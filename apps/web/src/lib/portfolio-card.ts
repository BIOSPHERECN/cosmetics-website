/**
 * 莱诺鸟 P0-3 产品卡。
 * 整页图框只此一类：1:1、object-fit contain、衬底 #f6f5f2、安全区中心约 80%。
 * Sample 深链必须带非空 product_id，有品名带 about，有品类带 category。
 * 路径是 apex 相对路径 /{lang}/rfq/?…，不写 www，不写空 product_id=。
 */
import { CAT_LABEL, FMT_LABEL, label } from './catalog.ts';

/** 卡图框共用的唯一 aspect-ratio 类名。禁止再开 4:5 或 4:3。 */
export const PORTFOLIO_ASPECT_CLASS = 'pf-aspect-1x1';

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/i;
/** 证书章、原料溯源、车间/工厂实拍不能当产品卡主图。产品瓶图（含 AI 产品图库）留下。 */
const BAD_COVER = /资质证书|原料溯源|工厂实力|帛卉实拍|假车间|车间|workshop|sourcing|certificate|cert-stamp|cert_stamp|video-still|factory-hall|factory-floor|gmpc|iso-?22716/i;

export function productRef(p: { id?: unknown; slug?: unknown } | null | undefined): string {
  const id = String(p?.id ?? '').trim();
  if (id) return id;
  return String(p?.slug ?? '').trim();
}

function localeOf(lang: string): string {
  const loc = String(lang ?? '').trim();
  return LOCALE.test(loc) ? loc : '';
}

/** 真产品图才返回 /media/{id}。无图、非数字 id、证书/溯源/车间封面都返回 null，卡上改用 gen-placeholder。 */
export function portfolioCoverSrc(p: {
  cover_media?: unknown;
  cover_folder?: unknown;
  cover_filename?: unknown;
  cover_key?: unknown;
} | null | undefined): string | null {
  const id = String(p?.cover_media ?? '').trim();
  if (!/^[0-9]+$/.test(id)) return null;
  const blob = [p?.cover_folder, p?.cover_filename, p?.cover_key].map((v) => String(v ?? '')).join(' ');
  if (BAD_COVER.test(blob)) return null;
  return `/media/${id}`;
}

function readFormat(specsJson: unknown): string {
  let data: unknown = specsJson;
  if (typeof specsJson === 'string') {
    const raw = specsJson.trim();
    if (!raw || raw === '[]' || raw === '{}') return '';
    try { data = JSON.parse(raw); } catch { return ''; }
  }
  if (Array.isArray(data)) {
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const lab = String((row as { label?: unknown }).label ?? '').trim();
      const val = String((row as { value?: unknown }).value ?? '').trim();
      if (val && /剂型|^format$/i.test(lab)) return val;
    }
    return '';
  }
  if (data && typeof data === 'object') {
    const fmt = String((data as { format?: unknown }).format ?? '').trim();
    if (fmt) return fmt;
  }
  return '';
}

function namedFormat(raw: string, zh: boolean): string {
  const text = raw.trim();
  if (!text) return '';
  const key = text.toLowerCase();
  if (FMT_LABEL[key]) return label(FMT_LABEL, key, zh);
  return text;
}

/** 剂型徽记：规格里的剂型优先，没有则用品类（护肤细分品类本身就是剂型）。 */
export function portfolioFormatBadge(
  specsJson: unknown,
  specsZh: unknown,
  category: string,
  zh: boolean,
): string {
  const fromSpecs = namedFormat(readFormat(specsJson) || readFormat(specsZh), zh);
  if (fromSpecs) return fromSpecs;
  const cat = String(category ?? '').trim();
  if (!cat) return '';
  if (FMT_LABEL[cat]) return label(FMT_LABEL, cat, zh);
  if (CAT_LABEL[cat]) return label(CAT_LABEL, cat, zh);
  return cat;
}

/**
 * Sample / 询盘主链。没有 id 也没有 slug 时返回 null，调用方不要渲染空 product_id=。
 * category 空则不带该参数。
 */
export function portfolioSampleHref(
  lang: string,
  p: { id?: unknown; slug?: unknown; category?: unknown } | null | undefined,
  about: string,
): string | null {
  const loc = localeOf(lang);
  const ref = productRef(p);
  if (!loc || !ref) return null;
  const q = new URLSearchParams();
  q.set('product_id', ref);
  const name = String(about ?? '').trim();
  if (name) q.set('about', name);
  const cat = String(p?.category ?? '').trim();
  if (cat) q.set('category', cat);
  return `/${loc}/rfq/?${q.toString()}`;
}

/** 详情页仍可点。没有 slug 时回产品库，不拼出带空 product_id 的地址。 */
export function portfolioDetailHref(
  lang: string,
  slug: string,
  p: { id?: unknown; slug?: unknown } | null | undefined,
): string {
  const loc = localeOf(lang) || 'en';
  const s = String(slug ?? '').trim();
  if (!s || /[/?#\\\s]/.test(s)) return `/${loc}/portfolio/`;
  const ref = productRef(p);
  const base = `/${loc}/product/${s}/`;
  return ref ? `${base}?product_id=${encodeURIComponent(ref)}` : base;
}
