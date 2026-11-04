import { GUIDES_ZH } from './guides.ts';
import { COMPARE_ZH } from './compare.ts';
import { CASES_ZH } from './cases.ts';

/**
 * 站内 AI 的「我们已经写过的判断」摘要。
 *
 * 为什么要有它:
 *   站上的问答 / 对比 / 指南是**给人和搜索引擎看的**,但我们自己的 AI
 *   (选品台、客服)回答同一个问题时是**现编的** —— 于是同一个问题,
 *   网页上说「首批 3,000 件可接」,AI 可能说「一般 5,000 起」。
 *   对采购来说这就是两个口径,而不一致比说错更伤。
 *
 * 为什么不做成 RAG 检索:
 *   这一层总共三十几条,压成摘要约 4–6k tokens,**每次请求整份带上比检索更准** ——
 *   检索会切片,而切片会切断「这一题和那一题的关系」。
 *   4,476 款包材那种量级才需要检索(156k tokens,塞不进也不该塞)。
 *   量级决定手段,不是「新技术一定更好」。
 *
 * 纪律:
 *   · 只出**判据与地址**,不出全文。全文在页面上,AI 要引就给链接。
 *   · 地址不带语言前缀,由调用方按当前语种拼 —— 拼错语种的链接比没有链接更糟。
 *   · 这份摘要是**唯一真源的派生物**:改 guides.ts / compare.ts 它自动跟着变,
 *     绝不在这里另写一份说法。两份说法迟早会分家,而分家不报错。
 */
export function kbDigest(): string {
  const lines: string[] = [];

  lines.push('# 我们站上已经写过的判断(回答时优先沿用,并给出对应链接)');
  lines.push('');
  lines.push('## 操作指南(怎么做)');
  for (const g of GUIDES_ZH) {
    lines.push(`- 【${g.q}】${g.answer}  → /guides/${g.slug}/`);
  }
  lines.push('');
  lines.push('## 选型对比(选哪个)');
  for (const c of COMPARE_ZH) {
    lines.push(`- 【${c.q}】${c.verdict}  → /compare/${c.slug}/`);
  }
  lines.push('');
  lines.push('## 项目走查(像你这种情况怎么接)');
  for (const c of CASES_ZH) {
    lines.push(`- 【${c.who}】${c.verdict}  → /cases/${c.slug}/`);
  }
  lines.push('');
  lines.push('## 口径纪律');
  lines.push('- 报价按询盘逐单出具,**不要说出任何单价**。能公开的只有包材参考价区间,那已经写在包材库每一款下面。');
  lines.push('- 不要提及任何客户品牌名。项目走查写的是「这类需求怎么接」,**不要说成「我们服务过某某」**。');
  lines.push('- 不要给出我们没有的资质。工厂持有认证仅列：GMPC、ISO 22716:2007、HALAL。FDA 工厂注册与 EU CPNP 是备案或通报协助，不是工厂认证。注册≠批准、不发证书。SGS 是第三方检测，不列入持证清单。不要把工厂注册说成批准或证书。');
  lines.push('- 禁用词一个都不能出现:治疗、疗效、消炎、抗菌、医用、修复、美白、祛斑、防晒、抗衰、第一、最、100%、永久、彻底、国家级。');
  lines.push('- 上面这些判断与页面完全一致。**改口径等于制造两个版本**,采购会当场发现。');

  return lines.join('\n');
}

/** 摘要的字节数 —— 调用方想知道这一份要花多少上下文时用 */
export const kbDigestSize = () => kbDigest().length;
