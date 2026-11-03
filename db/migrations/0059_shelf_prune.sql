-- 0059:把拿不出实拍图的包材下架(status='draft')。
-- 不是删除 —— 这些条目的规格是手写的、很细,缺的只是照片。
-- 补上图之后跑 python tools/shelf-prune.py --restore 就回来了。

UPDATE packaging SET status='draft' WHERE code IN ('AB-101','AB-102','SM-309','SM-306','SM-305','AB-105','AB-106','AB-107','AB-114','AB-111','JT-201','JT-202','JT-203','JT-205','JT-206','JT-207','SM-303','SM-304','SM-301','SM-302','SM-310','SM-311','SM-314','AB-108','AB-109','AB-110','AB-104','JT-204','SM-312','AB-103','SM-308','AB-112','AB-113','SM-307','SM-313','JT-208','JT-209','JT-210','JT-211','JT-212','JT-213','JT-214');
