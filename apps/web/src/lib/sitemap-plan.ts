/**
 * Sitemap 索引规划(纯函数,不碰 D1)。
 *
 * SEO-001:索引只列「这一份真能写出至少一条 <url>」的子图。
 *   解读库按 id/5000 切,中间有整段空 id(生产上大约 p=3–14、16–19、65、67–71)。
 *   用 MAX(id) 推片数会把这些空片写进索引,抓取器拿到的是没有 <loc> 的空 urlset。
 * SEO-002:营销页 / 产品 / 资讯按语种各一份,避免 18 语 × 全量 hreflang 挤在一个文件里。
 *   目录类(配方 / 包材 / 原料)同样按语种分文件,但只在库里真有行时才列。
 */
export const DECODER_SHARD = 5000;

export interface SitemapChild {
  part: string;
  lang?: string;
  p?: number;
}

export function occupiedShards(flags: readonly boolean[]): number[] {
  const out: number[] = [];
  flags.forEach((ok, i) => { if (ok) out.push(i); });
  return out;
}

/** 这一行会不会进某一片。与 sitemap 查询的 id 区间同一口径:[p*5000, (p+1)*5000)。 */
export function inDecoderShard(id: number, shard: number, size = DECODER_SHARD): boolean {
  return id >= shard * size && id < (shard + 1) * size;
}

export function planIndex(o: {
  langs: readonly string[];
  hasNews: boolean;
  hasFormulas: boolean;
  hasPackaging: boolean;
  /** 已发布原料详情,或 ingredient_facts 至少一行。任一成立就按语种列原料子图。 */
  hasIngredients: boolean;
  decoderShards: readonly number[];
}): SitemapChild[] {
  const out: SitemapChild[] = [];
  const add = (part: string) => { for (const lang of o.langs) out.push({ part, lang }); };
  add('pages');
  if (o.hasNews) add('news');
  if (o.hasFormulas) add('formulas');
  if (o.hasPackaging) add('packaging');
  if (o.hasIngredients) add('ingredients');
  for (const p of o.decoderShards) out.push({ part: 'decoder', p });
  return out;
}

export function childQuery(c: SitemapChild): string {
  const q = new URLSearchParams();
  q.set('part', c.part);
  if (c.lang) q.set('lang', c.lang);
  if (c.p != null) q.set('p', String(c.p));
  return q.toString();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function indexXml(host: string, children: readonly SitemapChild[]): string {
  const body = children
    .map((c) => `  <sitemap><loc>${esc(`https://${host}/sitemap.xml?${childQuery(c)}`)}</loc></sitemap>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** 子图里的一条 URL。alternates 只传「这个地址确实存在」的语种,不指向 404。 */
export function urlEntry(o: {
  loc: string;
  priority: string;
  lastmod?: string;
  alternates?: readonly { hreflang: string; href: string }[];
  xDefaultHref?: string;
}): string {
  const alts = (o.alternates ?? [])
    .map((a) => `    <xhtml:link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}"/>`)
    .join('\n');
  const x = o.xDefaultHref
    ? `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(o.xDefaultHref)}"/>`
    : '';
  const mod = o.lastmod ? `    <lastmod>${esc(o.lastmod.slice(0, 10))}</lastmod>\n` : '';
  return `  <url>\n    <loc>${esc(o.loc)}</loc>\n${mod}    <priority>${esc(o.priority)}</priority>${alts ? `\n${alts}` : ''}${x}\n  </url>`;
}

export function urlsetXml(entries: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}
