/**
 * 询盘收口 —— 全站唯一的线索入口。
 *
 * 补的是两个都很要命的窟窿:
 *
 * ① 主询盘表单一直是 `action="mailto:"`。
 *    浏览器把内容塞进访客自己的邮件客户端 —— 桌面端会弹出一个陌生的窗口,
 *    手机上多半**什么都不发生**。海外采购填完点提交、看不到任何回执,
 *    十有八九就走了。而 inquiries 表建好了却从来没有一行数据,
 *    后台的「询盘线索」页一直是空的 —— 看起来像没人询盘,其实是根本没收到。
 *
 * ② 我自己刚写的 DTC 订阅表单指向 /api/inquiry,而这个接口**当时并不存在**。
 *    线上实测 403。自己引入的坏链接,一并补上。
 *
 * 设计取舍:
 *   · 同时吃表单编码与 JSON —— 前者让表单在**零 JS** 下也能提交(这是底线:
 *     脚本挂了、被拦了,询盘也不能丢);后者给前端 fetch 用。
 *   · 蜜罐字段叫 website 不叫 company —— company 是 inquiries 表里的真实字段,
 *     拿它当蜜罐会把「填了公司名的正常客户」全判成机器人。这个坑我踩过一次(见下)。
 *   · 疑似垃圾**不丢弃**,打分入库。误判在所难免,丢掉一条真询盘的代价
 *     远大于让人多看一条垃圾。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { overQuota, recordUse, tooMany, clientId, sweep } from '../../lib/ratelimit';
import { siteIdForHost } from '@cosmetic/core/content/tenant-map.ts';
import { gradeAndNotify } from '../../lib/inquiry-ai';
import { humanGate } from '../../lib/human';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** 邮箱只做「长得像不像」的校验:严格的 RFC 正则会把合法地址误杀,得不偿失 */
const looksEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** 极简问答框:兼容 1–9 圈号、中英文答案标记,也兼容旧的 `1.` 模板。 */
// SELF_TEST_BEGIN
export function questionAnswers(message: string): Record<number, string> {
  const answers: Record<number, string> = {};
  const circled = '①②③④⑤⑥⑦⑧⑨';
  const lines = String(message ?? '').replace(/\r/g, '').split('\n');
  /* 题号行下一行(可隔空行)是答案标记才算题目 —— 答案里的「1. serum」清单不能被当成新题吞掉 */
  const isAns = (s = '') => /^(?:答|A)\s*[:：]/i.test(s.trim());
  const nextLine = (i = 0) => { while (++i < lines.length && !lines[i].trim()); return lines[i]; };
  let question = 0, collecting = false, buffer: string[] = [];
  const save = () => {
    const answer = buffer.join('\n').trim();
    if (question && answer) answers[question] = answer.slice(0, 1000);
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], line = raw.trim();
    const q = /^([①②③④⑤⑥⑦⑧⑨])|^(\d{1,2})[.、)]/.exec(line);
    if (q && isAns(nextLine(i))) { save(); question = q[1] ? circled.indexOf(q[1]) + 1 : Number(q[2]); collecting = false; continue; }
    const a = /^(?:答|A)\s*[:：]([\s\S]*)/i.exec(line);
    if (a && question) { collecting = true; if (a[1].trim()) buffer.push(a[1].trim()); continue; }
    if (collecting) buffer.push(raw);
  }
  save();
  return answers;
}
// SELF_TEST_END

