/**
 * 页面地址规范化与缓存键(09-24 安全架构 C1 / 代码审计 P0-3、P0-4)。
 * 中间件与 tools/canon.test.mjs 共用;本文件不 import 任何东西,Node 可以直接跑。
 *
 * 每个页面路径真正读的参数登记在 PARAMS,分三类:
 *   k —— 影响服务端渲染、进缓存键的参数,带取值规整(返回 '' = 丢掉);
 *   u —— 随人而变、带上就整页不缓存的(搜索词 q、登录页的回跳与提示);
 *   c —— 只给页面里的前端脚本读(询盘表单预填、选品链路带来的方向),服务端 HTML 与它无关,不进缓存键。
 * 登记之外的参数(JUNK 除外)在页面路径上一律 301 去掉:
 *   ① ?x=随机数 不再能让整页绕过边缘缓存(以前是整页不缓存、每次现渲染);
 *   ② %71=词 这类编码过的参数名、重复参数规整成 q=词,边缘 WAF 的 q= 规则就绕不过去;
 *   ③ 取值越界(p 超上限、不是数字)301 回规整值,随机值造不出无数个缓存键。
 * 新页面要读新参数:先登记在这里,否则参数会被 301 去掉。
 */
export type Norm = (v: string, sp: URLSearchParams) => string;
export type Reg = { k?: Record<string, Norm>; u?: string[]; c?: string[] };

const txt = (n: number): Norm => (v) => v.trim().slice(0, n);
const int = (lo: number, hi: number): Norm => (v) => {
  const x = parseInt(v, 10);
  return Number.isFinite(x) ? String(Math.min(hi, Math.max(lo, x))) : '';
};
/* 翻页上限:带词搜索 10 页,目录 / 列表 20 页(安全架构 3.1;页面里同一口径再夹一次) */
const pg = (list: number, withQ = list): Norm => (v, sp) => int(1, sp.get('q') ? withQ : list)(v, sp);
const word: Norm = (v) => (/^[a-z]{1,12}$/.test(v) ? v : '');
const T40 = txt(40), T60 = txt(60);

/** 从不影响渲染的参数(广告、统计、调试穿透):不跳转,只从缓存键里剔掉 */
export const JUNK = /^(utm_|fbclid$|gclid$|msclkid$|ref$|from$|z$|cb$|nc$|_$)/;
/** sitemap 分片名 —— pages/sitemap.xml.ts 用同一份 */
export const SITEMAP_PARTS = ['pages', 'news', 'formulas', 'packaging', 'ingredients', 'decoder'];

const PARAMS: [RegExp, Reg][] = [
  [/^\/[\w-]+\/packaging\/$/, { k: { p: int(1, 200), u: T40, g: T40, t: T40, a: T40, f: T40, c: T40 } }],
  [/^\/[\w-]+\/formulas\/$/, { k: { c: T40, f: T40, b: T40, m: T40 } }],
  [/^\/[\w-]+\/ingredients\/$/, { k: { k: T40, b: T40, f: T40, l: txt(1), fn: T40, r: txt(6), p: int(1, 200) }, u: ['q'] }],
  [/^\/[\w-]+\/news\/$/, { k: { p: int(1, 200), topic: T40, sort: txt(12) } }],
  [/^\/[\w-]+\/trends\/market\/$/, { k: { c: txt(30) } }],
  [/^\/[\w-]+\/trends\/$/, { k: { p: int(1, 200), r: T40, c: T40, b: T40, pf: T60 } }],
  [/^\/[\w-]+\/brands\/$/, { k: { c: txt(30), m: txt(30), p: int(1, 200) } }],
  [/^\/[\w-]+\/bases\/$/, { k: { g: txt(20), pick: (v) => (v === '1' ? v : '') } }],
  [/^\/[\w-]+\/qc\/$/, { k: { s: txt(12) } }],
  [/^\/[\w-]+\/regulations\/$/, { k: { r: txt(20) } }],
  [/^\/[\w-]+\/decoder\/$/, { k: { mk: txt(4), cat: txt(24), p: pg(20, 10) }, u: ['q'] }],
  [/^\/[\w-]+\/classics\/$/, { k: { t: txt(12), p: int(1, 20) }, u: ['q'] }],
  [/^\/[\w-]+\/graph\/$/, { k: { n: int(1, 1e9), t: txt(20) }, u: ['q'] }],
  [/^\/[\w-]+\/inci\/[\w-]+\/$/, { k: { p: pg(20, 10) }, u: ['q'] }],
  [/^\/[\w-]+\/portfolio\/$/, { k: { cat: txt(24) } }],
  [/^\/[\w-]+\/products\/$/, { k: { cat: txt(24) } }],
  [/^\/[\w-]+\/pack\/$/, { k: { pack: txt(24), type: T60, material: T60, capacity: T60 }, c: ['brief'] }],
  [/^\/[\w-]+\/studio\/$/, { c: ['brief'] }],
  [/^\/[\w-]+\/selector\/$/, { k: { formula: T40, pack: T40, code: T40 } }],
  [/^\/[\w-]+\/login\/$/, { u: ['next', 'sent', 'e', 'email'] }],
  [/^\/[\w-]+\/search\/$/, { c: ['q'] }],   // 站内 AI 检索:q 由前端读、调会员接口,服务端 HTML 与 q 无关
  /* RFQ 深链预填写进服务端 HTML(rfq/index.astro)。必须进缓存键,否则和空白表单共用一份边缘缓存。
     about 与 formula 都写入产品名。intent 只出现在链接里,页面不渲染,留下但不进键。长度与页面 slice 一致。 */
  [/^\/[\w-]+\/rfq\/$/, { k: { product_id: txt(40), category: T40, market: txt(80), about: txt(160), formula: txt(40) }, c: ['intent'] }],
  /* lang 必须进缓存键:子图按语种拆开之后,漏掉这一项会让 /id/ 与 /en/ 共用一份边缘缓存。 */
  [/^\/sitemap\.xml$/, { k: {
    part: (v) => (SITEMAP_PARTS.includes(v) ? v : ''),
    p: int(0, 99),
    lang: (v) => (/^(?:en|zh-cn|zh-tw|jp|kr|fr|de|ru|id|my|th|vn|ph|es|pt|ar|tr|in)$/.test(v) ? v : ''),
  } }],
];
/* 所有页面都允许:BEAUTY2OEM 简报表单提交后回跳的状态(服务端读,只收小写短词);询盘表单预填(前端读) */
const GLOBAL_K: Record<string, Norm> = { brief: word };
const GLOBAL_C = ['formula', 'formulas', 'pack', 'market', 'claim', 'sent', 'cart', 'code'];

