-- 0091 原料价格确认状态(2026-09-18 12:5x 创始人:「价格由财务和采购确认,我们不可以瞎编」)
-- price_status 三档:draft(待确认)→ purchasing_confirmed(采购已确认)→ finance_confirmed(财务已确认;只有这档当准数进配方成本)
-- 任何人改价一律退回 draft;两级确认各记 who / when。ALTER 不幂等,只跑一次。
ALTER TABLE lab_materials ADD COLUMN price_status TEXT DEFAULT 'draft';
ALTER TABLE lab_materials ADD COLUMN price_confirmed_by TEXT;
ALTER TABLE lab_materials ADD COLUMN price_confirmed_at TEXT;
ALTER TABLE lab_materials ADD COLUMN finance_confirmed_by TEXT;
ALTER TABLE lab_materials ADD COLUMN finance_confirmed_at TEXT;
