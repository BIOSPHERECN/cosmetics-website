/**
 * 会员每日查看配额 —— 两站同一份:cosmetic-sites 与 skin2oem 的 apps/web/src/lib/quota.ts 字节一致。
 * 改一边必须拷到另一边;`node tools/quota-parity.mjs`(cosmetic-sites)比对两份并跑断言。
 *
 * 创始人 2026-09-23:「配方列表可以看,但是点击就开启注册会员,免费版只可以一天看20个!收费版看100个,
 * 其他搜索等页面机制都是要限制!」「2个网站都一样受限」。
 *   · 按不同条目计:同一天重复看同一条不重复扣;日界按北京时间。
 *   · 详情页与站内搜索共用一个配额 —— 用户理解成「一天能看 20 个」。
 *   · 回答 / 搜索型爬虫不拦不计(见 ANSWER_BOT):被 AI 答案与搜索引用是获客主渠道,GEO/SEO 不能塌;训练型按未登录处理。
 */
import { openaiIp } from './ai-ip.ts';

export const DAILY = { free: 20, pro: 100 } as const;
/** 空或 free 按免费;其余付费档(平台还有 starter / enterprise)一律按付费 100 */
export const limitFor = (plan?: string | null): number => (!plan || plan === 'free' ? DAILY.free : DAILY.pro);

/** 北京时间的日期 YYYY-MM-DD */
export const bjDay = (t = Date.now()): string => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
/** 到北京时间下一个零点还剩几秒 */
export const secsToReset = (t = Date.now()): number => 86400 - Math.floor((t / 1000 + 8 * 3600) % 86400);

/** 能绕过登录看全文的只有「回答 / 搜索型」爬虫:它们答题时带链接把人带回来,是获客。
 *  训练型(GPTBot、ClaudeBot、CCBot、Bytespider、Meta-ExternalAgent、Amazonbot …)不在名单里 = 按未登录访客处理:
 *  详情现在是会员产品,抓进训练集以后别人问 AI 就白拿了(2026-09-23 安全策略,创始人授权)。
 *  GPTBot 约占站点流量 74%,它从此只看到标题 + 登录入口 —— 有意为之,不是 bug。
 *  Applebot-Extended / Google-Extended 只是 robots.txt 里的开关名,真实 UA 仍是 Applebot / Googlebot。
 *  自称 OpenAI 的还要 IP 落在 OpenAI 公布的段里(lib/ai-ip.ts,两站打点的 bot:spoof 同一口径),否则按冒充处理。 */
// ponytail: 除 OpenAI 外只认 UA,改 UA 冒充 Googlebot 能看全文;要堵就照 ai-ip.ts 再收 googlebot.json / bingbot.json 的段表
export const ANSWER_BOT = /Googlebot|Google-InspectionTool|bingbot|DuckDuckBot|YandexBot|Baiduspider|Applebot|OAI-SearchBot|ChatGPT-User|Claude-SearchBot|Claude-User|PerplexityBot|Perplexity-User/i;
export function answerBot(ua: string, ip: string): boolean {
  if (!ANSWER_BOT.test(ua || '')) return false;
  return !/chatgpt-user|oai-searchbot/i.test(ua) || openaiIp(ip);
}

/** bot = 回答 / 搜索型爬虫全文;full = 会员放行(已计);login = 要登录;over = 今天满了 */
export type Gate = { state: 'bot' | 'full' | 'login' | 'over'; used: number; limit: number };

/**
 * 判定一次查看。会员那一步一次往返(batch)、最多一条写:
 *   INSERT OR IGNORE 只在「今天还没满」时插入;同一条今天已记过则撞主键被忽略 —— 天然幂等。
 *   第二句在同一事务里读回「今天几条、这一条在不在」:在 = 放行(新记的或早记过的),不在 = 满了。
 * 表:mb_views (member_id, day, item_key) 主键。
 */
export async function gate(o: { db: D1Database | undefined; bot: boolean; member: { id: number; plan_id?: string | null } | null; item: string }): Promise<Gate> {
  if (o.bot) return { state: 'bot', used: 0, limit: 0 };
  if (!o.member) return { state: 'login', used: 0, limit: DAILY.free };
  const limit = limitFor(o.member.plan_id);
  if (!o.db) return { state: 'full', used: 0, limit };
  const day = bjDay(), key = o.item.slice(0, 200);
  try {
    const [, r] = await o.db.batch([
      o.db.prepare(`INSERT OR IGNORE INTO mb_views (member_id, day, item_key)
                    SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM mb_views WHERE member_id = ?1 AND day = ?2) < ?4`).bind(o.member.id, day, key, limit),
      o.db.prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(item_key = ?3), 0) AS seen FROM mb_views WHERE member_id = ?1 AND day = ?2`).bind(o.member.id, day, key),
    ]);
    const row = (r.results?.[0] ?? {}) as { n?: number; seen?: number };
    return { state: row.seen ? 'full' : 'over', used: Number(row.n ?? 0), limit };
  } catch (e) {
    console.error('[quota] 计数失败,放行', e);   // 计数表抖动不该把会员锁在门外
    return { state: 'full', used: 0, limit };
  }
}
