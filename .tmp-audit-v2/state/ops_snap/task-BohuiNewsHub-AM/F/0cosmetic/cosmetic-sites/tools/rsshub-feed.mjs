/**
 * RSSHub 采集通道 —— 创始人:「GitHub 很多爬国内的,把几十上百个爬虫开源整合成好用的」。
 * 正解就是 RSSHub:社区已把 3858 个源整合成统一路由,我们以**库模式**直调
 * (init + request,不起服务),按行业路由拉取 → 关键词过滤 → 走既有改写管线。
 * 描述字段常含全文 → excerpt 直接够深度稿底料。
 * 运行:NODE_USE_ENV_PROXY=1 HTTPS_PROXY=… node tools/rsshub-feed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://biosphere-ai.com';
const LOG = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/news-hub.log';
const KEY = /^CRON_KEY=(.+)$/m.exec(readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8'))[1].trim();

const ROUTES = [
  { path: '/cbndata/information', source: 'CBNData', topic: 'industry' },
  { path: '/36kr/hot-list', source: '36氪', topic: 'industry' },
  { path: '/jiemian/lists/61', source: '界面新闻·时尚', topic: 'brand' },
];
/* 09-24 撤 FashionNetwork(/fashionnetwork/headline/cn):09-22 起条目恒 0、详情页 403 反爬 —— 红灯源不绕,换源另议 */
/* 行业相关性关键词:标题不含就不收 —— 通用媒体路由里美妆只是子集 */
const KW = /美妆|化妆品|护肤|彩妆|香水|香氛|个护|美容|洗护|面膜|精华|防晒|口腔|cosmetic|beauty|skincare|fragrance/i;

const log = (m) => {
  const line = `${new Date().toISOString().slice(5, 16)}  ${m}`;
  console.log(line);
  writeFileSync(LOG, line + '\n', { flag: 'a' });
};

const { init, request } = await import('file:///F:/0cosmetic/rsshub-svc/node_modules/rsshub/dist-lib/pkg.mjs');
await init({ CACHE_TYPE: null });

const leads = [];
for (const r of ROUTES) {
  try {
    const feed = await request(r.path);
    const items = feed?.item ?? feed?.items ?? [];
    let hit = 0;
    for (const it of items) {
      if (leads.length >= 12) break;
      const title = String(it.title ?? '').trim();
      if (!title || !KW.test(title)) continue;
      const t = Date.parse(it.pubDate ?? '');
      if (!Number.isFinite(t) || Date.now() - t > 14 * 86400_000) continue;
      const text = String(it.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      leads.push({
        title: title.slice(0, 200), link: String(it.link ?? '').slice(0, 500),
        source: r.source, topic: r.topic,
        date: new Date(t).toUTCString(),
        snippet: text.slice(0, 300), excerpt: text.length > 400 ? text.slice(0, 3200) : '',
      });
      hit++;
    }
    log(`${r.source} 条目${items.length} 命中${hit}`);
  } catch (e) { log(`${r.source} ★ ${String(e.message ?? e).slice(0, 60)}`); }
}

if (!leads.length) { log('无命中线索'); process.exit(0); }
const res = await fetch(`${BASE}/api/cron/news/`, {
  method: 'POST',
  headers: { 'x-cron-key': KEY, origin: BASE, 'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 bohui-cron/1.0' },
  body: JSON.stringify({ cap: 10, leads }),
  signal: AbortSignal.timeout(280_000),
});
const j = await res.json().catch(() => ({}));
log(`投喂${leads.length} 入${j.inserted} 滤${j.skipped} 错${(j.errors ?? []).length}`);
process.exit(0);
