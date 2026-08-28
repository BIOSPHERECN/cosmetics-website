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

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** 邮箱只做「长得像不像」的校验:严格的 RFC 正则会把合法地址误杀,得不偿失 */
const looksEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** 从域名认站点;认不出来退回请求里带的 site,再不行给集团站 */
async function resolveSite(db: D1Database, host: string, hint: string): Promise<string> {
  const byHost = await db.prepare(`SELECT id FROM sites WHERE domain = ? OR domain = ?`)
    .bind(host, host.replace(/^www\./, '')).first<{ id: string }>().catch(() => null);
  if (byHost) return byHost.id;
  if (hint) {
    const ok = await db.prepare(`SELECT id FROM sites WHERE id = ?`).bind(hint).first<{ id: string }>().catch(() => null);
    if (ok) return ok.id;
  }
  return 'beauty2oem';
}

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: '数据源未就绪' }, 503);

  const who = clientId(request);
  if (await overQuota(db, 'inquiry', who)) return tooMany('inquiry');

  /* 表单提交(浏览器原生)与 fetch(JSON)走同一条路。
     判据用 Content-Type 而不是有没有 X-Requested-With —— 后者不是标准,不可靠。 */
  const ctype = request.headers.get('Content-Type') || '';
  const isForm = ctype.includes('form-urlencoded') || ctype.includes('multipart/form-data');
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

  const email = (f.email ?? '').trim();
  if (!looksEmail(email)) {
    return isForm ? backTo(request, 'bad') : json({ ok: false, msg: '请填写有效的邮箱地址' }, 400);
  }

  /* 反垃圾三条,都只加分不拦截:
       蜜罐被填(真人看不见这个框)· 消息里塞满链接 · 名字与消息完全为空 */
  let spam = 0;
  if ((f.website ?? '').trim()) spam += 5;
  const message = (f.message ?? '').trim();
  if ((message.match(/https?:\/\//g) ?? []).length >= 3) spam += 3;
  if (!message && !(f.name ?? '').trim()) spam += 1;

  const site = await resolveSite(db, new URL(request.url).hostname, (f.site ?? '').trim());
  const source = (f.source ?? 'form').slice(0, 32);

  try {
    await db.prepare(
      `INSERT INTO inquiries (site_id, lang, name, company, email, country, message, spam_score)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      site,
      (f.lang ?? 'zh-cn').slice(0, 12),
      (f.name ?? '').slice(0, 120) || '(未填姓名)',
      (f.company ?? '').slice(0, 160) || null,
      email.slice(0, 200),
      request.headers.get('CF-IPCountry') || null,
      /* 订阅这类只留邮箱的场景没有正文。写一句来源而不是留空 ——
         后台列表里一眼能分清「订阅」和「真询盘」,不用点进去猜。 */
      message.slice(0, 4000) || `（来自${source === 'newsletter' ? '订阅表单' : '表单'},未填写正文）`,
      spam,
    ).run();
  } catch (e) {
    return json({ ok: false, msg: `提交失败:${e instanceof Error ? e.message.slice(0, 120) : ''}` }, 500);
  }

  await recordUse(db, 'inquiry', who);
  if (Math.random() < 0.05) await sweep(db);

  return isForm ? backTo(request, 'ok') : json({ ok: true, msg: '已收到,我们会在两个工作日内书面回复。' });
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
