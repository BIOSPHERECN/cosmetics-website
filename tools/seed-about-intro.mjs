/**
 * 关于我们 · 帛卉正式介绍(创始人 2026-08-31:「要有帛卉的介绍啊!之前PPT里面也有」)。
 * 文案照抄《帛卉公司介绍_2026.pdf》第 1-2 页原稿(关于帛卉 / KEY FIGURES),
 * 品牌口径同日定稿:中文「帛卉化妆品」,英文 BIOSPHERE。
 * 新增精确地点口径(PDF 第 2 页):广州白云 + 印尼唐格朗双基地。
 * 同步:①hero lead 换 PDF 定位句;②site_i18n 站点描述去「集团」(meta/JSON-LD 残留 4 处的出处)。
 */
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

/* ── ① about hero(#93)lead 换 PDF 定位句 ─────────────────── */
for (const [lang, lead] of [
  ['zh-cn', 'AI 驱动的草本生物科技美妆产业创新平台 —— 帛卉化妆品立足广州、布局印尼,为全球美妆品牌提供从配方到成品的智造服务。'],
  ['en', 'An AI-driven herbal biotech beauty innovation platform — BIOSPHERE runs from Guangzhou and Indonesia, manufacturing for beauty brands worldwide from formula to finished product.'],
]) {
  const r = d1(`SELECT rowid rid, data_json d FROM block_i18n WHERE block_id=93 AND lang='${lang}'`)[0];
  if (r) { const data = JSON.parse(r.d); data.lead = lead;
    d1(`UPDATE block_i18n SET data_json=${lit(JSON.stringify(data))}, mt=0 WHERE rowid=${r.rid}`); console.log('hero', lang, '✓'); }
}

/* ── ② 正式介绍段(PDF 原稿)插在 prose(20)与 statsband(30)之间 ── */
const introZh = {
  paragraphs: [
    '帛卉化妆品(广州市帛卉化妆品有限公司)立足广州、布局印尼,是一家集「数据洞察、智能研发、柔性智造、品牌孵化、全球服务」于一体的草本美妆产业平台。',
    '以东方草本与亚马逊植物双源原料为根基,AI 算法贯穿配方研发与生产全流程,为美妆品牌提供从 0 到 1 的全链路赋能。',
    '双基地布局:广州白云 + 印尼唐格朗。20,000+ ㎡ 全球生产基地、15 条智能生产线、13,000+ 个成熟配方储备、300+ 家战略供应商;ISO 22716、GMPC、HALAL 认证与美国 FDA 注册、欧盟 CPNP 通报覆盖全球市场准入。',
  ],
};
const introEn = {
  paragraphs: [
    'BIOSPHERE (Guangzhou Biosphere Cosmetics Co., Ltd.) operates from Guangzhou with a second base in Indonesia — a herbal beauty platform uniting data insight, smart R&D, flexible manufacturing, brand incubation and global service.',
    'Built on dual-source raw materials — Eastern herbs and Amazonian botanicals — with AI running through formulation and production end to end, we enable beauty brands from zero to one.',
    'Dual bases: Baiyun, Guangzhou and Tangerang, Indonesia. 20,000+ m² of production floor, 15 smart lines, 13,000+ proven formulations and 300+ strategic suppliers; ISO 22716, GMPC and HALAL certification plus US FDA registration and EU CPNP notification cover global market entry.',
  ],
};
d1(`DELETE FROM block_i18n WHERE block_id IN (SELECT id FROM blocks WHERE page_id=36 AND sort_order=25)`);
d1(`DELETE FROM blocks WHERE page_id=36 AND sort_order=25`);
d1(`INSERT INTO blocks (page_id, type, sort_order, is_visible) VALUES (36, 'prose', 25, 1)`);
d1(`INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES
  (last_insert_rowid(), 'zh-cn', ${lit(JSON.stringify(introZh))}, 0),
  ((SELECT id FROM blocks WHERE page_id=36 AND sort_order=25), 'en', ${lit(JSON.stringify(introEn))}, 0)`);
console.log('公司介绍段 ✓');

/* 旧 prose(#94)与新介绍首段重复度高 → 下线,避免「关于我们」开头说两遍同一件事 */
d1(`UPDATE blocks SET is_visible=0 WHERE id=94`);
console.log('旧 prose #94 下线 ✓');

/* ── ③ site_i18n 站点描述去「集团」(meta/JSON-LD 的 4 处残留)── */
const descZh = 'AI 驱动的草本生物科技美妆产业创新平台。帛卉化妆品立足广州、布局印尼,集数据洞察、智能研发、柔性智造、品牌孵化、全球服务于一体,为美妆品牌提供从 0 到 1 的全链路赋能。';
const descEn = 'An AI-driven herbal biotech beauty innovation platform. BIOSPHERE runs dual bases in Guangzhou and Indonesia — data insight, smart R&D, flexible manufacturing, brand incubation and global service, enabling beauty brands from zero to one.';
d1(`UPDATE site_i18n SET description=${lit(descZh)} WHERE site_id='biosphere-ai' AND lang='zh-cn'`);
d1(`UPDATE site_i18n SET description=${lit(descEn)} WHERE site_id='biosphere-ai' AND lang='en'`);
/* 其余语种旧描述译自「集团」版 → 先用英文顶上(可读且无旧叙事),班车重翻由 mt 流程接手 */
const n = d1(`UPDATE site_i18n SET description=${lit(descEn)}, mt=1 WHERE site_id='biosphere-ai' AND lang NOT IN ('zh-cn','en') RETURNING lang`);
console.log('站点描述:zh/en 重写,', n.length, '个小语种暂用英文待重翻');
