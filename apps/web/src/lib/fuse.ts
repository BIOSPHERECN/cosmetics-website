/**
 * 费用熔断保险丝(2026-10-22,cost fuse)。
 *
 * 为什么有它:09-23 AI 爬虫猛攻 2 天烧掉 $80 的前车之鉴,以及免费档 D1 日读额度打满
 * 后「整站 503 一整天」的教训 —— 免费档的量价模型决定了「不加闸门,迟早被流量涨破」。
 * 放行 AI 爬虫(为 GEO/SEO)之后,费用风险转移为「渲染量」:缓存命中的请求不碰 D1、不花钱,
 * 真正花钱的是**缓存 miss → 渲染**这一步。所以熔断只看渲染量,不看总请求量。
 *
 * 机制:
 *   · 每次缓存 miss 渲染前调 fuseCheck():当日渲染计数 +1,超过阈值 → 置 fired。
 *   · fired=1 后,非会员 / 非后台 / 非探针请求直接 429(不渲染、不查 D1、不花钱),
 *     会员与后台不受影响(他们是付费主,不能误伤业务)。
 *   · 以「北京时间日期」为主键:新的一天自动从 0 开始,熔断到 UTC+8 零点自动解除。
 *   · 阈值做成变量(env.FUSE_RENDER_CAP),不上线时默认安全值 300,000。
 *
 * 为什么计渲染次数而不是行数:D1 Rows Read 免费 250 亿行/月(≈8.3 亿行/天),
 * 单页渲染几十~上百行,正常日渲染 <10 万次;阈值 30 万次 ≈ 3000 万行/天,
 * 只占免费额度的 3.6% —— 平时永远碰不到,异常暴涨才触发,不会把站点误锁。
 *
 * 与 quota.ts 同一约束:只依赖 D1 绑定 + 纯计算,不 import 组件包(中间件不能拉组件模块图)。
 * 改另一边必须同步(skin2oem 的 apps/web/src/lib/ 是拷贝份)。
 */
import { bjDay } from './quota';

export const FUSE_DEFAULT_CAP = 300_000;

export type Fuse = { fired: boolean; renders: number; cap: number };

/**
 * 渲染前熔断检查:当日渲染计数 +1,返回是否已触发熔断。
 * 只在缓存 miss(要渲染、要花钱)时调用;命中缓存的请求不调用,不花钱不用管。
 * D1 不可用时放行(fail-open):熔断闸坏了不能把全站锁死,宁可多渲染几页。
 */
export async function fuseCheck(o: {
  db: D1Database | undefined;
  cap?: number;
}): Promise<Fuse> {
  const cap = o.cap && o.cap > 0 ? o.cap : FUSE_DEFAULT_CAP;
  if (!o.db) return { fired: false, renders: 0, cap };
  const day = bjDay();
  try {
    /* 一步到位:同事务里计数 + 读回当天值。引用 mb_views 那套 INSERT OR IGNORE 的幂等思路,
       但这里要累计,所以用 ON CONFLICT DO UPDATE。batch 保证计数与判断原子。 */
    const [, r] = await o.db.batch([
      o.db.prepare(
        `INSERT INTO fuse_daily (day, renders) VALUES (?1, 1)
         ON CONFLICT(day) DO UPDATE SET renders = renders + 1`,
      ).bind(day),
      o.db.prepare(`SELECT renders, fired FROM fuse_daily WHERE day = ?1`).bind(day),
    ]);
    const row = (r.results?.[0] ?? {}) as { renders?: number; fired?: number };
    const renders = Number(row.renders ?? 0);
    let fired = Number(row.fired ?? 0) === 1;
    if (!fired && renders > cap) {
      /* 触顶瞬间置 fired(只写一次,之后的请求直接读到 1,不再写)。 */
      await o.db.prepare(
        `UPDATE fuse_daily SET fired = 1, fired_at = datetime('now') WHERE day = ?1`,
      ).bind(day).run().catch(() => {});
      fired = true;
    }
    return { fired, renders, cap };
  } catch (e) {
    /* 计数表抖动不该把访客锁在门外:计数失败一律放行 */
    console.error('[fuse] 熔断计数失败,放行', e);
    return { fired: false, renders: 0, cap };
  }
}

