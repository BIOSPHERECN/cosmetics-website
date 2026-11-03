/**
 * BEAUTY2OEM 客户档案(C2,2026-09-24)的纯规则:A/B/C 公式、认同七级升降、六角色缺口、个人信息闸。
 * 依据:SOP执行版-v1/03-客户信息管理与CRM-全局设计-v2.md §2.2(评分卡)§3.2(字段)§3.3(六角色)§4.2(记沟通按钮)§7(G13)。
 * 不 import 任何东西:tools/b2o-crm.test.ts 用 node 直接跑。阈值全是「初值,待校准」,改只改这里。
 */

/* ── 企业层字段(§3.2)。个人层(contact / wechat / phone / email)不在这里,后台永不读写 ── */
export type Field = { k: string; label: string; g: string; t?: 'area' | 'url' | 'sel'; opts?: [string, string][]; hint?: string };
export const FIELDS: Field[] = [
  { k: 'company', label: '公司名称', g: '身份' },
  { k: 'own_brand', label: '自有品牌', g: '身份' },
  { k: 'source_channel', label: '来源渠道', g: '身份', hint: '渠道-细分,如 partner-tsp、event-amz-hz1022、brief-web' },
  { k: 'platforms', label: '平台', g: '在哪卖', hint: 'Shopee / TikTok Shop / Amazon …' },
  { k: 'markets_now', label: '现在卖的国家', g: '在哪卖' },
  { k: 'markets_next', label: '准备进入的国家', g: '在哪卖' },
  { k: 'cats_now', label: '主营品类', g: '在哪卖' },
  { k: 'cats_next', label: '准备扩展的品类', g: '在哪卖' },
  { k: 'store_url', label: '店铺链接', g: '在哪卖', t: 'url' },
  { k: 'hero_urls', label: '核心商品链接', g: '在哪卖', t: 'url' },
  { k: 'price_band', label: '主销价格带', g: '卖什么' },
  { k: 'best_sellers', label: '卖得最好的 3–5 款', g: '卖什么', t: 'area', hint: '只写页面看得到的商品,不写销量' },
  { k: 'monthly_new', label: '月均上新', g: '怎么卖' },
  { k: 'mode', label: '选品模式', g: '怎么卖', t: 'sel', opts: [['', '—'], ['跟品', '跟品'], ['改良', '改良'], ['自研', '自研']] },
  { k: 'test_cycle', label: '合适产品多久能测', g: '怎么卖' },
  { k: 'traffic', label: '流量结构', g: '怎么卖', hint: '短视频 / 达人 / 直播 / 广告 / 自然' },
  { k: 'content_cap', label: '内容能力', g: '怎么卖' },
  { k: 'kol_cap', label: '达人能力', g: '怎么卖' },
  { k: 'users_desc', label: '主要用户', g: '怎么卖' },
  { k: 'supplier_count', label: '当前合作工厂数', g: '供应链' },
  { k: 'factory_pain', label: '供应链最大痛点', g: '供应链', t: 'area' },
  { k: 'core_need', label: '核心需求', g: '供应链', t: 'area' },
  { k: 'future_plan', label: '未来 1–2 个季度计划', g: '计划', t: 'area', hint: '客户不愿说就空着' },
  { k: 'product_pref', label: '产品偏好', g: '计划' },
  { k: 'decision_role', label: '新品决策人角色', g: '决策', t: 'sel', opts: [['', '—'], ['boss', '老板'], ['selection', '选品 / 产品'], ['supply', '供应链'], ['other', '其他']] },
  { k: 'decision_time', label: '决策时效', g: '决策', hint: '新品从提议到拍板要多久' },
  { k: 'scale', label: '规模信号', g: '决策', hint: '只写看得到的事实,不写编造的规模数字' },
  { k: 'money_model', label: '这个客户怎么赚钱', g: '一句话', t: 'area', hint: '在[平台]靠[流量方式]卖[价格带][品类],赚[利润来源],卡在[痛点]。简报发出前必填' },
];
export const SRC: [string, string][] = [['', '来源?'], ['S', '客户说'], ['P', '店铺页'], ['A', 'AI 推测'], ['I', '内部']];

