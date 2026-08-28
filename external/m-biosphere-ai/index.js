/**
 * m-biosphere-ai —— 优化版入口。
 *
 * 路由、接口形状、返回字段全部与线上一致,前端一行不用改。
 * 改的是底下那层:密钥怎么存、令牌怎么签、图片存哪儿、缓存怎么走。
 *
 * ══ 这一版改了什么(逐条对照原实现)══
 *
 * 【安全】详见 auth.js 顶部的五条。摘要:密钥出代码、HMAC 取代裸拼接哈希、
 *        恒定时间比较、PBKDF2 取代单次 SHA-256、登录限速、改密码踢下线。
 *
 * 【存储】图片从 KV 搬到 R2(KV 仍可读,老图不失效)。
 *        原实现把图片 base64 存进 KV,三处代价:
 *          · base64 让体积涨 33%
 *          · KV 是最终一致的,写完最长 60 秒才全球可见 ——
 *            上传完刷新看不到图,运营会当成 bug 报过来
 *          · 每次读要把整张图读进内存再 base64 解码:
 *            5MB 的图 → 6.7MB 字符串 → 再解成 5MB 字节。
 *            Workers 内存上限 128MB,并发几张大图就危险。
 *        R2 直接 `new Response(obj.body)` 是流式的,零拷贝、强一致。
 *
 * 【缓存】原实现为了注入 __CF_IPCOUNTRY__,对每个 HTML 响应做 .text() 全量读,
 *        并把缓存设成 no-store —— 整站 HTML 从此没有边缘缓存。
 *        改用 HTMLRewriter 流式注入:不缓冲、不落地,缓存头也留得住。
 *
 * 【跳转】语言前缀跳转从 301 改 302。
 *        301 会被浏览器**永久**缓存:哪天想改语言路由方案,
 *        已经访问过的用户浏览器里那条 301 是清不掉的。
 *
 * 【匹配】配方从"每请求全表线性扫"改成按标签建倒排索引(模块加载时建一次)。
 *        现在只有 19 条,差别看不出来;上到几百条就是每请求 O(n×m) 对 O(命中数)。
 *
 * 【CORS】原实现 jsonHeaders() 给所有接口都开了 Access-Control-Allow-Origin: *,
 *        包括登录、改密码、上传。虽然 cookie 是 SameSite=Lax 且没开 credentials,
 *        当前不可利用,但那是把门虚掩着。现在只有公开的 /api/formula 开。
 *
 * ══ 部署前必须先做的两件事 ══
 *   wrangler secret put AUTH_SECRET      # 换一个新的,别沿用代码里那串
 *   wrangler secret put ADMIN_PASSWORD   # 也换一个,旧的已随 bundle 外泄
 *   两个 secret 缺任何一个,鉴权接口一律 503 —— 宁可打不开,不要用兜底常量偷偷跑起来。
 */
import {
  ADMIN_COOKIE, parseCookies, hashPassword, verifyPassword,
  makeToken, verifyToken, tooManyAttempts, recordFail, clearFails,
  cookieHeader, clearCookieHeader,
} from './auth.js';
import { FORMULA_LIBRARY, normalizeLabel, matchFormulas } from './formulas.js';

const KV_PWD = 'bhbohui_admin_password_hash';
const KV_PV = 'bhbohui_password_version';
const IMAGE_ALLOWED = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/* 私有接口不开 CORS;公开数据接口单独开 */
const jsonHeaders = (cors = false) => ({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}),
});
const json = (body, status = 200, cors = false) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders(cors) });

const noStore = (res) => {
  const r = new Response(res.body, { status: res.status, headers: res.headers });
  r.headers.set('Cache-Control', 'no-store');
  r.headers.set('CDN-Cache-Control', 'no-store');
  return r;
};

const contentTypeFromKey = (key) =>
  key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

/** 当前密码版本 —— 改密码时 +1,让已签发的令牌全部作废 */
const currentPv = async (kv) => Number(await kv.get(KV_PV)) || 1;

/**
 * 校验密码。两条路径:
 *
 *  ① KV 里已经有哈希 —— 正常路径,走 PBKDF2(或旧格式并顺手升级)。
 *  ② KV 里还没有 —— 首次引导。拿 env.ADMIN_PASSWORD 做**恒定时间比较**,
 *     比对成功后立刻把 PBKDF2 哈希写进 KV,下一次登录就走 ① 了。
 *
 * ② 这条路径特意不对 env 密码再做一次 PBKDF2 —— 那样每次登录要跑两遍
 * 6 万次迭代(一次造参照哈希、一次验),白烧一倍 CPU。
 * env secret 本身是加密存储的,明文比一次就够,关键是**恒定时间**。
 */
