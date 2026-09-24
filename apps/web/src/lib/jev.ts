/**
 * Jev(TypeSafe AI)—— 只判断、不生成的模型。`POST /v1/systemone`,三种原语:
 *   choice(从候选里挑)/ score(2–10 级)/ noul(0–1 概率),每个答案带 confidence。
 *
 * 2026-09-22 创始人:「jev 要接入,现在大家都在用」。规矩(09-21 定):
 *   · 从候选里挑,不让它凭空报值;问题拆原子;一份材料一次问多题;
 *   · 它不会数数、比日期、多跳 —— 报价 / 成本 / 法规结论 / 封禁退订永远不交给它;
 *   · 置信度只决定「要不要人看」,不决定「要不要做」;
 *   · 送出去的材料先脱敏(邮箱 / 电话 / 网址换占位,lib/mail.ts redact)。
 * 第一处落点:询盘分级影子跑 —— 与舰队分级并排记在 inquiries.jev_json,后台并排看,不接管。
 * key:Worker secret TYPESAFE_API_KEY;没配就静默跳过(返回 null),任何异常都不影响询盘流程。
 */
export type JevQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> };
export type JevAnswer = { type: string; choice?: string; noul?: number; score?: number; confidence?: number };
export type JevResult = { answers: Record<string, JevAnswer>; ms: number; usage?: unknown };

export async function judge(env: any, state: string, questions: Record<string, JevQuestion>, timeoutMs = 8000): Promise<JevResult | null> {
  const key = String(env?.TYPESAFE_API_KEY ?? '').trim();
  if (env?.JEV_SHADOW !== '1') return null;   // 09-24 W7:Jev 已停,所有调用处(询盘 / 会诊)默认不跑;要恢复影子记账设 JEV_SHADOW=1
  if (!key || !state.trim()) return null;
  const t0 = Date.now();
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', signal: ctl.signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ state: state.slice(0, 6000), model: 'jev-latest', questions }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const d: any = await res.json();
    if (!d?.answers) return null;
    return { answers: d.answers, ms: Date.now() - t0, usage: d.usage };
  } catch { return null; }
}

/** 询盘四问:真买家概率 / 阶段 / 品类 / 紧迫。与舰队的 A/B/C 分级并排,不替代。 */
export const INQUIRY_QUESTIONS: Record<string, JevQuestion> = {
  is_real_buyer: { type: 'noul', instructions: '这条询盘像真实采购方(品牌方 / 进口商 / 批发商 / 零售商),而不是同行探价、求职、学生作业或广告推销吗?' },
  stage: { type: 'choice', instructions: '采购意向处于哪个阶段?', criteria: { browsing: '只是了解,没有产品和数量', spec: '有明确产品、数量或目标市场', ready: '已谈到打样、付款或交期' } },
  category: { type: 'choice', instructions: '产品属于哪个品类?', criteria: { skincare: '护肤(精华 / 面霜 / 面膜 / 爽肤水)', suncare: '防晒', cleansing: '洁面 / 洗护 / 身体清洁', haircare: '洗发护发', color: '彩妆', oralcare: '口腔护理(牙膏 / 牙膏片 / 漱口水)', fragrance: '香氛', other: '其他或看不出' } },
  urgency: { type: 'score', instructions: '对方的紧迫程度', criteria: ['不急', '一般', '很急'] },
};

/** 把答案压成后台一眼能看的一行:「真买家 0.82 · spec · skincare · 急 2/3 · 置信 0.7」 */
export function summarize(r: JevResult | null): string {
  if (!r) return '';
  const a = r.answers;
  const n = (k: string) => (typeof a[k]?.noul === 'number' ? a[k].noul!.toFixed(2) : '');
  const c = (k: string) => a[k]?.choice ?? '';
  const s = (k: string) => (typeof a[k]?.score === 'number' ? String(a[k].score) : '');
  const confs = Object.values(a).map((x) => x?.confidence).filter((x): x is number => typeof x === 'number');
  const conf = confs.length ? (confs.reduce((p, q) => p + q, 0) / confs.length).toFixed(2) : '';
  return [n('is_real_buyer') && `真买家 ${n('is_real_buyer')}`, c('stage'), c('category'), s('urgency') && `急 ${s('urgency')}`, conf && `置信 ${conf}`, `${r.ms} ms`].filter(Boolean).join(' · ');
}