/* ── A/B/C 评分卡(§2.2) ── */
export const SELLER: [string, string][] = [['', '— 先选类型 —'], ['brand', '品牌出海型'], ['tiktok', 'TikTok 内容型(已在出单)'], ['storegroup', '精品店群(放量款)'],
  ['catalog', '平台铺货型'], ['channel', '服务商 / 代运营 / 选品中心'], ['trader', '义乌外贸型(有品牌化意愿)'], ['factory', '工厂自营']];
export const CAT: [string, string][] = [['', '— 品类 —'], ['A', 'A 级快样:口腔 / 身体乳·沐浴 / 面部精华·安瓶·冻干·啫喱'], ['B', 'B 级:面膜、防晒'],
  ['C', 'C 级:洗护发、清洁、彩妆、香氛、儿童'], ['reg', '含氟 / 脱毛 / 美白(法规未复核,按 C 计)']];
export const SCALE: [string, string][] = [['brand', '自有注册商标或 Brand Registry'], ['multi', '≥2 个平台或 ≥2 个国家在卖'], ['newsku', '店铺近期持续上新'], ['team', '团队有选品或供应链分工(客户说)']];
export const TIMING: [string, string][] = [['', '— 时机 —'], ['now', '现在就有触发事件(扩国家 / 扩品类 / 换供应商 / 断货 / 差评 / 被下架)'], ['90d', '计划在 90 天内做'], ['none', '没有']];
export const REACH: [string, string][] = [['', '— 对接人 —'], ['boss', '老板或新品决策人'], ['selection', '选品或供应链负责人'], ['ops', '运营或助理']];
export const XWHY: [string, string][] = [['', '无'], ['drug', '要做涉药成分'], ['claim', '要做不合规宣称'], ['brand', '要求冒用他人品牌'], ['other', '其他不接原因(见等级记录)']];

const PT_TYPE: Record<string, number> = { brand: 30, tiktok: 25, storegroup: 20, trader: 10, catalog: 5 };
const PT_CAT: Record<string, number> = { A: 20, B: 10, C: 5, reg: 5 };
const PT_TIMING: Record<string, number> = { now: 15, '90d': 8, none: 0 };
const PT_REACH: Record<string, number> = { boss: 15, selection: 10, ops: 5 };

export type GradeIn = { cat?: string; scale?: string[]; timing?: string; reach?: string; x?: string; small_only?: boolean };
export type GradeOut = { grade: string | null; score: number | null; why: string };

/** 首聊四问齐了没有:链接 / 痛点 / 扩什么 / 多久能测(§3.2) */
export const fourDone = (p: Record<string, any>) =>
  !!((p.store_url || p.hero_urls) && p.factory_pain && (p.markets_next || p.cats_next) && p.test_cycle);

/** 分级公式。四问没齐 = 初评:(①+②+③≤15)÷65×100;齐了 = 重评:五项直接相加。X 与「最高 C」优先于分数 */
export function calcGrade(sellerType: string | null | undefined, gi: GradeIn, four: boolean): GradeOut {
  const st = sellerType ?? '';
  if (st === 'factory') return { grade: 'X', score: null, why: 'X 不接:工厂自营(竞争关系)' };
  if (gi.x) return { grade: 'X', score: null, why: `X 不接:${XWHY.find(([k]) => k === gi.x)?.[1] ?? gi.x}` };
  if (st === 'channel') return { grade: null, score: null, why: '服务商 / 渠道:不评分,转合作伙伴流程' };
  if (!(st in PT_TYPE)) return { grade: null, score: null, why: '先选卖家类型' };
  const s1 = PT_TYPE[st], s2 = PT_CAT[gi.cat ?? ''] ?? 0;
  const s3full = Math.min(20, 5 * new Set((gi.scale ?? []).filter((k) => SCALE.some(([x]) => x === k))).size);
  let score: number, why: string;
  if (four) {
    const s4 = PT_TIMING[gi.timing ?? ''] ?? 0, s5 = PT_REACH[gi.reach ?? ''] ?? 0;
    score = s1 + s2 + s3full + s4 + s5;
    why = `重评(五项):①类型 ${s1} ②品类 ${s2} ③规模 ${s3full} ④时机 ${s4} ⑤决策可达 ${s5} = ${score}`;
  } else {
    const s3 = Math.min(15, s3full);
    score = Math.round(((s1 + s2 + s3) / 65) * 100);
    why = `初评(只用①②③,按 65 折算):①类型 ${s1} ②品类 ${s2} ③规模 ${s3} → ${s1 + s2 + s3}/65 = ${score}`;
  }
  let grade = score >= 70 ? 'A' : score >= 50 ? 'B' : 'C';
  if (gi.small_only && grade !== 'C') { grade = 'C'; why += ';只要极小量试单、没有放量计划 → 最高 C'; }
  if (!gi.cat) why += ';品类未选按 0 计(待补)';
  return { grade, score, why: why + '(初值,待校准)' };
}