/** 从域名认站点;认不出来退回请求里带的 site,再不行给集团站 */
async function resolveSite(db: D1Database, host: string, hint: string): Promise<string> {
  const byHost = await db.prepare(`SELECT id FROM sites WHERE domain = ? OR domain = ?`)
    .bind(host, host.replace(/^www\./, '')).first<{ id: string }>().catch(() => null);
  if (byHost) return byHost.id;
  if (hint) {
    const ok = await db.prepare(`SELECT id FROM sites WHERE id = ?`).bind(hint).first<{ id: string }>().catch(() => null);
    if (ok) return ok.id;
  }
  /* 兜底按域名。2026-09-07:这里原来硬编码 'beauty2oem' ——
     一条询盘归到错误的站,等于这条线索直接丢进另一家公司的后台,
     而且没有任何报警。域名认不出来就返回空字符串,让调用方拒收并留痕,
     宁可让一条询盘报错,不可让它悄悄进错门。 */
  return siteIdForHost(host) ?? '';
}

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: '数据源未就绪' }, 503);

  const who = clientId(request);
  if (await overQuota(db, 'inquiry', who)) return tooMany('inquiry');

  /* 表单提交(浏览器原生)与 fetch(JSON)走同一条路。
     判据用 Content-Type 而不是有没有 X-Requested-With —— 后者不是标准,不可靠。 */
  const ctype = request.headers.get('Content-Type') || '';
  const isForm = ctype.includes('form-urlencoded') || ctype.includes('multipart/form-data');
  const wantsJson = (request.headers.get('Accept') || '').includes('application/json');
  let f: Record<string, string> = {};
  try {
    if (isForm) {
      for (const [k, v] of await request.formData()) f[k] = String(v);
    } else {
      const b = (await request.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(b)) f[k] = String(v ?? '');
    }
  } catch {
    return json({ ok: false, msg: '请求格式错误' }, 400);
  }

  const source = (f.source ?? 'form').slice(0, 32);
  const name = (f.name ?? '').trim();
  /* P0 RFQ: 市场/品类/量必填；不自动报价（仅入库+通知） */
  const market = (f.market ?? f.iq_market ?? '').trim().slice(0, 80);
  const productId = (f.product_id ?? f.productId ?? '').trim().slice(0, 40);
  if (source === 'rfq' || source === 'sample') {
    const cat0 = (f.category ?? '').trim();
    const vol0 = (f.volume ?? '').trim();
    if (!market || !cat0 || !vol0) {
      return isForm
        ? backTo(request, 'bad')
        : json({ ok: false, msg: 'RFQ requires market, category and volume / RFQ 需填写市场、品类与预估量' }, 400);
    }
  }

  /* Turnstile:蜜罐只挡最笨的脚本。09-24 W1b 起配了 secret 就缺令牌一律拒收(原来不带令牌直接放行),规则见 lib/human.ts */
  const human = await humanGate(env, String((f as any)['cf-turnstile-response'] ?? ''), isForm,
    new URL(request.url).hostname.endsWith('beauty2oem.com'));   // beauty2oem 只出中文
  if (human) return human;

  const email = (f.email ?? '').trim();
  /* WhatsApp / 电话只留常见号码字符;少于 6 位当没填。 */
  const whatsapp = (() => { const v = String(f.whatsapp ?? '').replace(/[^+\d\s()-]/g, '').trim().slice(0, 40); return v.replace(/\D/g, '').length >= 6 ? v : null; })();
  /* newsletter 是旧的纯邮箱订阅入口;其余询盘姓名必填,邮箱与 WhatsApp / 电话至少一个。 */
  if ((source !== 'newsletter' && !name) || (!email && !whatsapp) || (email && !looksEmail(email))) {
    return isForm ? backTo(request, 'bad') : json({ ok: false, msg: '请填写姓名,并至少留下有效邮箱或 WhatsApp / 电话' }, 400);
  }

  /* 反垃圾三条,都只加分不拦截:
       蜜罐被填(真人看不见这个框)· 消息里塞满链接 · 名字与消息完全为空 */
  let spam = 0;
  if ((f.website ?? '').trim()) spam += 5;
    let message = (f.message ?? '').trim();
  const answers = questionAnswers(message.slice(0, 8000));   // only parse first 8000 chars
  const category = (answers[3] ?? f.category ?? '').trim().slice(0, 40) || null;
  const volume = (answers[8] ?? f.volume ?? '').trim().slice(0, 40) || null;
  /* 结构化字段写入正文前缀，便于小满/人工检索；不生成报价 */
  if (market || productId) {
    const head = [market ? `market=${market}` : '', productId ? `product_id=${productId}` : ''].filter(Boolean).join('; ');
    if (head && !message.includes(head)) message = (head + (message ? '\n' + message : '')).slice(0, 4000);
  }
  if ((message.match(/https?:\/\//g) ?? []).length >= 3) spam += 3;
  if (!message && !(f.name ?? '').trim()) spam += 1;

  const site = await resolveSite(db, new URL(request.url).hostname, (f.site ?? '').trim());

  /* 来源页与站外来源。
     没有这两列,后台只能回答「这个月来了 20 条」;有了才能回答
     「20 条里 12 条来自生产线页,种植基地页一条没有」——
     前者是记账,后者才是能据以改内容的信息。
     referrer 只留 host:完整 URL 常带搜索词和会话 id,那属于访客隐私,
     我们既不需要也不该留。 */
  const refHost = (() => {
    const r = request.headers.get('referer') ?? '';
    try { return r ? new URL(r).host.slice(0, 120) : null; } catch { return null; }
  })();
  const srcPath = (() => {
    // 优先用表单自己带的(询盘车会带上下单那一页),否则从 referer 推
    const p = String(f.sourcePath ?? '').trim();
    if (p) return p.slice(0, 200);
    const r = request.headers.get('referer') ?? '';
    try { return r ? new URL(r).pathname.slice(0, 200) : null; } catch { return null; }
  })();

  let newId = 0;
  try {
    /* 09-21 01:2x 线上每一单都 500「参数绑定数量错误」:0068 加了 whatsapp 值却没加进列名,12 个 ? 绑 13 个值。创始人在 beauty2ai 上提交时发现,帛卉站同样中招。 */
    const ins = await db.prepare(
      `INSERT INTO inquiries (site_id, lang, name, company, email, country, message,
                              spam_score, source_path, referrer, category, volume, whatsapp)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      site,
      (f.lang ?? 'zh-cn').slice(0, 12),
      name.slice(0, 120) || '(未填姓名)',
      (f.company ?? '').slice(0, 160) || null,
      email.slice(0, 200),
      request.headers.get('CF-IPCountry') || null,
      /* 订阅这类只留邮箱的场景没有正文。写一句来源而不是留空 ——
         后台列表里一眼能分清「订阅」和「真询盘」,不用点进去猜。 */
      message.slice(0, 4000) || `（来自${source === 'newsletter' ? '订阅表单' : '表单'},未填写正文）`,
      spam,
      srcPath,
      refHost,
      /* 品类与数量级:报价前必问的两件,做成结构化字段而不是留在正文里 ——
         留在正文就得逐条人读,后台没法筛,也答不了「哪类询盘最多」。 */
      category,
      volume,
      whatsapp,
    ).run();
    newId = Number((ins as any).meta?.last_row_id ?? 0);
  } catch (e) {
    return json({ ok: false, msg: `提交失败:${e instanceof Error ? e.message.slice(0, 120) : ''}` }, 500);
  }

  await recordUse(db, 'inquiry', who);
  if (Math.random() < 0.05) await sweep(db);

  /* 入库之后:AI 分级 + 群通知,放到响应之后跑(waitUntil),访客秒得回执。
     订阅框(newsletter)不通知 —— 那不是询盘。 */
  /* 小满字段映射（获客回写）: ticket_id=newId; name; company; email; whatsapp; market; category; volume; product_id; source */
  if (newId && source !== 'newsletter') {
    const job = gradeAndNotify(db, env as any, newId, { name: name.slice(0, 120) || '(未填姓名)', company: (f.company ?? '').slice(0, 160) || null, email: email.slice(0, 200), country: request.headers.get('CF-IPCountry') || null, message: message.slice(0, 4000), lang: (f.lang ?? 'zh-cn').slice(0, 12), source_path: srcPath, category, volume, whatsapp });
    const ctx = (locals as any)?.cfContext;   // Astro 6:runtime.ctx 已移除,用 cfContext
    if (ctx?.waitUntil) ctx.waitUntil(job); else await job.catch(() => {});
  }

  return (isForm && !wantsJson) ? backTo(request, 'ok') : json({ ok: true, ticket_id: newId || null, msg: '已收到,我们会在两个工作日内书面回复。本接口不自动报价。' });
};

/**
 * 原生表单提交后带状态跳回原页。
 * 用 303 而不是 302:303 明确要求浏览器改用 GET 重取,
 * 这样访客刷新页面不会重复提交(302 在这里的行为各家浏览器并不一致)。
 */
function backTo(request: Request, state: 'ok' | 'bad'): Response {
  const ref = request.headers.get('Referer');
  let to: URL;
  try { to = new URL(ref ?? '/'); } catch { to = new URL('/', request.url); }
  /* 只跳回同源,避免被人拿 Referer 做成开放重定向 */
  if (to.origin !== new URL(request.url).origin) to = new URL('/', request.url);
  to.searchParams.set('inquiry', state);
  to.hash = 'inquiry';
  return new Response(null, { status: 303, headers: { Location: to.toString() } });
}

/** GET 只用来告诉误访者这里是什么,不返回任何数据 */
export const GET: APIRoute = async () =>
  json({ ok: false, msg: '此接口只接受 POST 提交' }, 405);
