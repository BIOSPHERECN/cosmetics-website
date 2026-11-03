/**
 * BEAUTY2OEM「提交店铺,拿机会简报」(2026-09-23 A7 线)。
 * 一次提交写两行:inquiries(后台询盘列表与群通知照旧可见)+ b2o_profiles(客户产品档案,字段见 db/migrations/0105_b2o.sql)。
 * 国内卖家多用微信,所以邮箱不必填:微信 / 手机 / 邮箱三选一。蜜罐 + 频控 + 打分;09-24 W1b 起接 Turnstile;09-24 C8 起 beauty2oem 改走自家点选码(它的 Turnstile 没授权域名;没有通行证回 ?brief=cap,
 *   前端 HumanForm 先探测、弹题、过了再原样提交;通行证 8 小时内再提交不出题)。
 * 不发 AI 首回 —— 页面承诺的是 24 小时内人工交付简报。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { overQuota, recordUse, tooMany, clientId } from '../../../lib/ratelimit';
import { gradeAndNotify } from '../../../lib/inquiry-ai';
import { humanGate } from '../../../lib/human';
import { humanMode, capFail, isProbe, probeResp } from '../../../lib/hcgate';
import { siteIdForHost } from '@cosmetic/core/content/tenant-map.ts';
import { autoBrief } from '../../../lib/b2o-auto';

export const prerender = false;

const back = (request: Request, state: string) => {
  let to: URL;
  try { to = new URL(request.headers.get('Referer') ?? '/zh-cn/brief/'); } catch { to = new URL('/zh-cn/brief/', request.url); }
  if (to.origin !== new URL(request.url).origin) to = new URL('/zh-cn/brief/', request.url);
  to.search = `?brief=${state}`; to.hash = 'brief';
  return new Response(null, { status: 303, headers: { Location: to.toString(), 'Cache-Control': 'no-store' } });
};

// SELF_TEST_BEGIN
/* 题号行下一行(可隔空行)是「答:」才算题目 —— 客户答案里的「1、交期慢」「15.9 美元」不能被当成新题吞掉 */
export function parseBriefAnswers(message: string): Record<number, string> {
  const answers: Record<number, string> = {};
  const lines = String(message ?? '').replace(/\r/g, '').split('\n');
  const isAns = (s = '') => /^答\s*[:：]/.test(s.trim());
  const nextLine = (i = 0) => { while (++i < lines.length && !lines[i].trim()); return lines[i]; };
  let question = 0, collecting = false, buffer: string[] = [];
  const save = () => {
    const answer = buffer.join('\n').trim();
    if (question && answer) answers[question] = answer.slice(0, 1000);
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], line = raw.trim();
    const q = /^(\d{1,2})[.、)]/.exec(line);
    if (q && isAns(nextLine(i))) { save(); question = Number(q[1]); collecting = false; continue; }
    if (/^【[^】]+】$/.test(line)) { save(); question = 0; collecting = false; continue; }
    const a = /^答\s*[:：]([\s\S]*)/.exec(line);
    if (a && question) { collecting = true; if (a[1].trim()) buffer.push(a[1].trim()); continue; }
    if (collecting) buffer.push(raw);
  }
  save();
  return answers;
}
// SELF_TEST_END

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return back(request, 'down');
  const who = clientId(request);
  if (await overQuota(db, 'inquiry', who)) return tooMany('inquiry');

  const f: Record<string, string> = {};
  try {
    for (const [k, v] of await request.formData()) f[k] = f[k] ? `${f[k]},${String(v)}` : String(v);   // 多选框同名多值 → 逗号拼
  } catch { return back(request, 'bad'); }
  const g = (k: string, n = 300) => String(f[k] ?? '').trim().slice(0, n);
  if (humanMode(env, siteIdForHost(new URL(request.url).hostname) === 'beauty2oem') === 'cap') {
    /* 09-24 红队:一张通行证最多交 3 份简报(QUOTA['form.pass'],8 小时),再交重新做题 —— 否则同 /16 换 IP 就绕过每 IP 5 次,
       一题换无限份简报,每份都触发 AI 评级、自动简报与群通知 */
    const pk = (/(?:^|;\s*)__Host-cap=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] ?? '').slice(-24);
    const cap = (await capFail(request, env)) ?? (await overQuota(db, 'form.pass', pk) ? 'cap' : null);
    if (isProbe(request)) return probeResp(cap);
    if (cap) return back(request, cap === 'human-off' ? 'down' : 'cap');
    await recordUse(db, 'form.pass', pk);
  } else {
    if (isProbe(request)) return probeResp(null);
    const human = await humanGate(env, String(f['cf-turnstile-response'] ?? ''), true, true);
    if (human) return human;
  }

  /* 09-24 创始人:表单只留姓名、手机、微信,其余写在一个问答框里,问题在前、答案可填可不填。
     问答框按题号拆:只取「答:」后面真写了字的;链接自动提取给简报用。旧表单字段(store_url 等)仍兼容。 */
  const contact = g('contact', 60), wechat = g('wechat', 60), phone = g('phone', 40), email = g('email', 200);
  const notes = String(f['notes'] ?? '').replace(/\r/g, '').slice(0, 4000);
  const ans = parseBriefAnswers(notes);
  /* 没按格式写的整段保留:只删模板行(空「答:」、小标题、后面跟空「答:」的题目),客户自己写的编号清单留着 */
  const nl = notes.split('\n'), emptyAns = (s = '') => /^答\s*[:：]\s*$/.test(s.trim());
  const extra = Object.keys(ans).length ? '' : nl.filter((l, i) => { const t = l.trim(); return !(emptyAns(t) || /^【[^】]+】$/.test(t) || (/^\d{1,2}[.、)]/.test(t) && emptyAns(nl[i + 1]))); }).join('\n').trim().slice(0, 1500);
  const mappedUrls = (Object.keys(ans).length ? [ans[2], ans[4]] : [extra]).filter(Boolean).flatMap((text) => text.match(/https?:\/\/[^\s,，。]+/g) ?? []).slice(0, 6);
  const store = g('store_url', 500) || mappedUrls[0] || '', heroes = g('hero_urls', 1500) || mappedUrls.filter((url) => url !== store).join('\n');
  if (!contact || !(wechat || phone || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) return back(request, 'bad');

  /* 09-24 W1:B4 v2 告知同意 —— 政策与跨境两项必勾,缺一拒收;留证写进 message 末行,不加迁移 */
  if (!g('agree_policy') || !g('agree_xborder')) return back(request, 'consent');
  const consent = `【同意记录】政策 v1.0(征求意见稿) · 跨境单独同意 · 营销:${g('agree_marketing') ? '是' : '否'} · ${new Date().toISOString().slice(0, 19)}Z`;

  let spam = 0;
  if (g('website')) spam += 5;
  if (((store + heroes).match(/https?:\/\//g) ?? []).length > 8) spam += 2;

  const P = {
    company: g('company', 120), own_brand: g('own_brand', 20), platforms: g('platforms', 200) || (ans[1] ?? '').slice(0, 200),
    markets_now: g('markets_now', 200) || (ans[1] ?? '').slice(0, 200), markets_next: g('markets_next', 200),
    cats_now: g('cats_now', 200) || (ans[3] ?? '').slice(0, 200), cats_next: g('cats_next', 200),
    price_band: g('price_band', 60) || (ans[3] ?? '').slice(0, 60), best_sellers: g('best_sellers', 800), monthly_new: g('monthly_new', 20), mode: g('mode', 20),
    traffic: g('traffic', 120), factory_pain: g('factory_pain', 1000), core_need: [g('core_need', 1000), ans[4], ans[5], ans[11], extra].filter(Boolean).join('\n').slice(0, 1000),
    decision_time: g('decision_time', 20) || (ans[8] ?? '').slice(0, 20), scale: g('scale', 30) || (ans[9] ?? '').slice(0, 30),
  };
  const message = [
    `【BEAUTY2OEM 机会简报申请】`, `平台:${P.platforms || '-'} · 现在卖:${P.markets_now || '-'} · 准备进:${P.markets_next || '-'}`,
    `品类:${P.cats_now || '-'} → 想扩:${P.cats_next || '-'} · 价格带:${P.price_band || '-'} · 月上新:${P.monthly_new || '-'} · 模式:${P.mode || '-'}`,
    `流量:${P.traffic || '-'} · 自有品牌:${P.own_brand || '-'} · 规模:${P.scale || '-'} · 决策:${P.decision_time || '-'}`,
    `店铺:${store || '-'}`, `核心商品:${heroes || '-'}`, `卖得最好:${P.best_sellers || '-'}`,
    `现工厂痛点:${P.factory_pain || '-'}`, `核心需求:${P.core_need || '-'}`, `微信:${wechat || '-'} · 手机:${phone || '-'}`,
    `客户在问答框里写的:${Object.entries(ans).map(([k, v]) => `\n  ${k}. ${v}`).join('') || (extra ? `\n  ${extra}` : '(没填)')}`,
  ].join('\n').slice(0, 3900) + '\n' + consent;
  const country = request.headers.get('CF-IPCountry') || null;
  const srcPath = (() => { try { return new URL(request.headers.get('Referer') ?? '').pathname.slice(0, 200); } catch { return '/zh-cn/brief/'; } })();

  let iid = 0, pid = 0;
  try {
    const ins = await db.prepare(
      `INSERT INTO inquiries (site_id, lang, name, company, email, country, message, spam_score, source_path, category, whatsapp)
       VALUES ('beauty2oem','zh-cn',?,?,?,?,?,?,?,?,?)`,
    ).bind(contact, P.company || null, email, country, message, spam, srcPath, P.cats_now.slice(0, 40) || null, phone || null).run();
    iid = Number((ins as any).meta?.last_row_id ?? 0);
    await db.prepare(
      `INSERT INTO b2o_profiles (inquiry_id, company, contact, wechat, phone, email, own_brand, platforms, markets_now, markets_next, cats_now, cats_next,
                                 store_url, hero_urls, price_band, best_sellers, monthly_new, mode, traffic, factory_pain, core_need, decision_time, scale, brief_due_at,
                                 consent_at, consent_ver, consent_via, consent_xb_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','+24 hours'), datetime('now'), 'policy-v1.0-draft', 'web-checkbox', datetime('now'))`,
    ).bind(iid, P.company, contact, wechat, phone, email, P.own_brand, P.platforms, P.markets_now, P.markets_next, P.cats_now, P.cats_next,
      store, heroes, P.price_band, P.best_sellers, P.monthly_new, P.mode, P.traffic, P.factory_pain, P.core_need, P.decision_time, P.scale).run()
      .then((r) => { pid = Number((r as any).meta?.last_row_id ?? 0); });   // 09-24 C1:两项同意上面已校验必勾,落到 0111 的同意列(同意闸门读它)
  } catch (e) {
    console.error('[b2o/brief] 入库失败', e);
    return back(request, 'down');
  }
  await recordUse(db, 'inquiry', who);

  if (iid && spam < 5) {
    const job = gradeAndNotify(db, env as any, iid, { name: contact, company: P.company || null, email, country, message, lang: 'zh-cn', source_path: srcPath, category: P.cats_now || null, volume: P.scale || null, whatsapp: phone || wechat || null, noReply: true });
    const ctx = (locals as any)?.cfContext;
    if (ctx?.waitUntil) ctx.waitUntil(job); else await job.catch(() => {});
  }
  /* 09-24 C1 · P03:几分钟内自动出机会简报草稿,挂后台「机会简报助手」待审;审批前不发。放响应之后跑,访客不等 */
  if (pid && spam < 5) {
    const ctx = (locals as any)?.cfContext, job = autoBrief(db, pid);
    if (ctx?.waitUntil) ctx.waitUntil(job); else await job.catch(() => {});
  }
  return back(request, 'ok');
};

export const GET: APIRoute = async () => new Response('POST only', { status: 405 });