/* ── 认同七级「记沟通」(§4.2 表,和 04-v2 §五 一一对应) ── */
export type Act = { label: string; to?: number; hard?: boolean; down?: boolean; pool?: string; kind?: string; trig: string };
export const ACTS: Record<string, Act> = {
  reply: { label: '实质回复(追问来源、说自己的情况)', to: 1, trig: 'reply' },
  discuss: { label: '讨论判断(补充看到的情况、反驳、追问「那你觉得…」)', to: 2, trig: 'judgment-discussed' },
  store: { label: '给店铺(店铺或主推款链接、后台截图、产品结构)', to: 3, hard: true, trig: 'store-given' },
  data: { label: '给数据(授权后台、销量区间、广告成本、差评原因)· 等级不变', trig: 'data' },
  choose: { label: '选方向 / 要样(选定方向并给收样地址,含直接说「寄样过来」)', to: 4, hard: true, trig: 'plan-chosen' },
  'sample-ok': { label: '样品反馈「可以 / 小改」', to: 5, hard: true, trig: 'sample-ok' },
  'quote-ask': { label: '问报价 · 等级不变,走报价审批', trig: 'quote-ask' },
  order: { label: '下单(测试单或首单,财务确认到账)', to: 6, hard: true, trig: 'test-order' },
  second: { label: '谈下一款(第二个产品或季度新品,口头提)', to: 7, trig: 'second-sku' },
  deny: { label: '否定方向(样品方向被否且不愿改)· 降一级', down: true, trig: 'sample-rejected' },
  'not-now': { label: '现在不需要 · 进放弃池,等级保留', pool: 'dropped', kind: 'drop', trig: 'refuse' },
  dnd: { label: '别再联系 / 回复「不需要」「不用」· 全渠道勿扰', pool: 'dnd', kind: 'dnd', trig: 'refuse' },
  x: { label: 'X 不接(涉药成分 / 不合规宣称 / 冒用他人品牌)', pool: 'dropped', kind: 'drop', trig: 'refuse-x' },
};
export const PROVEN = ['市场', '判断', '业务', '产品', '样品', '交付', '战略'];

export type LogRow = { from: number; to: number; kind: string; backfill: boolean; pending: 0 | 1 };
export type Plan = { rows: LogRow[]; lv: number; pool: string | null; note: string };

/**
 * 算一次「记沟通」要写哪些等级记录。
 * - 升级取 max(当前, 目标),不往下掉;跳过的每一级补记一行(evidence 前缀「补记:」)。
 * - L5 及以上、降级要主管确认:硬信号先落级、等确认;软信号和降级先挂「待确认」不落级(boss=主管本人记的直接生效)。
 * - 培育池里的客户有回应 → 回在跟池(revive),等级不变。
 */