async function checkPassword(password, env, ctx) {
  const inKv = await env.ASSETS_BUCKET.get(KV_PWD).catch(() => null);
  if (inKv) {
    const { ok, legacy } = await verifyPassword(password, String(inKv));
    if (ok && legacy) ctx.waitUntil(env.ASSETS_BUCKET.put(KV_PWD, await hashPassword(password)));
    return { ok, configured: true };
  }
  if (!env.ADMIN_PASSWORD) return { ok: false, configured: false };
  const ok = timingSafeEqualStr(password, env.ADMIN_PASSWORD);
  /* 引导成功后立刻落库,把"密码只存在环境变量里"这个中间状态尽快结束掉 */
  if (ok) ctx.waitUntil(env.ASSETS_BUCKET.put(KV_PWD, await hashPassword(password)));
  return { ok, configured: true };
}

/** 与 auth.js 里同一套实现;这里只比较明文,不值得为它多导出一个符号 */
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 登录态判定,一处实现供所有受保护路由用 */
async function authed(request, env) {
  return verifyToken(parseCookies(request)[ADMIN_COOKIE], env.AUTH_SECRET, await currentPv(env.ASSETS_BUCKET));
}

/* HTMLRewriter 处理器:把访客国家码注入 <head>,流式,不缓冲整页 */
class CountryInjector {
  constructor(country) { this.country = country; this.done = false; }
  element(el) {
    if (this.done) return;
    this.done = true;
    el.prepend(`<script>window.__CF_IPCOUNTRY__=${JSON.stringify(this.country)};</script>`, { html: true });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* ── 语言前缀 → 查询参数。302 不是 301,理由见文件头 ── */
    const m = url.pathname.match(/^\/(zh-cn|zh|en|es|ar|id|ja)(\/.*)?$/i);
    if (m) {
      const lang = m[1].toLowerCase() === 'zh-cn' ? 'zh' : m[1].toLowerCase();
      const target = new URL(m[2] || '/', url.origin);
      target.search = url.search;
      if (!target.searchParams.get('lang')) target.searchParams.set('lang', lang);
      target.hash = url.hash;
      return Response.redirect(target.toString(), 302);
    }

    /* ── 鉴权相关路由:密钥没配就整体停用 ────────────────
       这里选择"打不开"而不是"用兜底常量跑起来":
       后者会让「忘了配 secret」这件事永远不被发现,而它恰恰是最该被发现的。 */
    const needsAuth = url.pathname.startsWith('/bhbohui') || url.pathname === '/api/upload';
    if (needsAuth && !env.AUTH_SECRET) {
      return json({ ok: false, message: '服务端未配置 AUTH_SECRET,后台已停用' }, 503);
    }

    if (url.pathname === '/bhbohui' || url.pathname === '/bhbohui/') {
      if (await authed(request, env)) return noStore(await env.ASSETS.fetch(new URL('/bhbohui.html', url)));
      return Response.redirect(new URL('/bhbohui/login', url).toString(), 302);
    }

    if (url.pathname === '/bhbohui/login') {
      return noStore(await env.ASSETS.fetch(new URL('/bhbohui-login.html', url)));
    }

    if (url.pathname === '/bhbohui/api/login') {
      if (request.method !== 'POST') return json({ ok: false, message: 'method not allowed' }, 405);
      const ip = request.headers.get('CF-Connecting-IP') || '';
      if (await tooManyAttempts(env.ASSETS_BUCKET, ip)) {
        return json({ ok: false, message: '失败次数过多,请 15 分钟后再试' }, 429);
      }
      let pwd = '';
      try { pwd = String((await request.json())?.password || ''); }
      catch { return json({ ok: false, message: '请求格式错误' }, 400); }

      const { ok, configured } = await checkPassword(pwd, env, ctx);
      if (!configured) return json({ ok: false, message: '服务端未配置管理密码' }, 503);
      if (!ok) {
        await recordFail(env.ASSETS_BUCKET, ip);
        return json({ ok: false, message: '密码错误' }, 401);
      }
      await clearFails(env.ASSETS_BUCKET, ip);

      const token = await makeToken(env.AUTH_SECRET, await currentPv(env.ASSETS_BUCKET));
      return new Response(JSON.stringify({ ok: true, message: '登录成功' }), {
        status: 200,
        headers: { ...jsonHeaders(), 'Set-Cookie': cookieHeader(token) },
      });
    }

    if (url.pathname === '/bhbohui/api/change-password') {
      if (request.method !== 'POST') return json({ ok: false, message: 'method not allowed' }, 405);
      if (!(await authed(request, env))) return json({ ok: false, message: '未登录' }, 401);
      let cur = '', next = '';
      try { const b = await request.json(); cur = String(b?.current_password || ''); next = String(b?.new_password || ''); }
      catch { return json({ ok: false, message: '请求格式错误' }, 400); }

      if (!(await checkPassword(cur, env, ctx)).ok) return json({ ok: false, message: '当前密码错误' }, 400);
      if (next.length < 10) return json({ ok: false, message: '新密码至少 10 位' }, 400);   // 原来是 6 位,太短
      if (next === cur) return json({ ok: false, message: '新密码不能与当前密码相同' }, 400);

      const pv = (await currentPv(env.ASSETS_BUCKET)) + 1;
      await env.ASSETS_BUCKET.put(KV_PWD, await hashPassword(next));
      await env.ASSETS_BUCKET.put(KV_PV, String(pv));
      /* 递增版本号 = 所有旧令牌立即失效,包括自己这一个。
         所以顺手给当前这次会话换发一个新令牌,否则改完密码自己就被踢出去了。 */
      const token = await makeToken(env.AUTH_SECRET, pv);
      return new Response(JSON.stringify({ ok: true, message: '密码已修改,其它设备上的登录已全部失效' }), {
        status: 200,
        headers: { ...jsonHeaders(), 'Set-Cookie': cookieHeader(token) },
      });
    }

    if (url.pathname === '/bhbohui/api/logout') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...jsonHeaders(), 'Set-Cookie': clearCookieHeader() },
      });
    }

    if (url.pathname === '/bhbohui/api/session') {
      return json({ ok: await authed(request, env) });
    }

    if (url.pathname.startsWith('/bhbohui/')) {
      if (url.pathname.startsWith('/bhbohui/data/')) return noStore(await env.ASSETS.fetch(url));
      if (await authed(request, env)) return noStore(await env.ASSETS.fetch(new URL('/bhbohui.html', url)));
      return Response.redirect(new URL('/bhbohui/login', url).toString(), 302);
    }

    /* ── 上传 ───────────────────────────────────────────── */
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      if (!(await authed(request, env))) return json({ ok: false, message: '未登录' }, 401);

      let bytes = null, fileType = '';
      try {
        const ctype = request.headers.get('Content-Type') || '';
        if (ctype.includes('multipart/form-data')) {
          const file = (await request.formData()).get('file');
          if (!file) throw new Error('missing file');
          fileType = String(file.type || '');
          bytes = new Uint8Array(await file.arrayBuffer());
        } else {
          const b = await request.json();
          fileType = String(b.type || '');
          bytes = Uint8Array.from(atob(String(b.data || '')), (c) => c.charCodeAt(0));
        }
      } catch { return json({ ok: false, message: '请求解析失败' }, 400); }

      const ext = IMAGE_ALLOWED[fileType];
      if (!ext) return json({ ok: false, message: '仅支持 jpg/png/webp 格式' }, 400);
      if (!bytes?.length) return json({ ok: false, message: '文件内容为空' }, 400);
      if (bytes.length > IMAGE_MAX_BYTES) return json({ ok: false, message: '图片过大,限制 5MB' }, 413);

      /* 声明的 Content-Type 是客户端说了算的,不能信。
         校验文件头(magic number):JPEG FFD8FF / PNG 89504E47 / WEBP RIFF....WEBP。
         不校验的话,一个改名的 .html 传上来会被当图片存下、再以 image/* 吐出去 ——
         虽然浏览器不会当 HTML 渲染,但那是运气,不是设计。 */
      const sig = (a, off = 0) => a.every((v, i) => bytes[off + i] === v);
      const looksImage =
        (ext === 'jpg' && sig([0xff, 0xd8, 0xff])) ||
        (ext === 'png' && sig([0x89, 0x50, 0x4e, 0x47])) ||
        (ext === 'webp' && sig([0x52, 0x49, 0x46, 0x46]) && sig([0x57, 0x45, 0x42, 0x50], 8));
      if (!looksImage) return json({ ok: false, message: '文件内容不是有效的图片' }, 400);

      /* key 用 randomUUID 而不是 Date.now()+Math.random().slice(2,8):
         后者只有 6 位随机,同毫秒内有碰撞概率,撞了就是悄悄覆盖别人的图。 */
      const key = `${crypto.randomUUID()}.${ext}`;
      if (env.MEDIA) {
        await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: fileType, cacheControl: 'public, max-age=31536000, immutable' } });
      } else {
        /* 没绑 R2 时退回 KV(与线上现状一致),但把这件事显式记下来,
           免得"以为搬到 R2 了"其实一直在走 KV。 */
        /* 存**原始二进制**,不再存 base64。
           两个理由:base64 白白涨 33%;而且线上 KV 里那 14 张老图本来就是原始二进制,
           两种格式混着存,读的那一端迟早判错(见下面读取处的说明)。 */
        await env.ASSETS_BUCKET.put(key, bytes);
        console.warn('[upload] 未绑定 R2(MEDIA),已退回 KV 存储:', key);
      }
      return json({ ok: true, url: `/assets/${key}`, key });
    }

    /* ── 取图:R2 优先,KV 兜底(老图不失效)───────────── */
    if (url.pathname.startsWith('/assets/')) {
      const key = url.pathname.slice('/assets/'.length);
      const safe = key && !key.includes('..') && !key.includes('/') && key.length <= 128 && key.includes('.');
      if (safe) {
        if (env.MEDIA) {
          const obj = await env.MEDIA.get(key).catch(() => null);
          if (obj) {
            const h = new Headers();
            obj.writeHttpMetadata(h);
            h.set('Content-Type', obj.httpMetadata?.contentType || contentTypeFromKey(key));
            h.set('Cache-Control', 'public, max-age=31536000, immutable');
            h.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');
            h.set('ETag', obj.httpEtag);
            h.set('Access-Control-Allow-Origin', '*');
            return new Response(obj.body, { headers: h });   // 流式,不进内存
          }
        }
        /* ★ 这里踩了一个线上正在发生的坑 ★
           原实现只会 `atob(值)` 按 base64 解。可线上 KV 里那 14 张图存的是**原始二进制** ——
           atob 抛异常 → 被 catch 吞掉 → 落到 env.ASSETS.fetch → 命中 SPA 回退,
           于是 /assets/xxx.png 返回 200、Content-Type 是 text/html、内容是 60KB 的首页。
           实测生产站现在就是这个样子:图裂了,但状态码是 200,任何监控都不会报。

           改法:按 arrayBuffer 取回,先看**文件头**。
           是图就直接吐;不是图再当 base64 试一次;两条都不成立就老老实实 404 ——
           在图片地址上返回一整页 HTML,比返回 404 更难查。 */
        const buf = await env.ASSETS_BUCKET.get(key, { type: 'arrayBuffer' }).catch(() => null);
        if (buf) {
          const bytes = new Uint8Array(buf);
          const sig = (a, off = 0) => a.every((v, i) => bytes[off + i] === v);
          const isImage =
            sig([0xff, 0xd8, 0xff]) ||                                   // JPEG
            sig([0x89, 0x50, 0x4e, 0x47]) ||                             // PNG
            (sig([0x52, 0x49, 0x46, 0x46]) && sig([0x57, 0x45, 0x42, 0x50], 8)); // WEBP

          let out = isImage ? bytes : null;
          if (!out) {
            try {
              const bin = atob(new TextDecoder().decode(bytes));
              out = Uint8Array.from(bin, (c) => c.charCodeAt(0));
            } catch { /* 既不是图也不是 base64 */ }
          }
          if (out) {
            return new Response(out, {
              headers: {
                'Content-Type': contentTypeFromKey(key),
                'Cache-Control': 'public, max-age=31536000, immutable',
                'CDN-Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
        }
        return new Response('Not found', { status: 404 });
      }
      return env.ASSETS.fetch(url);
    }

    /* ── 配方受控匹配(公开接口)───────────────────────── */
    if (url.pathname === '/api/formula') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      let raw = url.searchParams.get('label') || '';
      let productName = url.searchParams.get('product_name') || '';
      if (request.method === 'POST') {
        try { const b = await request.json(); raw = b?.label || b?.tags || raw; productName = b?.product_name || productName; }
        catch { /* 保持查询参数取到的值 */ }
      }
      const labels = normalizeLabel(raw, productName);
      const result = labels.length ? matchFormulas(labels) : { top: [], comparison: { key: '功效对比', items: [] } };
      return json({
        ok: true,
        mode: 'controlled',
        matched: result.top,
        comparison: result.comparison,
        total: result.top.length,
        disclaimer: '以上为受控匹配的方案参考,仅作选配方向展示,不构成完整配方文件;具体开发以商务沟通与法规备案为准。',
      }, 200, true);
    }

    /* ── 静态站 ─────────────────────────────────────────
       注入国家码改用 HTMLRewriter:流式改写,不把整页读进内存,
       也不必为了改一行就把整站 HTML 的缓存关掉。 */
    if (url.pathname === '/') url.pathname = '/index.html';
    let res = await env.ASSETS.fetch(url);
    if (res.status === 404 && !url.pathname.includes('.')) {
      url.pathname = '/index.html';
      res = await env.ASSETS.fetch(url);
    }
    if (res.status === 200 && (res.headers.get('Content-Type') || '').includes('text/html')) {
      const country = request.headers.get('CF-IPCountry') || '';
      return new HTMLRewriter().on('head', new CountryInjector(country)).transform(res);
    }
    return res;
  },
};

export { FORMULA_LIBRARY };
