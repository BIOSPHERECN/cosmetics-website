/**
 * BEAUTY2OEM「提交店铺,拿机会简报」(2026-09-23 A7 线)。
 * 一次提交写两行:inquiries(后台询盘列表与群通知照旧可见)+ b2o_profiles(客户产品档案,字段见 db/migrations/0105_b2o.sql)。
 * 国内卖家多用微信,所以邮箱不必填:微信 / 手机 / 邮箱三选一。不接 Turnstile(小组件只授权了 biosphere-ai.com),靠蜜罐 + 频控 + 打分。
 * 不发 AI 首回 —— 页面承诺的是 24 小时内人工交付简报。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { overQuota, recordUse, tooMany, clientId } from '../../../lib/ratelimit';
import { gradeAndNotify } from '../../../lib/inquiry-ai';

export const prerender = false;

const back = (request: Request, state: string) => {
  let to: URL;
  try { to = new URL(request.headers.get('Referer') ?? '/zh-cn/brief/'); } catch { to = new URL('/zh-cn/brief/', request.url); }
  if (to.origin !== new URL(request.url).origin) to = new URL('/zh-cn/brief/', request.url);
  to.search = `?brief=${state}`; to.hash = 'brief';
  return new Response(null, { status: 303, headers: { Location: to.toString(), 'Cache-Control': 'no-store' } });
};

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

  const contact = g('contact', 60), wechat = g('wechat', 60), phone = g('phone', 40), email = g('email', 200);
  const store = g('store_url', 500), heroes = g('hero_urls', 1500);
  if (!contact || !(wechat || phone || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) || !(store || heroes)) return back(request, 'bad');

  let spam = 0;
  if (g('website')) spam += 5;
  if (((store + heroes).match(/https?:\/\//g) ?? []).length > 8) spam += 2;

  const P = {
    company: g('company', 120), own_brand: g('own_brand', 20), platforms: g('platforms', 200),
    markets_now: g('markets_now', 200), markets_next: g('markets_next', 200), cats_now: g('cats_now', 200), cats_next: g('cats_next', 200),
    price_band: g('price_band', 60), best_sellers: g('best_sellers', 800), monthly_new: g('monthly_new', 20), mode: g('mode', 20),
    traffic: g('traffic', 120), factory_pain: g('factory_pain', 1000), core_need: g('core_need', 1000), decision_time: g('decision_time', 20), scale: g('scale', 30),
  };
  const message = [
    `【BEAUTY2OEM 机会简报申请】`, `平台:${P.platforms || '-'} · 现在卖:${P.markets_now || '-'} · 准备进:${P.markets_next || '-'}`,
    `品类:${P.cats_now || '-'} → 想扩:${P.cats_next || '-'} · 价格带:${P.price_band || '-'} · 月上新:${P.monthly_new || '-'} · 模式:${P.mode || '-'}`,
    `流量:${P.traffic || '-'} · 自有品牌:${P.own_brand || '-'} · 规模:${P.scale || '-'} · 决策:${P.decision_time || '-'}`,
    `店铺:${store || '-'}`, `核心商品:${heroes || '-'}`, `卖得最好:${P.best_sellers || '-'}`,
    `现工厂痛点:${P.factory_pain || '-'}`, `核心需求:${P.core_need || '-'}`, `微信:${wechat || '-'} · 手机:${phone || '-'}`,
  ].join('\n').slice(0, 4000);
  const country = request.headers.get('CF-IPCountry') || null;
  const srcPath = (() => { try { return new URL(request.headers.get('Referer') ?? '').pathname.slice(0, 200); } catch { return '/zh-cn/brief/'; } })();

  let iid = 0;
  try {
    const ins = await db.prepare(
      `INSERT INTO inquiries (site_id, lang, name, company, email, country, message, spam_score, source_path, category, whatsapp)
       VALUES ('beauty2oem','zh-cn',?,?,?,?,?,?,?,?,?)`,
    ).bind(contact, P.company || null, email, country, message, spam, srcPath, P.cats_now.slice(0, 40) || null, phone || null).run();
    iid = Number((ins as any).meta?.last_row_id ?? 0);
    await db.prepare(
      `INSERT INTO b2o_profiles (inquiry_id, company, contact, wechat, phone, email, own_brand, platforms, markets_now, markets_next, cats_now, cats_next,
                                 store_url, hero_urls, price_band, best_sellers, monthly_new, mode, traffic, factory_pain, core_need, decision_time, scale, brief_due_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','+24 hours'))`,
    ).bind(iid, P.company, contact, wechat, phone, email, P.own_brand, P.platforms, P.markets_now, P.markets_next, P.cats_now, P.cats_next,
      store, heroes, P.price_band, P.best_sellers, P.monthly_new, P.mode, P.traffic, P.factory_pain, P.core_need, P.decision_time, P.scale).run();
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
  return back(request, 'ok');
};

export const GET: APIRoute = async () => new Response('POST only', { status: 405 });
