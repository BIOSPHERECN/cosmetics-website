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
  /* 包装设计:一次调用同时打读图 + 出图两条线,是最贵的一档,给 6/小时 */
  'ai.pack': { limit: 6, windowMin: 60 },
  /* AI 站内搜索:检索走 D1 不花钱,但每次会调一次模型 —— 给个上限防脚本刷 */
  'ai.search': { limit: 30, windowMin: 60 },
  /* AI 电商套图(2026-10-28):一次出 4 张文生图 —— 最贵的一档,4 次/小时/IP */
  'ai.ecom-set': { limit: 4, windowMin: 60 },
  /* AI 视频(2026-10-29,LibTV 预留):一次可跑 2 分钟轮询且视频模型单价高,2 次/小时/IP */
  'ai.video': { limit: 2, windowMin: 60 },
  /* AI 客服:对话轮次多于共创,给到 30/小时;刷爆的引导走询盘,不是无限聊天 */
  'ai.chat': { limit: 30, windowMin: 60 },
  /* 匿名访客的 AI 客服免费层:5 轮/小时,超了引导登录(获客铁律:首触零摩擦,但防脚本刷) */
  'ai.chat.anon': { limit: 5, windowMin: 60 },
  /* 设计迭代(api/design/iterate):一次打文本模型 + 排一张图,12/小时(09-24 补登记,原代码按这个数写的) */
  'ai.design': { limit: 12, windowMin: 60 },
  /* 向量检索的**全站**日上限(不分 IP)。
     按 IP 限流挡不住分布式脚本,而 Vectorize 是按「查询的向量维度数」计费的 ——
     一次 topK=20 × 1024 维不贵,量堆起来才贵。这一条是刹车不是节流:
     超了就跳过语义、走原来的 SQL 结果,**降级但不报错**。
     创始人 2026-09-08:「Vectorize 注意被打爆流量」。 */
  'kb.query': { limit: 500, windowMin: 1440 },
  inquiry: { limit: 5, windowMin: 60 },
  /* 会员登录邮件(2026-09-23):同一邮箱 1 小时 3 封(防拿别人邮箱轰炸),同一 IP 1 小时 20 封(公司出口 NAT 留余量)。
     真正挡批量注册的是 Turnstile,这两条挡的是「过了人机验证之后的滥发」。 */
  'member.mail': { limit: 3, windowMin: 60 },
  'member.ip': { limit: 20, windowMin: 60 },
  /* 09-24 红队:一张点选码通行证(8 小时、同 /16 换 IP 也认)最多换 3 封登录信,再要就重新做题。
     不设这条,一次做题就能批量注册、或拿别人的邮箱狂发登录信(发信域名信誉受损);Turnstile 档每封本来就要一次新令牌 */
  'member.pass': { limit: 3, windowMin: 480 },
  /* 同上,beauty2oem 简报:一张通行证最多 3 份 */
  'form.pass': { limit: 3, windowMin: 480 },
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
