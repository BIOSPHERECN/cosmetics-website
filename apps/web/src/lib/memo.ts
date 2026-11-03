/** 查询结果短期记忆 —— 09-24 R2:公司库一天读 200+ 亿行(Workers Paid 含 250 亿/月,超出按量计费)。
 *  高读量的都是「每次渲染现算、结果几小时不变」的查询:原料总表 5,845 行、解读库分面 GROUP BY 全表 14.8 万行、
 *  成分页共现、导航。边缘页面缓存按 语种×参数 分键,同一份数据被 17 个语种、每个 ?p= 各算一遍。
 *  这里按「数据本身」记:先查本隔离区 Map,再查边缘 Cache API(免费,同机房所有隔离区共享),都没有才打 D1。
 *  fn 抛错不记;空数组不记(查询失败被 catch 成 [] 时,不能把空结果记上几小时)。
 *  ponytail: 不同机房各算一次;要全球一份就换 KV(有免费额度但写少读多才划算)。 */
const local = new Map<string, { t: number; v: unknown }>();

export async function memo<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const hit = local.get(key);
  if (hit && hit.t > Date.now()) return hit.v as T;
  const req = new Request('https://memo.bohui.internal/' + encodeURIComponent(key));
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  try {
    const r = await cache?.match(req);
    if (r) { const v = (await r.json()) as T; local.set(key, { t: Date.now() + ttlSec * 1000, v }); return v; }
  } catch { /* 缓存不可用就直接查 */ }
  const v = await fn();
  if (Array.isArray(v) && v.length === 0) return v;
  if (local.size > 500) local.clear();
  local.set(key, { t: Date.now() + ttlSec * 1000, v });
  try { await cache?.put(req, new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttlSec}` } })); } catch { /* 同上 */ }
  return v;
}
