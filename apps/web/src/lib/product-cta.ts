/**
 * 产品详情右栏进 RFQ 的地址，以及剂型一行。
 * 没有非空 product_id 和 about 就不给链接，避免渲染 product_id= 空值或 www 绝对地址。
 */
import { FMT_LABEL, label } from './catalog.ts';
import { portfolioFormatBadge } from './portfolio-card.ts';

export interface ProductDetailRfqInput {
  lang: string;
  intent: string;
  productRef: string;
  about: string;
  category?: string;
  spf_pa?: string;
  texture?: string;
  skin_type?: string;
}

const ID_OK = /[?&]product_id=[^&]+/;
const ID_EMPTY = /[?&]product_id=(?:&|$)/;
const ABOUT_OK = /[?&]about=[^&]+/;

/** 站内相对路径，且 product_id、about 都非空。否则返回空串，调用方不渲染。 */
export function gateProductRfqHref(href: string): string {
  const raw = String(href ?? '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return '';
  const path = raw.split('?')[0];
  if (/www\./i.test(path)) return '';
  if (!ID_OK.test(raw) || ID_EMPTY.test(raw) || !ABOUT_OK.test(raw)) return '';
  return raw;
}

/** 非爆品卡的详情 CTA。爆品卡仍走 waveRfqPath，再过同一道门闩。 */
export function productDetailRfqHref(input: ProductDetailRfqInput): string {
  const lang = String(input.lang ?? '').trim() || 'en';
  const ref = String(input.productRef ?? '').trim();
  const about = String(input.about ?? '').trim().slice(0, 160);
  const intent = String(input.intent ?? '').trim();
  if (!ref || !about) return '';
  const qs = new URLSearchParams();
  qs.set('product_id', ref);
  qs.set('about', about);
  const cat = String(input.category ?? '').trim();
  if (cat) qs.set('category', cat);
  if (intent) qs.set('intent', intent);
  const spf = String(input.spf_pa ?? '').trim();
  const texture = String(input.texture ?? '').trim();
  const skin = String(input.skin_type ?? '').trim();
  if (spf) qs.set('spf_pa', spf);
  if (texture) qs.set('texture', texture);
  if (skin) qs.set('skin_type', skin);
  return gateProductRfqHref(`/${lang}/rfq/?${qs.toString()}`);
}

function specRows(specs: unknown): { label: string; value: string }[] {
  let data = specs;
  if (typeof specs === 'string') {
    const raw = specs.trim();
    if (!raw) return [];
    try { data = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const lab = String((row as { label?: unknown }).label ?? '').trim();
    const val = String((row as { value?: unknown }).value ?? '').trim();
    return lab && val ? [{ label: lab, value: val }] : [];
  });
}

function namedDosage(raw: string, zh: boolean): string {
  const text = raw.trim();
  if (!text) return '';
  const key = text.toLowerCase();
  if (FMT_LABEL[key]) return label(FMT_LABEL, key, zh);
  const token = key.split(/[/|,\s]+/).find((part) => FMT_LABEL[part]);
  if (token) return label(FMT_LABEL, token, zh);
  return text;
}

function textureIsDosage(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  if (!key) return false;
  if (FMT_LABEL[key]) return true;
  return key.split(/[/|,\s]+/).some((part) => !!FMT_LABEL[part]);
}

/** 右栏剂型只占一行。规格剂型优先；肤感里能对上剂型词才用；否则退回品类徽记。 */
export function productDosageLine(specs: unknown, category: string, zh: boolean): string {
  const rows = specRows(specs);
  const direct = rows.find((row) => /剂型|^format$/i.test(row.label))?.value ?? '';
  if (direct) return namedDosage(direct, zh);
  const texture = rows.find((row) => /^texture$|肤感|质地/i.test(row.label))?.value ?? '';
  if (texture && textureIsDosage(texture)) return namedDosage(texture, zh);
  return portfolioFormatBadge(specs, '', category, zh);
}