/** 熔断响应的标准样式:429 + Retry-After,不缓存(错误页绝不能进缓存,老教训)。 */
export function fuseResponse(): Response {
  return new Response('Busy, retry later', {
    status: 429,
    headers: {
      'Retry-After': '3600',
      'Cache-Control': 'no-store',
      'x-bh-fuse': '1',
    },
  });
}

/**
 * 付费 AI 的**全站日预算**(2026-11-02,cost#1 C2)。
 *
 * 与上面渲染熔断的区别,以及为什么两条都要有:
 *   渲染熔断挡的是「D1 被刷爆」(免费行读额度);这条挡的是「模型额度被烧干」(真钱/真配额)。
 *   ratelimit.ts 里全是 per-IP 滑动窗口 —— 换 IP 就绕过;而模型池是**全站共享**的,
 *   所以这里必须按「全站 × 天」计数,不能按 IP。
 *
 * 为什么不新建表 / 不加列:
 *   加列要跑 D1 迁移,而 ship.sh 只做 build+deploy,不会自动执迁移 ——
 *   线上没有那一列时 UPDATE 会抛错,被 fail-open 吞掉,闸门看起来装了其实一直没生效。
 *   所以复用 fuse_daily 的主键,用 `ai:<日期>` 这个命名空间行,**渲染熔断读的 `bjDay()`
 *   行与本行互不相交**,旧查询一行都不用改。计数借 renders 列(同一天一行、单调累加)。
 *
 * 权重:一次请求打几个模型就记几次(ecom-set 4 张图 = 4),否则重接口被低估、闸门形同虚设。
 * 触顶后返回 503:不是"稍后重试"的瞬时限流,而是当天不再放行 —— 次日 UTC+8 零点自动恢复。
 */
export const AI_DAILY_DEFAULT_CAP = 2000;

export type AiDaily = { ok: boolean; calls: number; cap: number };

export async function aiDailyCheck(o: {
  db: D1Database | undefined;
  /** 直接传 env.AI_DAILY_CAP(字符串)即可;非法或 ≤0 时用内置默认 */
  cap?: unknown;
  /** 本次请求折算的模型调用次数,默认 1 */
  cost?: number;
}): Promise<AiDaily> {
  const n = Number(o.cap);
  const cap = Number.isFinite(n) && n > 0 ? n : AI_DAILY_DEFAULT_CAP;
  const cost = Math.max(1, Math.floor(Number(o.cost) || 1));
  if (!o.db) return { ok: true, calls: 0, cap };
  const key = `ai:${bjDay()}`;
  try {
    const [, r] = await o.db.batch([
      o.db.prepare(
        `INSERT INTO fuse_daily (day, renders) VALUES (?1, ?2)
         ON CONFLICT(day) DO UPDATE SET renders = renders + ?2`,
      ).bind(key, cost),
      o.db.prepare(`SELECT renders FROM fuse_daily WHERE day = ?1`).bind(key),
    ]);
    const row = (r.results?.[0] ?? {}) as { renders?: number };
    const calls = Number(row.renders ?? 0);
    if (calls > cap) console.error('[ai-budget] 当日付费 AI 调用超限', { calls, cap });
    return { ok: calls <= cap, calls, cap };
  } catch (e) {
    /* 与渲染熔断同一取舍:计数坏了不能把付费功能整体锁死,宁可多花钱也不能误伤业务 */
    console.error('[ai-budget] 计数失败,放行', e);
    return { ok: true, calls: 0, cap };
  }
}

/** 付费预算触顶:503(当天不再放行,不是瞬时限流),不缓存。 */
export function aiBudgetResponse(): Response {
  return new Response('AI daily budget reached', {
    status: 503,
    headers: {
      'Retry-After': '3600',
      'Cache-Control': 'no-store',
      'x-bh-ai-budget': '1',
    },
  });
}
