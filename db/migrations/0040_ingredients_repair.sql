-- 0040(2026-09-07):修复被审稿意见污染的原料记录。
--
-- 0034 那一版自动套用审稿修订时,把散文式的建议整段写进了字段:
-- 一百条里三十条受影响,最糟的两条连 INCI 都成了指令文本
--(「INCI 保持 Morus Alba Root Extract;name_zh 改为…」),而 INCI 决定 slug 与页面标题。
--
-- 教训:自动套用只适合「值 → 值」的修订。审稿意见是写给人看的,
-- 里面既有新值也有理由,机器分不清哪一段该写进去。
-- 要么把审稿产出约束成纯值,要么就别自动套 —— 上一版两样都没做。
--
-- 这一版只做能确定的还原(值形如「…改为:「X」」就取 X),
-- 救不回来的一律下架等人工重写 —— 九十条干净的,比一百条混着垃圾的强。

UPDATE ingredients SET name_zh='光果甘草(根)提取物」;aliases 保留「甘草根提取物」并在 mechanism_zh 中补一句:「与乌拉尔甘草(Glycyrrhiza uralensis)对应的是另一条 INCI,物种不同、标示物与目录条目均不通用,选料时先确认拉丁名。' WHERE slug='glycyrrhiza-glabra-root-extract';
UPDATE ingredients SET mechanism_zh='也常出现在抗蓝光、晒后舒缓类概念的配方设计里。' WHERE slug='scutellaria-baicalensis-root-extract';
UPDATE ingredients SET mechanism_zh='多糖类具成膜性,配方中参与保湿方向的设计,同时对体系流变有实际贡献——这一点常被低估:它不只是活性物,也是半个增稠剂。', incompatible='高醇体系中多糖易析出白色絮状物,析出阈值随规格与分子量差异很大,高醇爽肤水必须先做梯度稀释预试或另选耐醇规格,不要按某个固定醇度判断。' WHERE slug='astragalus-membranaceus-root-extract';
UPDATE ingredients SET status='draft' WHERE slug='morus-alba-root-extract';
UPDATE ingredients SET status='draft' WHERE slug='polygonum-multiflorum-root-extract';
UPDATE ingredients SET aliases='竹子提取物,龙头竹提取物,Bambusa vulgaris,Bamboo extract」；把部位问题挪进 mechanism_zh，补一句：「该 INCI 不标注部位，叶部另有 Bambusa Vulgaris Leaf Extract 等独立 INCI，下单前须与供应商确认部位、提取方式与硅含量规格。' WHERE slug='bambusa-vulgaris-extract';
UPDATE ingredients SET status='draft' WHERE slug='chamomilla-recutita-flower-extract';
UPDATE ingredients SET status='draft' WHERE slug='avena-sativa-kernel-extract';
UPDATE ingredients SET mechanism_zh=')国际客户对这支油认知度低,随样资料需要额外交代来源、部位与脂肪酸谱。' WHERE slug='camellia-oleifera-seed-oil';
UPDATE ingredients SET factory_note='是否 FCF、是否去萜(无萜/折叠规格)、冷压还是蒸馏」。' WHERE slug='citrus-aurantium-bergamia-fruit-oil';
UPDATE ingredients SET mechanism_zh='1)与薄荷脑、薄荷油同用:蒸馏姜油本身的热感有限,冷热同用的卖点通常要靠 CO2 萃取物或姜油树脂实现;若配方里同时存在这两类姜原料与凉感剂,主观刺激会明显强于各自单用,眼周与颈部产品不建议同时上量。2)与辣椒素类(Capsicum 提取物、壬酰香草胺):热感叠加最容易出事故的一组,但叠加风险主要来自姜油树脂/CO2 萃取物一侧;总热感组分须按最低有效量设计并做梯度人体测试。」stability 末句改为:「一是长期存放后的颜色变化对浅色配方的影响,二是辛辣香气强度随存放时间的衰减(热感诉求若由姜油树脂承担,则该项应对树脂规格单独考核)。」factory_note 中「打样阶段就要做梯度…把热感刚好的点定下来」改为「打样阶段就要做梯度(如 0.05/0.1/0.2%)人体耐受与感官对照,把辛辣香气与刺激的可接受点定下来;若客户诉求是明确热感,应改用姜油树脂或 CO2 萃取物并单独评估,不要靠拉高蒸馏油加量硬凑。' WHERE slug='zingiber-officinale-root-oil';
UPDATE ingredients SET aliases='银耳多糖,白木耳多糖,雪耳提取物,Tremella fuciformis,Tremella Fuciformis Extract' WHERE slug='tremella-fuciformis-polysaccharide';
UPDATE ingredients SET mechanism_zh='因为不带电荷,耐盐、耐 pH 波动的能力比卡波与多数阴离子胶好,肤感顺滑、拉丝感弱,常被用于天然认证配方中替代合成流变剂的手感需求。' WHERE slug='tamarindus-indica-seed-gum';
UPDATE ingredients SET market_eu='欧盟对水解小麦蛋白类原料设有与肽分子量相关的限制条件,不属于无条件常规使用,采用前必须逐项核对原料规格是否落在允许范围内,并在产品信息文件中保留分子量分布数据与供应商资料;具体条件以最新官方文本为准。」同时把 confidence 由「高」降为「中」。' WHERE slug='hydrolyzed-wheat-protein';
UPDATE ingredients SET market_us='常规使用方向。过敏原相关的标签与客服口径以供应商检测资料与目标市场规则为准,不预设豌豆属于强制标示的过敏原类别,以最新官方文本为准。' WHERE slug='hydrolyzed-pea-protein';
UPDATE ingredients SET aliases='肌醇六磷酸,IP6,Inositol Hexaphosphate,Phytate,Phytic Acid」;来源信息移到 mechanism_zh 或 halal_vegan(那里已有「常见米糠及谷物来源」)。' WHERE slug='phytic-acid';
UPDATE ingredients SET aliases='三甲基甘氨酸,无水甜菜碱,TMG,Trimethylglycine,Glycine Betaine」;来源留在 halal_vegan 与 mechanism_zh 里说明即可。' WHERE slug='betaine';
UPDATE ingredients SET status='draft' WHERE slug='bakuchiol';
