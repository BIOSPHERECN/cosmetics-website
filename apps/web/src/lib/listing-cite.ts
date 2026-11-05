/**
 * 产品 Listing 可引用（PL-3）。
 *
 * 上架闸：中文源 description 仍是「Product: 名称.」占位，或有效字不足 120，不能改成 published。
 * 已经 published 的空壳不在这里下架。
 *
 * 有效字：NFKC 之后的汉字、字母、数字。空白和标点不计，避免用标点把空壳垫过线。
 * 公网首段另有一条更低的线：可见第一段和 Product JSON-LD.description 用同一段，且有效字至少 20。
 */
import { softenClaims } from './comply-copy.ts';

export const PUBLISH_MIN_CHARS = 120;
export const LEAD_MIN_CHARS = 20;

export function effectiveCharCount(raw: string | null | undefined): number {
  const s = String(raw ?? '').normalize('NFKC');
  const chars = s.match(/\p{L}|\p{N}/gu);
  return chars ? chars.length : 0;
}

function collapse(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 整段就是现网空壳「Product: 名称.」或「Product: 名称」。
 * 去掉前缀后如果还有第二句（再出现句号、问号、感叹号），不当成占位，改由有效字闸决定。
 */
export function isPlaceholderDescription(raw: string | null | undefined): boolean {
  const s = collapse(raw);
  if (!s) return false;
  if (/^Product:\s*.+\.\s*$/i.test(s)) {
    const body = s.replace(/^Product:\s*/i, '').replace(/\.\s*$/, '');
    if (!/[.。!！?？]/.test(body)) return true;
  }
  if (/^Product:\s*[^.\n。!！?？]+$/i.test(s)) return true;
  return false;
}

/** 不能上架时返回给后台的一句原因；可以通过则返回 null。 */
export function listingPublishBlock(description: string | null | undefined): string | null {
  if (isPlaceholderDescription(description)) {
    return '描述仍是「Product: 名称.」占位，不能上架';
  }
  const n = effectiveCharCount(description);
  if (n < PUBLISH_MIN_CHARS) {
    return `描述有效字 ${n}，少于 ${PUBLISH_MIN_CHARS}，不能上架`;
  }
  return null;
}

/**
 * 只拦「变成 published」。已经是 published 的保存、以及下架，都不在这里改状态。
 */
export function blockPublishTransition(input: {
  currentStatus: string | null | undefined;
  nextStatus: string | null | undefined;
  description: string | null | undefined;
}): string | null {
  if (input.nextStatus !== 'published') return null;
  if (input.currentStatus === 'published') return null;
  return listingPublishBlock(input.description);
}

function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** 从前往后拼，直到第一段有效字够 20。拼进去的段不再重复出现。 */
function takeLead(paragraphs: string[]): { lead: string; paragraphs: string[] } | null {
  const acc: string[] = [];
  for (const p of paragraphs) {
    acc.push(p);
    const lead = acc.join(' ');
    if (effectiveCharCount(lead) >= LEAD_MIN_CHARS) {
      const rest = paragraphs.slice(acc.length);
      const shown = acc.length === 1 ? paragraphs : [lead, ...rest];
      return { lead: shown[0], paragraphs: shown };
    }
  }
  return null;
}

function fallbackParagraphs(input: { name: string; categoryLabel: string; zh: boolean }): string[] {
  const name = input.name.trim() || (input.zh ? '本产品' : 'This product');
  const cat = input.categoryLabel.trim() || (input.zh ? '美妆' : 'beauty');
  if (input.zh) {
    return [
      `${name} 是帛卉为 OEM/ODM 项目供应的${cat}类产品:配方、包材与标签可按品牌需求在自有产线上调整,打样签样后进入量产。`,
      '工厂位于广州,20,000 ㎡ 厂房、15 条自动化产线,在册配方 13,000+,持有 GMPC、ISO 22716:2007 与 HALAL 认证;出口可配合 FDA 注册（注册≠批准、不发证书）、CPNP 通报与东南亚市场备案。起订量按品类与包材议定，以书面确认为准。打样通常 5–14 天，这是样品指示，不是大货交期。',
    ];
  }
  return [
    `${name} is a ${cat.toLowerCase()} product supplied by BIOSPHERE-AI for OEM/ODM projects: formula, packaging and labels can be adjusted to your brand on our own lines, with sampling and sign-off before mass production.`,
    'The factory is in Guangzhou — over 20,000 m² of manufacturing floor, 15 automated production lines and 13,000+ formulations on file, certified to GMPC, ISO 22716:2007 and HALAL; export support covers FDA registration (registration is not approval, and no certificate is issued), CPNP notification and Southeast Asian filings. MOQ is agreed per category and packaging and confirmed in writing. Sampling is typically 5–14 days as a sample indication, not a production lead time.',
  ];
}

/**
 * 页上产品说明。lead 是第一段，也是 Product JSON-LD 的 description。
 * 占位或不足 20 个有效字时，用站内可核对的采购说明顶上，不把「Product: 名称.」写进结构化数据。
 */
export function listingLead(input: {
  description: string | null | undefined;
  name: string;
  categoryLabel: string;
  zh: boolean;
}): { paragraphs: string[]; lead: string; source: 'description' | 'fallback' } {
  const raw = String(input.description ?? '').replace(/\r\n/g, '\n').trim();
  if (raw && !isPlaceholderDescription(raw)) {
    const taken = takeLead(paragraphsOf(softenClaims(raw)));
    if (taken) return { ...taken, source: 'description' };
  }
  const paragraphs = fallbackParagraphs(input);
  return { paragraphs, lead: paragraphs[0], source: 'fallback' };
}

/** specs_json.faq（或 faqs）里问答。空项丢掉。页面和 FAQPage 用同一份返回值。 */
export function faqsFromSpecs(specs: unknown): { q: string; a: string }[] {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return [];
  const raw = (specs as { faq?: unknown; faqs?: unknown }).faq ?? (specs as { faqs?: unknown }).faqs;
  if (!Array.isArray(raw)) return [];
  const out: { q: string; a: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { q?: unknown; a?: unknown; question?: unknown; answer?: unknown };
    const q = collapse(String(row.q ?? row.question ?? ''));
    const a = collapse(String(row.a ?? row.answer ?? ''));
    if (!q || !a) continue;
    out.push({ q, a });
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * 把导入的 specs / faq 并进已有 specs_json。
 * 原来若是 [{label,value}] 数组，挪进 list，避免补 FAQ 时把规格丢掉。
 * 对象按键合并。传入的 faq 数组覆盖同名键。
 */
export function mergeSpecsJson(
  currentRaw: string | null | undefined,
  incoming: unknown,
  faq?: unknown,
): string {
  let base: Record<string, unknown> = {};
  if (currentRaw && String(currentRaw).trim()) {
    try {
      const parsed = JSON.parse(String(currentRaw));
      if (Array.isArray(parsed)) base = { list: parsed };
      else if (parsed && typeof parsed === 'object') base = { ...parsed };
    } catch {
      base = {};
    }
  }
  if (Array.isArray(incoming)) base.list = incoming;
  else if (incoming && typeof incoming === 'object') Object.assign(base, incoming as Record<string, unknown>);
  if (Array.isArray(faq)) base.faq = faq;
  return JSON.stringify(base);
}
