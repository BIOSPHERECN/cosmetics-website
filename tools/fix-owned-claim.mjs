/**
 * 失实主张清除(创始人 2026-08-31:「工厂是租赁的,『自有厂房,非租赁代工』删除」)。
 * 数字纪律的镜像条款:资料没有的不写,**与事实相反的更不能写**。
 * 「自有品牌 / 自有仓储」不在清理之列(后者是 PDF 原口径)。
 * 替换原则:不说产权,说可验证的事实 —— 双基地实体、可验厂、产能与认证。
 */
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const PATS = {
  'zh-cn': [
    ['自有厂房,非租赁代工', '广州 + 印尼双基地实拍'],
    ['自有厂房不是租赁转包,', ''],
    ['有没有自有工厂、', '工厂实体与产能可不可验、'],
    ['以自有工厂与研发中心为核心', '以广州、印尼双基地工厂与研发中心为核心'],
    ['15条 条自动化产线', '15 条自动化产线'],   // 顺手修笔误
  ],
  en: [
    ['our own factory, not leased subcontracting', 'our Guangzhou and Indonesia plants'],
    ['wholly-owned factory', 'production base'],
    ['own factory and R&D centre at the core', 'Guangzhou and Indonesia plants and an R&D centre at the core'],
    ['whether they own the factory', 'whether the factory and its capacity can be verified'],
  ],
};

const touched = new Set();
for (const [lang, pats] of Object.entries(PATS)) {
  const rows = d1(`SELECT rowid rid, block_id bid, data_json d FROM block_i18n WHERE lang='${lang}' AND (data_json LIKE '%自有厂房%' OR data_json LIKE '%自有工厂%' OR data_json LIKE '%租赁%' OR data_json LIKE '%own factory%' OR data_json LIKE '%wholly-owned%' OR data_json LIKE '%15条 条%')`);
  for (const r of rows) {
    let s = r.d;
    for (const [from, to] of pats) s = s.split(from).join(to);
    if (s !== r.d) {
      d1(`UPDATE block_i18n SET data_json=${lit(s)} WHERE rowid=${r.rid}`);
      touched.add(r.bid); console.log(`${lang} #${r.bid} ✓`);
    } else {
      console.log(`${lang} #${r.bid} 命中关键词但无模式匹配 —— 人工复核:`, r.d.slice(0, 120));
    }
  }
}

if (touched.size) {
  const ids = [...touched].join(',');
  const del = d1(`DELETE FROM block_i18n WHERE block_id IN (${ids}) AND lang NOT IN ('zh-cn','en') RETURNING block_id`);
  console.log(`小语种旧译删 ${del.length} 行(块 ${ids})`);
}
const left = d1(`SELECT COUNT(*) n FROM block_i18n WHERE data_json LIKE '%自有厂房%' OR data_json LIKE '%自有工厂%'`);
console.log('「自有厂房/自有工厂」残留:', left[0].n);
