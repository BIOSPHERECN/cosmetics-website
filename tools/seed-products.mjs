/**
 * 把公司资料里的重点爆品录成真实产品。
 *
 * 来源:《帛卉公司介绍_2026》第 7 页「重点推荐爆品」六款 + 第 8 页「巴西展会」四款。
 *
 * ── 一条必须守住的线 ────────────────────────────────────────
 * 资料里带了不少功效数字:多孔包裹 SPF 提升 64%、斑马鱼尾鳍修复 +19.07%、
 * 依克多因 0.3%、7 天身体美白对比。这些是**内部研发数据**,
 * 不是第三方验证过的功效宣称。
 *
 * 直接发到公开网站上,就是未经证实的功效宣称 —— 而这个站自己写着
 * 「功效宣称一律配得出第三方报告」。自己立的规矩自己先破,损失比不写这些数字大得多。
 *
 * 所以字段分成两列,靠**结构**隔开而不是靠约定:
 *   description    公开文案:定位、核心成分方向、目标市场 —— 商业信息,不是功效宣称
 *   internal_note  只在后台出现的合规提醒与内部数字,前台渲染层根本不查这一列
 *
 * 第一版我把内部数字写进了 description、只在文字里标「不对外宣称」。
 * 前台恰好没渲染 description 所以没漏,但那是**侥幸不是设计** ——
 * 哪天加了产品详情页,那些数字会连同「不对外宣称」几个字一起公开,
 * 而且看起来像是我们在正式宣称。
 *
 * 另外:资料里没有的(价格、起订量数字、上市时间)一律不写。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const SITE = 'biosphere-ai';
const MOQ = '柔性起订量 · 按品类与包材议';

/** 剂型图:用已有的产品形态图按品类对号入座,不硬塞 */
const IMG = { hair: 11, serum: 16, sun: 14, oral: 12, water: 16, tablet: 12, body: 14, mask: 17 };

const P = [
  /* ── 六大爆品(资料 P7)────────────────────────────── */
  {
    slug: 'murumuru-hair-mask', name: '木鲁星果脂发膜', cat: 'hair', img: IMG.hair,
    summary: '核心成分:亚马逊木鲁星果脂。深层滋养修护方向,面向欧美与巴西市场。',
    desc: '定位:护发修护。热带植物油脂亲肤性强,针对染烫受损与毛躁的柔顺亮泽需求。\n目标市场:欧美 / 巴西。',
    note: '资料未给第三方功效报告。量产前需按目的地法规配齐检测与备案。',
  },
  {
    slug: 'sage-acne-serum', name: '鼠尾草清痘精华', cat: 'skincare', img: IMG.serum,
    summary: '核心成分:鼠尾草 + 水杨酸复配。草本配方降低刺激,面向油痘肌长期使用。',
    desc: '定位:祛痘护肤,面向 Z 世代年轻群体。草本复配的思路是降低单一酸类的刺激性,支持长期使用。',
    note: '祛痘类在多数市场属功效宣称受限品类。上市前须按目的地法规准备功效与安全性报告;水杨酸浓度上限逐国不同,须先确认。',
  },
  {
    slug: 'herbal-anti-itch-sun', name: '草本止痒防晒', cat: 'body', img: IMG.sun,
    summary: '核心方向:草本舒缓 + 高倍防晒。防晒与蚊虫叮咬止痒二合一,热带市场差异化。',
    desc: '定位:防晒护理,户外 / 热带市场。沙滩与户外场景下「防晒」与「叮咬止痒」通常要买两支,合并成一支是这一款的差异点。',
    note: '防晒指数属强监管项。SPF 数值一律以目的地认可的第三方检测结果为准,内部数据不可对外。驱蚊/止痒表述在部分国家按农药或药品管理,须逐国确认。',
  },
  {
    slug: 'herbal-mouthwash', name: '草本抑菌漱口水', cat: 'oral', img: IMG.oral,
    summary: '核心成分:九仙草草本复配。无酒精温和配方,草本香型区别于化学漱口水。',
    desc: '定位:口腔护理,全年龄段。无酒精是这一类在中东与东南亚市场的准入前提,草本香型是与主流化学漱口水的区隔点。',
    note: '「抑菌」在多数市场属受限表述,需按目的地法规确认可用措辞;部分市场按药品或准字号管理。',
  },
  {
    slug: 'dual-source-essence', name: '双源草本精华水', cat: 'skincare', img: IMG.water,
    summary: '核心成分:东方草本 + 亚马逊植物双源活性。品牌核心大单品方向。',
    desc: '定位:精华护肤,中高端市场。双源原料体系是帛卉的差异化根基 —— 同一支产品里同时用东方草本与亚马逊植物,是别家很难复制的原料结构。高复购、高客单,适合做品牌的核心单品。',
    note: '抗氧化与抗老类宣称须配第三方功效报告后才可对外使用。',
  },
  {
    slug: 'solid-tooth-tablet', name: '便携固体洁牙片', cat: 'oral', img: IMG.tablet,
    summary: '核心方向:固体牙膏创新形态。零水配方,环保便携。',
    desc: '定位:口腔创新,面向环保与旅行人群。零水配方降低运输重量与包装用量,契合可持续消费趋势;固体形态本身有社交传播属性。',
    note: '固体口腔护理在部分市场的产品分类与备案路径和膏体不同,需逐国确认归类。',
  },

  /* ── 巴西展会四款(资料 P8)────────────────────────── */
  {
    slug: 'cooling-after-sun-spray', name: '冰感止痒修护防晒喷雾', cat: 'body', img: IMG.sun,
    summary: '核心方向:多孔包裹防晒 + TRPM8 冰感体系。防晒与晒后止痒二合一。',
    desc: '定位:巴西 / 南美市场重点款。\n市场依据:多国全年 UV 均值 9–14,暴晒后燥热发痒是普遍痛点,而市面少有针对性产品。\n配方方向:多孔包裹提升防晒效率;植萃复配 + 依克多因走多通路止痒。',
    note: '资料标 P0(立即打样)。内部实测:多孔包裹 SPF 提升 64%、依克多因 0.3%、16 种植萃。\n以上均为内部数据,量产前须配第三方 SPF 检测与人体功效报告后方可对外宣称。',
  },
  {
    slug: 'post-hair-removal-spray', name: '止痒冰感脱毛后护理喷雾', cat: 'body', img: IMG.sun,
    summary: '核心方向:多通路止痒 + 壳聚糖防毛囊炎。',
    desc: '定位:海外脱毛后护理。\n市场依据:脱毛品类成熟,但脱毛后护理的竞品多为基础舒缓款,差异化空间明确。\n配方方向:多通路协同止痒;羧甲基壳聚糖针对毛囊炎方向。',
    note: '资料标 P1。内部方案:抑制 PAR-2 + 激活 TRPM8 + 增加 GABA 三通路,PLANT21 体系。\n「一分钟止痒」属时效性功效宣称,须有人体功效测试支撑才可对外使用。',
  },
  {
    slug: 'brightening-body-lotion', name: '身体美白留香身体乳', cat: 'body', img: IMG.body,
    summary: '核心方向:即时提亮体系 + 留香微胶囊。备巴西本地香型三款。',
    desc: '定位:海外身体护理。\n市场依据:身体美白与持久留香是海外双高频搜索需求。\n配方方向:鞣花酸 + 谷胱甘肽做即时提亮;留香微胶囊做持久释香。\n本地香型:巴西莓、橙花百香果、玫红番石榴。',
    note: '资料标 P1。「美白」在中国、欧盟与东南亚多国属特殊用途或受限宣称,须走特证或改用合规措辞。\n资料中的「7 天身体美白对比」「留香时长实测」须有人体试验支撑才可对外。',
  },
  {
    slug: 'nine-herb-jelly-mask', name: '九大仙草东方草本修护冻膜', cat: 'skincare', img: IMG.mask,
    summary: '核心成分:铁皮石斛 / 天山雪莲 / 人参等九仙草,超分子低温闪萃。',
    desc: '定位:品牌叙事款。\n市场依据:海外 41% 消费者偏好天然成分,vegan 品类年增 40%。\n配方方向:九仙草超分子低温闪萃,承接公司的低温闪萃技术;棕红色冻膜质地本身有视觉记忆点。\n文化背书:唐代典籍中的配伍记载 —— 这是配方灵感来源,不构成功效宣称。',
    note: '资料标 P2(品牌叙事期)。内部实验:斑马鱼尾鳍修复 +19.07%。\n动物模型结果不能直接外推为人体功效,对外一律以人体功效报告为准。',
  },
];

