/**
 * 品牌名定稿(创始人 2026-08-31:「帛卉集团改成帛卉化妆品,英文还是 biosphere」)。
 * 口径:中文品牌行「帛卉化妆品」,英文/小语种品牌行只用「BIOSPHERE」;
 * 法务页(privacy/terms)的运营主体保留法人全称(中「广州市帛卉化妆品有限公司」/
 * 英「Guangzhou Biosphere Cosmetics Co., Ltd.」)—— 模式刻意绕开它们。
 */
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const PATS = {
  'zh-cn': [
    ['帛卉 · BIOSPHERE 智造平台', '帛卉化妆品 · BIOSPHERE 智造平台'],
    ['广州市帛卉化妆品有限公司 · BIOSPHERE', '帛卉化妆品 · BIOSPHERE'],   // 店招品牌行;法务页无此后缀,不会误伤
    ['BOHUI · 帛卉', 'BIOSPHERE · 帛卉化妆品'],
    ['帛卉自有品牌', '帛卉化妆品自有品牌'],
  ],
  en: [
    ['Guangzhou Biosphere Cosmetics · BIOSPHERE Manufacturing', 'BIOSPHERE Manufacturing'],
    ['Guangzhou Biosphere Cosmetics Co., Ltd. · BIOSPHERE', 'BIOSPHERE'],
    ['Guangzhou Biosphere Cosmetics manufacturing base', 'BIOSPHERE manufacturing base'],
  ],
  jp: [
    ['帛卉 BIOSPHERE スマート製造プラットフォーム', 'BIOSPHERE スマート製造プラットフォーム'],
    ['帛卉生産拠点', 'BIOSPHERE 生産拠点'],
  ],
};

const touched = new Set();
for (const [lang, pats] of Object.entries(PATS)) {
  /* 候选面收窄:只扫含品牌关键字的行,避免全表逐行 */
  const rows = d1(`SELECT rowid rid, block_id bid, data_json d FROM block_i18n WHERE lang='${lang}' AND (data_json LIKE '%BIOSPHERE%' OR data_json LIKE '%帛卉%' OR data_json LIKE '%BOHUI%')`);
  for (const r of rows) {
    let s = r.d;
    for (const [from, to] of pats) s = s.split(from).join(to);
    if (s !== r.d) {
      d1(`UPDATE block_i18n SET data_json=${lit(s)} WHERE rowid=${r.rid}`);
      touched.add(r.bid); console.log(`${lang} #${r.bid} ✓`);
    }
  }
}

if (touched.size) {
  const ids = [...touched].join(',');
  const del = d1(`DELETE FROM block_i18n WHERE block_id IN (${ids}) AND lang NOT IN ('zh-cn','en','jp','th') RETURNING block_id`);
  console.log(`小语种旧译删 ${del.length} 行(块 ${ids})`);
}

/* 复扫:品牌行不应再出现旧口径(法务页的法人全称除外) */
const chk = d1(`SELECT COUNT(*) n FROM block_i18n i JOIN blocks b ON b.id=i.block_id JOIN pages p ON p.id=b.page_id WHERE i.lang IN ('zh-cn','en') AND b.type <> 'legal' AND (i.data_json LIKE '%帛卉 · BIOSPHERE%' OR i.data_json LIKE '%BOHUI ·%' OR i.data_json LIKE '%Guangzhou Biosphere Cosmetics ·%')`);
console.log('非法务页旧口径残留:', chk[0].n);
