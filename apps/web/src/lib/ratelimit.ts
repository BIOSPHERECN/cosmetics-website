/**
 * 公开接口限流 —— 通用一份,供 AI 与询盘等**不需要登录**的接口用。
 *
 * 为什么这件事非做不可:
 *   /api/ai/skin 与 /api/studio 是公开的,每次调用都会真的打模型。
 *   在此之前它们**一条限流都没有** —— 任何人写个 for 循环,几分钟就能把
 *   免费池七家的额度全烧干。到那时前台的 AI 功能对所有真实客户同时失效,
 *   而账单或配额耗尽往往要到第二天才被发现。
 *
 *   这类风险和"数据被偷"不一样:它不需要攻击者有任何技术,
 *   一个写错的爬虫、一个循环调用的前端 bug 就能触发,概率高得多。
 *
 * 为什么计数落 D1 而不是内存:
 *   Worker 实例随时被回收,内存计数形同虚设 —— 换个实例就清零了。
 *   沿用登录限流那套(revisions 表按 entity 记),不新建表:
 *   同一件事用两套机制,迟早有一套忘了维护。
 *
 * 为什么用滑动窗口而不是令牌桶:
 *   令牌桶要存"上次补充时间 + 余量"两个值并原子更新,D1 上要么加锁要么容忍竞态。
 *   而我们要挡的是"循环狂刷",不是精确整形流量 —— 数一数最近 N 分钟内的条数就够了,
 *   多放行一两次不影响结论。
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface Quota {
  /** 窗口内允许的次数 */
  limit: number;
  /** 窗口分钟数 */
  windowMin: number;
}

/**
 * 各公开接口的额度。数字是按「一个真人正常用会用几次」定的,不是拍的:
 *   肌肤检测:一次要传照片、等十几秒看结果,真人一小时点 8 次已经很多了。
 *   AI 共创:改需求反复试是正常的,给宽一些。
 *   询盘:同一 IP 一小时提交 5 次以上,基本可以断定不是采购在填表。
 */
export const QUOTA = {
  'ai.skin': { limit: 8, windowMin: 60 },
  'ai.studio': { limit: 20, windowMin: 60 },
  inquiry: { limit: 5, windowMin: 60 },
} satisfies Record<string, Quota>;

export type QuotaKey = keyof typeof QUOTA;

/**
 * 取访客标识。CF-Connecting-IP 由 Cloudflare 在边缘写入,
 * 客户端伪造的同名头会被覆盖 —— 这是它比 X-Forwarded-For 可信的原因。
 * 取不到时退回 'unknown':宁可把这一小撮人算成同一个桶,也不要直接放行。
 */
export const clientId = (request: Request): string =>
  request.headers.get('CF-Connecting-IP') || 'unknown';

/** 超额返回 true。任何异常都返回 false —— 限流坏了不该让正常功能一起停 */
export async function overQuota(db: D1Database | undefined, key: QuotaKey, id: string): Promise<boolean> {
  if (!db) return false;
  const { limit, windowMin } = QUOTA[key];
  try {
    const row = await db.prepare(
      `SELECT COUNT(*) AS n FROM revisions
        WHERE entity = ? AND entity_id = ?
          AND created_at > datetime('now', ?)`,
    ).bind(`rl:${key}`, id, `-${windowMin} minutes`).first<{ n: number }>();
    return (row?.n ?? 0) >= limit;
  } catch {
    return false;
  }
}

/** 记一次调用。放 waitUntil 里调用,不要让计数拖慢正常响应 */
export async function recordUse(db: D1Database | undefined, key: QuotaKey, id: string): Promise<void> {
  if (!db) return;
  try {
    await db.prepare(
      `INSERT INTO revisions (entity, entity_id, after_json) VALUES (?, ?, '{}')`,
    ).bind(`rl:${key}`, id).run();
  } catch { /* 计数失败不影响主流程 */ }
}

/** 统一的超额响应。给出还要等多久,而不是一句冷冰冰的「请稍后再试」 */
export function tooMany(key: QuotaKey): Response {
  const { limit, windowMin } = QUOTA[key];
  return new Response(JSON.stringify({
    ok: false,
    msg: `使用过于频繁:${windowMin} 分钟内最多 ${limit} 次。请稍后再试,或直接发询盘由人工跟进。`,
  }), {
    status: 429,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(windowMin * 60) },
  });
}

/**
 * 清理过期计数 —— 限流记录只在窗口内有意义,留着会把 revisions 表撑大。
 * 由调用方在 waitUntil 里偶尔触发(不必每次都跑)。
 */
export async function sweep(db: D1Database | undefined): Promise<void> {
  if (!db) return;
  try {
    await db.prepare(
      `DELETE FROM revisions WHERE entity LIKE 'rl:%' AND created_at < datetime('now', '-24 hours')`,
    ).run();
  } catch { /* 清理失败无妨,下次再来 */ }
}
