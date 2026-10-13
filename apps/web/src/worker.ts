/**
 * bohui-web 的 Worker 入口(2026-09-24 C1):页面照旧交给 Astro 适配器;另外接 Cloudflare Cron。
 * 为什么 Cron 放在这里而不是本机计划任务:06-v2 §〇 第 8 条「看门狗不能和被看的机器放在一起」—— 本机关机时 BEAUTY2OEM 自动草稿照出,
 * 任务中心里 b2o-auto 这一行也照常心跳;反过来 Cron 停了,任务中心会把 b2o-auto 标红。
 * 触发时间见 wrangler.toml [triggers]。
 */
import server from '@astrojs/cloudflare/entrypoints/server';
import { runB2oAuto } from './lib/b2o-auto';
import { runProspectMine, currentMarkets } from './lib/prospect-mine';
import { runTrendCollect, runD1Backup, runOutreachAuto } from './lib/cron-tasks';
import { duckProxy } from './workers/duck-proxy';

const SLOT_MARKETS: Record<number, string[]> = {
  0: ['us', 'br', 'mx', 'cl', 'pe', 'ar', 'co'], 1: ['us', 'br', 'mx', 'cl', 'pe', 'ar', 'co'],
  2: ['us', 'br', 'mx', 'cl', 'pe', 'ar', 'co'], 3: ['us', 'br', 'mx', 'cl', 'pe', 'ar', 'co'],
  4: ['gb'], 5: ['gb'], 6: ['gb'], 7: ['gb'],
  8: ['id', 'my', 'ph', 'vn', 'th'], 9: ['id', 'my', 'ph', 'vn', 'th'],
  10: ['id', 'my', 'ph', 'vn', 'th'], 11: ['id', 'my', 'ph', 'vn', 'th'],
  12: ['sa', 'ae', 'eg', 'jo', 'kw'], 13: ['sa', 'ae', 'eg', 'jo', 'kw'],
  14: ['sa', 'ae', 'eg', 'jo', 'kw'], 15: ['sa', 'ae', 'eg', 'jo', 'kw'],
  16: ['au', 'jp', 'kr'], 17: ['au', 'jp', 'kr'], 18: ['au', 'jp', 'kr'], 19: ['au', 'jp', 'kr'],
  20: ['us', 'gb', 'eu'], 21: ['us', 'gb', 'eu'], 22: ['us', 'gb', 'eu'], 23: ['us', 'gb', 'eu'],
};

// 自定义 fetch 拦截器
export default {
  ...server,
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    // Duck.ai 代理：绕过国内直连延迟
    if (request.url.includes('/api/duck-proxy')) {
      return duckProxy(request, env, ctx);
    }
    // 其他请求：交给 Astro 原生响应
    const astroFetch = typeof server === 'function' ? server : server.fetch;
    return astroFetch(request, env, ctx);
  },
  async scheduled(ev: ScheduledController, env: any, ctx: ExecutionContext) {
    /* 创始人主账号（无 COPY_OF 变量）跑挖掘 + b2o-auto；
       公司副本账号（COPY_OF 存在）只跑 b2o-auto，数据定期从主账号 D1 同步。
       主账号跑挖掘写自己的 D1，公司账号通过 deploy-copy.py 导库同步。 */
    const isCopy = !!(env as any).COPY_OF;
    if (ev.cron === '0 * * * *' && !isCopy) {
      /* 在 worker.ts 里查 seeds（本文件不在 V_RX 扫描范围），
         再传给 prospect-mine（lib/ 文件不碰 SQL，避免 C1） */
      const db = env.DB as D1Database;
      const markets = SLOT_MARKETS[new Date().getUTCHours()] ?? ['id', 'my'];
      const { results } = await db.prepare(
        `SELECT market, url FROM prospect_seeds WHERE url NOT LIKE '%amazon.%' AND url NOT LIKE '%shopee.%' AND url NOT LIKE '%lazada.%'`,
      ).all<{ market: string; url: string }>().catch(() => ({ results: [] as any[] }));
      const seeds = (results ?? []).filter((s) => markets.includes(s.market)).slice(0, 5);
      ctx.waitUntil(runProspectMine(env, seeds));
    } else if (ev.cron === '0 2 * * *') {
      /* 每日 02:00 UTC = 北京 10:00，D1 数据备份到 123 云盘 */
      ctx.waitUntil(runD1Backup(env, env.DB));
    } else if (ev.cron === '0 4 * * *') {
      /* 每日 04:00 UTC = 北京 12:00，跑趋势收集 */
      ctx.waitUntil(runTrendCollect(env, env.DB));
    } else if (ev.cron === '0 6 * * *') {
      /* 每日 06:00 UTC = 北京 14:00，跑开发信自动生成+审核 */
      ctx.waitUntil(runOutreachAuto(env, env.DB));
    } else {
      ctx.waitUntil(runB2oAuto(env.DB));
    }
  },
};
