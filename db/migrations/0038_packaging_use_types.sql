-- 0038(2026-09-07):把「用途」和「形态」分开,不再拿用途硬猜瓶型。
--
-- 源站(新潮塑胶目录)的十三个类别里,只有五个说的是形态
-- (PET瓶 / PETG瓶 / 玻璃瓶 / 真空瓶 / 走珠瓶),其余八个说的是**装什么**
-- (膏霜护肤类 / 洗发沐浴类 / 婴童类 / 彩妆类 / 护发美发类 / 洗涤瓶 / 赠品类 / 其他)。
--
-- 入库时我把用途硬映射成了形态,结果 ST-A3650 这只带指槽的膏霜罐被标成「按压瓶」——
-- 客户按这个筛选会筛到一堆对不上的东西,比没有分类更糟。
-- 现在如实存成用途类型,形态留空,等尺寸图 OCR 与视觉识别补上再改。
UPDATE packaging SET type='use-skincare' WHERE supplier_ref='新潮塑胶' AND notes_zh='护肤'  AND type='jar';
UPDATE packaging SET type='use-wash'     WHERE supplier_ref='新潮塑胶' AND notes_zh='洗护'  AND type='pump-bottle';
UPDATE packaging SET type='use-baby'     WHERE supplier_ref='新潮塑胶' AND notes_zh='婴童'  AND type='press-bottle';
UPDATE packaging SET type='use-makeup'   WHERE supplier_ref='新潮塑胶' AND notes_zh='彩妆'  AND type='compact';
UPDATE packaging SET type='use-home'     WHERE supplier_ref='新潮塑胶' AND notes_zh='家清'  AND type='press-bottle';
UPDATE packaging SET type='use-gift'     WHERE supplier_ref='新潮塑胶' AND notes_zh='礼赠'  AND type='travel-kit';
UPDATE packaging SET type='use-other'    WHERE supplier_ref='新潮塑胶' AND (notes_zh IS NULL OR notes_zh='') AND type='press-bottle'
   AND material IS NULL;
