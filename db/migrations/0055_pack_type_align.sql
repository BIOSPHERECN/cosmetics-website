-- 0055(2026-09-08):把视觉判出的瓶型键对齐到库里已有的词表。
--
-- 视觉脚本用的是「采购会说的词」,库里 catalog.ts 用的是更早定的一套键,
-- 两套撞车了一个:视觉的 press-bottle 指**带泵头的按压瓶**,
-- 而 catalog 里 press-bottle 的标签是「挤压瓶」——
-- 直接入库会让 1,845 款显示成错的名字。这种错不报警、只是每天骗人。
--
-- 对齐规则:能映射到已有键的一律映射,映射不了的补进词表(见 catalog.ts)。
UPDATE packaging SET type='pump-bottle'         WHERE type='press-bottle';
UPDATE packaging SET type='jar'                 WHERE type='cream-jar';
UPDATE packaging SET type='compact-powder-case' WHERE type='compact';
UPDATE packaging SET type='mask-pouch'          WHERE type='sachet';
UPDATE packaging SET type='outer-carton'        WHERE type='carton';
UPDATE packaging SET type='cap'                 WHERE type='part';
