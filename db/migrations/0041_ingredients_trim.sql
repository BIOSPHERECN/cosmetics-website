-- 0041(2026-09-07):把还原时多带进来的尾巴截掉。
--
-- 0040 从「…改为:「X」…」里取 X 时用了贪婪匹配,把闭合的「」之后的指令一起吞了。
-- 值本该到第一个「」」为止 —— 这七处逐条截断。
-- 姜油那条是字段串了(审稿说的是 incompatible,却被写进了 mechanism_zh),救不了,下架。
UPDATE ingredients SET name_zh='光果甘草(根)提取物'
 WHERE slug='glycyrrhiza-glabra-root-extract';
UPDATE ingredients SET aliases='竹子提取物,龙头竹提取物,Bambusa vulgaris,Bamboo extract'
 WHERE slug='bambusa-vulgaris-extract';
UPDATE ingredients SET factory_note='规格确认要点:是否 FCF(去佛手柑内酯)、是否去萜(无萜/折叠规格)、冷压还是蒸馏。这三项决定光敏风险与香气走向,报价单与 BOM 上必须写死。'
 WHERE slug='citrus-aurantium-bergamia-fruit-oil';
UPDATE ingredients SET market_eu='欧盟对水解小麦蛋白类原料设有与肽分子量相关的限制条件,不属于无条件常规使用,采用前必须逐项核对原料规格是否落在允许范围内,并在产品信息文件中保留分子量分布数据与供应商资料;具体条件以最新官方文本为准。',
                       confidence='中'
 WHERE slug='hydrolyzed-wheat-protein';
UPDATE ingredients SET aliases='肌醇六磷酸,IP6,Inositol Hexaphosphate,Phytate,Phytic Acid'
 WHERE slug='phytic-acid';
UPDATE ingredients SET aliases='三甲基甘氨酸,无水甜菜碱,TMG,Trimethylglycine,Glycine Betaine'
 WHERE slug='betaine';
UPDATE ingredients SET status='draft' WHERE slug='zingiber-officinale-root-oil';
