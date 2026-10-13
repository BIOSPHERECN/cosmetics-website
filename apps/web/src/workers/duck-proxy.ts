/**
 * Duck.ai 反向代理 —— 解决国内访问不稳 / 延迟问题。
 *
 * 为什么需要：
 *   duck.ai 前端域名可达(200)，但它依赖的上游 API 与页面资源在境外，
 *   国内直连偶发超时。走 Cloudflare 边缘节点中转后稳定得多。
 *
 * 多上游轮转（创始人 2026-10-09:「最好可以多账号轮转，万一卡了就麻烦了」）：
 *   上游列表按请求轮询，某一家失败自动切下一家；短时间内连挂的进死名单 5 分钟，
 *   避免每次请求都白等一遍 —— 这套"轮询 + 死名单"直接照搬 fleet.ts 的成熟做法。
 *
 * 路由：/api/duck-proxy/<path>  →  <upstream>/<path>
 */

/** 上游列表。默认鸭子官方；将来加了镜像/备用域，往这里追加一行即可 */
const UPSTREAMS = ['https://duck.ai'];

/** 调用内死名单：某上游 5xx/超时后短期不再尝试（同 fleet.ts 的 deadAt） */
const deadAt = new Map<string, number>();
const DEAD_TTL = 5 * 60_000;
const isDead = (u: string) => {
  const t = deadAt.get(u);
  return !!t && Date.now() - t < DEAD_TTL;
};
const markDead = (u: string, status: number | string) => {
  if (status === 429 || status === 403 || status === 'abort' || (typeof status === 'number' && status >= 500)) {
    deadAt.set(u, Date.now());
  }
};

/** 轮询游标（Worker 实例会被回收，只求尽量均摊，不追求严格公平） */
let cursor = 0;
function pickOrder(): string[] {
  const n = UPSTREAMS.length;
  const start = cursor++ % n;
  return [...UPSTREAMS.slice(start), ...UPSTREAMS.slice(0, start)];
}

const STRIP = '/api/duck-proxy';

/** 需要透传给上游客端的响应头 */
const PASS_THROUGH = new Set([
  'content-type', 'content-length', 'content-encoding', 'cache-control',
  'etag', 'last-modified', 'set-cookie', 'x-vqd-hash-1', 'x-vqd-4',
]);

export async function duckProxy(request: Request, _env: unknown, _ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  // 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const rest = url.pathname.startsWith(STRIP) ? url.pathname.slice(STRIP.length) : url.pathname;
  const tail = `${rest || '/'}${url.search}`;

  // 只透传必要请求头，其余由代理自己构造（避免把国内客户端的指纹带过去触发风控）
  const fwd = new Headers({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    Referer: 'https://duck.ai/',
    Origin: 'https://duck.ai',
  });
  for (const [k, v] of request.headers) {
    const lk = k.toLowerCase();
    if (['host', 'origin', 'referer', 'connection', 'content-length'].includes(lk)) continue;
    fwd.set(k, v);
  }

  let lastErr = 'no upstream';
  for (const base of pickOrder()) {
    if (isDead(base)) continue;
    try {
      const res = await fetch(`${base}${tail}`, {
        method: request.method,
        headers: fwd,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
      });

      // 5xx / 429 视为上游不健康，记死并试下一家
      if (res.status >= 500 || res.status === 429) {
        markDead(base, res.status);
        lastErr = `${base} → ${res.status}`;
        continue;
      }

      // 重定向：改写成走代理自身的路径，否则浏览器会跳回原域名
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location') ?? '';
        const rewritten = loc
          .replace(/^https?:\/\/duck\.ai/, STRIP)
          .replace(/^https?:\/\/duckduckgo\.com/, STRIP);
        return new Response(null, { status: res.status, headers: { ...corsHeaders(), location: rewritten } });
      }

      const out = new Headers();
      for (const [k, v] of res.headers) {
        if (PASS_THROUGH.has(k.toLowerCase())) out.set(k, v);
      }
      for (const [k, v] of Object.entries(corsHeaders())) out.set(k, v);
      out.set('X-Proxy-Upstream', base);
      // 不缓存：对话/生成类接口每次都要新结果
      out.set('Cache-Control', 'no-store');

      return new Response(res.body, { status: res.status, headers: out });
    } catch (err) {
      markDead(base, 'abort');
      lastErr = `${base} → ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return new Response(JSON.stringify({ error: 'upstream_unavailable', detail: lastErr }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, x-vqd-4, x-vqd-hash-1, x-request-id, x-slashd',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'x-vqd-hash-1, x-vqd-4',
    'Access-Control-Max-Age': '86400',
  };
}