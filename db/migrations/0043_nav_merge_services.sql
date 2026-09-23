-- 0043(2026-09-07):导航按产线链路重排 + 解决方案十页收成一页服务。
--
-- 创始人当天的三条:
--   「原料库、包材库、配方库,建议合并到一起,不要散开」
--   「先包材,再配方,再包装盒,才有产品」「链路要清晰」
--   「解决方案不要和别人的网站布局一样,可改成服务…把所有的变成一个网页」
--   措辞拍板:「个性化 OEM/ODM 服务」
--
-- 动作三件:
--   A. 三个库并进一个导航项「产品库」,父项落在链路第一段(包材)。
--      URL 一个都不改 —— 改了等于把昨天刚上线的页全部作废。
--   B. 成品案例从「关于」底下挪到产品库底下 —— 它是链路的终点,不是公司简介的附属。
--   C. 新增 /services/;旧的 /solutions/ 与十个子页退出导航并下架,
--      由路由做 301 指到 /services/#锚点。内容一个字没丢,全在新页上。
--
-- 语种:只写 zh-cn 与 en。getNav 的回退链是 [当前语种, en, zh-cn],
-- 另外十五个语种会自动落到英文,不必为一个新页补十七行占位翻译。

-- ── A. 三个库合并 ──────────────────────────────────────────────────────
UPDATE pages SET parent_id = (SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='packaging')
 WHERE site_id='biosphere-ai' AND slug IN ('formulas','ingredients');

-- 父项在导航上叫「产品库」,点进去落在链路第一段(包材)——「先包材」。
-- 页内顶上的链路条会立刻把四段摆出来,不会停在一个库里出不去。
UPDATE page_i18n SET nav_label='产品库'
 WHERE lang='zh-cn' AND page_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='packaging');
UPDATE page_i18n SET nav_label='Libraries'
 WHERE lang='en' AND page_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='packaging');

-- 排序按链路走:包材(父) → 配方 → 原料 → 成品
UPDATE pages SET sort_order=3  WHERE site_id='biosphere-ai' AND slug='packaging';
UPDATE pages SET sort_order=31 WHERE site_id='biosphere-ai' AND slug='formulas';
UPDATE pages SET sort_order=32 WHERE site_id='biosphere-ai' AND slug='ingredients';

-- ── B. 成品案例归位 ────────────────────────────────────────────────────
UPDATE pages SET parent_id=(SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='packaging'),
                 sort_order=33
 WHERE site_id='biosphere-ai' AND slug='products';

-- ── C. 解决方案 → 个性化 OEM/ODM 服务 ─────────────────────────────────
INSERT OR IGNORE INTO pages (site_id,slug,parent_id,template,in_nav,sort_order,status)
VALUES ('biosphere-ai','services',NULL,'external',1,4,'published');

INSERT OR REPLACE INTO page_i18n (page_id,lang,nav_label,title,seo_desc,mt) VALUES
((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='services'),'zh-cn',
 'OEM/ODM 服务',
 '个性化 OEM/ODM 服务 —— 一条链,你要哪一段,我们接哪一段',
 '广州草本化妆品工厂的个性化 OEM/ODM 服务:整线代工、配方定制、单段承接三种接法,覆盖包材、配方、包装盒到成品四段链路。十种客户情形各自怎么走,一页写清。',0),
((SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='services'),'en',
 'Services',
 'Custom OEM / ODM services — one chain, take all of it or one stage',
 'Custom OEM/ODM services from a Guangzhou botanical cosmetics factory: full OEM, ODM formulation, or a single stage. Containers, formulas, cartons and finished product — ten customer situations, one page.',0);

-- 旧的十一页退出导航并下架 —— 路由改成 301,sitemap 不再列它们。
-- 不删 pages 行:留着才知道这些 slug 曾经存在过、现在指向哪。
UPDATE pages SET in_nav=0, status='draft'
 WHERE site_id='biosphere-ai' AND (slug='solutions' OR slug LIKE 'solutions/%');
