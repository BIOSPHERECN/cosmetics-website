/**
 * 把已写好的 5 站 × 4 语内容灌进 D1。
 * 生成 SQL 到 packages/cms/seed.sql,再由 wrangler 执行。
 *
 * 为什么先生成文件再执行,而不是逐条调 API:
 * D1 的 --file 是一次事务批量执行,几百条语句一次往返;逐条调用要几百次往返,慢且容易半途失败留下脏数据。
 *
 * 幂等:每次先 DELETE 再 INSERT(只删本脚本管的内容表,不碰 users / media / inquiries),
 * 所以可以反复跑,不会越跑越多。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from '../packages/core/src/registry.ts';
import { HOME } from '../packages/core/src/content/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['zh-cn', 'zh-tw', 'en', 'ja'];
const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => q(JSON.stringify(v ?? {}));

/** 页面骨架 —— 对标 Intercos(6 顶级×15 二级)与 KDC-One(7 顶级)的两级结构 */
const PAGE_TREE = [
  { slug: '', tpl: 'home', nav: 0, label: { 'zh-cn': '首页', 'zh-tw': '首頁', en: 'Home', ja: 'ホーム' },
    title: { 'zh-cn': '首页', 'zh-tw': '首頁', en: 'Home', ja: 'ホーム' } },

  { slug: 'about', tpl: 'standard', nav: 1,
    label: { 'zh-cn': '关于我们', 'zh-tw': '關於我們', en: 'About us', ja: '会社概要' },
    title: { 'zh-cn': '关于我们', 'zh-tw': '關於我們', en: 'About us', ja: '会社概要' },
    children: [
      { slug: 'about/group', label: { 'zh-cn': '集团概况', 'zh-tw': '集團概況', en: 'The Group', ja: 'グループ概要' } },
      { slug: 'about/history', label: { 'zh-cn': '发展历程', 'zh-tw': '發展歷程', en: 'History', ja: '沿革' } },
      { slug: 'about/plants', label: { 'zh-cn': '工厂与产能', 'zh-tw': '工廠與產能', en: 'Plants & capacity', ja: '工場と生産能力' } },
    ] },

  { slug: 'capabilities', tpl: 'standard', nav: 1,
    label: { 'zh-cn': '能力与服务', 'zh-tw': '能力與服務', en: 'What we do', ja: '事業内容' },
    title: { 'zh-cn': '能力与服务', 'zh-tw': '能力與服務', en: 'What we do', ja: '事業内容' },
    children: [
      { slug: 'capabilities/manufacturing', label: { 'zh-cn': '生产制造', 'zh-tw': '生產製造', en: 'Manufacturing', ja: '製造' } },
      { slug: 'capabilities/incubation', label: { 'zh-cn': '品牌孵化', 'zh-tw': '品牌孵化', en: 'Brand incubation', ja: 'ブランド育成' } },
      { slug: 'capabilities/packaging', label: { 'zh-cn': '包材方案', 'zh-tw': '包材方案', en: 'Packaging', ja: '容器' } },
    ] },

  { slug: 'rnd', tpl: 'standard', nav: 1,
    label: { 'zh-cn': '研发创新', 'zh-tw': '研發創新', en: 'Research & innovation', ja: '研究開発' },
    title: { 'zh-cn': '研发创新', 'zh-tw': '研發創新', en: 'Research & innovation', ja: '研究開発' },
    children: [
      { slug: 'rnd/formulation', label: { 'zh-cn': '技术与配方', 'zh-tw': '技術與配方', en: 'Technology', ja: '技術と処方' } },
      { slug: 'rnd/lab', label: { 'zh-cn': '实验室与检测', 'zh-tw': '實驗室與檢測', en: 'Lab & testing', ja: '試験' } },
    ] },

  { slug: 'products', tpl: 'products', nav: 1,
    label: { 'zh-cn': '产品品类', 'zh-tw': '產品品類', en: 'Products', ja: '製品' },
    title: { 'zh-cn': '产品品类', 'zh-tw': '產品品類', en: 'Products', ja: '製品' } },

  { slug: 'quality', tpl: 'standard', nav: 1,
    label: { 'zh-cn': '质量与合规', 'zh-tw': '品質與法規', en: 'Quality & compliance', ja: '品質と法規' },
    title: { 'zh-cn': '质量与合规', 'zh-tw': '品質與法規', en: 'Quality & compliance', ja: '品質と法規' } },

  { slug: 'contact', tpl: 'contact', nav: 1,
    label: { 'zh-cn': '联系询盘', 'zh-tw': '聯絡詢價', en: 'Contact', ja: 'お問い合わせ' },
    title: { 'zh-cn': '联系询盘', 'zh-tw': '聯絡詢價', en: 'Contact', ja: 'お問い合わせ' } },

  // 出海站必备的法务页,标杆站 KDC-One 页脚就有 Privacy / Legal Notices
  { slug: 'privacy', tpl: 'legal', nav: 0,
    label: { 'zh-cn': '隐私政策', 'zh-tw': '隱私政策', en: 'Privacy policy', ja: 'プライバシー' },
    title: { 'zh-cn': '隐私政策', 'zh-tw': '隱私政策', en: 'Privacy policy', ja: 'プライバシーポリシー' } },
  { slug: 'terms', tpl: 'legal', nav: 0,
    label: { 'zh-cn': '法律声明', 'zh-tw': '法律聲明', en: 'Legal notices', ja: '法的表示' },
    title: { 'zh-cn': '法律声明', 'zh-tw': '法律聲明', en: 'Legal notices', ja: '法的表示' } },
];

