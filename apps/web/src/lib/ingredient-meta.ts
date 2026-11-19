/**
 * 成分页 meta description（GROK-SEO-GEO-T10）。
 *
 * 旧写法是整句 `.slice(0, 160)`。短名字能在 160 字里收住，
 * 长 INCI 会断在半个词上（现网 Achillea 结尾是 “popular products t”）。
 * 这里只输出完整句，最长 160 字，常见名字尽量落在 155–160。
 *
 * 匿名页公开的只有 INCI 名、别名 / CAS / EC / PubChem（有公开记录才有）和询盘入口。
 * 不写功效、刺激性或产品名单。会员或回答型爬虫若页面上的 what 本身已是
 * 以句号收尾、且连同成分名仍不超过 160 的句子，才沿用那一句原文。
 */

const MAX = 160;

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function sentence(s: string): boolean {
  return s.length > 0 && s.length <= MAX && /[.!?。！？]$/.test(s);
}

/** 从长到短挑一句能接在 base 后面、接完仍是完整句且不超过 160 的。 */
function appendLongest(base: string, options: string[]): string {
  const ranked = [...options].sort((a, b) => b.length - a.length);
  for (const opt of ranked) {
    const next = `${base} ${opt}`;
    if (sentence(next)) return next;
  }
  return base;
}

function clipAtBoundary(name: string, budget: number): string {
  if (budget <= 0) return '';
  if (name.length <= budget) return name;
  const slice = name.slice(0, budget);
  let idx = -1;
  for (const sep of [' ', '-', '/']) idx = Math.max(idx, slice.lastIndexOf(sep));
  if (idx <= 0) return '';
  return slice.slice(0, idx).replace(/[\s\-/]+$/u, '');
}

function enLead(name: string): string {
  const full = `${name} is listed in the ingredient index under its INCI name.`;
  if (full.length <= MAX) return full;
  const short = `${name} is in the ingredient index.`;
  if (short.length <= MAX) return short;
  const tail = ' is in the ingredient index.';
  const clipped = clipAtBoundary(name, MAX - tail.length);
  if (clipped) return `${clipped} is in the ingredient index.`;
  return 'This page is an ingredient index entry.';
}

function zhLead(name: string): string {
  const full = `${name} 收在成分索引中，按 INCI 名列出。`;
  if (full.length <= MAX) return full;
  const short = `${name} 收在成分索引中。`;
  if (short.length <= MAX) return short;
  const tail = ' 收在成分索引中。';
  const clipped = clipAtBoundary(name, MAX - tail.length);
  if (clipped) return `${clipped} 收在成分索引中。`;
  return '这一页是成分索引中的一条。';
}

/** 都是页面上已经公开的事：有记录才列出标识，有匹配才引用目录，页上有询盘。 */
const EN_IDENTIFIERS = [
  'Known aliases and the CAS, EC or PubChem CID are included when a public record lists them.',
  'Known aliases and CAS, EC or PubChem CID are shown when a public record lists them.',
  'Known aliases and CAS are shown when a public record already lists them.',
  'Aliases and CAS numbers are shown when a public record includes them.',
  'Known aliases and CAS are shown when a public record includes them.',
  'Aliases and CAS are shown when a public record includes them.',
  'Public identifiers are listed only when a record has them.',
  'Aliases are shown when a public record includes them.',
  'Identifiers are listed only when a record has them.',
  'A matching public record is what the page cites.',
  'The page cites a matching public record.',
  'Only a matching public record is cited.',
  'A public match is cited here.',
];

const EN_ENQUIRY = [
  'The enquiry link is on this page.',
  'An enquiry link is on this page.',
  'The enquiry link is here.',
  'An enquiry link is here.',
  'Enquire on this page.',
  'Enquire here.',
];

const ZH_IDENTIFIERS = [
  '公开记录里已有的别名、CAS、EC 或 PubChem CID 会写在这一页。',
  '有公开记录时，这一页写出别名、CAS、EC 或 PubChem CID。',
  '有公开记录时才列出别名与 CAS。',
];

const ZH_ENQUIRY = [
  '页上有询盘入口。',
];

/**
 * what 必须本身以句号收尾。功能词逗号列表不加句号冒充句子。
 * 第一句连同成分名放得下才用；放不下就退回公开句，避免再切到半个词。
 */
function sentenceFromWhat(name: string, what: string): string | null {
  const body = tidy(what);
  if (!body) return null;
  const chunks = body.split(/(?<=[.!?。！？])\s+/u).filter(Boolean);
  let acc = '';
  for (const chunk of chunks) {
    if (!/[.!?。！？]$/.test(chunk)) break;
    const next = acc ? `${acc} ${chunk}` : chunk;
    const line = `${name}: ${next}`;
    if (!sentence(line)) break;
    acc = next;
  }
  return acc ? `${name}: ${acc}` : null;
}

export function catalogMetaDescription(o: {
  zh: boolean;
  name: string;
  what?: string | null;
  full?: boolean;
}): string {
  const name = tidy(String(o.name ?? ''));
  const safe = name || (o.zh ? '该成分' : 'This ingredient');
  if (o.full && o.what) {
    const fromPage = sentenceFromWhat(safe, String(o.what));
    if (fromPage) return fromPage;
  }
  if (o.zh) {
    return appendLongest(appendLongest(zhLead(safe), ZH_IDENTIFIERS), ZH_ENQUIRY);
  }
  return appendLongest(appendLongest(enLead(safe), EN_IDENTIFIERS), EN_ENQUIRY);
}