const sql = [];
let next = (d1('SELECT MAX(id) m FROM products')[0].m ?? 0) + 1;
let created = 0, updated = 0;

for (const [i, p] of P.entries()) {
  const exist = d1(`SELECT id FROM products WHERE site_id=${lit(SITE)} AND slug=${lit(p.slug)} LIMIT 1`)[0];
  const id = exist?.id ?? next++;
  const featured = i < 6 ? 1 : 0;

  if (exist) {
    updated++;
    sql.push(`UPDATE products SET category=${lit(p.cat)}, moq=${lit(MOQ)}, sort_order=${(i + 1) * 10},
                status='published', is_featured=${featured}, cover_media=${p.img},
                internal_note=${lit(p.note)}, updated_at=datetime('now') WHERE id=${id};`);
  } else {
    created++;
    sql.push(`INSERT INTO products (id,site_id,slug,category,moq,sort_order,status,is_featured,cover_media,internal_note)
              VALUES (${id},${lit(SITE)},${lit(p.slug)},${lit(p.cat)},${lit(MOQ)},${(i + 1) * 10},
                      'published',${featured},${p.img},${lit(p.note)});`);
  }

  sql.push(`INSERT INTO product_i18n (product_id,lang,name,summary,description)
            VALUES (${id},'zh-cn',${lit(p.name)},${lit(p.summary)},${lit(p.desc)})
            ON CONFLICT(product_id,lang) DO UPDATE SET name=excluded.name,
              summary=excluded.summary, description=excluded.description;`);
  // 中文改了,其余语种的译文就过期了 —— 标记而不是删,旧译文先顶着同时在翻译中心显示待重翻
  sql.push(`UPDATE product_i18n SET mt=2 WHERE product_id=${id} AND lang<>'zh-cn';`);
  sql.push(`DELETE FROM product_media WHERE product_id=${id};`);
  sql.push(`INSERT INTO product_media (product_id,media_id,sort_order) VALUES (${id},${p.img},0);`);
}

const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/products.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`产品入库:新建 ${created} 个 · 更新 ${updated} 个 · 共 ${P.length} 款`);
console.log(`  内部合规备注 ${P.filter((x) => x.note).length} 条,写在 internal_note(前台不查这一列)`);
