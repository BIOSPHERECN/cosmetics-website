-- 队列批次 824761b9:30 张已上传 R2,这里只补数据库索引。
-- 上传与入库分开:图先上去,SQL 人看过再灌 —— 两边都能单独重来。
-- book/page 是 NOT NULL(2026-09-07 踩过:漏了这两列,
-- INSERT OR IGNORE 把三千五百行静默丢光,还不报错)。

INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',1,'item','media/pack/al/AL-001-1.webp','AL-001-1','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',2,'item','media/pack/al/AL-001-2.webp','AL-001-2','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',3,'item','media/pack/al/AL-001-3.webp','AL-001-3','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',4,'item','media/pack/al/AL-001-4.webp','AL-001-4','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',5,'item','media/pack/al/AL-001-5.webp','AL-001-5','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',6,'item','media/pack/al/AL-001-6.webp','AL-001-6','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',7,'item','media/pack/al/AL-001-7.webp','AL-001-7','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',8,'item','media/pack/al/AL-001-8.webp','AL-001-8','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',9,'item','media/pack/al/AL-002-1.webp','AL-002-1','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',10,'item','media/pack/al/AL-002-2.webp','AL-002-2','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',11,'item','media/pack/al/AL-002-3.webp','AL-002-3','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',12,'item','media/pack/al/AL-002-4.webp','AL-002-4','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',13,'item','media/pack/al/AL-002-5.webp','AL-002-5','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',14,'item','media/pack/al/AL-003-1.webp','AL-003-1','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',15,'item','media/pack/al/AL-003-2.webp','AL-003-2','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',16,'item','media/pack/al/AL-003-3.webp','AL-003-3','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',17,'item','media/pack/al/AL-003-4.webp','AL-003-4','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',18,'item','media/pack/al/AL-003-5.webp','AL-003-5','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',19,'item','media/pack/al/AL-003-6.webp','AL-003-6','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',20,'item','media/pack/al/AL-003-7.webp','AL-003-7','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',21,'item','media/pack/al/AL-003-8.webp','AL-003-8','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',22,'item','media/pack/al/AL-004-1.webp','AL-004-1','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',23,'item','media/pack/al/AL-004-2.webp','AL-004-2','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',24,'item','media/pack/al/AL-004-3.webp','AL-004-3','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',25,'item','media/pack/al/AL-004-4.webp','AL-004-4','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',26,'item','media/pack/al/AL-004-5.webp','AL-004-5','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',27,'item','media/pack/al/AL-004-6.webp','AL-004-6','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',28,'item','media/pack/al/AL-004-7.webp','AL-004-7','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',29,'item','media/pack/al/AL-005-1.webp','AL-005-1','queue',NULL,1);
INSERT OR IGNORE INTO pack_assets (supplier,supplier_s,book,page,kind,r2_key,our_code,source,source_url,reviewed) VALUES ('1688 散单','al','队列批次824761b9',30,'item','media/pack/al/AL-005-2.webp','AL-005-2','queue',NULL,1);