/** 首页版块序列 = PDF 定案 7 屏;某站没有对应内容时自动跳过 */
const HOME_BLOCKS = [
  { type: 'hero',     pick: (c) => ({ ...c.hero, stats: c.stats?.items ?? [] }) },
  { type: 'workshop', pick: (c) => c.workshop },
  { type: 'certs',    pick: (c) => c.certs },
  { type: 'matrix',   pick: (c) => c.matrix },
  { type: 'process',  pick: (c) => c.process },
  { type: 'evidence', pick: (c) => c.evidence },
  { type: 'proof',    pick: (c) => c.proof },
  { type: 'form',     pick: (c) => c.form },
  { type: 'inquiry',  pick: (c) => (c.form ? null : c.inquiry) },
];

const sql = [];
sql.push('-- 由 tools/seed-cms.mjs 生成,请勿手改。重跑本脚本即可刷新。');
sql.push('PRAGMA foreign_keys = ON;');
// 只清本脚本负责的内容表;users / media / inquiries 是运营数据,绝不动
sql.push('DELETE FROM block_i18n;', 'DELETE FROM blocks;', 'DELETE FROM page_i18n;', 'DELETE FROM pages;');
sql.push('DELETE FROM site_i18n;', 'DELETE FROM sites;');

let siteOrder = 0;
for (const s of SITES) {
  sql.push(
    `INSERT INTO sites (id, domain, brand_color, variant, is_live, sort_order) VALUES (${q(s.id)}, ${q(s.domain)}, ${q(s.brandColor)}, ${q(s.defaultVariant)}, 0, ${siteOrder++});`,
  );
  for (const lang of LANGS) {
    const c = HOME[s.id]?.[lang];
    sql.push(
      `INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES (${q(s.id)}, ${q(lang)}, ${q(s.name)}, ${q(c?.hero?.eyebrow ?? s.nameZh)}, ${q(c?.seo?.description ?? '')});`,
    );
  }

  // 页面(含二级)
  let pageOrder = 0;
  for (const p of PAGE_TREE) {
    sql.push(
      `INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (${q(s.id)}, ${q(p.slug)}, NULL, ${q(p.tpl)}, ${p.nav}, ${pageOrder++}, 'published');`,
    );
    // 用 (site_id, slug) 这个唯一键回查 page_id,而不是 last_insert_rowid():
    // page_i18n 也是有 rowid 的普通表,插进去之后 last_insert_rowid() 就变了,
    // 第二条起会把外键指到错误的行 —— 这是很隐蔽的一类脏数据。
    for (const lang of LANGS) {
      const c = HOME[s.id]?.[lang];
      const title = p.slug === '' ? (c?.seo?.title ?? p.title[lang]) : p.title[lang];
      const desc = p.slug === '' ? (c?.seo?.description ?? '') : '';
      sql.push(
        `INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, ${q(lang)}, ${q(p.label[lang])}, ${q(title)}, ${q(desc)} FROM pages WHERE site_id = ${q(s.id)} AND slug = ${q(p.slug)};`,
      );
    }
    for (const ch of p.children ?? []) {
      sql.push(
        `INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT ${q(s.id)}, ${q(ch.slug)}, id, 'standard', 1, ${pageOrder++}, 'published' FROM pages WHERE site_id = ${q(s.id)} AND slug = ${q(p.slug)};`,
      );
      for (const lang of LANGS) {
        sql.push(
          `INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, ${q(lang)}, ${q(ch.label[lang])}, ${q(ch.label[lang])}, NULL FROM pages WHERE site_id = ${q(s.id)} AND slug = ${q(ch.slug)};`,
        );
      }
    }
  }

  // 首页版块
  let blockOrder = 0;
  for (const b of HOME_BLOCKS) {
    const anyLang = LANGS.some((l) => b.pick(HOME[s.id]?.[l] ?? {}));
    if (!anyLang) continue;
    const ord = blockOrder++;
    sql.push(
      `INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, ${q(b.type)}, ${ord}, 1, '{}' FROM pages WHERE site_id = ${q(s.id)} AND slug = '';`,
    );
    // 同理不用 last_insert_rowid():靠 (站点, 首页, 版块类型, 序号) 回查 block_id
    for (const lang of LANGS) {
      const data = b.pick(HOME[s.id]?.[lang] ?? {});
      if (!data) continue;
      sql.push(
        `INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, ${q(lang)}, ${j(data)} FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = ${q(s.id)} AND pg.slug = '' AND bk.type = ${q(b.type)} AND bk.sort_order = ${ord};`,
      );
    }
  }
}

const out = join(ROOT, 'packages/cms/seed.sql');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sql.join('\n') + '\n', 'utf8');
console.log(`✓ 生成 ${sql.length} 条语句 → packages/cms/seed.sql`);
console.log(`  站点 ${SITES.length} 个 · 语言 ${LANGS.length} 种 · 每站页面 ${PAGE_TREE.length + PAGE_TREE.reduce((n, p) => n + (p.children?.length ?? 0), 0)} 个`);
