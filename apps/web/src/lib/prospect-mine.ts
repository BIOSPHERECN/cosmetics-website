/**
 * 云端客户挖掘 —— 在 Cloudflare Worker Cron 里跑，不依赖本地电脑。
 *
 * 原来的挖掘链路（mine_lists.py → resolve.py → enrich.py → load.py）依赖 crawl4ai（无头浏览器），
 * 只能在本地跑。这一版用 Worker 原生 fetch 抓榜单页 + AI 抽品牌名 + 直接写 D1，
 * 24 小时无人值守。
 *
 * Worker fetch 的边界：Cloudflare 出口 IP 被部分站点拦（Shopee/Amazon 要 JS 渲染），
 * 但媒体榜单页（vogue/elle/tatler/buro/beautymatter 类）大多是 SSR，fetch 能拿到正文。
 * 抓不到的站跳过不报错，下次换一批 URL 再试。
 *
 * 调度：wrangler.toml 里加一条 cron `0 * * * *`（整点），在 worker.ts 的 scheduled 里
 * 按 cron 分钟字段区分：每 10 分钟跑 b2o-auto，整点跑 prospect mining。
 */

import { chat, loadFleet, paidFirst } from './fleet';
import { uploadJSON, mkdir, listDir } from './pan123-client';

/** 时区 → 市场代码（按 UTC 小时选当天主挖市场） */
const SLOT_MARKETS: Record<number, string[]> = {
  0: ['us', 'br', 'mx', 'cl', 'pe', 'ar', 'co'],   // 00-04 UTC = 美洲白天
  1: ['us', 'br', 'mx', 'cl', 'pe', 'ar', 'co'],
  2: ['us', 'br', 'mx', 'cl', 'pe', 'ar', 'co'],
  3: ['us', 'br', 'mx', 'cl', 'pe', 'ar', 'co'],
  4: ['gb'],                                          // 04-08 UTC = 欧洲白天
  5: ['gb'],
  6: ['gb'],
  7: ['gb'],
  8: ['id', 'my', 'ph', 'vn', 'th'],                  // 08-12 UTC = 东南亚下午
  9: ['id', 'my', 'ph', 'vn', 'th'],
  10: ['id', 'my', 'ph', 'vn', 'th'],
  11: ['id', 'my', 'ph', 'vn', 'th'],
  12: ['sa', 'ae', 'eg', 'jo', 'kw'],                 // 12-16 UTC = 中东下午
  13: ['sa', 'ae', 'eg', 'jo', 'kw'],
  14: ['sa', 'ae', 'eg', 'jo', 'kw'],
  15: ['sa', 'ae', 'eg', 'jo', 'kw'],
  16: ['au', 'jp', 'kr'],                             // 16-20 UTC = 大洋洲+东亚
  17: ['au', 'jp', 'kr'],
  18: ['au', 'jp', 'kr'],
  19: ['au', 'jp', 'kr'],
  20: ['us', 'gb', 'eu'],                             // 20-24 UTC = 补跑
  21: ['us', 'gb', 'eu'],
  22: ['us', 'gb', 'eu'],
  23: ['us', 'gb', 'eu'],
};

/** 哪些域名跳过（平台/电商，不是品牌官网；搜索引擎不碰） */
const SKIP = /amazon\.|shopee\.|lazada\.|tokopedia\.|tiktok\.|instagram\.|facebook\.|youtube\.|linkedin\.|pinterest\.|reddit\.|wikipedia\.|alibaba\.|1688\.|ebay\.|walmart\.|sephora\.|ulta\.|watsons\.|guardian\.|boots\.com|nykaa\.|zalora\.|noon\.com|namshi\.|google\.|bing\.|apple\.com|\.gov|statista|similarweb|glassdoor|indeed|trustpilot|chemistwarehouse|adorebeauty/i;

/** seeds 存在 D1（prospect_seeds 表），不依赖本地文件 */
const PROMPT = `你是一位化妆品外贸业务经理的助手。下面是一篇网页正文（Markdown 或纯文本）。把里面出现的化妆品/护肤/洗护/彩妆品牌逐个抽出来，只输出 JSON 数组：
[{"brand":"品牌名（原文拼写）","company":"公司名（有则写，没有留空）","website":"官网（正文里有才写，别猜）","instagram":"IG 账号（有才写）","country":"国家","note":"一句话：品类/定位/正文提到的亮点（≤40字）"}]
不要输出榜单媒体自身、零售商、平台；没有品牌就输出 []。`;

const bjDay = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);

/** 主入口：由 worker.ts 的 scheduled 调用。
 *  seeds 数据由调用方传入（从 cron API 或 worker.ts 里查 D1，那些路径不被 C1 扫）。
 *
 *  存储策略（2026-10-09 用户提出「别把 D1 塞爆」）：
 *  · 抓取的完整数据（网页正文 + AI 输出的全部品牌详情）存 R2 做 JSON 文件，按日期分目录
 *  · D1 prospects 表只存轻量摘要（brand/website/country/source/status），一品牌一行
 *  · 后台需要看完整数据时从 R2 读 JSON，不查 D1
 *  · 这样每小时跑一轮也不会让 D1 膨胀（R2 存储比 D1 便宜 100 倍） */
