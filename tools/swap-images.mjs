/**
 * 图片升级:把占位图换成更贴题的真图,并清掉图库里的垃圾。
 *
 * 三件事:
 *
 * ① 古方研究用的是「通用草药占位图」(herb-01/02/03),
 *    而我们现在有 5 种**真实的原料田间照**(人参 / 玫瑰 / 绿茶 / 芦荟 / 积雪草)。
 *    同样是草本,一张能说出名字的植株照和一张泛泛的绿叶图,可信度完全不同 ——
 *    采购看古方版块时想确认的正是「你们真的碰得到这些原料吗」。
 *
 * ② 包材占位图换成实际的包材陈列图。
 *
 * ③ `/media/3` 是一张叫「Beautiful Bright」的通用美妆图,
 *    却被用作**口腔护理站的首页大图**。这是典型的货不对板 ——
 *    卖牙膏的站首页放一张护肤模特图,访客三秒内就会怀疑这站是不是拼的。
 *
 * 换完再清一批图库垃圾:早期误抓的 CC0 素材(Cuba 1907、Naval Ophthalmic、
 * USDA 之类)和没人用的占位图。留着的唯一后果是下次有人从图库里挑到它们。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

/* 占位 → 真图。右边全部是库里确实存在、且内容对得上的图 */
const SWAP = {
  94: 117,   // 通用草药 → 人参 Panax ginseng 田间
  95: 118,   // 通用草药 → 玫瑰 Rosa 田间
  96: 120,   // 通用草药 → 绿茶 Camellia sinensis 田间
  90: 50,    // 包材占位 → 包材陈列
  91: 50,
  3: 12,     // 口腔站首页那张通用美妆图 → 牙膏/口腔护理
};

const rows = d1(`SELECT i.block_id, i.lang, i.data_json, b.type, p.site_id, p.slug
                   FROM block_i18n i
                   JOIN blocks b ON b.id = i.block_id
                   JOIN pages  p ON p.id = b.page_id
                  WHERE b.is_visible = 1`);

const sql = [];
let touched = 0, swaps = 0;
const perBlock = new Map();

for (const r of rows) {
  let s = r.data_json, changed = false;
  for (const [from, to] of Object.entries(SWAP)) {
    // 必须用后界断言,否则 /media/9 会命中 /media/90、/media/96
    const re = new RegExp(`/media/${from}(?![0-9])`, 'g');
    const n = (s.match(re) || []).length;
    if (n) { s = s.replace(re, `/media/${to}`); changed = true; swaps += n; }
  }
  if (changed) {
    sql.push(`UPDATE block_i18n SET data_json=${lit(s)} WHERE block_id=${r.block_id} AND lang=${lit(r.lang)};`);
    touched++;
    perBlock.set(r.block_id, `${r.site_id} /${r.slug || '首页'} ${r.type}`);
  }
}

/* 图库清理。只删**没有任何版块引用**的:
   demo 目录里那批早期误抓的 CC0 素材,和从没用上的占位图。 */
const allData = rows.map((r) => r.data_json).join(' ');
const media = d1(`SELECT id, folder, alt_zh FROM media`);
const dead = media.filter((m) => {
  if (!/占位|^demo$/.test(String(m.folder))) return false;
  // 换图之后的引用情况要按**换完的结果**判,所以先看原文再看 SWAP 目标
  if (Object.prototype.hasOwnProperty.call(SWAP, String(m.id))) return true;   // 已被换掉,必然没人用了
  return !new RegExp(`/media/${m.id}(?![0-9])`).test(allData);
});

if (dead.length) {
  sql.push(`DELETE FROM product_media WHERE media_id IN (${dead.map((m) => m.id).join(',')});`);
  sql.push(`UPDATE products SET cover_media = NULL WHERE cover_media IN (${dead.map((m) => m.id).join(',')});`);
  sql.push(`DELETE FROM media WHERE id IN (${dead.map((m) => m.id).join(',')});`);
}

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/swap.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });

console.log(`换图:${swaps} 处引用,涉及 ${touched} 条译文 / ${perBlock.size} 个版块`);
for (const [id, where] of [...perBlock].slice(0, 10)) console.log(`  #${id} ${where}`);
console.log(`\n清理图库:删掉 ${dead.length} 张(早期误抓的 CC0 素材 + 从没用上的占位图)`);
const left = d1(`SELECT folder, COUNT(*) n FROM media GROUP BY folder ORDER BY n DESC`);
console.log('  剩余:' + left.map((x) => `${x.folder} ${x.n}`).join(' · '));
