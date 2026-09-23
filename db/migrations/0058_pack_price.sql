-- 0058:包材参考价 = 供应商公开价 × 2,按 1 USD = 6.7 CNY 折算(2026-09-08)。
-- 只给取到供应商公开价的类型定价,其余留空 —— 报价单上一个错价比一个空值伤得多。
-- 由 tools/pack-price.py 生成,可重复跑。汇率或倍率改了,重跑即可全量覆盖。

-- pet-bottle-jar:3799 款
UPDATE packaging SET price_ref='$0.20-0.32', price_currency='USD', price_unit=NULL, source_price=0.1, source_price_note='供应商公开价 $0.10-$0.16 × 2;汇率 1 USD = 6.7 CNY(2026-09-08);stxinchao.en.alibaba.com 公开 FOB(2026-09-08 实测 5 条) · 与 1688 offer 559766155506 的 ¥0.72 起批价互相印证', price_mult=2, moq=COALESCE(moq, 10000) WHERE status IN ('sample','active') AND type IN ('pump-bottle','spray-bottle','screw-bottle','flip-bottle','foam-pump','airless-bottle','dropper-bottle','roll-on','refill-core','jar');

-- 没有取到供应商公开价的类型:显式留空,不留来路不明的旧值
UPDATE packaging SET price_ref=NULL, source_price=NULL, source_price_note=NULL WHERE status IN ('sample','active') AND type NOT IN ('pump-bottle','press-bottle','spray-bottle','screw-bottle','flip-bottle','foam-pump','airless-bottle','dropper-bottle','roll-on','refill-core','jar','cream-jar');