/** 这个路径的参数表(本路径登记的优先于全站那几项) */
export function regFor(path: string): { k: Record<string, Norm>; u: string[]; c: string[] } {
  const r = (PARAMS.find(([re]) => re.test(path)) ?? [null, {} as Reg])[1];
  const u = r.u ?? [], c0 = r.c ?? [];
  /* 无原型对象:?constructor= / ?toString= 这类参数名不能摸到 Object.prototype 上的函数(会被当成取值规整函数调用、301 转圈) */
  const k: Record<string, Norm> = Object.assign(Object.create(null), GLOBAL_K, r.k ?? {});
  for (const n of [...u, ...c0]) delete k[n];
  const c = [...GLOBAL_C.filter((x) => !(x in k) && !u.includes(x)), ...c0];
  return { k, u, c };
}

/** 页面路径:不是接口、图片 / 包材图资源、后台、构建产物,也不带扩展名 */
export const isPagePath = (p: string): boolean => !/^\/(?:api|media|pack|asset|bohui)(?:\/|$)|^\/_/.test(p) && !/\.\w{2,5}$/.test(p);

/** 规范地址(补尾斜杠 + 只留登记过的参数 + 取值规整);已经规范返回 null。只对页面路径的 GET 用。 */
export function canonical(pathname: string, search: string): string | null {
  const path = pathname.endsWith('/') ? pathname : pathname + '/';
  let changed = path !== pathname;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const out = new URLSearchParams();
  if (raw) {
    const r = regFor(path);
    const sp = new URLSearchParams(raw);
    const seen = new Set<string>();
    for (const part of raw.split('&')) {
      if (!part) { changed = true; continue; }
      const i = part.indexOf('=');
      const rk = i < 0 ? part : part.slice(0, i);
      let key: string, val: string;
      try {
        key = decodeURIComponent(rk.replace(/\+/g, ' '));
        val = decodeURIComponent((i < 0 ? '' : part.slice(i + 1)).replace(/\+/g, ' '));
      } catch { changed = true; continue; }          // 坏的 % 编码:整段丢掉
      if (key !== rk) changed = true;                  // 参数名被编码过(%71= 之类)
      if (seen.has(key)) { changed = true; continue; } // 重复参数只留第一个
      seen.add(key);
      if (JUNK.test(key) || r.u.includes(key) || r.c.includes(key)) { out.append(key, val); continue; }
      const norm = r.k[key];
      if (!norm) { changed = true; continue; }         // 没登记的参数:去掉
      const v = norm(val, sp);
      if (v !== val) changed = true;
      if (v) out.append(key, v);
    }
  }
  if (!changed) return null;
  const s = out.toString();
  return path + (s ? `?${s}` : '');
}

/** 缓存键里保留的参数:只留 k 类,值按同一口径规整,按名字排序 */
export function keyParams(pathname: string, sp: URLSearchParams): [string, string][] {
  const { k } = regFor(pathname);
  const out: [string, string][] = [];
  for (const [name, norm] of Object.entries(k)) {
    const raw = sp.get(name);
    const v = raw ? norm(raw, sp) : '';
    if (v) out.push([name, v]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** 带了 u 类或没登记的参数 → 整页不进缓存(JUNK、前端参数不算) */
export function uncacheable(pathname: string, sp: URLSearchParams): boolean {
  const { k, c } = regFor(pathname);
  for (const name of sp.keys()) if (!JUNK.test(name) && !(name in k) && !c.includes(name)) return true;
  return false;
}
