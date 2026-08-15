-- 由 tools/seed-formulas.mjs 生成。全部为**样例**,上线前须由创始人替换为真实配方。
DELETE FROM formulas WHERE status = 'sample';
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('SR-1001','skincare','serum','hydrating,barrier','[{"name":"透明质酸钠","pct":"0.5-1.5%"},{"name":"泛醇","pct":"1-3%"}]','水感清爽,吸收快',3000,'low',25,'CN,EU,US,JP,ID','sample','SR-1001 · skincare/serum · 功效 hydrating,barrier · 主要活性物 透明质酸钠 0.5-1.5%、泛醇 1-3% · 肤感 水感清爽,吸收快 · 起订 3000 · 打样 25 天 · 可去市场 CN,EU,US,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('SR-1002','skincare','serum','brightening','[{"name":"烟酰胺","pct":"2-5%"},{"name":"α-熊果苷","pct":"0.5-2%"}]','轻薄微黏,成膜均匀',3000,'mid',30,'CN,EU,US,ID','sample','SR-1002 · skincare/serum · 功效 brightening · 主要活性物 烟酰胺 2-5%、α-熊果苷 0.5-2% · 肤感 轻薄微黏,成膜均匀 · 起订 3000 · 打样 30 天 · 可去市场 CN,EU,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('SR-1003','skincare','serum','anti-aging,firming','[{"name":"视黄醇","pct":"0.1-0.3%"},{"name":"生育酚","pct":"0.5-1%"}]','油润,夜用型',5000,'high',45,'EU,US,JP','sample','SR-1003 · skincare/serum · 功效 anti-aging,firming · 主要活性物 视黄醇 0.1-0.3%、生育酚 0.5-1% · 肤感 油润,夜用型 · 起订 5000 · 打样 45 天 · 可去市场 EU,US,JP');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('SR-1004','skincare','serum','soothing,sensitive','[{"name":"红没药醇","pct":"0.2-0.5%"},{"name":"积雪草苷","pct":"0.1-0.5%"}]','无刺激,极简配方',3000,'mid',30,'CN,EU,US,JP,ID','sample','SR-1004 · skincare/serum · 功效 soothing,sensitive · 主要活性物 红没药醇 0.2-0.5%、积雪草苷 0.1-0.5% · 肤感 无刺激,极简配方 · 起订 3000 · 打样 30 天 · 可去市场 CN,EU,US,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('SR-1005','skincare','serum','oil-control,acne','[{"name":"水杨酸","pct":"0.5-2%"},{"name":"锌盐","pct":"0.3-1%"}]','速干哑光',5000,'low',28,'CN,US,ID','sample','SR-1005 · skincare/serum · 功效 oil-control,acne · 主要活性物 水杨酸 0.5-2%、锌盐 0.3-1% · 肤感 速干哑光 · 起订 5000 · 打样 28 天 · 可去市场 CN,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('SR-1006','skincare','serum','hydrating,plumping','[{"name":"多重透明质酸","pct":"1-2%"},{"name":"海藻糖","pct":"1-3%"}]','弹润,轻膜感',3000,'mid',30,'CN,EU,JP,ID','sample','SR-1006 · skincare/serum · 功效 hydrating,plumping · 主要活性物 多重透明质酸 1-2%、海藻糖 1-3% · 肤感 弹润,轻膜感 · 起订 3000 · 打样 30 天 · 可去市场 CN,EU,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CR-2001','skincare','cream','barrier,repair','[{"name":"神经酰胺NP","pct":"0.5-2%"},{"name":"胆固醇","pct":"0.2-0.8%"}]','厚润不油腻',3000,'mid',35,'CN,EU,US,JP,ID','sample','CR-2001 · skincare/cream · 功效 barrier,repair · 主要活性物 神经酰胺NP 0.5-2%、胆固醇 0.2-0.8% · 肤感 厚润不油腻 · 起订 3000 · 打样 35 天 · 可去市场 CN,EU,US,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CR-2002','skincare','cream','anti-aging','[{"name":"胜肽复合物","pct":"2-5%"},{"name":"角鲨烷","pct":"5-10%"}]','丝滑,推开即化',3000,'high',45,'EU,US,JP','sample','CR-2002 · skincare/cream · 功效 anti-aging · 主要活性物 胜肽复合物 2-5%、角鲨烷 5-10% · 肤感 丝滑,推开即化 · 起订 3000 · 打样 45 天 · 可去市场 EU,US,JP');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CR-2003','skincare','cream','hydrating,daily','[{"name":"甘油","pct":"3-8%"},{"name":"乳木果油","pct":"2-5%"}]','基础款,四季适用',5000,'low',25,'CN,US,ID','sample','CR-2003 · skincare/cream · 功效 hydrating,daily · 主要活性物 甘油 3-8%、乳木果油 2-5% · 肤感 基础款,四季适用 · 起订 5000 · 打样 25 天 · 可去市场 CN,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CR-2004','skincare','cream','soothing,post-procedure','[{"name":"泛醇","pct":"2-5%"},{"name":"尿囊素","pct":"0.2-0.5%"}]','医美术后向,极简',3000,'mid',35,'CN,EU,JP','sample','CR-2004 · skincare/cream · 功效 soothing,post-procedure · 主要活性物 泛醇 2-5%、尿囊素 0.2-0.5% · 肤感 医美术后向,极简 · 起订 3000 · 打样 35 天 · 可去市场 CN,EU,JP');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CR-2005','skincare','cream','brightening,night','[{"name":"传明酸","pct":"1-3%"},{"name":"烟酰胺","pct":"2-4%"}]','夜用,略厚',3000,'mid',35,'CN,JP,ID','sample','CR-2005 · skincare/cream · 功效 brightening,night · 主要活性物 传明酸 1-3%、烟酰胺 2-4% · 肤感 夜用,略厚 · 起订 3000 · 打样 35 天 · 可去市场 CN,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MK-3001','skincare','mask','hydrating','[{"name":"透明质酸钠","pct":"0.3-1%"},{"name":"甜菜碱","pct":"1-2%"}]','精华液饱满,天丝基布',10000,'low',20,'CN,EU,US,JP,ID','sample','MK-3001 · skincare/mask · 功效 hydrating · 主要活性物 透明质酸钠 0.3-1%、甜菜碱 1-2% · 肤感 精华液饱满,天丝基布 · 起订 10000 · 打样 20 天 · 可去市场 CN,EU,US,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MK-3002','skincare','mask','brightening','[{"name":"烟酰胺","pct":"2-4%"},{"name":"维生素C衍生物","pct":"1-3%"}]','略黏,敷后需洗',10000,'mid',25,'CN,US,ID','sample','MK-3002 · skincare/mask · 功效 brightening · 主要活性物 烟酰胺 2-4%、维生素C衍生物 1-3% · 肤感 略黏,敷后需洗 · 起订 10000 · 打样 25 天 · 可去市场 CN,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MK-3003','skincare','mask','soothing','[{"name":"积雪草提取物","pct":"1-3%"},{"name":"红没药醇","pct":"0.2-0.4%"}]','生物纤维膜,贴合度高',8000,'mid',28,'CN,EU,JP','sample','MK-3003 · skincare/mask · 功效 soothing · 主要活性物 积雪草提取物 1-3%、红没药醇 0.2-0.4% · 肤感 生物纤维膜,贴合度高 · 起订 8000 · 打样 28 天 · 可去市场 CN,EU,JP');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MK-3004','skincare','mask','clay,detox','[{"name":"高岭土","pct":"15-25%"},{"name":"活性炭","pct":"1-3%"}]','水洗式,涂抹型',8000,'low',22,'CN,US,ID','sample','MK-3004 · skincare/mask · 功效 clay,detox · 主要活性物 高岭土 15-25%、活性炭 1-3% · 肤感 水洗式,涂抹型 · 起订 8000 · 打样 22 天 · 可去市场 CN,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CL-4001','cleansing','foam','gentle,amino','[{"name":"氨基酸表活复配","pct":"12-18%"}]','细腻绵密泡,弱酸性',5000,'mid',25,'CN,EU,US,JP,ID','sample','CL-4001 · cleansing/foam · 功效 gentle,amino · 主要活性物 氨基酸表活复配 12-18% · 肤感 细腻绵密泡,弱酸性 · 起订 5000 · 打样 25 天 · 可去市场 CN,EU,US,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CL-4002','cleansing','foam','deep-clean','[{"name":"皂基复配","pct":"20-28%"}]','冲洗感强,清爽',5000,'low',20,'CN,ID','sample','CL-4002 · cleansing/foam · 功效 deep-clean · 主要活性物 皂基复配 20-28% · 肤感 冲洗感强,清爽 · 起订 5000 · 打样 20 天 · 可去市场 CN,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CL-4003','cleansing','oil','makeup-removal','[{"name":"辛酸/癸酸甘油三酯","pct":"60-80%"}]','乳化快,不糊眼',5000,'mid',25,'CN,EU,JP,ID','sample','CL-4003 · cleansing/oil · 功效 makeup-removal · 主要活性物 辛酸/癸酸甘油三酯 60-80% · 肤感 乳化快,不糊眼 · 起订 5000 · 打样 25 天 · 可去市场 CN,EU,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('CL-4004','cleansing','micellar','sensitive','[{"name":"温和非离子表活","pct":"3-6%"}]','免洗型,零泡',8000,'low',22,'EU,US,ID','sample','CL-4004 · cleansing/micellar · 功效 sensitive · 主要活性物 温和非离子表活 3-6% · 肤感 免洗型,零泡 · 起订 8000 · 打样 22 天 · 可去市场 EU,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MU-5001','makeup','powder','pressed,matte','[{"name":"云母","pct":"40-60%"},{"name":"硅石","pct":"5-12%"}]','压粉细腻,不飞粉',5000,'mid',35,'CN,EU,US,JP,ID','sample','MU-5001 · makeup/powder · 功效 pressed,matte · 主要活性物 云母 40-60%、硅石 5-12% · 肤感 压粉细腻,不飞粉 · 起订 5000 · 打样 35 天 · 可去市场 CN,EU,US,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MU-5002','makeup','powder','loose,setting','[{"name":"滑石粉替代体系","pct":"50-70%"}]','散粉,轻薄定妆',5000,'low',30,'CN,US,ID','sample','MU-5002 · makeup/powder · 功效 loose,setting · 主要活性物 滑石粉替代体系 50-70% · 肤感 散粉,轻薄定妆 · 起订 5000 · 打样 30 天 · 可去市场 CN,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MU-5003','makeup','balm','lip,tinted','[{"name":"蜡体复配","pct":"18-28%"},{"name":"植物油相","pct":"40-55%"}]','滋润带色,不拔干',8000,'mid',35,'CN,EU,JP,ID','sample','MU-5003 · makeup/balm · 功效 lip,tinted · 主要活性物 蜡体复配 18-28%、植物油相 40-55% · 肤感 滋润带色,不拔干 · 起订 8000 · 打样 35 天 · 可去市场 CN,EU,JP,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MU-5004','makeup','balm','lip,clear','[{"name":"蜡体复配","pct":"20-30%"}]','纯润唇,无色',10000,'low',28,'CN,US,ID','sample','MU-5004 · makeup/balm · 功效 lip,clear · 主要活性物 蜡体复配 20-30% · 肤感 纯润唇,无色 · 起订 10000 · 打样 28 天 · 可去市场 CN,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('MU-5005','makeup','liquid','foundation,light','[{"name":"二氧化钛","pct":"5-12%"},{"name":"成膜剂","pct":"2-5%"}]','轻薄水润,自然遮瑕',5000,'high',45,'CN,EU,JP','sample','MU-5005 · makeup/liquid · 功效 foundation,light · 主要活性物 二氧化钛 5-12%、成膜剂 2-5% · 肤感 轻薄水润,自然遮瑕 · 起订 5000 · 打样 45 天 · 可去市场 CN,EU,JP');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('OC-6001','oral','toothpaste','low-abrasion,daily','[{"name":"水合硅石","pct":"15-25%"},{"name":"木糖醇","pct":"5-10%"}]','低研磨,温和薄荷',10000,'low',30,'CN,EU,US,ID','sample','OC-6001 · oral/toothpaste · 功效 low-abrasion,daily · 主要活性物 水合硅石 15-25%、木糖醇 5-10% · 肤感 低研磨,温和薄荷 · 起订 10000 · 打样 30 天 · 可去市场 CN,EU,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('OC-6002','oral','toothpaste','probiotic','[{"name":"口腔益生菌冻干粉","pct":"0.5-2%"}]','无强效杀菌剂',10000,'high',50,'CN,EU,JP','sample','OC-6002 · oral/toothpaste · 功效 probiotic · 主要活性物 口腔益生菌冻干粉 0.5-2% · 肤感 无强效杀菌剂 · 起订 10000 · 打样 50 天 · 可去市场 CN,EU,JP');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('OC-6003','oral','toothpaste','whitening,gentle','[{"name":"羟基磷灰石","pct":"5-15%"}]','非过氧化物路线',10000,'mid',40,'EU,US,JP','sample','OC-6003 · oral/toothpaste · 功效 whitening,gentle · 主要活性物 羟基磷灰石 5-15% · 肤感 非过氧化物路线 · 起订 10000 · 打样 40 天 · 可去市场 EU,US,JP');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('OC-6004','oral','rinse','alcohol-free','[{"name":"西吡氯铵","pct":"0.05-0.1%"}]','无酒精,不辣口',8000,'low',25,'CN,US,ID','sample','OC-6004 · oral/rinse · 功效 alcohol-free · 主要活性物 西吡氯铵 0.05-0.1% · 肤感 无酒精,不辣口 · 起订 8000 · 打样 25 天 · 可去市场 CN,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('BD-7001','body','lotion','hydrating','[{"name":"甘油","pct":"5-10%"},{"name":"角鲨烷","pct":"3-6%"}]','快吸收,无油膜',5000,'low',22,'CN,EU,US,ID','sample','BD-7001 · body/lotion · 功效 hydrating · 主要活性物 甘油 5-10%、角鲨烷 3-6% · 肤感 快吸收,无油膜 · 起订 5000 · 打样 22 天 · 可去市场 CN,EU,US,ID');
INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES ('BD-7002','body','oil','nourishing,botanical','[{"name":"冷压植物油复配","pct":"85-95%"}]','延展好,香气自然',3000,'mid',28,'EU,US,JP','sample','BD-7002 · body/oil · 功效 nourishing,botanical · 主要活性物 冷压植物油复配 85-95% · 肤感 延展好,香气自然 · 起订 3000 · 打样 28 天 · 可去市场 EU,US,JP');
