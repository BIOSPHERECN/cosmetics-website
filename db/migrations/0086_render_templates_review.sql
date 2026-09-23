-- 0085 试渲染评审后修模板(2026-09-17)。创始人原话:「工具都很强大,提示词不行,AI图就很惨」「不是太简单,完全没视觉效果的,无法吸引客户的」
-- 对照参考站样例三条差距:①瓶身有印刷品牌字与品名(不是空白标签的打样感);②材质按品类给真值(软管=哑光塑料,不是磨砂玻璃);③画面干净无杂物无反光板边缘。
-- 只 UPDATE 本任务新建的 render_templates,幂等。

-- 全部模板:空白标签 → 有字的极简标签(参考站 121/241/01 均有品牌字+品名+容量,这是"成品感"的来源);统一加"清洁画面"负向句
UPDATE render_templates SET template_en = REPLACE(template_en,
  'and a blank minimalist label', 'and a minimalist printed label with a short fictional brand wordmark, one product-name line and a volume line in crisp legible type');
UPDATE render_templates SET template_en = REPLACE(template_en,
  'and a blank label', 'and a minimalist printed label with a short fictional brand wordmark, one product-name line and a volume line in crisp legible type');
UPDATE render_templates SET template_en = REPLACE(template_en,
  'and blank labels', 'and matching minimalist printed labels with one short fictional brand wordmark in crisp legible type');
UPDATE render_templates SET template_en = REPLACE(template_en,
  ', blank label,', ', minimalist printed label with a short fictional brand wordmark and product-name line in crisp legible type,');
UPDATE render_templates SET template_en = REPLACE(template_en, 'no branding or text.', 'no real-world brand logos.');
UPDATE render_templates SET template_en = REPLACE(template_en, 'no visible branding or text.', 'no real-world brand logos.');
UPDATE render_templates SET template_en = REPLACE(template_en, 'no branding.', 'no real-world brand logos.');
UPDATE render_templates SET template_en = template_en ||
  ' Clean frame edge to edge: no reflector, light-stand, window frame or black edge in shot, no lens-flare sparkles, no floating objects, product fills 45-60% of frame height, packaging proportions physically accurate.';

-- 软管 tpl5(ST-A1105 得 1 分:玻璃软管、盖着盖子却从瓶身侧面出膏):删"gel emerging"与"extreme macro",软管必须平放、盖朝镜头、哑光塑料
UPDATE render_templates SET template_en =
  'A {color} matte soft-touch plastic laminate squeeze tube ({product}) with a {cap} flip-top cap and a crimped flat seal at the tail end, lying on its side on a wet white acrylic surface, cap facing the camera at a three-quarter angle, a single glossy dollop of white cream squeezed out beside the cap. Fine condensation droplets on the tube and surface. Gentle left-side softbox key light wrapping the tube curve, side fill lighting the water beads, subtle rim light, negative fill for gentle contrast. Pure white seamless background, 85mm, medium depth of field so the whole tube stays sharp. Fresh hydrating pure mood, commercial skincare photography, crisp detail, high-end beauty aesthetic.',
  template_zh = '{color}哑光软触塑料复合软管({product}),{cap}翻盖,尾部压边封口,平放在带水的白色亚克力台面上,盖口四分之三角朝镜头,盖旁挤出一坨光泽乳霜。管身与台面细密水珠。左侧柔光箱主光包住管身弧面,侧补光点亮水珠,微弱轮廓光,负补光。纯白无缝背景,85mm 中等景深整管清晰。清爽水润,商业护肤摄影。',
  notes = '09-17 评审:原版"磨砂玻璃软管+盖着盖出膏"出图畸形(ST-A1105 1 分)。软管材质必须是塑料复合,平放盖朝镜头,整管清晰。'
WHERE id = 5;
-- tpl5 是整句重写,上面追加的清洁句要补回来
UPDATE render_templates SET template_en = template_en ||
  ' Minimalist printed label with a short fictional brand wordmark and product-name line in crisp legible type. Clean frame edge to edge: no reflector or black edge in shot, no lens-flare sparkles, product fills 55-70% of frame width, packaging proportions physically accurate.'
WHERE id = 5;

-- 软管 tpl6(ST-A1214 3 分构图:水果堆满、软管立在盖上显小):水果减到两样,软管斜靠
UPDATE render_templates SET template_en = REPLACE(template_en,
  'surrounded by fresh fruit slices and a sprig of green herb', 'with just two fruit slices and one sprig of green herb placed off to one side, leaving clean negative space')
WHERE id = 6;

-- 面霜罐 tpl4(AL-004-3 3 分:罐子浮在石球上不真实、罐体在画面里太小):改放石台上,石球退成陪衬
UPDATE render_templates SET template_en = REPLACE(template_en,
  'balanced on a polished sage-green stone sphere perched on a textured beige limestone rock', 'standing firmly on a textured beige limestone slab, a polished sage-green stone sphere resting beside it as a prop')
WHERE id = 4;

-- 按压瓶 tpl8(AL-001-4 3 分:亚克力方块+星芒闪光廉价):去闪光,渐变改双色低饱和
UPDATE render_templates SET template_en = REPLACE(REPLACE(template_en,
  'transparent iridescent geometric acrylic blocks', 'two stacked matte stone plinths'),
  'fading from deep coral to soft golden', 'fading from muted terracotta to warm sand')
WHERE id = 8;

-- 模特手持 tpl11(AL-002-3 3 分:脸占满、产品小):产品前置放大,人物退到肩以上半虚
UPDATE render_templates SET template_en = REPLACE(template_en,
  'Product in the foreground tack-sharp, face softly focused', 'Product held forward toward the lens and filling at least a third of the frame height, tack-sharp; the face behind it softly out of focus, chin to forehead only partly in frame')
WHERE id = 11;
