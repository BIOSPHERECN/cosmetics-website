/**
 * 配方库样例数据 —— 30 条,覆盖五大品类。
 *
 * ⚠️ 全部是**样例**,用于把 AI 共创链路跑通并给创始人验收流程。
 * 上线前必须由创始人用真实配方替换 —— 向客户展示编造的配方参数,
 * 比没有配方库更糟:客户按参数下单,做不出来是要赔钱的。
 * 因此每条都带 status='sample',前端与 AI 检索时会显式标注。
 *
 * 字段设计的用意:
 *  · benefits 用逗号分隔而非另建表 —— 几千行量级下 LIKE 足够快,省一次 JOIN;
 *  · actives_json 存活性物与浓度区间,是 AI 解释"为什么推荐这条"的依据,
 *    没有它,AI 只能说"这条适合你",客户不会信;
 *  · markets 防止推荐了却出不了关 —— 这是代工行业最常见的返工原因。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const F = [
  // ── 护肤 · 精华 ────────────────────────────────────────────────
  ['SR-1001','skincare','serum','hydrating,barrier',[['透明质酸钠','0.5-1.5%'],['泛醇','1-3%']],'水感清爽,吸收快',3000,'low',25,'CN,EU,US,JP,ID'],
  ['SR-1002','skincare','serum','brightening',[['烟酰胺','2-5%'],['α-熊果苷','0.5-2%']],'轻薄微黏,成膜均匀',3000,'mid',30,'CN,EU,US,ID'],
  ['SR-1003','skincare','serum','anti-aging,firming',[['视黄醇','0.1-0.3%'],['生育酚','0.5-1%']],'油润,夜用型',5000,'high',45,'EU,US,JP'],
  ['SR-1004','skincare','serum','soothing,sensitive',[['红没药醇','0.2-0.5%'],['积雪草苷','0.1-0.5%']],'无刺激,极简配方',3000,'mid',30,'CN,EU,US,JP,ID'],
  ['SR-1005','skincare','serum','oil-control,acne',[['水杨酸','0.5-2%'],['锌盐','0.3-1%']],'速干哑光',5000,'low',28,'CN,US,ID'],
  ['SR-1006','skincare','serum','hydrating,plumping',[['多重透明质酸','1-2%'],['海藻糖','1-3%']],'弹润,轻膜感',3000,'mid',30,'CN,EU,JP,ID'],

  // ── 护肤 · 面霜 ────────────────────────────────────────────────
  ['CR-2001','skincare','cream','barrier,repair',[['神经酰胺NP','0.5-2%'],['胆固醇','0.2-0.8%']],'厚润不油腻',3000,'mid',35,'CN,EU,US,JP,ID'],
  ['CR-2002','skincare','cream','anti-aging',[['胜肽复合物','2-5%'],['角鲨烷','5-10%']],'丝滑,推开即化',3000,'high',45,'EU,US,JP'],
  ['CR-2003','skincare','cream','hydrating,daily',[['甘油','3-8%'],['乳木果油','2-5%']],'基础款,四季适用',5000,'low',25,'CN,US,ID'],
  ['CR-2004','skincare','cream','soothing,post-procedure',[['泛醇','2-5%'],['尿囊素','0.2-0.5%']],'医美术后向,极简',3000,'mid',35,'CN,EU,JP'],
  ['CR-2005','skincare','cream','brightening,night',[['传明酸','1-3%'],['烟酰胺','2-4%']],'夜用,略厚',3000,'mid',35,'CN,JP,ID'],

  // ── 护肤 · 面膜 ────────────────────────────────────────────────
  ['MK-3001','skincare','mask','hydrating',[['透明质酸钠','0.3-1%'],['甜菜碱','1-2%']],'精华液饱满,天丝基布',10000,'low',20,'CN,EU,US,JP,ID'],
  ['MK-3002','skincare','mask','brightening',[['烟酰胺','2-4%'],['维生素C衍生物','1-3%']],'略黏,敷后需洗',10000,'mid',25,'CN,US,ID'],
  ['MK-3003','skincare','mask','soothing',[['积雪草提取物','1-3%'],['红没药醇','0.2-0.4%']],'生物纤维膜,贴合度高',8000,'mid',28,'CN,EU,JP'],
  ['MK-3004','skincare','mask','clay,detox',[['高岭土','15-25%'],['活性炭','1-3%']],'水洗式,涂抹型',8000,'low',22,'CN,US,ID'],

  // ── 洁护 ──────────────────────────────────────────────────────
  ['CL-4001','cleansing','foam','gentle,amino',[['氨基酸表活复配','12-18%']],'细腻绵密泡,弱酸性',5000,'mid',25,'CN,EU,US,JP,ID'],
  ['CL-4002','cleansing','foam','deep-clean',[['皂基复配','20-28%']],'冲洗感强,清爽',5000,'low',20,'CN,ID'],
  ['CL-4003','cleansing','oil','makeup-removal',[['辛酸/癸酸甘油三酯','60-80%']],'乳化快,不糊眼',5000,'mid',25,'CN,EU,JP,ID'],
  ['CL-4004','cleansing','micellar','sensitive',[['温和非离子表活','3-6%']],'免洗型,零泡',8000,'low',22,'EU,US,ID'],

  // ── 彩妆 ──────────────────────────────────────────────────────
  ['MU-5001','makeup','powder','pressed,matte',[['云母','40-60%'],['硅石','5-12%']],'压粉细腻,不飞粉',5000,'mid',35,'CN,EU,US,JP,ID'],
  ['MU-5002','makeup','powder','loose,setting',[['滑石粉替代体系','50-70%']],'散粉,轻薄定妆',5000,'low',30,'CN,US,ID'],
  ['MU-5003','makeup','balm','lip,tinted',[['蜡体复配','18-28%'],['植物油相','40-55%']],'滋润带色,不拔干',8000,'mid',35,'CN,EU,JP,ID'],
  ['MU-5004','makeup','balm','lip,clear',[['蜡体复配','20-30%']],'纯润唇,无色',10000,'low',28,'CN,US,ID'],
  ['MU-5005','makeup','liquid','foundation,light',[['二氧化钛','5-12%'],['成膜剂','2-5%']],'轻薄水润,自然遮瑕',5000,'high',45,'CN,EU,JP'],

  // ── 口腔 ──────────────────────────────────────────────────────
  ['OC-6001','oral','toothpaste','low-abrasion,daily',[['水合硅石','15-25%'],['木糖醇','5-10%']],'低研磨,温和薄荷',10000,'low',30,'CN,EU,US,ID'],
  ['OC-6002','oral','toothpaste','probiotic',[['口腔益生菌冻干粉','0.5-2%']],'无强效杀菌剂',10000,'high',50,'CN,EU,JP'],
  ['OC-6003','oral','toothpaste','whitening,gentle',[['羟基磷灰石','5-15%']],'非过氧化物路线',10000,'mid',40,'EU,US,JP'],
  ['OC-6004','oral','rinse','alcohol-free',[['西吡氯铵','0.05-0.1%']],'无酒精,不辣口',8000,'low',25,'CN,US,ID'],

  // ── 身体 ──────────────────────────────────────────────────────
  ['BD-7001','body','lotion','hydrating',[['甘油','5-10%'],['角鲨烷','3-6%']],'快吸收,无油膜',5000,'low',22,'CN,EU,US,ID'],
  ['BD-7002','body','oil','nourishing,botanical',[['冷压植物油复配','85-95%']],'延展好,香气自然',3000,'mid',28,'EU,US,JP'],
];

const sql = ['-- 由 tools/seed-formulas.mjs 生成。全部为**样例**,上线前须由创始人替换为真实配方。'];
sql.push(`DELETE FROM formulas WHERE status = 'sample';`);
for (const [code, cat, fmt, benefits, actives, texture, moq, cost, days, markets] of F) {
  const summary = `${code} · ${cat}/${fmt} · 功效 ${benefits} · 主要活性物 ${actives.map(([n, p]) => `${n} ${p}`).join('、')} · 肤感 ${texture} · 起订 ${moq} · 打样 ${days} 天 · 可去市场 ${markets}`;
  sql.push(
    `INSERT INTO formulas (code,category,format,benefits,actives_json,texture,moq,cost_band,lead_days,markets,status,ai_summary)
     VALUES (${q(code)},${q(cat)},${q(fmt)},${q(benefits)},${q(JSON.stringify(actives.map(([name, pct]) => ({ name, pct }))))},${q(texture)},${moq},${q(cost)},${days},${q(markets)},'sample',${q(summary)});`,
  );
}

mkdirSync(join(ROOT, 'packages/cms'), { recursive: true });
writeFileSync(join(ROOT, 'packages/cms/seed-formulas.sql'), sql.join('\n') + '\n', 'utf8');
console.log(`✓ ${F.length} 条样例配方 → packages/cms/seed-formulas.sql`);
