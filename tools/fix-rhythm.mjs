/**
 * 打散相邻同型版块。
 *
 * 刚补完六个模块就又排出了 4 个 procgrid 连排 —— 和一开始那次五连排一个毛病。
 * 这不是"不好看":连着四屏同一种网格,读者到第三屏就开始滑而不是看,
 * 后面的内容等于白做。
 *
 * 做法不是人工重排一次(下次加版块还会犯),而是写成一个可反复跑的规则:
 * 扫一遍页面,发现相邻同型就从后面借一个异型版块插进来。
 * 借不到就只报告,不硬调 —— 硬调会把内容顺序打乱,那比连排更糟。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const SITE = process.argv[2] || 'biosphere-ai';
const SLUG = process.argv[3] ?? '';
const APPLY = process.argv.includes('--apply');

const page = d1(`SELECT id FROM pages WHERE site_id='${SITE}' AND slug='${SLUG}' LIMIT 1`)[0];
if (!page) { console.error(`找不到 ${SITE} /${SLUG}`); process.exit(1); }

const rows = d1(`SELECT b.id, b.type, b.sort_order,
                        (SELECT substr(i.data_json,1,60) FROM block_i18n i
                          WHERE i.block_id=b.id AND i.lang='zh-cn') AS peek
                   FROM blocks b WHERE b.page_id=${page.id} AND b.is_visible=1
                  ORDER BY b.sort_order, b.id`);

const title = (r) => {
  const m = /"title":"([^"]{0,26})/.exec(r.peek ?? '');
  return m ? m[1] : '';
};

console.log(`\n${SITE} /${SLUG || '首页'} — ${rows.length} 块`);
console.log('  ' + rows.map((r) => r.type).join('→'));

/* 贪心重排:逐个往结果里放,若与上一块同型就先从待放队列里找一个异型的插进来。
   通告条(announce)固定在最前,不参与重排。 */
const fixed = rows.filter((r) => r.type === 'announce');
const pool = rows.filter((r) => r.type !== 'announce');
const out = [];
while (pool.length) {
  const last = out[out.length - 1];
  let idx = 0;
  if (last && pool[0].type === last.type) {
    const alt = pool.findIndex((r) => r.type !== last.type);
    if (alt > 0) idx = alt;      // 借一个异型的先放
  }
  out.push(pool.splice(idx, 1)[0]);
}

const order = [...fixed, ...out];
const before = rows.map((r) => r.type);
const after = order.map((r) => r.type);
const dupsOf = (a) => a.filter((t, i) => i > 0 && t === a[i - 1]).length;

console.log(`\n  相邻同型:${dupsOf(before)} 处 → ${dupsOf(after)} 处`);
if (dupsOf(before) === dupsOf(after) && JSON.stringify(before) === JSON.stringify(after)) {
  console.log('  已经是打散的,不用改。'); process.exit(0);
}
console.log('  ' + after.join('→'));

const moved = order.filter((r, i) => rows[i]?.id !== r.id);
console.log(`\n  会移动 ${moved.length} 块:`);
moved.slice(0, 8).forEach((r) => console.log(`    #${r.id} ${r.type.padEnd(10)} ${title(r)}`));

if (!APPLY) { console.log('\n(只是预览。加 --apply 才会改)'); process.exit(0); }

const sql = order.map((r, i) =>
  `UPDATE blocks SET sort_order=${r.type === 'announce' ? -1 : (i + 1) * 10} WHERE id=${r.id};`);
const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/rhythm.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`\n已重排 ${order.length} 块`);
