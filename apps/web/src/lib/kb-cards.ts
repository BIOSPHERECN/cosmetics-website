/* C4 知识库后台(2026-09-24):说服卡 / 方法卡检索 —— 「客户问 X,该调哪张卡」。
   卡只有几十张,整批读出来在内存里打分:中文按相邻两字切词、英文按单词,命中标题 ×3、检索词 ×2、正文 ×1。
   ponytail: 关键词打分,卡过几百张或要同义词再上 FTS(inci_fts 那套),不做向量。 */
export const CARD_KINDS = ['知识卡片', '方法卡'];
export const LAYER: Record<string, string> = { 知识卡片: '④ 对外层', 方法卡: '② 方法层' };

const STOP = new Set(['你们', '我们', '这个', '那个', '什么', '一下', '怎么', '可以', '是不', '不是', '有没', '没有']);

export function terms(q: string): string[] {
  const s = q.toLowerCase();
  const out = new Set<string>();
  for (const w of s.match(/[a-z0-9][a-z0-9.+-]*/g) ?? []) if (w.length >= 2) out.add(w);
  for (const run of s.match(/[一-鿿]+/g) ?? []) {
    if (run.length === 1) continue;
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return [...out].filter((t) => !STOP.has(t));
}

export type Card = { slug: string; kind: string; title: string; tags: string | null; body: string };

export function rank<T extends Card>(q: string, cards: T[], top = 5): (T & { score: number })[] {
  const ts = terms(q);
  if (!ts.length) return [];
  return cards
    .map((c) => {
      const t = c.title.toLowerCase(), g = (c.tags ?? '').toLowerCase(), b = c.body.toLowerCase();
      let score = 0;
      for (const w of ts) score += (t.includes(w) ? 3 : 0) + (g.includes(w) ? 2 : 0) + (b.includes(w) ? 1 : 0);
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.kind !== '知识卡片') - Number(b.kind !== '知识卡片'))
    .slice(0, top);
}

/** 卡上的出处行:「出处:」「原文:」链接、「吸收自」—— 每张卡都要能看到数字从哪来 */
export function cites(body: string, max = 6): string[] {
  return body.split('\n')
    .filter((l) => /出处|原文[::]|https?:\/\/|吸收自/.test(l) && !/^\s*-\s*\*\*证据与出处\*\*/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

/** 卡上那句能直接对客户说的话 */
export function oneLine(body: string): string {
  const m = /\*\*一句话回答\*\*[::]\s*(.+)/.exec(body) ?? /\*\*用在\*\*[::]\s*(.+)/.exec(body);
  return (m?.[1] ?? '').trim();
}
