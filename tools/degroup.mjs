/**
 * 「先删除集团,只是帛卉」(创始人 2026-08-31)—— 内容层全站去集团化。
 *
 * 三类处理:
 *   ① 法务主体:「帛卉集团 BOHUI GROUP」→「广州市帛卉化妆品有限公司」
 *     (隐私/条款的运营主体写真实法人,本来就该如此);
 *   ② 品牌措辞:「帛卉集团…」→「帛卉…」;顺带修 #233 通告条的「香氛」品类口误;
 *   ③ 「集团概况」子页(about/group)整页转草稿下线(可逆,数据不删)。
 * 受改块的小语种旧译删除,交给已复活的 i18n 班车重翻。
 */
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

/* ── ② 通用措辞替换(zh-cn + en)────────────────────────── */
const ZH_PATTERNS = [
  ['帛卉集团 BOHUI GROUP', '广州市帛卉化妆品有限公司'],
  ['BOHUI · 帛卉集团', 'BOHUI · 帛卉'],
  ['帛卉集团智造平台', '帛卉草本美妆智造平台'],
  ['帛卉集团自有品牌', '帛卉自有品牌'],
  ['帛卉集团所有', '广州市帛卉化妆品有限公司所有'],
  ['帛卉集团 · BIOSPHERE', '帛卉 · BIOSPHERE'],
  ['集团品牌生态', '品牌矩阵'],
  ['集团旗下', '帛卉旗下'],
  ['集团自有品牌', '自有品牌'],
  ['帛卉集团', '帛卉'],
];
const EN_PATTERNS = [
  ['BOHUI GROUP · BIOSPHERE Manufacturing', 'Guangzhou Biosphere Cosmetics · BIOSPHERE Manufacturing'],
  ['BOHUI GROUP', 'Guangzhou Biosphere Cosmetics Co., Ltd.'],
  ['BOHUI Group', 'Guangzhou Biosphere Cosmetics'],
  ['Brand ecosystem', 'Brand portfolio'],
  ['the group', 'Biosphere'],
];

const touched = new Set();
for (const [lang, pats] of [['zh-cn', ZH_PATTERNS], ['en', EN_PATTERNS]]) {
  const needle = lang === 'zh-cn' ? '集团' : 'GROUP';
  const rows = d1(`SELECT i.rowid rid, i.block_id bid, i.data_json d FROM block_i18n i WHERE i.lang='${lang}' AND (i.data_json LIKE '%集团%' OR i.data_json LIKE '%BOHUI GROUP%' OR i.data_json LIKE '%BOHUI Group%')`);
  for (const r of rows) {
    let s = r.d;
    for (const [from, to] of pats) s = s.split(from).join(to);
    if (s !== r.d) {
      d1(`UPDATE block_i18n SET data_json=${lit(s)} WHERE rowid=${r.rid}`);
      touched.add(r.bid);
      console.log(`${lang} #${r.bid} ✓`);
    }
  }
}

/* jp/th 我手写过的店招行也带着 GROUP 字样 */
/* 长非 ASCII 模式会撞 SQLite「LIKE pattern too complex」→ 按块号直取,JS 里替换 */
const JPTH = {
  jp: [['BOHUI GROUP · BIOSPHERE スマート製造プラットフォーム', '帛卉 BIOSPHERE スマート製造プラットフォーム'], ['BOHUIグループ生産拠点', '帛卉生産拠点'], ['BOHUI GROUP', 'Biosphere']],
  th: [['BOHUI GROUP · แพลตฟอร์มการผลิตอัจฉริยะ BIOSPHERE', 'แพลตฟอร์มการผลิตอัจฉริยะ BIOSPHERE'], ['ฐานการผลิตของ BOHUI GROUP', 'ฐานการผลิตของ Biosphere'], ['BOHUI GROUP', 'Biosphere']],
};
for (const [lang, pats] of Object.entries(JPTH)) {
  const rows = d1(`SELECT rowid rid, block_id bid, data_json d FROM block_i18n WHERE lang='${lang}' AND block_id IN (234, 343)`);
  for (const r of rows) {
    let s = r.d;
    for (const [from, to] of pats) s = s.split(from).join(to);
    if (s !== r.d) {
      d1(`UPDATE block_i18n SET data_json=${lit(s)} WHERE rowid=${r.rid}`);
      touched.add(r.bid); console.log(`${lang} #${r.bid} ✓`);
    }
  }
}

/* #233 通告条重写(顺带修「香氛」品类口误) */
const ann = d1(`SELECT rowid rid, data_json d FROM block_i18n WHERE block_id=233 AND lang='zh-cn'`)[0];
if (ann) {
  const data = JSON.parse(ann.d);
  data.text = 'BIOSPHERE-AI · 帛卉草本美妆智造平台 · 护肤 / 彩妆 / 身体洗护 / 口腔护理四线并行';
  d1(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(data))} WHERE rowid=${ann.rid}`);
  touched.add(233); console.log('#233 通告条重写 ✓');
}

/* ── ③ 「集团概况」子页下线(全部站点,草稿态可逆)──────────── */
const gp = d1(`UPDATE pages SET status='draft', in_nav=0 WHERE slug='about/group' RETURNING id, site_id`);
console.log('about/group 下线:', JSON.stringify(gp));

/* ── 小语种旧译删除 → 班车重翻 ─────────────────────────────── */
if (touched.size) {
  const ids = [...touched].join(',');
  const del = d1(`DELETE FROM block_i18n WHERE block_id IN (${ids}) AND lang NOT IN ('zh-cn','en','jp','th') RETURNING block_id`);
  console.log(`小语种旧译删 ${del.length} 行(块 ${ids})`);
}

/* 复扫余量 */
const left = d1(`SELECT COUNT(*) n FROM block_i18n WHERE lang IN ('zh-cn','en') AND (data_json LIKE '%帛卉集团%' OR data_json LIKE '%BOHUI GROUP%')`);
console.log('剩余「帛卉集团/BOHUI GROUP」:', left[0].n);
