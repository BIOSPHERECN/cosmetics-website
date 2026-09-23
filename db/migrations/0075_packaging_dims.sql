-- 包材尺寸与重量(2026-09-16 创始人:「有些瓶子是有尺寸的,那也是需要标注的」「这个对于客户知道瓶子的尺寸还是非常重要的」)。
-- 1688「商品件重尺」表每个 SKU 有 长×宽×高(cm)与重量(g);dims 存「3.9×3.9×3.7 cm」这种可读串,weight_g 存克数。
ALTER TABLE packaging ADD COLUMN dims TEXT;
ALTER TABLE packaging ADD COLUMN weight_g REAL;
