/**
 * bohui-web 的 Worker 入口(2026-09-24 C1):页面照旧交给 Astro 适配器;另外接 Cloudflare Cron。
 * 为什么 Cron 放在这里而不是本机计划任务:06-v2 §〇 第 8 条「看门狗不能和被看的机器放在一起」—— 本机关机时 BEAUTY2OEM 自动草稿照出,
 * 任务中心里 b2o-auto 这一行也照常心跳;反过来 Cron 停了,任务中心会把 b2o-auto 标红。
 * 触发时间见 wrangler.toml [triggers]。
 */
import server from '@astrojs/cloudflare/entrypoints/server';
import { runB2oAuto } from './lib/b2o-auto';

export default {
  ...server,
  async scheduled(_ev: ScheduledController, env: { DB: D1Database }, ctx: ExecutionContext) {
    ctx.waitUntil(runB2oAuto(env.DB));
  },
};
