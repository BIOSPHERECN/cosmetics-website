/**
 * 边缘缓存键与「写入 Cache API 的那一份」响应头。
 *
 * 中间件对浏览器仍下发 max-age=0(登录前后不能让浏览器自己囤一份匿名 HTML)。
 * Cache API 会按 Cache-Control 决定收不收:max-age=0 会被当成不要缓存或立即过期,
 * put 返回 413、match 落空,于是每次都是 miss,熔断计数被刷爆。
 * 存进缓存的副本把 max-age 抬到与 s-maxage 相同;命中后再改回 max-age=0。
 *
 * 缓存键只认调用方已经规范化的 URL(含 __cv / __gate)。不带原请求头:
 * Cache API 的 match 会看 Range / If-None-Match / If-Modified-Since,
 * 带上它们会把本该命中的页面变成 304、206 或直接 miss,再次进 fuseCheck。
 */

/** 给 caches.default 用的键。method 固定 GET,不复制原请求头。 */
export function cacheKeyRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

/**
 * 准备交给 cache.put 的副本。原响应不动。
 * 只有「max-age=0 且 s-maxage>0」才改写;immutable / 路由自己的正 max-age / no-store 原样克隆。
 */
export function cachePutResponse(res: Response): Response {
  const src = res.clone();
  const cc = src.headers.get('Cache-Control') ?? '';
  const s = /(?:^|[, ])s-maxage=(\d+)/.exec(cc);
  const zero = /(?:^|[, ])max-age=0(?:$|[, ])/.test(cc);
  if (!s || !zero || !(Number(s[1]) > 0)) return src;
  const headers = new Headers(src.headers);
  headers.set('Cache-Control', cc.replace(/(^|[, ])max-age=0(?=$|[, ])/, `$1max-age=${s[1]}`));
  headers.set('x-bh-cc-browser', 'max-age=0');
  return new Response(src.body, { status: src.status, statusText: src.statusText, headers });
}

/** 命中后回给浏览器:若这份是我们抬过 max-age 的边缘副本,改回 max-age=0。 */
export function restoreBrowserCacheControl(headers: Headers): void {
  if (headers.get('x-bh-cc-browser') !== 'max-age=0') return;
  const cc = headers.get('Cache-Control') ?? '';
  if (cc) headers.set('Cache-Control', cc.replace(/(^|[, ])max-age=\d+/, '$1max-age=0'));
  headers.delete('x-bh-cc-browser');
}
