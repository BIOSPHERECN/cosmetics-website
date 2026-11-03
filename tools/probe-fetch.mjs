/**
 * 本机工具打线上的共用前置(ship-gate / regress / audit-distinct 都 import 它)。
 *
 * 09-24:bohui-web 的 workers.dev 与预览地址已关(暴露面 H1),工具默认改打正式域名。
 * 本机出口是云机房(AWS 香港),正式域名会被 WAF S2 托管质询 —— 所以给自家域名的请求带上
 * 自家探针头 x-bohui-probe,S1/S2 见到这个值就放行。
 * 密钥只在 cosmetic-sites/.env 的 BOHUI_PROBE_KEY(或同名环境变量),不进仓库、不打印。
 * 只给自家域名加头;跳转到别家域名时不带(fetch 跨域跳转不会自动去掉自定义头,这里手动跟)。
 */
import { readFileSync } from 'node:fs';

/** 正式域名上按域名认站,?site= 无效;只有这两个站挂在 bohui-web 上 */
export const LIVE = { 'biosphere-ai': 'https://biosphere-ai.com', beauty2oem: 'https://beauty2oem.com' };
export const ALL_SITES = ['beauty2oem', 'skin2oem', 'medierba', 'biosphere-ai', 'biosphere-oralcare'];

/** 给了基址(副本 / 本地 dev)沿用 ?site= 切站;没给就打该站正式域名。返回 [前缀, 查询串] */
export const siteBase = (argBase, site) =>
  argBase ? [argBase.replace(/\/+$/, ''), `site=${site}`] : [LIVE[site], ''];

let key = process.env.BOHUI_PROBE_KEY;
try {
  key ||= readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^\s*(?:export\s+)?BOHUI_PROBE_KEY\s*=\s*"?([^"\r\n]+)/m)?.[1];
} catch { /* 没有 .env:不带头,线上会被质询,工具自己会报 403 */ }

const OWN = /(^|\.)(biosphere-ai|beauty2oem)\.com$/i;
if (key) {
  const raw = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    let url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!OWN.test(url.hostname)) return raw(input, init);
    const follow = (init.redirect ?? 'follow') === 'follow';
    for (let hop = 0; ; hop++) {
      const own = OWN.test(url.hostname);
      const h = new Headers(init.headers);
      if (own) h.set('x-bohui-probe', key);
      const r = await raw(url, { ...init, headers: h, redirect: own ? 'manual' : init.redirect });
      const loc = r.headers.get('location');
      if (!own || !follow || !loc || r.status < 300 || r.status > 399 || hop >= 5) return r;
      url = new URL(loc, url);
      if (r.status === 303) init = { ...init, method: 'GET', body: undefined };
    }
  };
}