export function planTrust(cur: number, pool: string, actKey: string, boss: boolean): Plan | null {
  const a = ACTS[actKey];
  if (!a) return null;
  const rows: LogRow[] = [];
  let lv = cur, newPool: string | null = null, note = '等级不变';
  if (a.pool) {
    rows.push({ from: cur, to: cur, kind: a.kind!, backfill: false, pending: 0 });
    newPool = a.pool; note = a.pool === 'dnd' ? '已设勿扰:全渠道不再主动联系' : '已进放弃池,等级保留';
    return { rows, lv, pool: newPool, note };
  }
  if (pool === 'nurture') { rows.push({ from: cur, to: cur, kind: 'revive', backfill: false, pending: 0 }); newPool = 'active'; }
  if (a.down) {
    if (cur > 0) {
      const pend = boss ? 0 : 1;
      rows.push({ from: cur, to: cur - 1, kind: 'down', backfill: false, pending: pend });
      if (!pend) lv = cur - 1;
      note = pend ? `降到 L${cur - 1} 待主管确认` : `已降到 L${cur - 1}`;
    }
  } else if (a.to !== undefined && a.to > cur) {
    const pend: 0 | 1 = a.to >= 5 && !a.hard && !boss ? 1 : 0;
    for (let l = cur + 1; l <= a.to; l++) rows.push({ from: l - 1, to: l, kind: 'up', backfill: l < a.to, pending: pend });
    if (!pend) lv = a.to;
    note = pend ? `升到 L${a.to} 待主管确认(软信号)` : `已升到 L${a.to}${a.to >= 5 && !boss ? ',待主管确认' : ''}${a.to - cur > 1 ? `,补记 ${a.to - cur - 1} 级` : ''}`;
  }
  if (newPool === 'active') note += ';已从培育池回到在跟';
  return { rows, lv, pool: newPool, note };
}

/* ── 产品矩阵六角色与缺口提示(§3.3,只是提示,标推测) ── */
export const ROLES = ['引流', '利润', '复购', '内容', '品牌', '实验'];
export type Sku = { sku: string; url?: string; role: string; price?: string; note?: string };
export function gapHints(skus: Sku[]): string[] {
  const n = skus.length, c = (r: string) => skus.filter((s) => s.role === r).length;
  if (!n) return [];
  const out: string[] = [];
  if (c('引流') * 2 > n) out.push('一半以上是引流款 → 缺利润款:同品类升级剂型或成分卖点,用成熟 Base 做');
  if (!c('复购')) out.push('没有复购款 → 日用消耗型(口腔、身体护理)');
  if (!c('内容')) out.push('没有内容款 → 若流量靠短视频,做质地、变色、即时效果看得见的剂型');
  if (!c('品牌')) out.push('没有品牌款 → 系列化包材(从货架现成包材里选)');
  return out;
}

/* ── 个人信息闸(G13):证据和企业层文字里不许出现手机号、邮箱、微信号 ── */
// ponytail: 只认手机号 / 邮箱 / 「微信:xxx」三种形状;姓氏+职务(王总)认不出来,靠每周抽检(§7.1)
export function piiHit(t: string): string | null {
  if (/(?<!\d)1[3-9]\d{9}(?!\d)/.test(t)) return '手机号';
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t)) return '邮箱';
  if (/(微信|vx|wx|v信|wechat)\s*号?\s*[:：]?\s*[A-Za-z][-_A-Za-z0-9]{5,}/i.test(t)) return '微信号';
  return null;
}
/** 联系人内部编号:客户代号-角色(如 C9001-选品),不含姓名 */
export const REF_RE = /^[A-Za-z0-9]{2,12}-(老板|选品|产品|供应链|运营|采购|其他)\d?$/;

/** 简报到期 = 下一个工作日 18:00(北京时间,01-v2 §3.0),返回 UTC 'YYYY-MM-DD HH:MM:SS' */
// ponytail: 只跳周六周日,不认法定节假日;要准就接节假日表
export function nextWorkday18(now: Date): string {
  const d = new Date(now.getTime() + 8 * 3600e3);            // 北京时间当作 UTC 字段来算
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  d.setUTCHours(18 - 8, 0, 0, 0);                             // 北京 18:00 = UTC 10:00
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
