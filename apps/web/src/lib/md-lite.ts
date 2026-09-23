/**
 * 极简 Markdown → HTML:只认日报里用到的那几样(标题、段落、无序/有序列表、表格、粗体、链接、行内代码)。
 * 图片一律不出(Amazon 图片外链不能热链,出了也是裂图),表格可截断(日报单表几百行,页面只留前 N 行)。
 * 不引第三方库:Worker 里多一个依赖就多一份体积,而日报格式是固定的。
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s: string) =>
  esc(s)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                                              // 图片:去掉
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener nofollow" target="_blank">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

export function mdLite(md: string, opts: { maxRows?: number; rowNote?: (hidden: number) => string } = {}): string {
  const maxRows = opts.maxRows ?? 40;
  const out: string[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.+)/.exec(l);
    if (h) { const lv = Math.min(h[1].length + 1, 4); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); i++; continue; }
    if (l.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      if (!rows.length) continue;
      const [head, ...body] = rows;
      const dropCols = head.map((c) => /图片|image/i.test(c));
      const keep = (r: string[]) => r.filter((_, k) => !dropCols[k]);
      const shown = body.slice(0, maxRows);
      out.push('<div class="tw"><table><thead><tr>' + keep(head).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + shown.map((r) => '<tr>' + keep(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      if (body.length > shown.length && opts.rowNote) out.push(`<p class="more">${esc(opts.rowNote(body.length - shown.length))}</p>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
      const ol = /^\s*\d+\./.test(l); const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; }
      out.push(`<${ol ? 'ol' : 'ul'}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${ol ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\s*>\s?/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^\s*>\s?/, ''))}</blockquote>`); i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\||\s*[-*]\s|\s*\d+\.\s|\s*>)/.test(lines[i])) { para.push(lines[i]); i++; }
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); else i++;
  }
  return out.join('\n');
}
