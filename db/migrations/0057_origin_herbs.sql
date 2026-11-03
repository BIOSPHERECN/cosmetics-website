-- 0057:原料溯源档案从五味补到十三味。
-- 八味全部取自 ingredients 表(我们自己的原料库),产区写公开可查的道地产区,
-- 不声称「帛卉在该产区有基地」——「自有基地亩数与证书编号由运营补充」那句原样保留。
-- 由 tools/origin-herbs.py 生成,可重复跑(先删同 slug 的页再插)。

-- 甘草
DELETE FROM pages WHERE site_id='biosphere-ai' AND slug='origin/licorice';
INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (140, 'biosphere-ai', 'origin/licorice', 96, 'standard', 1, 1110, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (140, 'zh-cn', '甘草', '甘草 Glycyrrhiza glabra · 原料溯源', '甘草 Glycyrrhiza glabra / Glycyrrhiza uralensis 的常规产区、入料部位与主要活性成分,以及它在配方里的常见方向。产区为公开可查的道地产区。');
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (440, 140, 'hero', 10, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (440, 'zh-cn', '{"eyebrow":"原料溯源","title":"甘草 · Glycyrrhiza glabra / Glycyrrhiza uralensis","body":"舒缓、亮肤方向;水醇提取,常与烟酰胺、维 C 衍生物配伍。","ctaText":"发起询盘","ctaHref":"/zh-cn/contact/"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (441, 140, 'matrix', 20, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (441, 'zh-cn', '{"title":"原料档案","intro":"以下为该植物的通用信息,可公开查证。","items":[{"k":"学名","v":"Glycyrrhiza glabra / Glycyrrhiza uralensis"},{"k":"INCI","v":"Glycyrrhiza Glabra Root Extract"},{"k":"常规产区","v":"中国新疆 · 内蒙古"},{"k":"入料部位","v":"根与根茎"},{"k":"主要活性成分","v":"甘草酸、甘草苷;光果甘草另含光甘草定(Glabridin)"},{"k":"常见应用方向","v":"舒缓、亮肤方向;水醇提取,常与烟酰胺、维 C 衍生物配伍。"}]}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (442, 140, 'statement', 30, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (442, 'zh-cn', '{"eyebrow":"这一味的关键","tone":"sand","title":"「甘草」在配方里指两个物种:光果甘草(G. glabra)与乌拉尔甘草(G. uralensis)。光甘草定主要来自前者 —— 做亮肤方向要先认清是哪一种,写错物种等于宣称落空。","body":""}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (443, 140, 'prose', 40, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (443, 'zh-cn', '{"body":"【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (444, 140, 'inquiry', 50, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (444, 'zh-cn', '{"title":"需要甘草原料的检测报告?","body":"按批出具活性物含量、农残与重金属检测。","ctaText":"发起询盘"}', 0);

-- 枸杞
DELETE FROM pages WHERE site_id='biosphere-ai' AND slug='origin/goji';
INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (141, 'biosphere-ai', 'origin/goji', 96, 'standard', 1, 1111, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (141, 'zh-cn', '枸杞', '枸杞 Lycium barbarum · 原料溯源', '枸杞 Lycium barbarum 的常规产区、入料部位与主要活性成分,以及它在配方里的常见方向。产区为公开可查的道地产区。');
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (445, 141, 'hero', 10, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (445, 'zh-cn', '{"eyebrow":"原料溯源","title":"枸杞 · Lycium barbarum","body":"抗氧化与保湿方向;多糖组分对屏障类配方友好。","ctaText":"发起询盘","ctaHref":"/zh-cn/contact/"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (446, 141, 'matrix', 20, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (446, 'zh-cn', '{"title":"原料档案","intro":"以下为该植物的通用信息,可公开查证。","items":[{"k":"学名","v":"Lycium barbarum"},{"k":"INCI","v":"Lycium Barbarum Fruit Extract"},{"k":"常规产区","v":"中国宁夏中宁 · 新疆精河"},{"k":"入料部位","v":"成熟果实"},{"k":"主要活性成分","v":"枸杞多糖(LBP)、玉米黄质双棕榈酸酯、甜菜碱"},{"k":"常见应用方向","v":"抗氧化与保湿方向;多糖组分对屏障类配方友好。"}]}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (447, 141, 'statement', 30, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (447, 'zh-cn', '{"eyebrow":"这一味的关键","tone":"sand","title":"枸杞的活性主力是多糖,而多糖怕高温久提 —— 提取温度与时长直接决定这一味是活性物还是甜味剂。低温萃取那一段不是噱头。","body":""}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (448, 141, 'prose', 40, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (448, 'zh-cn', '{"body":"【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (449, 141, 'inquiry', 50, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (449, 'zh-cn', '{"title":"需要枸杞原料的检测报告?","body":"按批出具活性物含量、农残与重金属检测。","ctaText":"发起询盘"}', 0);

-- 鱼腥草
DELETE FROM pages WHERE site_id='biosphere-ai' AND slug='origin/houttuynia';
INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (142, 'biosphere-ai', 'origin/houttuynia', 96, 'standard', 1, 1112, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (142, 'zh-cn', '鱼腥草', '鱼腥草 Houttuynia cordata · 原料溯源', '鱼腥草 Houttuynia cordata 的常规产区、入料部位与主要活性成分,以及它在配方里的常见方向。产区为公开可查的道地产区。');
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (450, 142, 'hero', 10, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (450, 'zh-cn', '{"eyebrow":"原料溯源","title":"鱼腥草 · Houttuynia cordata","body":"舒缓与控油方向;油皮、痘肌类配方常用。","ctaText":"发起询盘","ctaHref":"/zh-cn/contact/"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (451, 142, 'matrix', 20, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (451, 'zh-cn', '{"title":"原料档案","intro":"以下为该植物的通用信息,可公开查证。","items":[{"k":"学名","v":"Houttuynia cordata"},{"k":"INCI","v":"Houttuynia Cordata Extract"},{"k":"常规产区","v":"中国四川 · 贵州"},{"k":"入料部位","v":"全草"},{"k":"主要活性成分","v":"癸酰乙醛(鱼腥草素)、槲皮苷、绿原酸"},{"k":"常见应用方向","v":"舒缓与控油方向;油皮、痘肌类配方常用。"}]}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (452, 142, 'statement', 30, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (452, 'zh-cn', '{"eyebrow":"这一味的关键","tone":"sand","title":"鱼腥草的特征气味来自癸酰乙醛,而它正是活性所在 —— 脱味脱得太干净,活性也一起走了。做香型时这一味要单独谈。","body":""}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (453, 142, 'prose', 40, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (453, 'zh-cn', '{"body":"【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (454, 142, 'inquiry', 50, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (454, 'zh-cn', '{"title":"需要鱼腥草原料的检测报告?","body":"按批出具活性物含量、农残与重金属检测。","ctaText":"发起询盘"}', 0);

-- 广藿香
DELETE FROM pages WHERE site_id='biosphere-ai' AND slug='origin/patchouli';
INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (143, 'biosphere-ai', 'origin/patchouli', 96, 'standard', 1, 1113, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (143, 'zh-cn', '广藿香', '广藿香 Pogostemon cablin · 原料溯源', '广藿香 Pogostemon cablin 的常规产区、入料部位与主要活性成分,以及它在配方里的常见方向。产区为公开可查的道地产区。');
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (455, 143, 'hero', 10, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (455, 'zh-cn', '{"eyebrow":"原料溯源","title":"广藿香 · Pogostemon cablin","body":"调理与香氛方向;精油入料,常作定香。","ctaText":"发起询盘","ctaHref":"/zh-cn/contact/"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (456, 143, 'matrix', 20, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (456, 'zh-cn', '{"title":"原料档案","intro":"以下为该植物的通用信息,可公开查证。","items":[{"k":"学名","v":"Pogostemon cablin"},{"k":"INCI","v":"Pogostemon Cablin Oil"},{"k":"常规产区","v":"中国广东肇庆 · 湛江(道地「广藿香」)"},{"k":"入料部位","v":"地上部分(叶与茎)"},{"k":"主要活性成分","v":"广藿香醇(Patchoulol)、α-布藜烯等倍半萜"},{"k":"常见应用方向","v":"调理与香氛方向;精油入料,常作定香。"}]}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (457, 143, 'statement', 30, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (457, 'zh-cn', '{"eyebrow":"这一味的关键","tone":"sand","title":"「广」字就是产区:广东是广藿香的道地产区,离广州基地最近的一味 ——鲜料在途时间短,挥发性成分损耗小。","body":""}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (458, 143, 'prose', 40, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (458, 'zh-cn', '{"body":"【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (459, 143, 'inquiry', 50, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (459, 'zh-cn', '{"title":"需要广藿香原料的检测报告?","body":"按批出具活性物含量、农残与重金属检测。","ctaText":"发起询盘"}', 0);

-- 金银花
DELETE FROM pages WHERE site_id='biosphere-ai' AND slug='origin/honeysuckle';
INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (144, 'biosphere-ai', 'origin/honeysuckle', 96, 'standard', 1, 1114, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (144, 'zh-cn', '金银花', '金银花 Lonicera japonica · 原料溯源', '金银花 Lonicera japonica 的常规产区、入料部位与主要活性成分,以及它在配方里的常见方向。产区为公开可查的道地产区。');
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (460, 144, 'hero', 10, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (460, 'zh-cn', '{"eyebrow":"原料溯源","title":"金银花 · Lonicera japonica","body":"舒缓与抗氧化方向;敏感肌、清洁类配方常用。","ctaText":"发起询盘","ctaHref":"/zh-cn/contact/"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (461, 144, 'matrix', 20, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (461, 'zh-cn', '{"title":"原料档案","intro":"以下为该植物的通用信息,可公开查证。","items":[{"k":"学名","v":"Lonicera japonica"},{"k":"INCI","v":"Lonicera Japonica Flower Extract"},{"k":"常规产区","v":"中国山东平邑 · 河南封丘"},{"k":"入料部位","v":"花蕾(将开未开时采)"},{"k":"主要活性成分","v":"绿原酸、木犀草苷"},{"k":"常见应用方向","v":"舒缓与抗氧化方向;敏感肌、清洁类配方常用。"}]}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (462, 144, 'statement', 30, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (462, 'zh-cn', '{"eyebrow":"这一味的关键","tone":"sand","title":"采收时点定成败:花蕾将开未开时绿原酸含量最高,开花之后掉得很快。这一味最能说明「择时采收」不是修辞。","body":""}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (463, 144, 'prose', 40, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (463, 'zh-cn', '{"body":"【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (464, 144, 'inquiry', 50, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (464, 'zh-cn', '{"title":"需要金银花原料的检测报告?","body":"按批出具活性物含量、农残与重金属检测。","ctaText":"发起询盘"}', 0);

-- 黄芩
DELETE FROM pages WHERE site_id='biosphere-ai' AND slug='origin/scutellaria';
INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (145, 'biosphere-ai', 'origin/scutellaria', 96, 'standard', 1, 1115, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (145, 'zh-cn', '黄芩', '黄芩 Scutellaria baicalensis · 原料溯源', '黄芩 Scutellaria baicalensis 的常规产区、入料部位与主要活性成分,以及它在配方里的常见方向。产区为公开可查的道地产区。');
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (465, 145, 'hero', 10, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (465, 'zh-cn', '{"eyebrow":"原料溯源","title":"黄芩 · Scutellaria baicalensis","body":"抗氧化与舒缓方向;与屏障类配方配伍稳定。","ctaText":"发起询盘","ctaHref":"/zh-cn/contact/"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (466, 145, 'matrix', 20, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (466, 'zh-cn', '{"title":"原料档案","intro":"以下为该植物的通用信息,可公开查证。","items":[{"k":"学名","v":"Scutellaria baicalensis"},{"k":"INCI","v":"Scutellaria Baicalensis Root Extract"},{"k":"常规产区","v":"中国河北承德 · 山西"},{"k":"入料部位","v":"根"},{"k":"主要活性成分","v":"黄芩苷(Baicalin)、黄芩素、汉黄芩素"},{"k":"常见应用方向","v":"抗氧化与舒缓方向;与屏障类配方配伍稳定。"}]}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (467, 145, 'statement', 30, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (467, 'zh-cn', '{"eyebrow":"这一味的关键","tone":"sand","title":"黄芩苷本身带黄色,加量做抗氧化会把膏体带黄 —— 这一味的用量上限往往由外观决定,而不是由功效决定。","body":""}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (468, 145, 'prose', 40, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (468, 'zh-cn', '{"body":"【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (469, 145, 'inquiry', 50, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (469, 'zh-cn', '{"title":"需要黄芩原料的检测报告?","body":"按批出具活性物含量、农残与重金属检测。","ctaText":"发起询盘"}', 0);

-- 三七
DELETE FROM pages WHERE site_id='biosphere-ai' AND slug='origin/notoginseng';
INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (146, 'biosphere-ai', 'origin/notoginseng', 96, 'standard', 1, 1116, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (146, 'zh-cn', '三七', '三七 Panax notoginseng · 原料溯源', '三七 Panax notoginseng 的常规产区、入料部位与主要活性成分,以及它在配方里的常见方向。产区为公开可查的道地产区。');
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (470, 146, 'hero', 10, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (470, 'zh-cn', '{"eyebrow":"原料溯源","title":"三七 · Panax notoginseng","body":"屏障方向;与人参同属,皂苷谱不同,不能互相替代。","ctaText":"发起询盘","ctaHref":"/zh-cn/contact/"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (471, 146, 'matrix', 20, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (471, 'zh-cn', '{"title":"原料档案","intro":"以下为该植物的通用信息,可公开查证。","items":[{"k":"学名","v":"Panax notoginseng"},{"k":"INCI","v":"Panax Notoginseng Root Extract"},{"k":"常规产区","v":"中国云南文山"},{"k":"入料部位","v":"根与根茎(三年生以上)"},{"k":"主要活性成分","v":"三七皂苷 R1、人参皂苷 Rb1 / Rg1"},{"k":"常见应用方向","v":"屏障方向;与人参同属,皂苷谱不同,不能互相替代。"}]}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (472, 146, 'statement', 30, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (472, 'zh-cn', '{"eyebrow":"这一味的关键","tone":"sand","title":"三七与人参同属不同种,皂苷谱差别很大 —— 报价单上写「人参皂苷」而实际用三七,是行业里常见的偷换,我们按物种分开建档。","body":""}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (473, 146, 'prose', 40, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (473, 'zh-cn', '{"body":"【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (474, 146, 'inquiry', 50, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (474, 'zh-cn', '{"title":"需要三七原料的检测报告?","body":"按批出具活性物含量、农残与重金属检测。","ctaText":"发起询盘"}', 0);

-- 艾蒿
DELETE FROM pages WHERE site_id='biosphere-ai' AND slug='origin/mugwort';
INSERT INTO pages (id, site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES (147, 'biosphere-ai', 'origin/mugwort', 96, 'standard', 1, 1117, 'published');
INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (147, 'zh-cn', '艾蒿', '艾蒿 Artemisia princeps · 原料溯源', '艾蒿 Artemisia princeps / Artemisia argyi 的常规产区、入料部位与主要活性成分,以及它在配方里的常见方向。产区为公开可查的道地产区。');
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (475, 147, 'hero', 10, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (475, 'zh-cn', '{"eyebrow":"原料溯源","title":"艾蒿 · Artemisia princeps / Artemisia argyi","body":"舒缓与屏障方向;敏感肌线常用,韩系配方带热之后需求量涨得快。","ctaText":"发起询盘","ctaHref":"/zh-cn/contact/"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (476, 147, 'matrix', 20, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (476, 'zh-cn', '{"title":"原料档案","intro":"以下为该植物的通用信息,可公开查证。","items":[{"k":"学名","v":"Artemisia princeps / Artemisia argyi"},{"k":"INCI","v":"Artemisia Princeps Leaf Extract"},{"k":"常规产区","v":"中国湖北蕲春(蕲艾) · 河南"},{"k":"入料部位","v":"叶"},{"k":"主要活性成分","v":"桉叶素等挥发油、黄酮类"},{"k":"常见应用方向","v":"舒缓与屏障方向;敏感肌线常用,韩系配方带热之后需求量涨得快。"}]}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (477, 147, 'statement', 30, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (477, 'zh-cn', '{"eyebrow":"这一味的关键","tone":"sand","title":"艾蒿含挥发油,做敏感肌线时要按目标市场核对致敏原申报 —— 「温和」是配方目标,不是这一味的天然属性。","body":""}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (478, 147, 'prose', 40, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (478, 'zh-cn', '{"body":"【待运营在后台补充】本味原料的帛卉合作基地信息:地块位置、面积、GAP 或有机认证编号、当季采收日期、批次检测报告编号。\n\n这一段留空是刻意的 —— 产区海拔、亩数这类数字如果由系统凭空生成,采购拿去核对时会当场穿帮,损失远大于「暂时没填」。"}', 0);
INSERT INTO blocks (id, page_id, type, sort_order, is_visible) VALUES (479, 147, 'inquiry', 50, 1);
INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES (479, 'zh-cn', '{"title":"需要艾蒿原料的检测报告?","body":"按批出具活性物含量、农残与重金属检测。","ctaText":"发起询盘"}', 0);

-- 卡片网格:补 href + 追加八味
UPDATE block_i18n SET data_json='{"eyebrow":"ORIGINS","tone":"paper","cols":3,"title":"13 味核心原料","intro":"点进任意一味看产区、入料部位与活性成分。植物学信息是公开可查的;帛卉自有基地的亩数与证书编号由运营在后台补充。尚无实拍的条目暂不配图 ——不拿图库照片冒充基地实拍。","items":[{"image":"/media/117","label":"人参 Panax ginseng","note":"中国东北 · 长白山区","href":"/zh-cn/origin/ginseng/"},{"image":"/media/118","label":"玫瑰 Rosa rugosa / Rosa damascena","note":"中国山东平阴 · 甘肃苦水","href":"/zh-cn/origin/rose/"},{"image":"/media/120","label":"绿茶 Camellia sinensis","note":"中国浙江 · 福建","href":"/zh-cn/origin/green-tea/"},{"image":"/media/122","label":"芦荟 Aloe barbadensis","note":"中国海南 · 云南","href":"/zh-cn/origin/aloe/"},{"image":"/media/124","label":"积雪草 Centella asiatica","note":"中国云南 · 广西","href":"/zh-cn/origin/centella/"},{"label":"甘草 Glycyrrhiza glabra","note":"中国新疆 · 内蒙古","href":"/zh-cn/origin/licorice/"},{"label":"枸杞 Lycium barbarum","note":"中国宁夏中宁 · 新疆精河","href":"/zh-cn/origin/goji/"},{"label":"鱼腥草 Houttuynia cordata","note":"中国四川 · 贵州","href":"/zh-cn/origin/houttuynia/"},{"label":"广藿香 Pogostemon cablin","note":"中国广东肇庆 · 湛江(道地「广藿香」)","href":"/zh-cn/origin/patchouli/"},{"label":"金银花 Lonicera japonica","note":"中国山东平邑 · 河南封丘","href":"/zh-cn/origin/honeysuckle/"},{"label":"黄芩 Scutellaria baicalensis","note":"中国河北承德 · 山西","href":"/zh-cn/origin/scutellaria/"},{"label":"三七 Panax notoginseng","note":"中国云南文山","href":"/zh-cn/origin/notoginseng/"},{"label":"艾蒿 Artemisia princeps","note":"中国湖北蕲春(蕲艾) · 河南","href":"/zh-cn/origin/mugwort/"}]}' WHERE block_id=310 AND lang='zh-cn';
-- 顶部数字:核心原料档案改成实际条数
UPDATE block_i18n SET data_json='{"tone":"paper","items":[{"value":"20+","unit":"家","label":"合作山地种植基地"},{"value":"3","unit":"大产区","label":"贵州毕节 · 新疆喀什 · 广东清远"},{"value":"13","unit":"味","label":"核心原料溯源档案"},{"value":"20,000+","unit":"篇","label":"古方文献数字化整理"}]}' WHERE block_id=423 AND lang='zh-cn';