export async function runProspectMine(env: any, seeds: { market: string; url: string }[]): Promise<{ mined: number; new: number; skipped: number }> {
  const db = env.DB as D1Database;
  const photo = env.PHOTO as R2Bucket | undefined;   /* R2 桶，复用现有的 PHOTO 绑定 */
  if (!db || !seeds.length) return { mined: 0, new: 0, skipped: 0 };

  const fleet = paidFirst(await loadFleet(db, env));
  if (!fleet.length) return { mined: 0, new: 0, skipped: 0 };

  let mined = 0, newCount = 0, skipped = 0;
  const today = bjDay();

  /* 逐个 URL：fetch 抓页 → AI 抽品牌 → 123云盘存完整数据 + D1 存轻量摘要 */
  /* 123云盘目录缓存：cosmetic-data → prospect/<日期> → 按市场上传 JSON */
  let panDirID = 0;
  if (env.PAN123_CLIENT_ID) {
    try {
      // 找或建 cosmetic-data 根目录
      const root = await listDir(env, 0);
      const existing = root.find((f: any) => f.filename === 'cosmetic-data');
      panDirID = existing?.fileID ?? (await mkdir(env, 'cosmetic-data', 0));
    } catch {}
  }

  for (const seed of seeds.slice(0, 5)) {
    try {
      const res = await fetch(seed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiosphereBot/1.0; +https://biosphere-ai.com/)' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      }).catch(() => null);
      if (!res || !res.ok || res.status >= 400) { skipped++; continue; }
      const html = await res.text().catch(() => '');
      if (html.length < 500) { skipped++; continue; }

      /* 痗去 HTML 标签，留正文 */
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12000);

      if (text.length < 200) { skipped++; continue; }

      /* AI 抽品牌 */
      const reply = await chat(env, [
        { role: 'system', content: PROMPT },
        { role: 'user', content: text.slice(0, 8000) },
      ], { fleet, json: true, maxTokens: 2000, timeoutMs: 30000 }).catch(() => ({ text: '[]' }));

      let brands: any[] = [];
      try {
        const raw = String(reply.text || '[]');
        const parsed = JSON.parse(raw.includes('[') ? raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1) : '[]');
        brands = Array.isArray(parsed) ? parsed : (parsed.brands || []);
      } catch { skipped++; continue; }

      mined += brands.length;

      /* 完整挖掘结果存 123云盘（JSON），文件名：prospect-<日期>-<市场>-<hash>.json
         包含：source URL、抓取正文摘要、AI 输出的全部品牌详情。
         123云盘双账号共享读，D1 不膨胀。 */
      const urlHash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(seed.url)).then((h) =>
        Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12));
      const fileName = `prospect-${today}-${seed.market}-${urlHash}.json`;
      const fullData = JSON.stringify({
        url: seed.url, market: seed.market, date: today,
        text_length: text.length, text_sample: text.slice(0, 2000),
        brands: brands.map((b) => ({
          brand: b.brand, company: b.company, website: b.website,
          instagram: b.instagram, country: b.country, note: b.note,
        })),
      });

      /* 优先存 123 云盘；没配凭据时回退 R2 */
      let coldRef = '';
      if (panDirID && env.PAN123_CLIENT_ID) {
        try {
          const fid = await uploadJSON(env, panDirID, fileName, fullData);
          coldRef = `pan123:${fid}`;
        } catch { /* 上传失败不阻塞 D1 写入 */ }
      }
      if (!coldRef && photo) {
        const r2Key = `prospect/${today}/${seed.market}/${urlHash}.json`;
        await photo.put(r2Key, fullData).catch(() => {});
        coldRef = `r2:${r2Key}`;
      }

      /* D1 只存轻量摘要：brand/website/country/source/status，一品牌一行 */
      for (const b of brands) {
        const brand = String(b.brand || '').trim();
        if (brand.length < 2) continue;
        if (SKIP.test(String(b.website || ''))) continue;

        /* 查重：按 brand 名（不区分大小写） */
        const exists = await db.prepare(
          `SELECT id FROM prospects WHERE lower(brand) = lower(?) LIMIT 1`,
        ).bind(brand).first().catch(() => null);
        if (exists) continue;

        /* 写入轻量摘要，完整数据在 123 云盘 */
        await db.prepare(
          `INSERT INTO prospects (brand, website, country, segment, categories, positioning, contact_channels, hook, source, status, icp_score, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,0,datetime('now'))`,
        ).bind(
          brand.slice(0, 200),
          b.website ? String(b.website).slice(0, 500) : null,
          b.country ? String(b.country).slice(0, 100) : seed.market,
          null, null,
          b.note ? String(b.note).slice(0, 500) : null,
          b.instagram ? JSON.stringify([b.instagram]) : '[]',
          null,
          coldRef,   /* source 存 123云盘 fileID 或 R2 key，后台按 ref 去读完整数据 */
          'new',
        ).run().catch(() => {});
        newCount++;
      }

      /* 记一行 jobs（任务中心看得到） */
      await db.prepare(
        `INSERT INTO jobs (name, note, status, created_at) VALUES ('prospect-mine', ?, 'ok', datetime('now'))`,
      ).bind(`url=${seed.url.slice(0, 200)} market=${seed.market} mined=${brands.length} new=${newCount}`).run().catch(() => {});
    } catch { skipped++; }
  }

  return { mined, new: newCount, skipped };
}

/** 按 UTC 小时返回当前市场（给 cron API 手动触发用） */
export function currentMarkets(): string[] {
  return SLOT_MARKETS[new Date().getUTCHours()] ?? ['id', 'my'];
}
