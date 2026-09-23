/**
 * 资讯采集云端闹钟 —— 创始人 2026-08-31:「新闻采集,不可以变自动化吗?」
 *
 * 此前靠本机 schtasks 调 .bat:机器一关,资讯当天就停更,还没人知道。
 * 这个 Worker 只干一件事:按 crons 表定点戳主站的三个采集端点。
 * 真正的抓取/改写/入库逻辑都在主站里,这里挂了也只是"少叫一班车",
 * 本机计划任务保留当双保险 —— 采集端按链接幂等去重,重复触发无害。
 */
const STEPS = [
  ['采集新稿', 'https://biosphere-ai.com/api/cron/news/'],
  ['资讯配图', 'https://biosphere-ai.com/api/cron/news-art/'],
  ['薄稿升级', 'https://biosphere-ai.com/api/cron/news-upgrade/'],
];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  // 手动触发口(带同一把 key),方便验收:GET /?key=...
  async fetch(request, env) {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    if (!env.CRON_KEY || key !== env.CRON_KEY) return new Response('forbidden', { status: 403 });
    const log = await run(env);
    return new Response(JSON.stringify(log, null, 2), { headers: { 'content-type': 'application/json' } });
  },
};

async function run(env) {
  const log = [];
  for (const [name, url] of STEPS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'x-cron-key': env.CRON_KEY, 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(280_000),
      });
      log.push({ step: name, status: r.status, body: (await r.text()).slice(0, 300) });
    } catch (e) {
      log.push({ step: name, error: String(e).slice(0, 200) });
    }
  }
  console.log(JSON.stringify(log));
  return log;
}
