/**
 * 机会卡池共用常量(C3 预判引擎 MVP,2026-09-24)。页面 bohui/b2o-pool.astro 与接口 api/admin/b2o-pool.ts 共用。
 * 五种状态 = SOP 02-v2 §4.5;复盘四档与七类错误 = §7.2 / §7.4。
 * frozen_hash 公式与 tools/b2o-cards-verify.py 一致:sha256(json.dumps({HASH_KEYS}, ensure_ascii=False, sort_keys=True))。
 */
type P = Record<string, any>;
export const VERDICTS: Record<string, string> = { 推进: 'push', 提前准备: 'prepare', 客户验证: 'validate', 观察: 'watch', 放弃: 'drop' };
export const RESULTS: Record<string, string> = { 对: 'hit', 错: 'miss', 部分: 'partial', 无法判断: 'unknown' };
export const GAPS = ['假信号', '法规漏判', '阶段误判', '客户不匹配', '能力高估', '窗口误判', '信号无效'];
const HASH_KEYS = ['title', 'fact', 'pro', 'con', 'ruling', 'uncertainty', 'invalidation', 'action', 'verdict', 'card_id', 'made_at', 'stage', 'evidence_json'];

/** 与 Python json.dumps(sort_keys=True, ensure_ascii=False) 默认分隔符「, 」「: 」逐字节一致(键全是 ASCII) */
export const canon = (o: P) => '{' + Object.keys(o).sort().map((k) => `${JSON.stringify(k)}: ${JSON.stringify(o[k] ?? null)}`).join(', ') + '}';
export async function frozenHash(r: P): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon(Object.fromEntries(HASH_KEYS.map((k) => [k, r[k] ?? null])))));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
