-- 队列批次 19cf9c20:12 张已上传 R2,这里只补数据库索引。
-- 上传与入库分开:图先上去,SQL 人看过再灌 —— 两边都能单独重来。
-- book/page 是 NOT NULL(2026-09-07 踩过:漏了这两列,
-- INSERT OR IGNORE 把三千五百行静默丢光,还不报错)。

INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',1,'item','media/pack/mx/MX-006-6.webp','MX-006-6','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',2,'item','media/pack/mx/MX-007-1.webp','MX-007-1','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',3,'item','media/pack/mx/MX-007-2.webp','MX-007-2','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',4,'item','media/pack/mx/MX-007-3.webp','MX-007-3','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',5,'item','media/pack/mx/MX-007-4.webp','MX-007-4','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',6,'item','media/pack/mx/MX-007-5.webp','MX-007-5','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',7,'item','media/pack/mx/MX-008-1.webp','MX-008-1','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',8,'item','media/pack/mx/MX-008-2.webp','MX-008-2','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',9,'item','media/pack/mx/MX-008-3.webp','MX-008-3','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',10,'item','media/pack/mx/MX-008-4.webp','MX-008-4','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',11,'item','media/pack/mx/MX-008-5.webp','MX-008-5','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 杂项','mx','队列批次19cf9c20',12,'item','media/pack/mx/MX-008-6.webp','MX-008-6','queue',NULL,1);
