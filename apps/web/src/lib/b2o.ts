/**
 * BEAUTY2OEM 后台共用常量(2026-09-24 W3)。
 * 认同七级:照抄 SOP执行版-v1/03-客户信息管理与CRM-全局设计-v2.md §4.1(04-v2 §五 同口径);改级别定义只改这里。
 */
export const TRUST: { lv: number; name: string; mind: string; proof: string }[] = [
  { lv: 0, name: 'L0 未接触', mind: '不认识我们', proof: '我们的信息有价值' },
  { lv: 1, name: 'L1 信息', mind: '「这信息有点意思」', proof: '我们会判断' },
  { lv: 2, name: 'L2 判断', mind: '「你们说得有道理」', proof: '我们懂他的生意' },
  { lv: 3, name: 'L3 业务', mind: '「你们懂我的生意」', proof: '我们懂产品' },
  { lv: 4, name: 'L4 产品', mind: '「你们懂产品」', proof: '我们真能做出来' },
  { lv: 5, name: 'L5 打样', mind: '「你们真能做出来」', proof: '我们能稳定交付' },
  { lv: 6, name: 'L6 交付', mind: '「你们可靠」', proof: '值得一起规划' },
  { lv: 7, name: 'L7 战略', mind: '「下季度一起看看做什么」', proof: '保持判断领先' },
];

/** 客户代号:送模型、写简报都只用它,不用公司名和联系人(03-v2 第 6 条 · G13) */
export const custCode = (p: { id: number; contact_ref?: string | null }) => (p.contact_ref || '').split('-')[0] || `B2O-${p.id}`;

/** 简报草稿机检:04-v2 / 简报模板「禁写」。模板里那句「起订量、大货交期、价格:待业务确认」不算,只抓带数字的商务条款和禁词 */
export function briefFlags(t: string): string[] {
  const out: string[] = [];
  // 09-24 C1 补出样/样品费/账期/付款(06-v2 b2o-scrub 回归:「起订量 5000 支,出样 5–14 天」两处都要抓)
  const m1 = t.match(/(起订量|MOQ|交期|单价|报价|成本|出厂价|出样|打样周期|样品费|账期|付款|定金)[^\n|]{0,12}?\d[\d,.–~-]*\s*(件|个|支|瓶|天|周|月|元|美元|\$|¥|%)/gi);
  if (m1) out.push(`疑似商务数字:${[...new Set(m1)].slice(0, 3).join(' / ')}(商务条款只用工厂口径页)`);
  for (const w of ['保证', '包过', '承诺', 'AI 预测', 'AI预测', '预测爆款', '集团', '印尼工厂', '印尼厂', '海外工厂', '现成配方', '现货']) if (t.includes(w)) out.push(`禁词:${w}`);
  if (/\d/.test(t) && !/出处/.test(t)) out.push('有数字但没写出处');
  // 09-24 老板会议:不给客户 AI 配方 —— 草稿里出现配方表或成分比例就标出来,审批时删掉
  if (/配方表|成分表|(配方|成分|INCI|含量|添加量|用量)[^\n]{0,40}?\d+(?:\.\d+)?\s*%/i.test(t)) out.push('疑似配方表或成分比例(不给客户 AI 配方)');
  return out;
}
