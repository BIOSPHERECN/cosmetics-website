-- 由 tools/seed-cms.mjs 生成,请勿手改。重跑本脚本即可刷新。
PRAGMA foreign_keys = ON;
DELETE FROM block_i18n;
DELETE FROM blocks;
DELETE FROM page_i18n;
DELETE FROM pages;
DELETE FROM site_i18n;
DELETE FROM sites;
INSERT INTO sites (id, domain, brand_color, variant, is_live, sort_order) VALUES ('beauty2oem', 'beauty2oem.com', '#a8823c', 'v1', 0, 0);
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('beauty2oem', 'zh-cn', 'BEAUTY2OEM', '智造之美', '全品类美妆制造、品牌孵化与定制、供应链整合与全球交付。帛卉集团旗下美妆智造平台,以研发实力与产能规模支撑品牌从 0 到量产。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('beauty2oem', 'zh-tw', 'BEAUTY2OEM', '智造之美', '全品類美妝製造、品牌孵化與定制、供應鏈整合與全球交付。帛卉集團旗下美妝智造平台,以研發實力與產能規模支撐品牌從 0 到量產。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('beauty2oem', 'en', 'BEAUTY2OEM', 'Intelligent Manufacturing', 'Full-category beauty manufacturing, brand incubation and customization, supply-chain integration and global delivery. The beauty manufacturing platform of BOHUI Group.');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('beauty2oem', 'ja', 'BEAUTY2OEM', 'スマート製造', '全カテゴリー化粧品製造、ブランド育成とカスタマイズ、サプライチェーン統合、グローバル納品。帛卉グループの化粧品スマート製造プラットフォーム。');
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', '', NULL, 'home', 0, 0, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '首页', '全球美妆智能制造平台', '全品类美妆制造、品牌孵化与定制、供应链整合与全球交付。帛卉集团旗下美妆智造平台,以研发实力与产能规模支撑品牌从 0 到量产。' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '首頁', '全球美妝智能製造平台', '全品類美妝製造、品牌孵化與定制、供應鏈整合與全球交付。帛卉集團旗下美妝智造平台,以研發實力與產能規模支撐品牌從 0 到量產。' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Home', 'Global Intelligent Beauty Manufacturing', 'Full-category beauty manufacturing, brand incubation and customization, supply-chain integration and global delivery. The beauty manufacturing platform of BOHUI Group.' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'ホーム', 'グローバル美容スマート製造プラットフォーム', '全カテゴリー化粧品製造、ブランド育成とカスタマイズ、サプライチェーン統合、グローバル納品。帛卉グループの化粧品スマート製造プラットフォーム。' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', 'about', NULL, 'standard', 1, 1, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '关于我们', '关于我们', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '關於我們', '關於我們', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'About us', 'About us', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '会社概要', '会社概要', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'beauty2oem', 'about/group', id, 'standard', 1, 2, 'published' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '集团概况', '集团概况', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '集團概況', '集團概況', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'The Group', 'The Group', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'グループ概要', 'グループ概要', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/group';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'beauty2oem', 'about/history', id, 'standard', 1, 3, 'published' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '发展历程', '发展历程', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '發展歷程', '發展歷程', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'History', 'History', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '沿革', '沿革', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/history';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'beauty2oem', 'about/plants', id, 'standard', 1, 4, 'published' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '工厂与产能', '工厂与产能', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '工廠與產能', '工廠與產能', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Plants & capacity', 'Plants & capacity', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '工場と生産能力', '工場と生産能力', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'about/plants';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', 'capabilities', NULL, 'standard', 1, 5, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '能力与服务', '能力与服务', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '能力與服務', '能力與服務', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'What we do', 'What we do', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '事業内容', '事業内容', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'beauty2oem', 'capabilities/manufacturing', id, 'standard', 1, 6, 'published' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '生产制造', '生产制造', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '生產製造', '生產製造', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Manufacturing', 'Manufacturing', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '製造', '製造', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/manufacturing';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'beauty2oem', 'capabilities/incubation', id, 'standard', 1, 7, 'published' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Brand incubation', 'Brand incubation', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'ブランド育成', 'ブランド育成', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/incubation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'beauty2oem', 'capabilities/packaging', id, 'standard', 1, 8, 'published' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Packaging', 'Packaging', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '容器', '容器', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'capabilities/packaging';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', 'rnd', NULL, 'standard', 1, 9, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '研发创新', '研发创新', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '研發創新', '研發創新', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Research & innovation', 'Research & innovation', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '研究開発', '研究開発', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'beauty2oem', 'rnd/formulation', id, 'standard', 1, 10, 'published' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '技术与配方', '技术与配方', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '技術與配方', '技術與配方', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Technology', 'Technology', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '技術と処方', '技術と処方', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd/formulation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'beauty2oem', 'rnd/lab', id, 'standard', 1, 11, 'published' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '实验室与检测', '实验室与检测', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '實驗室與檢測', '實驗室與檢測', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Lab & testing', 'Lab & testing', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '試験', '試験', NULL FROM pages WHERE site_id = 'beauty2oem' AND slug = 'rnd/lab';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', 'products', NULL, 'products', 1, 12, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '产品品类', '产品品类', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '產品品類', '產品品類', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Products', 'Products', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '製品', '製品', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'products';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', 'quality', NULL, 'standard', 1, 13, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '质量与合规', '质量与合规', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '品質與法規', '品質與法規', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Quality & compliance', 'Quality & compliance', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '品質と法規', '品質と法規', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'quality';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', 'contact', NULL, 'contact', 1, 14, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '联系询盘', '联系询盘', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '聯絡詢價', '聯絡詢價', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Contact', 'Contact', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'お問い合わせ', 'お問い合わせ', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'contact';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', 'privacy', NULL, 'legal', 0, 15, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '隐私政策', '隐私政策', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '隱私政策', '隱私政策', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Privacy policy', 'Privacy policy', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'プライバシー', 'プライバシーポリシー', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'privacy';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('beauty2oem', 'terms', NULL, 'legal', 0, 16, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '法律声明', '法律声明', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '法律聲明', '法律聲明', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Legal notices', 'Legal notices', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '法的表示', '法的表示', '' FROM pages WHERE site_id = 'beauty2oem' AND slug = 'terms';
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'hero', 0, 1, '{}' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"eyebrow":"智造之美","title":"从配方到成品,一站式美妆智能制造","lead":"我们不只是代工车间。从配方研发、包材选型、合规备案到全球交付,把一个想法变成能上架的产品,中间的每一环我们都替品牌方跑通。","ctaPrimary":"发起询盘","ctaSecondary":"查看制造能力","stats":[{"value":"1.2 亿支","label":"年综合产能","note":"按标准品折算"},{"value":"8 大品类","label":"覆盖品类","note":"护肤 / 彩妆 / 洁护 / 香氛等"},{"value":"120 人","label":"研发与工艺团队"},{"value":"46 国","label":"累计交付国家与地区"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"eyebrow":"智造之美","title":"從配方到成品,一站式美妝智能製造","lead":"我們不只是代工車間。從配方研發、包材選型、法規備案到全球交付,把一個想法變成能上架的產品,中間每一環我們都替品牌方跑通。","ctaPrimary":"發起詢價","ctaSecondary":"查看製造能力","stats":[{"value":"1.2 億支","label":"年綜合產能","note":"按標準品折算"},{"value":"8 大品類","label":"覆蓋品類","note":"護膚 / 彩妝 / 潔護 / 香氛等"},{"value":"120 人","label":"研發與製程團隊"},{"value":"46 國","label":"累計交付國家與地區"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"eyebrow":"Intelligent Manufacturing","title":"From formula to finished product — one manufacturing partner","lead":"We are more than a filling line. Formulation, packaging selection, regulatory registration, global delivery — every step between an idea and a shelf-ready product is one we run on your behalf.","ctaPrimary":"Start an inquiry","ctaSecondary":"See our capabilities","stats":[{"value":"120M units","label":"Annual capacity","note":"standard-unit equivalent"},{"value":"8 categories","label":"Categories covered","note":"skincare, colour, cleansing, fragrance and more"},{"value":"120","label":"R&D and process engineers"},{"value":"46","label":"Countries and regions shipped to"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"eyebrow":"スマート製造","title":"処方から完成品まで、一貫したスマート製造","lead":"当社は充填工場にとどまりません。処方開発、容器選定、法規登録、グローバル納品 —— アイデアが棚に並ぶ製品になるまでの各工程を、ブランド様に代わって進めます。","ctaPrimary":"お問い合わせ","ctaSecondary":"製造能力を見る","stats":[{"value":"1.2 億本","label":"年間総生産能力","note":"標準品換算"},{"value":"8 カテゴリー","label":"対応カテゴリー","note":"スキンケア / メイク / 洗浄 / フレグランス ほか"},{"value":"120 名","label":"研究開発・製造技術チーム"},{"value":"46 か国","label":"累計納品国・地域"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'certs', 1, 1, '{}' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"资质与合规","note":"证书编号与有效期可在询盘后提供扫描件核验。出口目的地不同,所需合规文件不同,我们按目的地清单逐项准备。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妆品良好生产规范 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"质量管理体系"},{"id":"iso14001","label":"ISO 14001","note":"环境管理体系"},{"id":"fda","label":"FDA","note":"美国食品药品监督管理局企业注册"},{"id":"cpnp","label":"EU CPNP","note":"欧盟化妆品法规通报"},{"id":"sgs","label":"SGS / Intertek","note":"第三方检测与验厂报告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"資質與合規","note":"證書編號與有效期可於詢價後提供掃描件核驗。出口目的地不同,所需合規文件亦不同,我們依目的地清單逐項準備。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妝品優良製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質管理系統"},{"id":"iso14001","label":"ISO 14001","note":"環境管理系統"},{"id":"fda","label":"FDA","note":"美國食品藥物管理局企業註冊"},{"id":"cpnp","label":"EU CPNP","note":"歐盟化妝品法規通報"},{"id":"sgs","label":"SGS / Intertek","note":"第三方檢測與驗廠報告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Certifications & compliance","note":"Certificate numbers and validity can be verified against scanned copies upon inquiry. Required documentation differs by destination market; we prepare each item against your destination checklist.","items":[{"id":"iso22716","label":"ISO 22716","note":"Good Manufacturing Practice for cosmetics"},{"id":"iso9001","label":"ISO 9001","note":"Quality management system"},{"id":"iso14001","label":"ISO 14001","note":"Environmental management system"},{"id":"fda","label":"FDA","note":"US FDA facility registration"},{"id":"cpnp","label":"EU CPNP","note":"EU cosmetic product notification"},{"id":"sgs","label":"SGS / Intertek","note":"Third-party testing and factory audit"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"認証とコンプライアンス","note":"証明書番号と有効期限は、お問い合わせ後にスキャンコピーでご確認いただけます。輸出先ごとに必要書類が異なるため、仕向地のチェックリストに沿って個別に準備します。","items":[{"id":"iso22716","label":"ISO 22716","note":"化粧品の適正製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質マネジメントシステム"},{"id":"iso14001","label":"ISO 14001","note":"環境マネジメントシステム"},{"id":"fda","label":"FDA","note":"米国 FDA 施設登録"},{"id":"cpnp","label":"EU CPNP","note":"EU 化粧品規則に基づく届出"},{"id":"sgs","label":"SGS / Intertek","note":"第三者試験・工場監査"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'matrix', 2, 1, '{}' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"四项核心能力","intro":"品牌方在不同阶段需要的东西不一样 —— 有的要一条配方,有的要一整套从 0 到 1。这四块能力可以单独用,也可以打包用。","items":[{"id":"manufacturing","title":"全品类美妆制造","desc":"护肤、彩妆、洁护、香氛四条产线并行,同一订单可跨品类组合,不必分散到多家工厂。","bullets":["乳化 / 灌装 / 压粉 / 冷制多工艺线","小批量试产与大货同线,配方一致性可控","半固体、液体、粉体剂型全覆盖"]},{"id":"incubation","title":"品牌孵化与定制","desc":"没有配方、没有包材、只有一个品牌想法,也能开始。我们从品类定位往回推,给出可执行的产品线规划。","bullets":["配方定制与既有配方复刻","包材选型与结构打样","视觉与文案的产品端落地建议"]},{"id":"supplychain","title":"供应链整合","desc":"原料、包材、检测、物流分散在不同供应商时,交期与成本最容易失控。我们把它收拢成一条链。","bullets":["原料溯源与替代方案库","包材集采,降低小单起订压力","第三方检测与合规文件统一归口"]},{"id":"delivery","title":"全球交付服务","desc":"出口目的地不同,合规要求与标签规则也不同。我们按目的地清单准备文件,不让货卡在关口。","bullets":["目的地合规文件逐项准备","多语言标签与说明书排版","海运 / 空运 / 快递多渠道方案"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"四項核心能力","intro":"品牌方在不同階段需要的東西不一樣 —— 有的要一條配方,有的要一整套從 0 到 1。這四塊能力可單獨使用,也可打包使用。","items":[{"id":"manufacturing","title":"全品類美妝製造","desc":"護膚、彩妝、潔護、香氛四條產線並行,同一訂單可跨品類組合,不必分散到多家工廠。","bullets":["乳化 / 充填 / 壓粉 / 冷製多製程線","小批試產與大貨同線,配方一致性可控","半固體、液體、粉體劑型全覆蓋"]},{"id":"incubation","title":"品牌孵化與定制","desc":"沒有配方、沒有包材、只有一個品牌想法,也能開始。我們從品類定位往回推,給出可執行的產品線規劃。","bullets":["配方定制與既有配方複刻","包材選型與結構打樣","視覺與文案的產品端落地建議"]},{"id":"supplychain","title":"供應鏈整合","desc":"原料、包材、檢測、物流分散在不同供應商時,交期與成本最容易失控。我們把它收攏成一條鏈。","bullets":["原料溯源與替代方案庫","包材集採,降低小單起訂壓力","第三方檢測與法規文件統一歸口"]},{"id":"delivery","title":"全球交付服務","desc":"出口目的地不同,法規要求與標籤規則也不同。我們依目的地清單準備文件,不讓貨卡在關口。","bullets":["目的地法規文件逐項準備","多語言標籤與說明書排版","海運 / 空運 / 快遞多管道方案"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Four core capabilities","intro":"Brands need different things at different stages — sometimes a single formula, sometimes the whole path from zero to one. These four blocks work on their own or together.","items":[{"id":"manufacturing","title":"Full-category manufacturing","desc":"Skincare, colour cosmetics, cleansing and fragrance lines run in parallel, so one order can span categories instead of being split across factories.","bullets":["Emulsion, filling, powder pressing and cold-process lines","Pilot batches share the line with production runs, keeping formula consistency controllable","Semi-solid, liquid and powder formats covered"]},{"id":"incubation","title":"Brand incubation and customization","desc":"No formula, no packaging, just a brand idea is enough to begin. We work backwards from category positioning to an executable product-line plan.","bullets":["Custom formulation and reproduction of existing formulas","Packaging selection and structural prototyping","Product-side guidance for visual identity and copy"]},{"id":"supplychain","title":"Supply-chain integration","desc":"When ingredients, packaging, testing and logistics sit with different vendors, lead time and cost are the first things to slip. We consolidate them into one chain.","bullets":["Ingredient traceability and a library of substitutes","Pooled packaging procurement to ease MOQ pressure","Third-party testing and compliance documents under one owner"]},{"id":"delivery","title":"Global delivery","desc":"Compliance and labelling rules differ by destination. We prepare documentation against the destination checklist so shipments do not stall at the border.","bullets":["Destination-specific compliance documentation","Multilingual labels and insert typesetting","Sea, air and courier routing options"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"四つの中核能力","intro":"ブランド様が必要とするものは段階ごとに異なります。処方一本の場合も、ゼロからの立ち上げ一式の場合もあります。四つの能力は単独でも、まとめてでもご利用いただけます。","items":[{"id":"manufacturing","title":"全カテゴリー製造","desc":"スキンケア、メイク、洗浄、フレグランスの四ラインが並行稼働。一つの発注でカテゴリーをまたげるため、複数工場に分散する必要がありません。","bullets":["乳化 / 充填 / プレス / 冷製の複数工程ライン","試作と量産が同一ライン、処方の再現性を管理","半固形・液体・粉体の剤形に対応"]},{"id":"incubation","title":"ブランド育成とカスタマイズ","desc":"処方も容器もなく、ブランドの構想だけでも着手できます。カテゴリー戦略から逆算し、実行可能な製品ライン計画をご提案します。","bullets":["処方のカスタム開発と既存処方の再現","容器選定と構造試作","ビジュアル・コピーの製品側への落とし込み"]},{"id":"supplychain","title":"サプライチェーン統合","desc":"原料、容器、試験、物流が別々の取引先に分散すると、納期とコストが真っ先に崩れます。当社はこれを一本の鎖にまとめます。","bullets":["原料のトレーサビリティと代替案のライブラリ","容器の共同調達で小ロットの負担を軽減","第三者試験と法規書類の窓口を一本化"]},{"id":"delivery","title":"グローバル納品","desc":"仕向地ごとに法規要件と表示ルールが異なります。仕向地チェックリストに沿って書類を準備し、通関で止まらないようにします。","bullets":["仕向地別の法規書類を個別準備","多言語ラベルと添付文書の組版","海上・航空・クーリエの複数ルート"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'process', 3, 1, '{}' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"合作怎么开始","intro":"从第一封邮件到第一批货,通常五步。每一步交付什么、需要你确认什么,我们提前写清楚。","steps":[{"no":"01","title":"需求对接","desc":"说清品类、目标市场、预算区间与期望上市时间,我们给出可行性判断与初步方案。"},{"no":"02","title":"配方打样","desc":"实验室出样,寄样确认肤感、外观与稳定性;需要调整的地方在这一步改完。"},{"no":"03","title":"样品确认","desc":"包材结构与成品样一并确认,同步启动第三方检测与合规文件。"},{"no":"04","title":"量产备案","desc":"按目的地完成备案与注册,量产排期锁定,原料与包材同步到位。"},{"no":"05","title":"交付履约","desc":"大货生产、出货检验、物流安排;交付后配方与工艺参数归档,便于返单复产。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"合作怎麼開始","intro":"從第一封郵件到第一批貨,通常五步。每一步交付什麼、需要你確認什麼,我們提前寫清楚。","steps":[{"no":"01","title":"需求對接","desc":"說清品類、目標市場、預算區間與期望上市時間,我們給出可行性判斷與初步方案。"},{"no":"02","title":"配方打樣","desc":"實驗室出樣,寄樣確認膚感、外觀與穩定性;需要調整的地方在這一步改完。"},{"no":"03","title":"樣品確認","desc":"包材結構與成品樣一併確認,同步啟動第三方檢測與法規文件。"},{"no":"04","title":"量產備案","desc":"依目的地完成備案與註冊,量產排期鎖定,原料與包材同步到位。"},{"no":"05","title":"交付履約","desc":"大貨生產、出貨檢驗、物流安排;交付後配方與製程參數歸檔,便於返單複產。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"How engagements start","intro":"From first email to first shipment is usually five steps. What each step delivers, and what we need you to sign off, is written down in advance.","steps":[{"no":"01","title":"Brief","desc":"Tell us the category, target market, budget range and intended launch date. We come back with a feasibility read and an outline plan."},{"no":"02","title":"Formulation","desc":"Lab samples are produced and shipped for sign-off on texture, appearance and stability. Adjustments happen here."},{"no":"03","title":"Sample approval","desc":"Packaging structure and finished samples are approved together, with third-party testing and compliance documents started in parallel."},{"no":"04","title":"Registration","desc":"Destination registration completed, production slot locked, ingredients and packaging staged."},{"no":"05","title":"Delivery","desc":"Production, outgoing inspection and logistics. Formula and process parameters are archived afterwards so repeat orders reproduce exactly."}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"進め方","intro":"最初のメールから初回出荷まで、通常は五段階です。各段階の成果物とご確認いただく事項は、あらかじめ明文化します。","steps":[{"no":"01","title":"ご要望の確認","desc":"カテゴリー、対象市場、予算帯、希望する発売時期をお知らせください。実現性の判断と概略案をご返答します。"},{"no":"02","title":"処方試作","desc":"ラボで試作品を製造し、使用感・外観・安定性のご確認用に発送します。調整はこの段階で完了させます。"},{"no":"03","title":"サンプル承認","desc":"容器構造と完成品サンプルを併せてご承認いただき、第三者試験と法規書類を並行して開始します。"},{"no":"04","title":"登録・届出","desc":"仕向地の届出・登録を完了し、量産枠を確保。原料と容器を同時に手配します。"},{"no":"05","title":"納品","desc":"量産、出荷検査、物流手配。納品後は処方と工程パラメータを保管し、リピート発注時に同一品を再現します。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'inquiry', 4, 1, '{}' FROM pages WHERE site_id = 'beauty2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"带着你的需求来,我们用一份可执行的方案回复","body":"无论是既有配方复刻、全新品类开发,还是只想先问问产能与起订量 —— 一封邮件即可开始,我们在两个工作日内给出书面回复。","button":"发起询盘"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"帶著你的需求來,我們以一份可執行的方案回覆","body":"無論是既有配方複刻、全新品類開發,或只想先問產能與起訂量 —— 一封郵件即可開始,我們於兩個工作日內提供書面回覆。","button":"發起詢價"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Bring us the brief — we reply with an actionable plan","body":"Whether it is reproducing an existing formula, developing a new category, or simply asking about capacity and MOQ — one email starts it. We respond in writing within two working days.","button":"Start an inquiry"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"ご要望をお寄せください。実行可能な提案でお返しします","body":"既存処方の再現、新カテゴリーの開発、あるいは生産能力と最小ロットのご確認だけでも構いません。メール一通から始まり、2 営業日以内に書面でご回答します。","button":"お問い合わせ"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'beauty2oem' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 4;
INSERT INTO sites (id, domain, brand_color, variant, is_live, sort_order) VALUES ('skin2oem', 'skin2oem.com', '#2e7c8c', 'v1', 0, 1);
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('skin2oem', 'zh-cn', 'SKIN2OEM', '科技之力', '护肤品研发制造、功效配方定制、高端护肤解决方案、品质与安全保障。帛卉集团旗下护肤智造平台。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('skin2oem', 'zh-tw', 'SKIN2OEM', '科技之力', '護膚品研發製造、功效配方定制、高端護膚解決方案、品質與安全保障。帛卉集團旗下護膚智造平台。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('skin2oem', 'en', 'SKIN2OEM', 'Technology Power', 'Skincare R&D and manufacturing, efficacy-driven custom formulation, premium skincare solutions, quality and safety assurance. The skincare platform of BOHUI Group.');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('skin2oem', 'ja', 'SKIN2OEM', '科学の力', 'スキンケアの研究開発と製造、有効性起点の処方カスタマイズ、高付加価値ソリューション、品質と安全の保証。帛卉グループのスキンケア製造プラットフォーム。');
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', '', NULL, 'home', 0, 0, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '首页', '全球护肤智能制造平台', '护肤品研发制造、功效配方定制、高端护肤解决方案、品质与安全保障。帛卉集团旗下护肤智造平台。' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '首頁', '全球護膚智能製造平台', '護膚品研發製造、功效配方定制、高端護膚解決方案、品質與安全保障。帛卉集團旗下護膚智造平台。' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Home', 'Global Intelligent Skincare Manufacturing', 'Skincare R&D and manufacturing, efficacy-driven custom formulation, premium skincare solutions, quality and safety assurance. The skincare platform of BOHUI Group.' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'ホーム', 'グローバルスキンケア・スマート製造プラットフォーム', 'スキンケアの研究開発と製造、有効性起点の処方カスタマイズ、高付加価値ソリューション、品質と安全の保証。帛卉グループのスキンケア製造プラットフォーム。' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', 'about', NULL, 'standard', 1, 1, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '关于我们', '关于我们', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '關於我們', '關於我們', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'About us', 'About us', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '会社概要', '会社概要', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'about';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'skin2oem', 'about/group', id, 'standard', 1, 2, 'published' FROM pages WHERE site_id = 'skin2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '集团概况', '集团概况', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '集團概況', '集團概況', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'The Group', 'The Group', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'グループ概要', 'グループ概要', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/group';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'skin2oem', 'about/history', id, 'standard', 1, 3, 'published' FROM pages WHERE site_id = 'skin2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '发展历程', '发展历程', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '發展歷程', '發展歷程', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'History', 'History', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '沿革', '沿革', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/history';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'skin2oem', 'about/plants', id, 'standard', 1, 4, 'published' FROM pages WHERE site_id = 'skin2oem' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '工厂与产能', '工厂与产能', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '工廠與產能', '工廠與產能', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Plants & capacity', 'Plants & capacity', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '工場と生産能力', '工場と生産能力', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'about/plants';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', 'capabilities', NULL, 'standard', 1, 5, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '能力与服务', '能力与服务', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '能力與服務', '能力與服務', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'What we do', 'What we do', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '事業内容', '事業内容', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'skin2oem', 'capabilities/manufacturing', id, 'standard', 1, 6, 'published' FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '生产制造', '生产制造', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '生產製造', '生產製造', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Manufacturing', 'Manufacturing', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '製造', '製造', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/manufacturing';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'skin2oem', 'capabilities/incubation', id, 'standard', 1, 7, 'published' FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Brand incubation', 'Brand incubation', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'ブランド育成', 'ブランド育成', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/incubation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'skin2oem', 'capabilities/packaging', id, 'standard', 1, 8, 'published' FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Packaging', 'Packaging', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '容器', '容器', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'capabilities/packaging';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', 'rnd', NULL, 'standard', 1, 9, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '研发创新', '研发创新', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '研發創新', '研發創新', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Research & innovation', 'Research & innovation', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '研究開発', '研究開発', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'skin2oem', 'rnd/formulation', id, 'standard', 1, 10, 'published' FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '技术与配方', '技术与配方', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '技術與配方', '技術與配方', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Technology', 'Technology', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '技術と処方', '技術と処方', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd/formulation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'skin2oem', 'rnd/lab', id, 'standard', 1, 11, 'published' FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '实验室与检测', '实验室与检测', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '實驗室與檢測', '實驗室與檢測', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Lab & testing', 'Lab & testing', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '試験', '試験', NULL FROM pages WHERE site_id = 'skin2oem' AND slug = 'rnd/lab';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', 'products', NULL, 'products', 1, 12, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '产品品类', '产品品类', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '產品品類', '產品品類', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Products', 'Products', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '製品', '製品', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'products';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', 'quality', NULL, 'standard', 1, 13, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '质量与合规', '质量与合规', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '品質與法規', '品質與法規', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Quality & compliance', 'Quality & compliance', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '品質と法規', '品質と法規', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'quality';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', 'contact', NULL, 'contact', 1, 14, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '联系询盘', '联系询盘', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '聯絡詢價', '聯絡詢價', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Contact', 'Contact', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'お問い合わせ', 'お問い合わせ', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'contact';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', 'privacy', NULL, 'legal', 0, 15, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '隐私政策', '隐私政策', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '隱私政策', '隱私政策', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Privacy policy', 'Privacy policy', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'プライバシー', 'プライバシーポリシー', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'privacy';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('skin2oem', 'terms', NULL, 'legal', 0, 16, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '法律声明', '法律声明', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '法律聲明', '法律聲明', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Legal notices', 'Legal notices', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '法的表示', '法的表示', '' FROM pages WHERE site_id = 'skin2oem' AND slug = 'terms';
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'hero', 0, 1, '{}' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"eyebrow":"科技之力","title":"功效不是形容词,是可以被测出来的数字","lead":"我们把「有效」拆成可验证的指标:活性物浓度、透皮效率、稳定性周期、人体功效测试数据。配方定制从这些数字开始,不从修辞开始。","ctaPrimary":"发起询盘","ctaSecondary":"查看研发能力","stats":[{"value":"2,400+","label":"配方数据库条目","note":"含稳定性与相容性记录"},{"value":"30 天","label":"常规打样周期","note":"复杂剂型另计"},{"value":"18 项","label":"出厂检验项目"},{"value":"10 万级","label":"洁净车间等级","note":"关键工序局部百级"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"eyebrow":"科技之力","title":"功效不是形容詞,是可以被測出來的數字","lead":"我們把「有效」拆成可驗證的指標:活性物濃度、透皮效率、穩定性週期、人體功效測試數據。配方定制從這些數字開始,不從修辭開始。","ctaPrimary":"發起詢價","ctaSecondary":"查看研發能力","stats":[{"value":"2,400+","label":"配方資料庫條目","note":"含穩定性與相容性紀錄"},{"value":"30 天","label":"常規打樣週期","note":"複雜劑型另計"},{"value":"18 項","label":"出廠檢驗項目"},{"value":"10 萬級","label":"無塵車間等級","note":"關鍵工序局部百級"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"eyebrow":"Technology Power","title":"Efficacy is not an adjective — it is a number you can measure","lead":"We break \"effective\" into verifiable indicators: active concentration, delivery efficiency, stability window, human efficacy test data. Custom formulation starts from those numbers, not from rhetoric.","ctaPrimary":"Start an inquiry","ctaSecondary":"See our R&D","stats":[{"value":"2,400+","label":"Formula database entries","note":"with stability and compatibility records"},{"value":"30 days","label":"Standard sampling cycle","note":"complex formats quoted separately"},{"value":"18","label":"Outgoing inspection items"},{"value":"ISO 8","label":"Cleanroom classification","note":"ISO 5 locally at critical steps"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"eyebrow":"科学の力","title":"有効性は形容詞ではなく、測定できる数値です","lead":"「効く」を検証可能な指標に分解します。有効成分濃度、経皮到達効率、安定性期間、ヒト試験データ —— 処方のカスタマイズは修辞ではなく、これらの数値から始まります。","ctaPrimary":"お問い合わせ","ctaSecondary":"研究開発を見る","stats":[{"value":"2,400+","label":"処方データベース件数","note":"安定性・相容性の記録を含む"},{"value":"30 日","label":"標準試作期間","note":"複雑な剤形は別途"},{"value":"18 項目","label":"出荷検査項目"},{"value":"ISO 8","label":"クリーンルーム等級","note":"重要工程は局所 ISO 5"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'certs', 1, 1, '{}' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"资质与合规","note":"证书编号与有效期可在询盘后提供扫描件核验。出口目的地不同,所需合规文件不同,我们按目的地清单逐项准备。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妆品良好生产规范 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"质量管理体系"},{"id":"iso14001","label":"ISO 14001","note":"环境管理体系"},{"id":"fda","label":"FDA","note":"美国食品药品监督管理局企业注册"},{"id":"cpnp","label":"EU CPNP","note":"欧盟化妆品法规通报"},{"id":"sgs","label":"SGS / Intertek","note":"第三方检测与验厂报告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"資質與合規","note":"證書編號與有效期可於詢價後提供掃描件核驗。出口目的地不同,所需合規文件亦不同,我們依目的地清單逐項準備。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妝品優良製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質管理系統"},{"id":"iso14001","label":"ISO 14001","note":"環境管理系統"},{"id":"fda","label":"FDA","note":"美國食品藥物管理局企業註冊"},{"id":"cpnp","label":"EU CPNP","note":"歐盟化妝品法規通報"},{"id":"sgs","label":"SGS / Intertek","note":"第三方檢測與驗廠報告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Certifications & compliance","note":"Certificate numbers and validity can be verified against scanned copies upon inquiry. Required documentation differs by destination market; we prepare each item against your destination checklist.","items":[{"id":"iso22716","label":"ISO 22716","note":"Good Manufacturing Practice for cosmetics"},{"id":"iso9001","label":"ISO 9001","note":"Quality management system"},{"id":"iso14001","label":"ISO 14001","note":"Environmental management system"},{"id":"fda","label":"FDA","note":"US FDA facility registration"},{"id":"cpnp","label":"EU CPNP","note":"EU cosmetic product notification"},{"id":"sgs","label":"SGS / Intertek","note":"Third-party testing and factory audit"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"認証とコンプライアンス","note":"証明書番号と有効期限は、お問い合わせ後にスキャンコピーでご確認いただけます。輸出先ごとに必要書類が異なるため、仕向地のチェックリストに沿って個別に準備します。","items":[{"id":"iso22716","label":"ISO 22716","note":"化粧品の適正製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質マネジメントシステム"},{"id":"iso14001","label":"ISO 14001","note":"環境マネジメントシステム"},{"id":"fda","label":"FDA","note":"米国 FDA 施設登録"},{"id":"cpnp","label":"EU CPNP","note":"EU 化粧品規則に基づく届出"},{"id":"sgs","label":"SGS / Intertek","note":"第三者試験・工場監査"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'matrix', 2, 1, '{}' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"四项核心能力","intro":"护肤品的难点不在「做出来」,在「做得稳、说得清、过得了检」。这四块能力对应的正是这三件事。","items":[{"id":"rnd","title":"护肤品研发制造","desc":"从概念配方到可量产工艺,实验室与产线用同一套参数,避免打样好看、大货翻车。","bullets":["乳液 / 精华 / 面霜 / 面膜 / 精华油全剂型","中试放大验证,配方一致性可追溯"]},{"id":"efficacy","title":"功效配方定制","desc":"按目标功效反推活性物组合与浓度区间,并给出对应的检测方案,让宣称有据可依。","bullets":["抗衰 / 美白 / 舒缓 / 屏障修护方向","活性物配伍与稳定性预实验"]},{"id":"premium","title":"高端护肤解决方案","desc":"高客单产品对肤感与质感的容错极低。我们在肤感调校上单独设一轮评估,不把它留给量产去赌。","bullets":["肤感盲测与感官评价","高端包材适配与相容性测试"]},{"id":"safety","title":"品质与安全保障","desc":"安全性数据是出口的通行证,也是品牌的护城河。人体安全性与功效测试统一归口安排。","bullets":["人体斑贴与功效测试对接","重金属 / 微生物 / 防腐挑战全项检"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"四項核心能力","intro":"護膚品的難點不在「做出來」,在「做得穩、說得清、過得了檢」。這四塊能力對應的正是這三件事。","items":[{"id":"rnd","title":"護膚品研發製造","desc":"從概念配方到可量產製程,實驗室與產線用同一套參數,避免打樣好看、大貨翻車。","bullets":["乳液 / 精華 / 面霜 / 面膜 / 精華油全劑型","中試放大驗證,配方一致性可追溯"]},{"id":"efficacy","title":"功效配方定制","desc":"依目標功效反推活性物組合與濃度區間,並給出對應的檢測方案,讓宣稱有據可依。","bullets":["抗衰 / 美白 / 舒緩 / 屏障修護方向","活性物配伍與穩定性預實驗"]},{"id":"premium","title":"高端護膚解決方案","desc":"高客單產品對膚感與質感的容錯極低。我們在膚感調校上單獨設一輪評估,不把它留給量產去賭。","bullets":["膚感盲測與感官評價","高端包材適配與相容性測試"]},{"id":"safety","title":"品質與安全保障","desc":"安全性數據是出口的通行證,也是品牌的護城河。人體安全性與功效測試統一歸口安排。","bullets":["人體貼膚與功效測試對接","重金屬 / 微生物 / 防腐挑戰全項檢"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Four core capabilities","intro":"The hard part of skincare is not making it — it is making it consistently, substantiating it, and passing inspection. These four capabilities address exactly that.","items":[{"id":"rnd","title":"Skincare R&D and manufacturing","desc":"From concept formula to a production-ready process, lab and line share one parameter set, so a good sample does not become a failed batch.","bullets":["Emulsions, serums, creams, masks and facial oils","Pilot scale-up validation with traceable formula consistency"]},{"id":"efficacy","title":"Efficacy-driven formulation","desc":"We work backwards from the target claim to an active combination and concentration range, and pair it with a testing plan that substantiates the claim.","bullets":["Anti-ageing, brightening, soothing and barrier repair","Active compatibility and stability pre-trials"]},{"id":"premium","title":"Premium skincare solutions","desc":"High-ticket products leave almost no margin for error on texture. We add a dedicated sensory round rather than gambling it on production.","bullets":["Blind sensory panels and evaluation","Premium packaging fit and compatibility testing"]},{"id":"safety","title":"Quality and safety assurance","desc":"Safety data is both an export passport and a brand moat. Human safety and efficacy testing are arranged under one owner.","bullets":["Human patch and efficacy test coordination","Heavy metals, microbiology and preservative challenge testing"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"四つの中核能力","intro":"スキンケアの難所は「作ること」ではなく、「安定して作り、根拠を示し、検査を通すこと」です。四つの能力はまさにこの三点に対応します。","items":[{"id":"rnd","title":"スキンケアの研究開発と製造","desc":"コンセプト処方から量産可能な工程まで、ラボと製造ラインが同一のパラメータを共有し、試作は良いのに量産で崩れる事態を防ぎます。","bullets":["乳液・美容液・クリーム・マスク・オイルの全剤形","パイロットスケールアップ検証と処方の追跡可能性"]},{"id":"efficacy","title":"有効性起点の処方設計","desc":"目標とする訴求から有効成分の組み合わせと濃度域を逆算し、対応する試験計画まで併せてご提示します。","bullets":["エイジングケア / 明るさ / 鎮静 / バリア補修","有効成分の配合適性と安定性の予備試験"]},{"id":"premium","title":"高付加価値ソリューション","desc":"高価格帯製品は使用感の許容幅が極めて狭いため、官能評価を独立した工程として設けます。","bullets":["ブラインド官能評価パネル","高級容器の適合性・相容性試験"]},{"id":"safety","title":"品質と安全の保証","desc":"安全性データは輸出の通行証であり、ブランドの堀でもあります。ヒト安全性試験と有効性試験を一元的に手配します。","bullets":["ヒトパッチ試験・有効性試験の手配","重金属 / 微生物 / 防腐力チャレンジ試験"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'process', 3, 1, '{}' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"合作怎么开始","intro":"功效类产品比普通品多一道验证环节,我们把它前置,避免上市前才发现宣称站不住。","steps":[{"no":"01","title":"功效目标定义","desc":"先确定要宣称什么、面向哪个市场,倒推所需的测试类型与合规口径。"},{"no":"02","title":"配方与预实验","desc":"活性物配伍、稳定性与相容性预实验同步跑,不合格的组合在这一步淘汰。"},{"no":"03","title":"打样与肤感调校","desc":"寄样确认;肤感单独一轮盲测评估,改到位再进下一步。"},{"no":"04","title":"功效与安全测试","desc":"按目标市场安排人体功效与安全性测试,拿到可支撑宣称的报告。"},{"no":"05","title":"量产与交付","desc":"备案完成后量产,出厂 18 项检验,交付后工艺参数归档便于返单。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"合作怎麼開始","intro":"功效類產品比一般品多一道驗證環節,我們把它前置,避免上市前才發現宣稱站不住。","steps":[{"no":"01","title":"功效目標定義","desc":"先確定要宣稱什麼、面向哪個市場,倒推所需的測試類型與法規口徑。"},{"no":"02","title":"配方與預實驗","desc":"活性物配伍、穩定性與相容性預實驗同步跑,不合格的組合在這一步淘汰。"},{"no":"03","title":"打樣與膚感調校","desc":"寄樣確認;膚感單獨一輪盲測評估,改到位再進下一步。"},{"no":"04","title":"功效與安全測試","desc":"依目標市場安排人體功效與安全性測試,取得可支撐宣稱的報告。"},{"no":"05","title":"量產與交付","desc":"備案完成後量產,出廠 18 項檢驗,交付後製程參數歸檔便於返單。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"How engagements start","intro":"Efficacy products carry one more validation step than ordinary ones. We move it early, so a claim never collapses just before launch.","steps":[{"no":"01","title":"Define the claim","desc":"Decide what will be claimed and for which market, then work backwards to the required test types and regulatory wording."},{"no":"02","title":"Formulation and pre-trials","desc":"Active compatibility, stability and packaging compatibility run in parallel; combinations that fail are eliminated here."},{"no":"03","title":"Sampling and sensory tuning","desc":"Samples shipped for approval, with a separate blind sensory round before moving on."},{"no":"04","title":"Efficacy and safety testing","desc":"Human efficacy and safety testing arranged for the target market, producing reports that support the claim."},{"no":"05","title":"Production and delivery","desc":"Production after registration, 18-item outgoing inspection, and archived process parameters for repeat orders."}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"進め方","intro":"有効性訴求製品は通常品より検証工程が一つ多くなります。当社はこれを前倒しし、発売直前に訴求が成り立たないという事態を避けます。","steps":[{"no":"01","title":"訴求目標の定義","desc":"何を訴求し、どの市場に向けるかを先に定め、必要な試験種別と法規上の表現を逆算します。"},{"no":"02","title":"処方と予備試験","desc":"配合適性、安定性、容器相容性の予備試験を並行実施し、不適合の組み合わせをこの段階で除外します。"},{"no":"03","title":"試作と使用感調整","desc":"サンプルを発送してご確認いただき、使用感については独立したブラインド評価を経て次工程へ進みます。"},{"no":"04","title":"有効性・安全性試験","desc":"対象市場に応じてヒト有効性試験と安全性試験を手配し、訴求を支える報告書を取得します。"},{"no":"05","title":"量産と納品","desc":"届出完了後に量産、18 項目の出荷検査を実施。納品後は工程パラメータを保管しリピート発注に備えます。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'evidence', 4, 1, '{}' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"宣称与支撑","intro":"每一句功效宣称背后应当有一份可出示的报告。以下为常见宣称与对应的支撑方式。","items":[{"claim":"保湿力提升","proof":"角质层含水量仪器测定,使用前后对比","source":"第三方人体功效测试"},{"claim":"屏障修护","proof":"经皮水分流失(TEWL)指标变化"},{"claim":"温和不刺激","proof":"人体斑贴试验,受试者无刺激反应"},{"claim":"配方稳定","proof":"加速稳定性试验,高低温与离心考察"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"宣稱與支撐","intro":"每一句功效宣稱背後都應有一份可出示的報告。以下為常見宣稱與對應的支撐方式。","items":[{"claim":"保濕力提升","proof":"角質層含水量儀器測定,使用前後對比","source":"第三方人體功效測試"},{"claim":"屏障修護","proof":"經皮水分流失(TEWL)指標變化"},{"claim":"溫和不刺激","proof":"人體貼膚試驗,受試者無刺激反應"},{"claim":"配方穩定","proof":"加速穩定性試驗,高低溫與離心考察"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Claims and substantiation","intro":"Every efficacy claim should have a report behind it that can be produced on request. Common claims and how they are supported:","items":[{"claim":"Improved hydration","proof":"Instrumental measurement of stratum corneum water content, before and after","source":"Third-party human efficacy testing"},{"claim":"Barrier repair","proof":"Change in trans-epidermal water loss (TEWL)"},{"claim":"Gentle, non-irritating","proof":"Human patch test with no irritation observed"},{"claim":"Formula stability","proof":"Accelerated stability testing across temperature cycling and centrifugation"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"訴求と根拠","intro":"有効性の訴求には、求めに応じて提示できる報告書が伴うべきです。代表的な訴求と、その裏づけ方法をご紹介します。","items":[{"claim":"保湿力の向上","proof":"角層水分量の機器測定による使用前後の比較","source":"第三者機関によるヒト有効性試験"},{"claim":"バリア機能の補修","proof":"経表皮水分蒸散量(TEWL)の変化"},{"claim":"低刺激性","proof":"ヒトパッチ試験で刺激反応が認められないこと"},{"claim":"処方の安定性","proof":"加速安定性試験(温度サイクル・遠心)"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'inquiry', 5, 1, '{}' FROM pages WHERE site_id = 'skin2oem' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"带着你的需求来,我们用一份可执行的方案回复","body":"无论是既有配方复刻、全新品类开发,还是只想先问问产能与起订量 —— 一封邮件即可开始,我们在两个工作日内给出书面回复。","button":"发起询盘"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"帶著你的需求來,我們以一份可執行的方案回覆","body":"無論是既有配方複刻、全新品類開發,或只想先問產能與起訂量 —— 一封郵件即可開始,我們於兩個工作日內提供書面回覆。","button":"發起詢價"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Bring us the brief — we reply with an actionable plan","body":"Whether it is reproducing an existing formula, developing a new category, or simply asking about capacity and MOQ — one email starts it. We respond in writing within two working days.","button":"Start an inquiry"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"ご要望をお寄せください。実行可能な提案でお返しします","body":"既存処方の再現、新カテゴリーの開発、あるいは生産能力と最小ロットのご確認だけでも構いません。メール一通から始まり、2 営業日以内に書面でご回答します。","button":"お問い合わせ"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'skin2oem' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO sites (id, domain, brand_color, variant, is_live, sort_order) VALUES ('biosphere-ai', 'biosphere-ai.com', '#3b4a8c', 'v1', 0, 2);
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('biosphere-ai', 'zh-cn', 'BIOSPHERE-AI', '科技之力', 'AI配方研发、生命科学数据库、趋势洞察与预测、智能研发引擎。帛卉集团的科技大脑,赋能旗下全部制造平台与品牌。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('biosphere-ai', 'zh-tw', 'BIOSPHERE-AI', '科技之力', 'AI配方研發、生命科學資料庫、趨勢洞察與預測、智能研發引擎。帛卉集團的科技大腦,賦能旗下全部製造平台與品牌。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('biosphere-ai', 'en', 'BIOSPHERE-AI', 'Technology Power', 'AI-driven formulation, a life-science database, trend forecasting and an intelligent R&D engine. The technology brain of BOHUI Group, powering every manufacturing platform and brand under it.');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('biosphere-ai', 'ja', 'BIOSPHERE-AI', '科学の力', 'AI 処方開発、ライフサイエンスデータベース、トレンド予測、インテリジェント研究開発エンジン。帛卉グループの技術頭脳として、傘下の製造プラットフォームとブランドを支えます。');
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', '', NULL, 'home', 0, 0, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '首页', '全球生命美妆AI科技平台', 'AI配方研发、生命科学数据库、趋势洞察与预测、智能研发引擎。帛卉集团的科技大脑,赋能旗下全部制造平台与品牌。' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '首頁', '全球生命美妝AI科技平台', 'AI配方研發、生命科學資料庫、趨勢洞察與預測、智能研發引擎。帛卉集團的科技大腦,賦能旗下全部製造平台與品牌。' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Home', 'Global AI Platform for Life-Science Beauty', 'AI-driven formulation, a life-science database, trend forecasting and an intelligent R&D engine. The technology brain of BOHUI Group, powering every manufacturing platform and brand under it.' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'ホーム', 'ライフサイエンス美容 AI プラットフォーム', 'AI 処方開発、ライフサイエンスデータベース、トレンド予測、インテリジェント研究開発エンジン。帛卉グループの技術頭脳として、傘下の製造プラットフォームとブランドを支えます。' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', 'about', NULL, 'standard', 1, 1, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '关于我们', '关于我们', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '關於我們', '關於我們', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'About us', 'About us', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '会社概要', '会社概要', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-ai', 'about/group', id, 'standard', 1, 2, 'published' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '集团概况', '集团概况', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '集團概況', '集團概況', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'The Group', 'The Group', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'グループ概要', 'グループ概要', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/group';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-ai', 'about/history', id, 'standard', 1, 3, 'published' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '发展历程', '发展历程', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '發展歷程', '發展歷程', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'History', 'History', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '沿革', '沿革', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/history';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-ai', 'about/plants', id, 'standard', 1, 4, 'published' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '工厂与产能', '工厂与产能', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '工廠與產能', '工廠與產能', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Plants & capacity', 'Plants & capacity', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '工場と生産能力', '工場と生産能力', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'about/plants';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', 'capabilities', NULL, 'standard', 1, 5, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '能力与服务', '能力与服务', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '能力與服務', '能力與服務', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'What we do', 'What we do', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '事業内容', '事業内容', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-ai', 'capabilities/manufacturing', id, 'standard', 1, 6, 'published' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '生产制造', '生产制造', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '生產製造', '生產製造', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Manufacturing', 'Manufacturing', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '製造', '製造', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/manufacturing';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-ai', 'capabilities/incubation', id, 'standard', 1, 7, 'published' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Brand incubation', 'Brand incubation', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'ブランド育成', 'ブランド育成', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/incubation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-ai', 'capabilities/packaging', id, 'standard', 1, 8, 'published' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Packaging', 'Packaging', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '容器', '容器', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'capabilities/packaging';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', 'rnd', NULL, 'standard', 1, 9, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '研发创新', '研发创新', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '研發創新', '研發創新', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Research & innovation', 'Research & innovation', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '研究開発', '研究開発', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-ai', 'rnd/formulation', id, 'standard', 1, 10, 'published' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '技术与配方', '技术与配方', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '技術與配方', '技術與配方', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Technology', 'Technology', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '技術と処方', '技術と処方', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd/formulation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-ai', 'rnd/lab', id, 'standard', 1, 11, 'published' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '实验室与检测', '实验室与检测', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '實驗室與檢測', '實驗室與檢測', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Lab & testing', 'Lab & testing', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '試験', '試験', NULL FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'rnd/lab';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', 'products', NULL, 'products', 1, 12, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '产品品类', '产品品类', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '產品品類', '產品品類', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Products', 'Products', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '製品', '製品', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'products';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', 'quality', NULL, 'standard', 1, 13, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '质量与合规', '质量与合规', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '品質與法規', '品質與法規', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Quality & compliance', 'Quality & compliance', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '品質と法規', '品質と法規', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'quality';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', 'contact', NULL, 'contact', 1, 14, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '联系询盘', '联系询盘', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '聯絡詢價', '聯絡詢價', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Contact', 'Contact', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'お問い合わせ', 'お問い合わせ', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'contact';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', 'privacy', NULL, 'legal', 0, 15, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '隐私政策', '隐私政策', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '隱私政策', '隱私政策', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Privacy policy', 'Privacy policy', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'プライバシー', 'プライバシーポリシー', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'privacy';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-ai', 'terms', NULL, 'legal', 0, 16, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '法律声明', '法律声明', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '法律聲明', '法律聲明', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Legal notices', 'Legal notices', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '法的表示', '法的表示', '' FROM pages WHERE site_id = 'biosphere-ai' AND slug = 'terms';
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'hero', 0, 1, '{}' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"eyebrow":"科技之力","title":"让配方研发从「试出来」变成「算出来」","lead":"传统研发靠经验与反复试错,一个方向动辄数月。我们用生命科学数据库与 AI 引擎把候选空间先收窄,再交给实验室验证 —— 试错次数下降,方向感上升。","ctaPrimary":"预约平台演示","ctaSecondary":"了解技术架构","stats":[{"value":"1,800 万","label":"成分与文献关联条目"},{"value":"96 类","label":"皮肤与口腔生理指标"},{"value":"<24 小时","label":"候选配方生成周期","note":"不含实验验证"},{"value":"4 个","label":"在线赋能的制造与品牌平台"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"eyebrow":"科技之力","title":"讓配方研發從「試出來」變成「算出來」","lead":"傳統研發靠經驗與反覆試錯,一個方向動輒數月。我們用生命科學資料庫與 AI 引擎先收窄候選空間,再交給實驗室驗證 —— 試錯次數下降,方向感上升。","ctaPrimary":"預約平台展示","ctaSecondary":"了解技術架構","stats":[{"value":"1,800 萬","label":"成分與文獻關聯條目"},{"value":"96 類","label":"皮膚與口腔生理指標"},{"value":"<24 小時","label":"候選配方生成週期","note":"不含實驗驗證"},{"value":"4 個","label":"線上賦能的製造與品牌平台"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"eyebrow":"Technology Power","title":"Move formulation from trial-and-error to computation","lead":"Conventional R&D leans on experience and repeated trials — a single direction can take months. We narrow the candidate space first with a life-science database and an AI engine, then hand it to the lab. Fewer dead ends, clearer direction.","ctaPrimary":"Request a platform demo","ctaSecondary":"See the architecture","stats":[{"value":"18M","label":"Ingredient–literature linkages"},{"value":"96","label":"Skin and oral physiology indicators"},{"value":"<24h","label":"Candidate formula generation","note":"excluding lab validation"},{"value":"4","label":"Manufacturing and brand platforms served"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"eyebrow":"科学の力","title":"処方開発を「試す」から「計算する」へ","lead":"従来の研究開発は経験と試行錯誤に依存し、一つの方向性に数か月を要します。当社はライフサイエンスデータベースと AI エンジンで候補空間を先に絞り込み、その後に実験で検証します。試行回数は減り、方向性は明確になります。","ctaPrimary":"デモをご予約","ctaSecondary":"技術構成を見る","stats":[{"value":"1,800 万","label":"成分と文献の関連付け件数"},{"value":"96 種","label":"皮膚・口腔の生理指標"},{"value":"24 時間未満","label":"候補処方の生成期間","note":"実験検証を除く"},{"value":"4 つ","label":"支援する製造・ブランド基盤"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'certs', 1, 1, '{}' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"资质与合规","note":"证书编号与有效期可在询盘后提供扫描件核验。出口目的地不同,所需合规文件不同,我们按目的地清单逐项准备。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妆品良好生产规范 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"质量管理体系"},{"id":"iso14001","label":"ISO 14001","note":"环境管理体系"},{"id":"fda","label":"FDA","note":"美国食品药品监督管理局企业注册"},{"id":"cpnp","label":"EU CPNP","note":"欧盟化妆品法规通报"},{"id":"sgs","label":"SGS / Intertek","note":"第三方检测与验厂报告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"資質與合規","note":"證書編號與有效期可於詢價後提供掃描件核驗。出口目的地不同,所需合規文件亦不同,我們依目的地清單逐項準備。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妝品優良製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質管理系統"},{"id":"iso14001","label":"ISO 14001","note":"環境管理系統"},{"id":"fda","label":"FDA","note":"美國食品藥物管理局企業註冊"},{"id":"cpnp","label":"EU CPNP","note":"歐盟化妝品法規通報"},{"id":"sgs","label":"SGS / Intertek","note":"第三方檢測與驗廠報告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Certifications & compliance","note":"Certificate numbers and validity can be verified against scanned copies upon inquiry. Required documentation differs by destination market; we prepare each item against your destination checklist.","items":[{"id":"iso22716","label":"ISO 22716","note":"Good Manufacturing Practice for cosmetics"},{"id":"iso9001","label":"ISO 9001","note":"Quality management system"},{"id":"iso14001","label":"ISO 14001","note":"Environmental management system"},{"id":"fda","label":"FDA","note":"US FDA facility registration"},{"id":"cpnp","label":"EU CPNP","note":"EU cosmetic product notification"},{"id":"sgs","label":"SGS / Intertek","note":"Third-party testing and factory audit"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"認証とコンプライアンス","note":"証明書番号と有効期限は、お問い合わせ後にスキャンコピーでご確認いただけます。輸出先ごとに必要書類が異なるため、仕向地のチェックリストに沿って個別に準備します。","items":[{"id":"iso22716","label":"ISO 22716","note":"化粧品の適正製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質マネジメントシステム"},{"id":"iso14001","label":"ISO 14001","note":"環境マネジメントシステム"},{"id":"fda","label":"FDA","note":"米国 FDA 施設登録"},{"id":"cpnp","label":"EU CPNP","note":"EU 化粧品規則に基づく届出"},{"id":"sgs","label":"SGS / Intertek","note":"第三者試験・工場監査"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'matrix', 2, 1, '{}' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"四项核心能力","intro":"这四块能力不是四个独立工具,是一条闭环:数据进来 → 模型算出方向 → 引擎生成配方 → 结果回流成新数据。","items":[{"id":"ai-formula","title":"AI 配方研发","desc":"输入目标功效、剂型与成本约束,引擎在合规成分空间内生成候选配方,并给出每一条的依据与风险点。","bullets":["多目标约束下的候选生成","配伍冲突与稳定性风险预判"]},{"id":"database","title":"生命科学数据库","desc":"把分散的成分数据、文献结论与实测记录结构化,让每一次决策都能追溯到来源,而不是停留在\"业内都这么做\"。","bullets":["成分—机理—功效的关联图谱","实测数据回流,库随用随长"]},{"id":"trend","title":"趋势洞察与预测","desc":"监测全球市场的成分与概念热度变化,帮品牌在趋势成形之前决定要不要跟。","bullets":["成分热度与概念生命周期追踪","目标市场的差异化机会识别"]},{"id":"engine","title":"智能研发引擎","desc":"把上面三块接成一条可操作的工作流:在线提需求、看候选、下打样单,进度全程可见。","bullets":["在线共创工作台,品牌方直接参与选型","打样进度与实验结果同屏可见"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"四項核心能力","intro":"這四塊能力不是四個獨立工具,而是一條閉環:資料進來 → 模型算出方向 → 引擎生成配方 → 結果回流成新資料。","items":[{"id":"ai-formula","title":"AI 配方研發","desc":"輸入目標功效、劑型與成本約束,引擎在合規成分空間內生成候選配方,並給出每一條的依據與風險點。","bullets":["多目標約束下的候選生成","配伍衝突與穩定性風險預判"]},{"id":"database","title":"生命科學資料庫","desc":"把分散的成分資料、文獻結論與實測紀錄結構化,讓每次決策都能追溯到來源,而非停留在「業內都這麼做」。","bullets":["成分—機理—功效的關聯圖譜","實測資料回流,庫隨用隨長"]},{"id":"trend","title":"趨勢洞察與預測","desc":"監測全球市場的成分與概念熱度變化,協助品牌在趨勢成形前決定是否跟進。","bullets":["成分熱度與概念生命週期追蹤","目標市場的差異化機會識別"]},{"id":"engine","title":"智能研發引擎","desc":"把上述三塊接成一條可操作的工作流:線上提需求、看候選、下打樣單,進度全程可見。","bullets":["線上共創工作台,品牌方直接參與選型","打樣進度與實驗結果同屏可見"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Four core capabilities","intro":"These are not four separate tools but one loop: data comes in, models point to a direction, the engine generates formulas, results flow back as new data.","items":[{"id":"ai-formula","title":"AI-driven formulation","desc":"Give the engine a target claim, format and cost ceiling; it generates candidate formulas inside the compliant ingredient space, each with its rationale and risk flags.","bullets":["Candidate generation under multi-objective constraints","Compatibility conflicts and stability risks flagged in advance"]},{"id":"database","title":"Life-science database","desc":"Scattered ingredient data, published findings and measured records are structured so every decision traces to a source rather than to \"how the industry does it\".","bullets":["Ingredient–mechanism–effect knowledge graph","Measured data flows back; the library grows with use"]},{"id":"trend","title":"Trend insight and forecasting","desc":"We track how ingredient and concept interest shifts across global markets, so brands can decide whether to follow before a trend fully forms.","bullets":["Ingredient interest and concept lifecycle tracking","Differentiation opportunities by target market"]},{"id":"engine","title":"Intelligent R&D engine","desc":"The three above are wired into one workflow: submit a brief online, review candidates, order samples — with progress visible throughout.","bullets":["An online co-creation studio where brands take part in selection","Sampling progress and lab results on the same screen"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"四つの中核能力","intro":"四つの独立したツールではなく、一つの循環です。データが入り、モデルが方向を示し、エンジンが処方を生成し、結果が新たなデータとして戻ります。","items":[{"id":"ai-formula","title":"AI 処方開発","desc":"目標とする有効性、剤形、コスト制約を入力すると、法規上許容される成分空間の中で候補処方を生成し、根拠とリスクを併記します。","bullets":["多目的制約下での候補生成","配合衝突と安定性リスクの事前検知"]},{"id":"database","title":"ライフサイエンスデータベース","desc":"散在する成分データ、文献の結論、実測記録を構造化し、あらゆる判断が「業界の慣行」ではなく出典まで遡れるようにします。","bullets":["成分—メカニズム—効果の知識グラフ","実測データが還流し、蓄積とともに拡張"]},{"id":"trend","title":"トレンド洞察と予測","desc":"世界市場における成分とコンセプトの関心の推移を追跡し、トレンドが固まる前に追随の可否を判断できるようにします。","bullets":["成分の関心度とコンセプトのライフサイクル追跡","対象市場ごとの差別化機会の特定"]},{"id":"engine","title":"インテリジェント研究開発エンジン","desc":"上記三つを一つのワークフローに接続します。オンラインで要件を提出し、候補を確認し、試作を発注 —— 進捗は常に可視化されます。","bullets":["ブランド様が選定に直接参加するオンライン共創スタジオ","試作進捗と実験結果を同一画面で確認"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'process', 3, 1, '{}' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"怎么用起来","intro":"平台不是给你一个黑箱结果,而是让你参与每一步的取舍。","steps":[{"no":"01","title":"定义目标","desc":"在工作台里填目标功效、剂型、成本区间与目标市场,约束越清楚,候选质量越高。"},{"no":"02","title":"生成候选","desc":"引擎给出多组候选配方,每组附依据、风险点与预估成本,支持并排比较。"},{"no":"03","title":"共同筛选","desc":"你和我们的研发一起筛。被否掉的原因会回流进模型,下一轮更准。"},{"no":"04","title":"实验验证","desc":"选定方向进实验室打样,实测数据同步回工作台,同时沉淀进数据库。"},{"no":"05","title":"交产线","desc":"验证通过的配方直接转给 BEAUTY2OEM 或 SKIN2OEM 量产,参数无缝衔接。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"怎麼用起來","intro":"平台不是給你一個黑箱結果,而是讓你參與每一步的取捨。","steps":[{"no":"01","title":"定義目標","desc":"在工作台填入目標功效、劑型、成本區間與目標市場,約束越清楚,候選品質越高。"},{"no":"02","title":"生成候選","desc":"引擎給出多組候選配方,每組附依據、風險點與預估成本,支援並排比較。"},{"no":"03","title":"共同篩選","desc":"你與我們的研發一起篩。被否決的原因會回流進模型,下一輪更準。"},{"no":"04","title":"實驗驗證","desc":"選定方向進實驗室打樣,實測資料同步回工作台,同時沉澱進資料庫。"},{"no":"05","title":"交產線","desc":"驗證通過的配方直接轉給 BEAUTY2OEM 或 SKIN2OEM 量產,參數無縫銜接。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"How it works in practice","intro":"The platform does not hand you a black-box answer; it puts you inside every trade-off.","steps":[{"no":"01","title":"Define the target","desc":"Enter the target claim, format, cost band and destination market. The tighter the constraints, the better the candidates."},{"no":"02","title":"Generate candidates","desc":"The engine returns several candidate formulas, each with rationale, risk flags and estimated cost, comparable side by side."},{"no":"03","title":"Shortlist together","desc":"You and our formulators shortlist jointly. Reasons for rejection flow back into the model, sharpening the next round."},{"no":"04","title":"Validate in the lab","desc":"The chosen direction goes to sampling; measured data returns to the studio and settles into the database."},{"no":"05","title":"Hand to production","desc":"Validated formulas transfer straight to BEAUTY2OEM or SKIN2OEM for manufacturing, with parameters carried across intact."}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"実際の進め方","intro":"ブラックボックスの答えをお渡しするのではなく、すべての判断にご参加いただきます。","steps":[{"no":"01","title":"目標の定義","desc":"スタジオ上で目標とする有効性、剤形、コスト帯、対象市場を入力します。制約が明確なほど候補の質が上がります。"},{"no":"02","title":"候補の生成","desc":"エンジンが複数の候補処方を返し、それぞれに根拠、リスク、概算コストを付して並列比較できます。"},{"no":"03","title":"共同での絞り込み","desc":"御社と当社の処方担当が共に選別します。不採用の理由はモデルへ還流し、次の精度を高めます。"},{"no":"04","title":"実験による検証","desc":"選定した方向をラボで試作し、実測データはスタジオへ同期されると同時にデータベースへ蓄積されます。"},{"no":"05","title":"量産への引き渡し","desc":"検証済み処方は BEAUTY2OEM または SKIN2OEM へそのまま引き継がれ、パラメータも欠落なく移管されます。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'inquiry', 4, 1, '{}' FROM pages WHERE site_id = 'biosphere-ai' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"带着你的需求来,我们用一份可执行的方案回复","body":"无论是既有配方复刻、全新品类开发,还是只想先问问产能与起订量 —— 一封邮件即可开始,我们在两个工作日内给出书面回复。","button":"发起询盘"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"帶著你的需求來,我們以一份可執行的方案回覆","body":"無論是既有配方複刻、全新品類開發,或只想先問產能與起訂量 —— 一封郵件即可開始,我們於兩個工作日內提供書面回覆。","button":"發起詢價"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Bring us the brief — we reply with an actionable plan","body":"Whether it is reproducing an existing formula, developing a new category, or simply asking about capacity and MOQ — one email starts it. We respond in writing within two working days.","button":"Start an inquiry"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"ご要望をお寄せください。実行可能な提案でお返しします","body":"既存処方の再現、新カテゴリーの開発、あるいは生産能力と最小ロットのご確認だけでも構いません。メール一通から始まり、2 営業日以内に書面でご回答します。","button":"お問い合わせ"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-ai' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 4;
INSERT INTO sites (id, domain, brand_color, variant, is_live, sort_order) VALUES ('medierba', 'medierba.com', '#3e6b47', 'v1', 0, 3);
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('medierba', 'zh-cn', 'MEDIERBA', '自然之源', '草本科技护肤、功效修护抗衰、植物活性配方、自然与科学融合。帛卉集团旗下高端草本医学美容品牌 MEDIERBA。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('medierba', 'zh-tw', 'MEDIERBA', '自然之源', '草本科技護膚、功效修護抗衰、植物活性配方、自然與科學融合。帛卉集團旗下高端草本醫學美容品牌 MEDIERBA。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('medierba', 'en', 'MEDIERBA', 'Natural Origin', 'Herbal science skincare, repair and anti-ageing efficacy, botanical active formulation, nature and science combined. MEDIERBA, the herbal medical aesthetics brand of BOHUI Group.');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('medierba', 'ja', 'MEDIERBA', '自然の源', 'ハーバルサイエンススキンケア、補修とエイジングケア、植物由来アクティブ処方、自然と科学の融合。帛卉グループのハーバル・メディカルビューティーブランド MEDIERBA。');
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', '', NULL, 'home', 0, 0, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '首页', '高端草本医学美容品牌', '草本科技护肤、功效修护抗衰、植物活性配方、自然与科学融合。帛卉集团旗下高端草本医学美容品牌 MEDIERBA。' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '首頁', '高端草本醫學美容品牌', '草本科技護膚、功效修護抗衰、植物活性配方、自然與科學融合。帛卉集團旗下高端草本醫學美容品牌 MEDIERBA。' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Home', 'Herbal Medical Aesthetics', 'Herbal science skincare, repair and anti-ageing efficacy, botanical active formulation, nature and science combined. MEDIERBA, the herbal medical aesthetics brand of BOHUI Group.' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'ホーム', 'ハーバル・メディカルビューティー', 'ハーバルサイエンススキンケア、補修とエイジングケア、植物由来アクティブ処方、自然と科学の融合。帛卉グループのハーバル・メディカルビューティーブランド MEDIERBA。' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', 'about', NULL, 'standard', 1, 1, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '关于我们', '关于我们', '' FROM pages WHERE site_id = 'medierba' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '關於我們', '關於我們', '' FROM pages WHERE site_id = 'medierba' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'About us', 'About us', '' FROM pages WHERE site_id = 'medierba' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '会社概要', '会社概要', '' FROM pages WHERE site_id = 'medierba' AND slug = 'about';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'medierba', 'about/group', id, 'standard', 1, 2, 'published' FROM pages WHERE site_id = 'medierba' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '集团概况', '集团概况', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '集團概況', '集團概況', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'The Group', 'The Group', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'グループ概要', 'グループ概要', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/group';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'medierba', 'about/history', id, 'standard', 1, 3, 'published' FROM pages WHERE site_id = 'medierba' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '发展历程', '发展历程', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '發展歷程', '發展歷程', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'History', 'History', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '沿革', '沿革', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/history';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'medierba', 'about/plants', id, 'standard', 1, 4, 'published' FROM pages WHERE site_id = 'medierba' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '工厂与产能', '工厂与产能', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '工廠與產能', '工廠與產能', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Plants & capacity', 'Plants & capacity', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '工場と生産能力', '工場と生産能力', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'about/plants';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', 'capabilities', NULL, 'standard', 1, 5, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '能力与服务', '能力与服务', '' FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '能力與服務', '能力與服務', '' FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'What we do', 'What we do', '' FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '事業内容', '事業内容', '' FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'medierba', 'capabilities/manufacturing', id, 'standard', 1, 6, 'published' FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '生产制造', '生产制造', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '生產製造', '生產製造', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Manufacturing', 'Manufacturing', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '製造', '製造', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/manufacturing';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'medierba', 'capabilities/incubation', id, 'standard', 1, 7, 'published' FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Brand incubation', 'Brand incubation', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'ブランド育成', 'ブランド育成', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/incubation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'medierba', 'capabilities/packaging', id, 'standard', 1, 8, 'published' FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Packaging', 'Packaging', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '容器', '容器', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'capabilities/packaging';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', 'rnd', NULL, 'standard', 1, 9, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '研发创新', '研发创新', '' FROM pages WHERE site_id = 'medierba' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '研發創新', '研發創新', '' FROM pages WHERE site_id = 'medierba' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Research & innovation', 'Research & innovation', '' FROM pages WHERE site_id = 'medierba' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '研究開発', '研究開発', '' FROM pages WHERE site_id = 'medierba' AND slug = 'rnd';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'medierba', 'rnd/formulation', id, 'standard', 1, 10, 'published' FROM pages WHERE site_id = 'medierba' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '技术与配方', '技术与配方', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '技術與配方', '技術與配方', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Technology', 'Technology', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '技術と処方', '技術と処方', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'rnd/formulation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'medierba', 'rnd/lab', id, 'standard', 1, 11, 'published' FROM pages WHERE site_id = 'medierba' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '实验室与检测', '实验室与检测', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '實驗室與檢測', '實驗室與檢測', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Lab & testing', 'Lab & testing', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '試験', '試験', NULL FROM pages WHERE site_id = 'medierba' AND slug = 'rnd/lab';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', 'products', NULL, 'products', 1, 12, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '产品品类', '产品品类', '' FROM pages WHERE site_id = 'medierba' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '產品品類', '產品品類', '' FROM pages WHERE site_id = 'medierba' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Products', 'Products', '' FROM pages WHERE site_id = 'medierba' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '製品', '製品', '' FROM pages WHERE site_id = 'medierba' AND slug = 'products';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', 'quality', NULL, 'standard', 1, 13, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '质量与合规', '质量与合规', '' FROM pages WHERE site_id = 'medierba' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '品質與法規', '品質與法規', '' FROM pages WHERE site_id = 'medierba' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Quality & compliance', 'Quality & compliance', '' FROM pages WHERE site_id = 'medierba' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '品質と法規', '品質と法規', '' FROM pages WHERE site_id = 'medierba' AND slug = 'quality';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', 'contact', NULL, 'contact', 1, 14, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '联系询盘', '联系询盘', '' FROM pages WHERE site_id = 'medierba' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '聯絡詢價', '聯絡詢價', '' FROM pages WHERE site_id = 'medierba' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Contact', 'Contact', '' FROM pages WHERE site_id = 'medierba' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'お問い合わせ', 'お問い合わせ', '' FROM pages WHERE site_id = 'medierba' AND slug = 'contact';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', 'privacy', NULL, 'legal', 0, 15, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '隐私政策', '隐私政策', '' FROM pages WHERE site_id = 'medierba' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '隱私政策', '隱私政策', '' FROM pages WHERE site_id = 'medierba' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Privacy policy', 'Privacy policy', '' FROM pages WHERE site_id = 'medierba' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'プライバシー', 'プライバシーポリシー', '' FROM pages WHERE site_id = 'medierba' AND slug = 'privacy';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('medierba', 'terms', NULL, 'legal', 0, 16, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '法律声明', '法律声明', '' FROM pages WHERE site_id = 'medierba' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '法律聲明', '法律聲明', '' FROM pages WHERE site_id = 'medierba' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Legal notices', 'Legal notices', '' FROM pages WHERE site_id = 'medierba' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '法的表示', '法的表示', '' FROM pages WHERE site_id = 'medierba' AND slug = 'terms';
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'hero', 0, 1, '{}' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"eyebrow":"自然之源","title":"东方本草,用现代科学的方式说话","lead":"一味草本能不能护肤,不该只由典籍来回答。我们把植物活性成分提取、纯化、定量,再用现代功效测试验证 —— 让传统的智慧,拿得出当代的证据。","ctaPrimary":"联系我们","ctaSecondary":"了解产品线","stats":[{"value":"32 味","label":"在用草本活性原料"},{"value":"5 年","label":"本草活性成分研究积累"},{"value":"100%","label":"配方成分全表公开"},{"value":"0","label":"香精与色素添加"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"eyebrow":"自然之源","title":"東方本草,用現代科學的方式說話","lead":"一味草本能否護膚,不該只由典籍回答。我們把植物活性成分提取、純化、定量,再以現代功效測試驗證 —— 讓傳統的智慧,拿得出當代的證據。","ctaPrimary":"聯絡我們","ctaSecondary":"了解產品線","stats":[{"value":"32 味","label":"在用草本活性原料"},{"value":"5 年","label":"本草活性成分研究累積"},{"value":"100%","label":"配方成分全表公開"},{"value":"0","label":"香精與色素添加"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"eyebrow":"Natural Origin","title":"Eastern botanicals, stated in the language of modern science","lead":"Whether a herb belongs in skincare should not be settled by old texts alone. We extract, purify and quantify botanical actives, then verify them with modern efficacy testing — so traditional knowledge can produce contemporary evidence.","ctaPrimary":"Contact us","ctaSecondary":"Explore the range","stats":[{"value":"32","label":"Botanical actives in use"},{"value":"5 years","label":"Research into herbal actives"},{"value":"100%","label":"Full ingredient disclosure"},{"value":"0","label":"Added fragrance or colourant"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"eyebrow":"自然の源","title":"東洋の本草を、現代科学の言葉で語る","lead":"ある生薬が肌に有用かどうかは、古典だけが答えるべき問いではありません。植物由来の有効成分を抽出し、精製し、定量したうえで、現代の有効性試験で検証します。伝統の知恵に、現代の根拠を。","ctaPrimary":"お問い合わせ","ctaSecondary":"製品ラインを見る","stats":[{"value":"32 種","label":"使用中の植物由来有効成分"},{"value":"5 年","label":"本草有効成分の研究蓄積"},{"value":"100%","label":"全成分の開示"},{"value":"0","label":"香料・着色料の添加"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'certs', 1, 1, '{}' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"资质与合规","note":"证书编号与有效期可在询盘后提供扫描件核验。出口目的地不同,所需合规文件不同,我们按目的地清单逐项准备。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妆品良好生产规范 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"质量管理体系"},{"id":"iso14001","label":"ISO 14001","note":"环境管理体系"},{"id":"fda","label":"FDA","note":"美国食品药品监督管理局企业注册"},{"id":"cpnp","label":"EU CPNP","note":"欧盟化妆品法规通报"},{"id":"sgs","label":"SGS / Intertek","note":"第三方检测与验厂报告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"資質與合規","note":"證書編號與有效期可於詢價後提供掃描件核驗。出口目的地不同,所需合規文件亦不同,我們依目的地清單逐項準備。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妝品優良製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質管理系統"},{"id":"iso14001","label":"ISO 14001","note":"環境管理系統"},{"id":"fda","label":"FDA","note":"美國食品藥物管理局企業註冊"},{"id":"cpnp","label":"EU CPNP","note":"歐盟化妝品法規通報"},{"id":"sgs","label":"SGS / Intertek","note":"第三方檢測與驗廠報告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Certifications & compliance","note":"Certificate numbers and validity can be verified against scanned copies upon inquiry. Required documentation differs by destination market; we prepare each item against your destination checklist.","items":[{"id":"iso22716","label":"ISO 22716","note":"Good Manufacturing Practice for cosmetics"},{"id":"iso9001","label":"ISO 9001","note":"Quality management system"},{"id":"iso14001","label":"ISO 14001","note":"Environmental management system"},{"id":"fda","label":"FDA","note":"US FDA facility registration"},{"id":"cpnp","label":"EU CPNP","note":"EU cosmetic product notification"},{"id":"sgs","label":"SGS / Intertek","note":"Third-party testing and factory audit"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"認証とコンプライアンス","note":"証明書番号と有効期限は、お問い合わせ後にスキャンコピーでご確認いただけます。輸出先ごとに必要書類が異なるため、仕向地のチェックリストに沿って個別に準備します。","items":[{"id":"iso22716","label":"ISO 22716","note":"化粧品の適正製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質マネジメントシステム"},{"id":"iso14001","label":"ISO 14001","note":"環境マネジメントシステム"},{"id":"fda","label":"FDA","note":"米国 FDA 施設登録"},{"id":"cpnp","label":"EU CPNP","note":"EU 化粧品規則に基づく届出"},{"id":"sgs","label":"SGS / Intertek","note":"第三者試験・工場監査"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'matrix', 2, 1, '{}' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"我们相信的四件事","intro":"草本护肤最大的问题,是把\"天然\"当成免检金牌。我们不这样做 —— 天然只是起点,有效且安全才是终点。","items":[{"id":"herbal-tech","title":"草本科技护肤","desc":"从植物到活性物之间隔着提取工艺。同一味草本,提取方式不同,活性差几倍 —— 我们把工艺参数当配方的一部分来管理。","bullets":["低温提取保留热敏活性","活性物含量批批定量"]},{"id":"repair","title":"功效修护抗衰","desc":"抗衰不是一句宣称。我们把目标拆成屏障、纹理、紧致三条可测的线,分别验证。","bullets":["屏障修护与纹理改善分开评估","人体功效测试支撑核心宣称"]},{"id":"botanical","title":"植物活性配方","desc":"单一成分的故事好讲,复配的效果才实在。我们研究的是活性物之间的协同,而不是堆料。","bullets":["多活性物协同与配伍验证","刺激性前置评估,先安全后功效"]},{"id":"fusion","title":"自然与科学融合","desc":"传统配伍提供方向,现代方法提供证据。两者缺一,产品要么没根,要么没据。","bullets":["古方思路的现代转译","成分全表公开,不做隐藏配方"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"我們相信的四件事","intro":"草本護膚最大的問題,是把「天然」當成免檢金牌。我們不這樣做 —— 天然只是起點,有效且安全才是終點。","items":[{"id":"herbal-tech","title":"草本科技護膚","desc":"從植物到活性物之間隔著萃取工藝。同一味草本,萃取方式不同,活性差幾倍 —— 我們把工藝參數當作配方的一部分管理。","bullets":["低溫萃取保留熱敏活性","活性物含量批批定量"]},{"id":"repair","title":"功效修護抗衰","desc":"抗衰不是一句宣稱。我們把目標拆成屏障、紋理、緊緻三條可測的線,分別驗證。","bullets":["屏障修護與紋理改善分開評估","人體功效測試支撐核心宣稱"]},{"id":"botanical","title":"植物活性配方","desc":"單一成分的故事好講,複方的效果才實在。我們研究的是活性物之間的協同,而非堆料。","bullets":["多活性物協同與配伍驗證","刺激性前置評估,先安全後功效"]},{"id":"fusion","title":"自然與科學融合","desc":"傳統配伍提供方向,現代方法提供證據。兩者缺一,產品要麼沒根,要麼沒據。","bullets":["古方思路的現代轉譯","成分全表公開,不做隱藏配方"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Four things we hold to","intro":"The besetting problem of herbal skincare is treating \"natural\" as a free pass. We do not. Natural is the starting point; effective and safe is the finish line.","items":[{"id":"herbal-tech","title":"Herbal science skincare","desc":"Between a plant and an active lies an extraction process. The same herb, extracted differently, can vary several-fold in activity — so we manage process parameters as part of the formula.","bullets":["Low-temperature extraction preserves heat-sensitive actives","Active content quantified batch by batch"]},{"id":"repair","title":"Repair and anti-ageing efficacy","desc":"Anti-ageing is not a claim you simply make. We split the target into barrier, texture and firmness — three measurable lines, each verified separately.","bullets":["Barrier repair and texture improvement assessed apart","Human efficacy testing behind the core claims"]},{"id":"botanical","title":"Botanical active formulation","desc":"A single-ingredient story is easy to tell; it is the combination that has to work. We study synergy between actives rather than stacking them.","bullets":["Synergy and compatibility verification across actives","Irritation assessed first — safety before efficacy"]},{"id":"fusion","title":"Nature and science combined","desc":"Tradition supplies direction, modern method supplies evidence. Without either, a product is rootless or unsubstantiated.","bullets":["Classical formulation logic, translated for today","Full ingredient disclosure, no hidden blends"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"私たちが大切にする四つのこと","intro":"ハーバルスキンケア最大の問題は、「天然」を無検査の免罪符にしてしまうことです。天然は出発点にすぎず、有効かつ安全であることが到達点です。","items":[{"id":"herbal-tech","title":"ハーバルサイエンススキンケア","desc":"植物と有効成分の間には抽出工程があります。同じ生薬でも抽出法が違えば活性は数倍変わるため、工程条件を処方の一部として管理します。","bullets":["低温抽出で熱に弱い成分を保持","有効成分量をロットごとに定量"]},{"id":"repair","title":"補修とエイジングケア","desc":"エイジングケアは唱えるものではありません。バリア・キメ・ハリという測定可能な三つの線に分解し、個別に検証します。","bullets":["バリア補修とキメ改善を分けて評価","中核訴求はヒト有効性試験で裏づけ"]},{"id":"botanical","title":"植物由来アクティブ処方","desc":"単一成分の物語は語りやすいものですが、実際に効くのは組み合わせです。成分を重ねるのではなく、相乗作用を研究します。","bullets":["複数有効成分の相乗性と配合適性の検証","刺激性を先に評価 —— 安全が先、有効性は後"]},{"id":"fusion","title":"自然と科学の融合","desc":"伝統は方向を、現代の手法は根拠を与えます。どちらを欠いても、製品は根なしか、裏づけなしになります。","bullets":["古方の考え方を現代に翻訳","全成分を開示し、隠し処方を持たない"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'process', 3, 1, '{}' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"一瓶产品是怎么来的","intro":"从一味草本到一瓶成品,我们要走完这五步 —— 任何一步不通过,产品就不上市。","steps":[{"no":"01","title":"选材溯源","desc":"确定品种、产地与采收期。同种草本产地不同,活性差异显著,来源必须可追溯。"},{"no":"02","title":"提取纯化","desc":"低温提取与纯化,去除致敏与刺激组分,保留目标活性物。"},{"no":"03","title":"活性定量","desc":"每批原料测活性物含量,不达标不投产 —— 这是\"批次稳定\"唯一的保证方式。"},{"no":"04","title":"配方验证","desc":"配伍、稳定性、刺激性依次验证,任一项不合格即回到配方阶段。"},{"no":"05","title":"功效确认","desc":"人体功效测试确认核心宣称,报告可应要求出示,之后才排产上市。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"一瓶產品是怎麼來的","intro":"從一味草本到一瓶成品,我們要走完這五步 —— 任何一步不通過,產品就不上市。","steps":[{"no":"01","title":"選材溯源","desc":"確定品種、產地與採收期。同種草本產地不同,活性差異顯著,來源必須可追溯。"},{"no":"02","title":"萃取純化","desc":"低溫萃取與純化,去除致敏與刺激組分,保留目標活性物。"},{"no":"03","title":"活性定量","desc":"每批原料檢測活性物含量,不達標不投產 —— 這是「批次穩定」唯一的保證方式。"},{"no":"04","title":"配方驗證","desc":"配伍、穩定性、刺激性依序驗證,任一項不合格即回到配方階段。"},{"no":"05","title":"功效確認","desc":"人體功效測試確認核心宣稱,報告可應要求出示,之後才排產上市。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"How a bottle comes to exist","intro":"From a single herb to a finished product, these five steps must all pass. If any one fails, the product does not launch.","steps":[{"no":"01","title":"Sourcing","desc":"Species, origin and harvest window are fixed. The same herb varies markedly by origin, so provenance must be traceable."},{"no":"02","title":"Extraction","desc":"Low-temperature extraction and purification remove sensitising and irritant fractions while retaining the target actives."},{"no":"03","title":"Quantification","desc":"Every raw batch is measured for active content. Below spec, it does not enter production — this is the only real guarantee of batch consistency."},{"no":"04","title":"Formula validation","desc":"Compatibility, stability and irritation are verified in sequence; any failure returns the formula to the bench."},{"no":"05","title":"Efficacy confirmation","desc":"Human efficacy testing confirms the core claims, with reports available on request. Only then is production scheduled."}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"一本の製品ができるまで","intro":"一つの生薬から完成品まで、この五段階をすべて通過する必要があります。どこか一つでも通らなければ、発売しません。","steps":[{"no":"01","title":"原料の選定と追跡","desc":"品種・産地・採取時期を確定します。同じ生薬でも産地により活性が大きく異なるため、由来は追跡可能でなければなりません。"},{"no":"02","title":"抽出と精製","desc":"低温抽出と精製により、感作性・刺激性の画分を除き、目的の有効成分を残します。"},{"no":"03","title":"有効成分の定量","desc":"原料ロットごとに含量を測定し、規格を下回れば製造に回しません。ロット安定性を担保する唯一の方法です。"},{"no":"04","title":"処方の検証","desc":"配合適性、安定性、刺激性を順に検証します。一項目でも不合格なら処方段階に戻します。"},{"no":"05","title":"有効性の確認","desc":"ヒト有効性試験で中核訴求を確認します。報告書はご請求に応じて提示可能で、その後に生産を計画します。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'evidence', 4, 1, '{}' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"我们说的每句话,都指得出依据","intro":"以下是产品页上会出现的宣称,以及它们各自的支撑方式。没有支撑的话,我们不写。","items":[{"claim":"植物活性成分含量可查","proof":"每批原料出具活性物定量检测报告","source":"内部质控 + 第三方复检"},{"claim":"温和不刺激","proof":"人体斑贴试验,受试者无刺激反应"},{"claim":"屏障修护","proof":"经皮水分流失(TEWL)与角质层含水量双指标"},{"claim":"无香精无色素","proof":"成分全表公开,配方中无相关成分"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"我們說的每句話,都指得出依據","intro":"以下是產品頁上會出現的宣稱,以及它們各自的支撐方式。沒有支撐的話,我們不寫。","items":[{"claim":"植物活性成分含量可查","proof":"每批原料出具活性物定量檢測報告","source":"內部品管 + 第三方複檢"},{"claim":"溫和不刺激","proof":"人體貼膚試驗,受試者無刺激反應"},{"claim":"屏障修護","proof":"經皮水分流失(TEWL)與角質層含水量雙指標"},{"claim":"無香精無色素","proof":"成分全表公開,配方中無相關成分"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Every statement points to something","intro":"These are claims that appear on our product pages, and how each is supported. If we cannot support it, we do not write it.","items":[{"claim":"Botanical active content is verifiable","proof":"A quantitative active-content report is issued for every raw batch","source":"Internal QC plus third-party re-testing"},{"claim":"Gentle, non-irritating","proof":"Human patch test with no irritation observed"},{"claim":"Barrier repair","proof":"Trans-epidermal water loss (TEWL) and stratum corneum hydration, measured together"},{"claim":"No fragrance, no colourant","proof":"Full ingredient list published; neither appears in the formula"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"述べることには、必ず裏づけがあります","intro":"製品ページに掲載する訴求と、その裏づけ方法です。裏づけられないことは書きません。","items":[{"claim":"植物由来有効成分の含量を確認できる","proof":"原料ロットごとに有効成分の定量試験報告を発行","source":"社内品質管理および第三者による再試験"},{"claim":"低刺激性","proof":"ヒトパッチ試験で刺激反応が認められないこと"},{"claim":"バリア補修","proof":"経表皮水分蒸散量(TEWL)と角層水分量の二指標"},{"claim":"香料・着色料不使用","proof":"全成分を公開しており、処方に該当成分を含みません"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'inquiry', 5, 1, '{}' FROM pages WHERE site_id = 'medierba' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"带着你的需求来,我们用一份可执行的方案回复","body":"无论是既有配方复刻、全新品类开发,还是只想先问问产能与起订量 —— 一封邮件即可开始,我们在两个工作日内给出书面回复。","button":"发起询盘"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"帶著你的需求來,我們以一份可執行的方案回覆","body":"無論是既有配方複刻、全新品類開發,或只想先問產能與起訂量 —— 一封郵件即可開始,我們於兩個工作日內提供書面回覆。","button":"發起詢價"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Bring us the brief — we reply with an actionable plan","body":"Whether it is reproducing an existing formula, developing a new category, or simply asking about capacity and MOQ — one email starts it. We respond in writing within two working days.","button":"Start an inquiry"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"ご要望をお寄せください。実行可能な提案でお返しします","body":"既存処方の再現、新カテゴリーの開発、あるいは生産能力と最小ロットのご確認だけでも構いません。メール一通から始まり、2 営業日以内に書面でご回答します。","button":"お問い合わせ"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'medierba' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO sites (id, domain, brand_color, variant, is_live, sort_order) VALUES ('biosphere-oralcare', 'biosphere-oralcare.com', '#6b4c9a', 'v1', 0, 4);
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('biosphere-oralcare', 'zh-cn', 'BIOSPHERE-ORALCARE', '智造之美', '口腔微生态研究、益生菌口腔护理、智能口腔解决方案、全生命周期口腔健康。帛卉集团旗下 AI 口腔生命科技平台。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('biosphere-oralcare', 'zh-tw', 'BIOSPHERE-ORALCARE', '智造之美', '口腔微生態研究、益生菌口腔護理、智能口腔解決方案、全生命週期口腔健康。帛卉集團旗下 AI 口腔生命科技平台。');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('biosphere-oralcare', 'en', 'BIOSPHERE-ORALCARE', 'Intelligent Manufacturing', 'Oral microbiome research, probiotic oral care, intelligent oral solutions and lifelong oral health. The AI oral life-science platform of BOHUI Group.');
INSERT INTO site_i18n (site_id, lang, name, tagline, description) VALUES ('biosphere-oralcare', 'ja', 'BIOSPHERE-ORALCARE', 'スマート製造', '口腔マイクロバイオーム研究、プロバイオティクスによるオーラルケア、インテリジェントな口腔ソリューション、生涯にわたる口腔健康。帛卉グループの AI オーラルライフサイエンス基盤。');
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', '', NULL, 'home', 0, 0, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '首页', 'AI口腔生命科技平台', '口腔微生态研究、益生菌口腔护理、智能口腔解决方案、全生命周期口腔健康。帛卉集团旗下 AI 口腔生命科技平台。' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '首頁', 'AI口腔生命科技平台', '口腔微生態研究、益生菌口腔護理、智能口腔解決方案、全生命週期口腔健康。帛卉集團旗下 AI 口腔生命科技平台。' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Home', 'AI Oral Life-Science Platform', 'Oral microbiome research, probiotic oral care, intelligent oral solutions and lifelong oral health. The AI oral life-science platform of BOHUI Group.' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'ホーム', 'AI オーラルライフサイエンス・プラットフォーム', '口腔マイクロバイオーム研究、プロバイオティクスによるオーラルケア、インテリジェントな口腔ソリューション、生涯にわたる口腔健康。帛卉グループの AI オーラルライフサイエンス基盤。' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', 'about', NULL, 'standard', 1, 1, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '关于我们', '关于我们', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '關於我們', '關於我們', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'About us', 'About us', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '会社概要', '会社概要', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-oralcare', 'about/group', id, 'standard', 1, 2, 'published' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '集团概况', '集团概况', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '集團概況', '集團概況', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'The Group', 'The Group', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/group';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'グループ概要', 'グループ概要', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/group';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-oralcare', 'about/history', id, 'standard', 1, 3, 'published' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '发展历程', '发展历程', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '發展歷程', '發展歷程', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'History', 'History', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/history';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '沿革', '沿革', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/history';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-oralcare', 'about/plants', id, 'standard', 1, 4, 'published' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '工厂与产能', '工厂与产能', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '工廠與產能', '工廠與產能', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Plants & capacity', 'Plants & capacity', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/plants';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '工場と生産能力', '工場と生産能力', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'about/plants';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', 'capabilities', NULL, 'standard', 1, 5, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '能力与服务', '能力与服务', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '能力與服務', '能力與服務', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'What we do', 'What we do', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '事業内容', '事業内容', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-oralcare', 'capabilities/manufacturing', id, 'standard', 1, 6, 'published' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '生产制造', '生产制造', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '生產製造', '生產製造', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Manufacturing', 'Manufacturing', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/manufacturing';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '製造', '製造', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/manufacturing';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-oralcare', 'capabilities/incubation', id, 'standard', 1, 7, 'published' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '品牌孵化', '品牌孵化', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Brand incubation', 'Brand incubation', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/incubation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', 'ブランド育成', 'ブランド育成', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/incubation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-oralcare', 'capabilities/packaging', id, 'standard', 1, 8, 'published' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '包材方案', '包材方案', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Packaging', 'Packaging', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/packaging';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '容器', '容器', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'capabilities/packaging';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', 'rnd', NULL, 'standard', 1, 9, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '研发创新', '研发创新', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '研發創新', '研發創新', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Research & innovation', 'Research & innovation', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '研究開発', '研究開発', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-oralcare', 'rnd/formulation', id, 'standard', 1, 10, 'published' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '技术与配方', '技术与配方', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '技術與配方', '技術與配方', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Technology', 'Technology', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd/formulation';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '技術と処方', '技術と処方', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd/formulation';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status)
         SELECT 'biosphere-oralcare', 'rnd/lab', id, 'standard', 1, 11, 'published' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-cn', '实验室与检测', '实验室与检测', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'zh-tw', '實驗室與檢測', '實驗室與檢測', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'en', 'Lab & testing', 'Lab & testing', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd/lab';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
           SELECT id, 'ja', '試験', '試験', NULL FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'rnd/lab';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', 'products', NULL, 'products', 1, 12, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '产品品类', '产品品类', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '產品品類', '產品品類', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Products', 'Products', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'products';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '製品', '製品', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'products';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', 'quality', NULL, 'standard', 1, 13, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '质量与合规', '质量与合规', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '品質與法規', '品質與法規', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Quality & compliance', 'Quality & compliance', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'quality';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '品質と法規', '品質と法規', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'quality';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', 'contact', NULL, 'contact', 1, 14, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '联系询盘', '联系询盘', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '聯絡詢價', '聯絡詢價', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Contact', 'Contact', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'contact';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'お問い合わせ', 'お問い合わせ', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'contact';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', 'privacy', NULL, 'legal', 0, 15, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '隐私政策', '隐私政策', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '隱私政策', '隱私政策', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Privacy policy', 'Privacy policy', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'privacy';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', 'プライバシー', 'プライバシーポリシー', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'privacy';
INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('biosphere-oralcare', 'terms', NULL, 'legal', 0, 16, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-cn', '法律声明', '法律声明', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'zh-tw', '法律聲明', '法律聲明', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'en', 'Legal notices', 'Legal notices', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'terms';
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc)
         SELECT id, 'ja', '法的表示', '法的表示', '' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = 'terms';
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'hero', 0, 1, '{}' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"eyebrow":"智造之美","title":"口腔不是要杀菌,是要把菌群调回平衡","lead":"强效杀菌会连同有益菌一起清除,短期清爽,长期失衡。我们从口腔微生态出发,用益生菌与温和配方把菌群推回平衡态 —— 这是更慢、但更对的路。","ctaPrimary":"发起询盘","ctaSecondary":"查看研究方向","stats":[{"value":"260 株","label":"口腔菌株资源库"},{"value":"12 项","label":"功效验证指标"},{"value":"3 个","label":"全生命周期产品线","note":"婴幼儿 / 成人 / 银发"},{"value":"0","label":"强效杀菌剂添加"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"eyebrow":"智造之美","title":"口腔不是要殺菌,是要把菌叢調回平衡","lead":"強效殺菌會連同有益菌一起清除,短期清爽,長期失衡。我們從口腔微生態出發,以益生菌與溫和配方把菌叢推回平衡態 —— 這是更慢、但更對的路。","ctaPrimary":"發起詢價","ctaSecondary":"查看研究方向","stats":[{"value":"260 株","label":"口腔菌株資源庫"},{"value":"12 項","label":"功效驗證指標"},{"value":"3 條","label":"全生命週期產品線","note":"嬰幼兒 / 成人 / 銀髮"},{"value":"0","label":"強效殺菌劑添加"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"eyebrow":"Intelligent Manufacturing","title":"Oral care is not about killing bacteria — it is about restoring balance","lead":"Aggressive antibacterials clear the beneficial flora along with the rest: fresh in the short term, unbalanced in the long. We start from the oral microbiome and use probiotics and gentle formulation to push the flora back toward equilibrium. Slower, but the right road.","ctaPrimary":"Start an inquiry","ctaSecondary":"See our research","stats":[{"value":"260","label":"Oral strains in our library"},{"value":"12","label":"Efficacy validation indicators"},{"value":"3","label":"Life-stage product lines","note":"infant, adult, senior"},{"value":"0","label":"Harsh antibacterial agents added"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"eyebrow":"スマート製造","title":"オーラルケアは殺菌ではなく、菌叢を平衡へ戻すこと","lead":"強力な殺菌は有用菌まで一掃します。短期的には爽快でも、長期的には不均衡を招きます。当社は口腔マイクロバイオームを起点に、プロバイオティクスと低刺激処方で菌叢を平衡へ戻します。時間はかかりますが、正しい道だと考えます。","ctaPrimary":"お問い合わせ","ctaSecondary":"研究領域を見る","stats":[{"value":"260 株","label":"口腔菌株ライブラリ"},{"value":"12 項目","label":"有効性検証の指標"},{"value":"3 系列","label":"ライフステージ別製品ライン","note":"乳幼児 / 成人 / シニア"},{"value":"0","label":"強力な殺菌剤の配合"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'hero' AND bk.sort_order = 0;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'certs', 1, 1, '{}' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"资质与合规","note":"证书编号与有效期可在询盘后提供扫描件核验。出口目的地不同,所需合规文件不同,我们按目的地清单逐项准备。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妆品良好生产规范 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"质量管理体系"},{"id":"iso14001","label":"ISO 14001","note":"环境管理体系"},{"id":"fda","label":"FDA","note":"美国食品药品监督管理局企业注册"},{"id":"cpnp","label":"EU CPNP","note":"欧盟化妆品法规通报"},{"id":"sgs","label":"SGS / Intertek","note":"第三方检测与验厂报告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"資質與合規","note":"證書編號與有效期可於詢價後提供掃描件核驗。出口目的地不同,所需合規文件亦不同,我們依目的地清單逐項準備。","items":[{"id":"iso22716","label":"ISO 22716","note":"化妝品優良製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質管理系統"},{"id":"iso14001","label":"ISO 14001","note":"環境管理系統"},{"id":"fda","label":"FDA","note":"美國食品藥物管理局企業註冊"},{"id":"cpnp","label":"EU CPNP","note":"歐盟化妝品法規通報"},{"id":"sgs","label":"SGS / Intertek","note":"第三方檢測與驗廠報告"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Certifications & compliance","note":"Certificate numbers and validity can be verified against scanned copies upon inquiry. Required documentation differs by destination market; we prepare each item against your destination checklist.","items":[{"id":"iso22716","label":"ISO 22716","note":"Good Manufacturing Practice for cosmetics"},{"id":"iso9001","label":"ISO 9001","note":"Quality management system"},{"id":"iso14001","label":"ISO 14001","note":"Environmental management system"},{"id":"fda","label":"FDA","note":"US FDA facility registration"},{"id":"cpnp","label":"EU CPNP","note":"EU cosmetic product notification"},{"id":"sgs","label":"SGS / Intertek","note":"Third-party testing and factory audit"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"認証とコンプライアンス","note":"証明書番号と有効期限は、お問い合わせ後にスキャンコピーでご確認いただけます。輸出先ごとに必要書類が異なるため、仕向地のチェックリストに沿って個別に準備します。","items":[{"id":"iso22716","label":"ISO 22716","note":"化粧品の適正製造規範 GMPC"},{"id":"iso9001","label":"ISO 9001","note":"品質マネジメントシステム"},{"id":"iso14001","label":"ISO 14001","note":"環境マネジメントシステム"},{"id":"fda","label":"FDA","note":"米国 FDA 施設登録"},{"id":"cpnp","label":"EU CPNP","note":"EU 化粧品規則に基づく届出"},{"id":"sgs","label":"SGS / Intertek","note":"第三者試験・工場監査"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'certs' AND bk.sort_order = 1;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'matrix', 2, 1, '{}' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"四项核心能力","intro":"口腔护理长期被当成\"清洁\"问题,我们把它当成\"生态\"问题 —— 这决定了下面四块能力的组织方式。","items":[{"id":"microbiome","title":"口腔微生态研究","desc":"先弄清健康口腔的菌群长什么样,才谈得上调节。菌株资源库与测序分析是这一切的地基。","bullets":["菌株分离、鉴定与保藏","菌群结构测序与差异分析"]},{"id":"probiotics","title":"益生菌口腔护理","desc":"把有益菌活着送到口腔并留下来,难点在活性保持与定植。这是配方与工艺共同的课题。","bullets":["活性菌在膏体中的存活率控制","定植能力评估与验证"]},{"id":"smart","title":"智能口腔解决方案","desc":"口腔状态是变化的,护理方案也该跟着变。我们把检测数据接进方案推荐,而不是所有人用同一支牙膏。","bullets":["基于检测数据的个性化方案","硬件与配方的协同设计"]},{"id":"lifecycle","title":"全生命周期口腔健康","desc":"婴幼儿、成人、银发人群的口腔问题完全不同,配方逻辑不能通用。我们按人生阶段分线开发。","bullets":["分阶段的安全性与功效标准","吞咽风险与摩擦剂强度分级"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"四項核心能力","intro":"口腔護理長期被當成「清潔」問題,我們把它當成「生態」問題 —— 這決定了下面四塊能力的組織方式。","items":[{"id":"microbiome","title":"口腔微生態研究","desc":"先弄清健康口腔的菌叢長什麼樣,才談得上調節。菌株資源庫與定序分析是這一切的地基。","bullets":["菌株分離、鑑定與保藏","菌叢結構定序與差異分析"]},{"id":"probiotics","title":"益生菌口腔護理","desc":"把有益菌活著送到口腔並留下來,難點在活性保持與定殖。這是配方與製程共同的課題。","bullets":["活性菌在膏體中的存活率控制","定殖能力評估與驗證"]},{"id":"smart","title":"智能口腔解決方案","desc":"口腔狀態是變化的,護理方案也該跟著變。我們把檢測資料接進方案推薦,而非所有人用同一支牙膏。","bullets":["基於檢測資料的個人化方案","硬體與配方的協同設計"]},{"id":"lifecycle","title":"全生命週期口腔健康","desc":"嬰幼兒、成人、銀髮族的口腔問題完全不同,配方邏輯不能通用。我們依人生階段分線開發。","bullets":["分階段的安全性與功效標準","吞嚥風險與摩擦劑強度分級"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Four core capabilities","intro":"Oral care has long been treated as a cleaning problem. We treat it as an ecological one — which is what shapes the four capabilities below.","items":[{"id":"microbiome","title":"Oral microbiome research","desc":"You cannot modulate a flora you have not characterised. A strain library and sequencing analysis are the foundation of everything else.","bullets":["Strain isolation, identification and preservation","Community sequencing and differential analysis"]},{"id":"probiotics","title":"Probiotic oral care","desc":"Delivering beneficial bacteria alive and helping them stay is the hard part — a question of viability and colonisation that formulation and process must answer together.","bullets":["Viability control within the paste matrix","Colonisation capability assessment"]},{"id":"smart","title":"Intelligent oral solutions","desc":"Oral condition changes over time, and care should change with it. We feed measurement data into recommendations rather than giving everyone the same tube.","bullets":["Personalised regimens driven by measurement data","Hardware and formulation designed together"]},{"id":"lifecycle","title":"Lifelong oral health","desc":"Infants, adults and seniors face entirely different oral problems; one formulation logic cannot serve all. We develop separate lines by life stage.","bullets":["Stage-specific safety and efficacy standards","Swallowing risk and abrasivity graded by stage"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"四つの中核能力","intro":"オーラルケアは長く「洗浄」の問題として扱われてきましたが、当社は「生態」の問題として捉えます。この視点が以下四つの能力の組み立て方を決めています。","items":[{"id":"microbiome","title":"口腔マイクロバイオーム研究","desc":"健康な口腔の菌叢像を把握しなければ、調整は語れません。菌株ライブラリとシーケンス解析がすべての土台です。","bullets":["菌株の分離・同定・保存","菌叢構造のシーケンスと差分解析"]},{"id":"probiotics","title":"プロバイオティクス・オーラルケア","desc":"有用菌を生きたまま届け、留まらせることが難所です。生存性と定着性は、処方と製造工程が共に答えるべき課題です。","bullets":["ペースト基材中での生菌率の管理","定着能力の評価と検証"]},{"id":"smart","title":"インテリジェントな口腔ソリューション","desc":"口腔の状態は変化します。ケアもそれに追随すべきです。測定データを提案に接続し、全員に同じ一本を配ることはしません。","bullets":["測定データに基づく個別ケア設計","ハードウェアと処方の協調設計"]},{"id":"lifecycle","title":"生涯にわたる口腔健康","desc":"乳幼児・成人・シニアでは口腔の課題がまったく異なり、単一の処方思想では対応できません。ライフステージごとにラインを分けて開発します。","bullets":["段階別の安全性・有効性基準","誤嚥リスクと研磨剤強度の等級設定"]}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'matrix' AND bk.sort_order = 2;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'process', 3, 1, '{}' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"合作怎么开始","intro":"口腔品类合规要求高于普通化妆品,我们把合规判断放在最前面,不让方向性风险拖到后期。","steps":[{"no":"01","title":"品类与合规判断","desc":"先确定产品属化妆品还是特殊用途,目标市场的注册路径与宣称边界随之确定。"},{"no":"02","title":"配方与菌株选型","desc":"按目标功效选定菌株与基质,同步评估活性保持与摩擦剂强度。"},{"no":"03","title":"打样与稳定性","desc":"样品确认口感、泡沫与质地;活性菌存活率在货架期内跟踪考察。"},{"no":"04","title":"功效与安全验证","desc":"按目标市场安排功效与安全测试,拿到可支撑宣称的报告。"},{"no":"05","title":"注册与量产","desc":"完成注册备案后排产,出货前逐批复检活性指标。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"合作怎麼開始","intro":"口腔品類法規要求高於一般化妝品,我們把法規判斷放在最前面,不讓方向性風險拖到後期。","steps":[{"no":"01","title":"品類與法規判斷","desc":"先確定產品屬化妝品或特殊用途,目標市場的註冊路徑與宣稱邊界隨之確定。"},{"no":"02","title":"配方與菌株選型","desc":"依目標功效選定菌株與基質,同步評估活性保持與摩擦劑強度。"},{"no":"03","title":"打樣與穩定性","desc":"樣品確認口感、泡沫與質地;活性菌存活率於保存期內追蹤考察。"},{"no":"04","title":"功效與安全驗證","desc":"依目標市場安排功效與安全測試,取得可支撐宣稱的報告。"},{"no":"05","title":"註冊與量產","desc":"完成註冊備案後排產,出貨前逐批複檢活性指標。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"How engagements start","intro":"Oral products face stricter regulation than ordinary cosmetics, so we settle the regulatory read first rather than letting directional risk surface late.","steps":[{"no":"01","title":"Category and regulatory read","desc":"Establish whether the product is a cosmetic or a special-purpose product; the registration path and claim boundaries for the target market follow from that."},{"no":"02","title":"Formula and strain selection","desc":"Strains and base are selected against the target benefit, with viability and abrasivity assessed in parallel."},{"no":"03","title":"Sampling and stability","desc":"Samples confirm taste, foam and texture, while viable counts are tracked across shelf life."},{"no":"04","title":"Efficacy and safety validation","desc":"Testing arranged for the target market, producing reports that support the claims."},{"no":"05","title":"Registration and production","desc":"Production follows registration, with viability indicators re-checked batch by batch before shipment."}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"進め方","intro":"口腔製品は一般化粧品より規制が厳格なため、法規判断を最初に置き、方向性のリスクを後工程へ持ち越しません。","steps":[{"no":"01","title":"カテゴリーと法規の判断","desc":"化粧品か特定用途製品かを確定し、対象市場の登録経路と訴求の範囲を定めます。"},{"no":"02","title":"処方と菌株の選定","desc":"目標とする効果に応じて菌株と基材を選定し、生存性と研磨性を並行して評価します。"},{"no":"03","title":"試作と安定性","desc":"味・泡立ち・テクスチャーをご確認いただきつつ、保存期間中の生菌数を追跡します。"},{"no":"04","title":"有効性・安全性の検証","desc":"対象市場に応じた試験を手配し、訴求を支える報告書を取得します。"},{"no":"05","title":"登録と量産","desc":"登録完了後に生産へ移行し、出荷前にロットごとの生菌指標を再確認します。"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'process' AND bk.sort_order = 3;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'evidence', 4, 1, '{}' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"功效与支撑","intro":"口腔类宣称的监管尺度比一般护肤更严。以下每一条都对应一种可出示的验证方式;缺出处的条目会被显式标出,不做模糊处理。","items":[{"claim":"有益菌活性保持","proof":"货架期内活菌数定期检测,记录衰减曲线","source":"内部稳定性考察"},{"claim":"减少牙菌斑","proof":"牙菌斑指数(PLI)使用前后对比"},{"claim":"改善口腔异味","proof":"挥发性硫化物(VSC)仪器测定"},{"claim":"温和不刺激口腔黏膜","proof":"口腔黏膜刺激性试验"},{"claim":"低摩擦不伤釉质","proof":"相对牙本质磨耗值(RDA)测定"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"功效與支撐","intro":"口腔類宣稱的監管尺度比一般護膚更嚴。以下每一條都對應一種可出示的驗證方式;缺出處的條目會被顯式標出,不做模糊處理。","items":[{"claim":"有益菌活性保持","proof":"保存期內活菌數定期檢測,記錄衰減曲線","source":"內部穩定性考察"},{"claim":"減少牙菌斑","proof":"牙菌斑指數(PLI)使用前後對比"},{"claim":"改善口腔異味","proof":"揮發性硫化物(VSC)儀器測定"},{"claim":"溫和不刺激口腔黏膜","proof":"口腔黏膜刺激性試驗"},{"claim":"低摩擦不傷琺瑯質","proof":"相對牙本質磨耗值(RDA)測定"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Claims and substantiation","intro":"Oral claims are held to a stricter standard than general skincare. Each line below maps to a verification method that can be produced on request; entries lacking a source are flagged explicitly rather than blurred.","items":[{"claim":"Probiotic viability maintained","proof":"Viable counts measured periodically across shelf life, with the decay curve recorded","source":"Internal stability programme"},{"claim":"Reduced dental plaque","proof":"Plaque index (PLI) compared before and after use"},{"claim":"Improved oral malodour","proof":"Instrumental measurement of volatile sulphur compounds (VSC)"},{"claim":"Gentle on oral mucosa","proof":"Oral mucosal irritation testing"},{"claim":"Low abrasivity, enamel-safe","proof":"Relative dentin abrasivity (RDA) measurement"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"訴求と根拠","intro":"口腔製品の訴求は一般的なスキンケアより厳格に扱われます。以下の各項目は、求めに応じて提示できる検証方法に対応します。出典を欠く項目は曖昧にせず、明示的に表示します。","items":[{"claim":"プロバイオティクスの生存性維持","proof":"保存期間中の生菌数を定期測定し、減衰曲線を記録","source":"社内安定性プログラム"},{"claim":"歯垢の低減","proof":"歯垢指数(PLI)の使用前後比較"},{"claim":"口臭の改善","proof":"揮発性硫黄化合物(VSC)の機器測定"},{"claim":"口腔粘膜への低刺激性","proof":"口腔粘膜刺激性試験"},{"claim":"低研磨でエナメル質にやさしい","proof":"相対象牙質研磨値(RDA)の測定"}]}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'evidence' AND bk.sort_order = 4;
INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
       SELECT id, 'inquiry', 5, 1, '{}' FROM pages WHERE site_id = 'biosphere-oralcare' AND slug = '';
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-cn', '{"title":"带着你的需求来,我们用一份可执行的方案回复","body":"无论是既有配方复刻、全新品类开发,还是只想先问问产能与起订量 —— 一封邮件即可开始,我们在两个工作日内给出书面回复。","button":"发起询盘"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'zh-tw', '{"title":"帶著你的需求來,我們以一份可執行的方案回覆","body":"無論是既有配方複刻、全新品類開發,或只想先問產能與起訂量 —— 一封郵件即可開始,我們於兩個工作日內提供書面回覆。","button":"發起詢價"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'en', '{"title":"Bring us the brief — we reply with an actionable plan","body":"Whether it is reproducing an existing formula, developing a new category, or simply asking about capacity and MOQ — one email starts it. We respond in writing within two working days.","button":"Start an inquiry"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
INSERT INTO block_i18n (block_id, lang, data_json)
         SELECT bk.id, 'ja', '{"title":"ご要望をお寄せください。実行可能な提案でお返しします","body":"既存処方の再現、新カテゴリーの開発、あるいは生産能力と最小ロットのご確認だけでも構いません。メール一通から始まり、2 営業日以内に書面でご回答します。","button":"お問い合わせ"}' FROM blocks bk JOIN pages pg ON pg.id = bk.page_id
          WHERE pg.site_id = 'biosphere-oralcare' AND pg.slug = '' AND bk.type = 'inquiry' AND bk.sort_order = 5;
