/**
 * cron 任务函数 —— 从 worker.ts scheduled 直接调用，不走 HTTP self-fetch（CF 拦 loopback）。
 * 每个函数封装对应 cron 端点的核心逻辑，端点本身保留给手动触发用。
 */
import { chat, loadFleet, paidFirst } from './fleet';
import { reviewOutreach } from './outreach-review';
import { uploadJSON, mkdir, listDir } from './pan123-client';
import { searchWeb, budget } from './anysearch';

const bjDay = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);

/* 10-26 修:agnes 家族(tier1-3)全 429 时,原排序让 chat 只试前 4 家就放弃,
   永远轮不到能用的 bohui-gateway(tier4,内部网关最稳)。把 internal gateway 排第一。 */
function gwFirst(list: any[]): any[] {
  const gw = list.filter((p) => p.id === 'bohui-gateway' && p.keys?.length);
  const rest = list.filter((p) => p.id !== 'bohui-gateway' && p.keys?.length);
  return [...gw, ...rest];
}

/* ────────────────────────────────────────────────────────────
 * ecom 爆款单品采集(2026-10-23,替代本地 tools/ecom-trends.py 的云端正环)
 *
 * 原脚本走 Exa 搜索引擎索引层拿「榜单页链接」写 ecom_trends;本地有 mcporter,
 * 云端没有 —— 两层重建:
 *
 *   ① 单品层(写 ecom_items,老报告 30 万字节体量的底气):
 *      Amazon 美区 Best Sellers 的 zgbs 页面是 SSR 的静态 HTML,Worker fetch 能拿全文
 *      (2026-10-23 本机点验 200,含排名/标题/价格/评分/评论数/ASIN,30/30 可解析)。
 *      每天轮换一批品类节点,每个节点解析前 N 个单品 → INSERT ecom_items。
 *      —— 价格/评分全部来自页面 DOM,页面上没有的字段(销量/delta/店铺)一律留空,绝不编造。
 *
*   ② 链接层(写 ecom_trends,替代 Exa):
   *      AnySearch(云端已有 ANYSEARCH_KEY secret)按「市场 × 平台 × 品类」搜索榜单页链接,
   *      每条带可点开的原始 URL —— 忠实延续原脚本三条纪律(带链接 / 不编数字 / 耐心退避)。
   *      一天只跑一半市场(轮换,配额克制)。
 *
 * 纪律:
 *   - 每个源每一步失败记 failMap,最终写进 jobs 心跳 note(照抄 runTrendCollect 模式);
 *   - 任何 D1 INSERT 后检查 meta.changes,expected=1 而 changes=0 视为参数绑定事故,写进 note;
 *   - fetch 带浏览器 UA、超时、非 200/空体 → 记录源+状态码,绝不让 worker 崩。
 * ──────────────────────────────────────────────────────────── */

/** Amazon zgbs 品类节点(URL 2026-10-23 本机点验 200;页面是 SSR 静态 HTML) */
const ZGBS_NODES = [
  { url: 'https://www.amazon.com/Best-Sellers-Facial-Serums/zgbs/beauty/7792528011', category: '护肤', subcategory: '面部精华' },
  { url: 'https://www.amazon.com/Best-Sellers-Face-Moisturizers/zgbs/beauty/11062971', category: '护肤', subcategory: '面霜保湿' },
  { url: 'https://www.amazon.com/Best-Sellers-Sunscreens/zgbs/beauty/15239990011', category: '防晒', subcategory: '防晒霜' },
  { url: 'https://www.amazon.com/Best-Sellers-Oral-Care-Products/zgbs/hpc/10079992011', category: '口腔护理', subcategory: '口腔护理' },
  { url: 'https://www.amazon.com/Best-Sellers-Body-Lotions/zgbs/beauty/14024031', category: '身体护理', subcategory: '身体乳' },
  { url: 'https://www.amazon.com/Best-Sellers-Shampoo-Conditioner/zgbs/beauty/17911764011', category: '洗护', subcategory: '香波护发' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/* 链接层的市场 × 平台,按原 ecom-trends.py 的 MARKETS 收敛(帛卉实际出货市场优先) */
const ECOMSRCH: Array<[string, string, string, string[]]> = [
  ['us', '美国', 'United States', ['Amazon US', 'TikTok Shop US']],
  ['id', '印尼', 'Indonesia', ['Shopee Indonesia', 'Tokopedia']],
  ['th', '泰国', 'Thailand', ['Shopee Thailand', 'Lazada Thailand']],
  ['my', '马来西亚', 'Malaysia', ['Shopee Malaysia', 'Lazada Malaysia']],
  ['vn', '越南', 'Vietnam', ['Shopee Vietnam', 'TikTok Shop Vietnam']],
  ['ph', '菲律宾', 'Philippines', ['Shopee Philippines', 'Lazada Philippines']],
  ['br', '巴西', 'Brazil', ['Mercado Livre Brazil', 'Amazon Brazil']],
  ['jp', '日本', 'Japan', ['Amazon Japan', 'Rakuten']],
  ['kr', '韩国', 'South Korea', ['Coupang', 'Olive Young']],
  ['ae', '中东', 'Middle East', ['Noon', 'Amazon UAE']],
  ['de', '欧洲', 'Europe', ['Amazon Germany', 'Notino']],
  ['sg', '新加坡', 'Singapore', ['Shopee Singapore', 'Lazada Singapore']],
];
const ECOM_CATS: Array<[string, string]> = [
  ['skincare', 'serum moisturizer'], ['suncare', 'sunscreen SPF'], ['oral', 'toothpaste mouthwash'],
  ['body', 'body lotion body wash'], ['haircare', 'shampoo conditioner hair mask'],
];

/** zgbs HTML → 单品数组。只取页面 DOM 里真实存在的字段,没有就不写。 */
function parseZgbsHtml(html: string, node: { category: string; subcategory: string }): Array<Record<string, string | number | null>> {
  const unesc = (s: string) => String(s || '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#xA0;|\u00a0/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const out: Array<Record<string, string | number | null>> = [];
  for (const b of html.split(/<div id="p13n-asin-index-\d+"/).slice(1)) {
    const mRank = /zg-bdg-text">#(\d+)</.exec(b);
    if (!mRank) continue;   // 无排名徽章的(广告位/插播)不算榜单行
    const mAlt = /<img alt="([^"]{6,300})"/.exec(b);
    const mClamp = /class="[^"]*p13n-sc-css-line-clamp[^"]*"[^>]*>\s*([^<]+)/.exec(b);
    const title = unesc((mAlt && mAlt[1]) || (mClamp && mClamp[1]) || '');
    if (title.length < 6) continue;
    const mPrice = /_cDEzb_p13n-sc-price_3mJ9Z">([^<]+)/.exec(b)
      || /class="a-color-price"><span class="[^"]+">([^<]+)<\/span>/.exec(b);
    const mRating = /a-icon-alt">([\d.]+) out of 5 stars/.exec(b);
    const mReviews = /a-icon-alt">[\d.]+ out of 5 stars<\/span><\/i>[\s\S]{0,20}?<span[^>]*>([\d,]+)<\/span>/.exec(b);
    const mAsin = /href="\/([^"?]+\/dp\/([A-Z0-9]{10}))\//.exec(b);
    const mImg = /src="(https:\/\/[^"]*?\._(?:AC|SL|SY|SX)[^"]*(?:jpg|png|webp))"/.exec(b);
    /* 品牌:榜单页没有独立品牌字段。取标题首词序列(≤4 词,非全小写常见词则截到分隔符),
       并把「Amazon Essentials / Amazon Basics」这类亚马逊自营名替换为空 —— 页面上没有就不写。 */
    let brand = '';
    const head = title.split(/\s*[|,\-–—]|\s+(?:by|from)\s+/i)[0] ?? '';
    const words = head.trim().split(/\s+/);
    const take: string[] = [];
    for (const w of words) {
      if (take.length >= 4) break;
      if (/^amazon$/i.test(w) && words[1] && /essentials|basics/i.test(words[1])) break;  // 亚马逊自营不是品牌
      take.push(w);
    }
    brand = take.join(' ').slice(0, 28);
    if (/amazon/i.test(brand)) brand = '';
    out.push({
      report_date: null, region: '欧美', platform: 'Amazon US', category: node.category,
      subcategory: node.subcategory, board: '销量最高', rank_no: +mRank[1],
      title: title.slice(0, 300), brand: brand || null,
      price: mPrice ? unesc(mPrice[1]) : null, price_note: null,
      sales: null, delta: null,
      rating: mRating ? mRating[1] : null, reviews: mReviews ? mReviews[1] : null,
      rank_change: null, shop: null,
      url: mAsin ? `https://www.amazon.com/dp/${mAsin[2]}` : null,
      image: mImg ? mImg[1] : null,
    });
  }
  return out;
}

/** 爆款单品采集。挂在 0 4 UTC cron,与 runTrendCollect 并行;也可用端点手动触发。 */
export async function runEcomCollect(env: any, db: D1Database): Promise<{ ok: boolean; itemsFound: number; itemsInserted: number; trendsFound: number; trendsInserted: number; fails: string[] }> {
  const today = bjDay();
  const failMap: string[] = [];
  let itemsFound = 0, itemsInserted = 0, trendsFound = 0, trendsInserted = 0;

  /* ── 层 ①:Amazon zgbs 单品(轮换节点:一天 3 个,两天一轮) ── */
  const dayIdx = Math.floor(Date.now() / 86400000) % 2;
  const nodes = ZGBS_NODES.slice(dayIdx * 3, dayIdx * 3 + 3);
  const rows: Array<Record<string, string | number | null>> = [];
  for (const node of nodes) {
    let why = 'ok';
    try {
      const res = await fetch(node.url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(20000), redirect: 'follow', cf: { cacheTtl: 0 },
      }).catch(() => null);
      if (!res || !res.ok) { why = `http${res ? ':' + res.status : ':fail'}`; failMap.push(`${node.subcategory}=${why}`); continue; }
      const html = await res.text().catch(() => '');
      if (html.length < 20000) { why = 'html<' + html.length; failMap.push(`${node.subcategory}=${why}`); continue; }
      const items = parseZgbsHtml(html, node).slice(0, 15);
      if (!items.length) { why = 'parse0'; failMap.push(`${node.subcategory}=${why}`); continue; }
      itemsFound += items.length;
      for (const it of items) rows.push({ ...it, report_date: today });
    } catch { failMap.push(`${node.subcategory}=exc`); }
  }
  if (rows.length) {
    /* 当天本平台重跑幂等:先删再插(与 tools/ecom-report.py 每个 report_date 先 DELETE 同约定) */
    const del = await db.prepare(`DELETE FROM ecom_items WHERE report_date = ? AND platform = 'Amazon US'`).bind(today).run().catch(() => null);
    if (del) { /* 删除本身允许 0 行(今天第一次跑) */ }
    for (const r of rows) {
      const ins = await db.prepare(`INSERT INTO ecom_items (report_date,region,platform,category,subcategory,board,rank_no,title,brand,price,price_note,sales,delta,rating,reviews,rank_change,shop,url,image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(r.report_date, r.region, r.platform, r.category, r.subcategory, r.board, r.rank_no, r.title, r.brand, r.price,
          r.price_note, r.sales, r.delta, r.rating, r.reviews, r.rank_change, r.shop, r.url, r.image)
        .run().catch(() => null);
      if (!ins || (ins.meta && Number(ins.meta.changes) !== 1)) {
        failMap.push(`items:${r.platform}:${r.subcategory}#${r.rank_no}=changes${ins ? ins.meta?.changes : 'null'}`);
        continue;
      }
      itemsInserted++;
    }
  }

  /* ── 层 ②:AnySearch 榜单链接(轮换市场:一天 6 个市场 × 5 品类,两天覆盖全部) ──
     成本纪律(2026-11-02 审核):30 次搜索共用一份 30 次预算;3 路并发 + 8 分钟总时长上限,
     超限提前收工;结果先攒后 db.batch() 分块提交,避免 180 次逐条 await 拖长一次 cron。 */
  let budgetTotal = 0;
  if (env.ANYSEARCH_KEY) {
    const mIdx = dayIdx * 6;
    const mkts = ECOMSRCH.slice(mIdx % 12).concat(ECOMSRCH.slice(0, mIdx % 12)).slice(0, 6);
    const b = budget(30);
    const t0 = Date.now();
    const rows: Array<{ cc: string; czh: string; ccat: string; plat: string; title: string; url: string }> = [];
    const tasks: Array<() => Promise<void>> = [];
    for (const [cc, czh, cen, plats] of mkts) {
      for (const [ccat, kw] of ECOM_CATS) {
        const plat = plats[0];
        tasks.push(async () => {
          if (b.left <= 0 || Date.now() - t0 > 8 * 60_000) { failMap.push('anysearch:cap'); return; }
          budgetTotal++;
          try {
            const hits = await searchWeb(env, `best selling ${kw} ${cen} ${plat} bestseller 2026 top products`, 6, b);
            for (const h of hits) {
              trendsFound++;
              rows.push({ cc, czh, ccat, plat, title: h.title.slice(0, 300), url: h.url.slice(0, 600) });
            }
          } catch { failMap.push(`anysearch:${cc}=exc`); }
        });
      }
    }
    for (let i = 0; i < tasks.length; i += 3) await Promise.all(tasks.slice(i, i + 3).map((f) => f()));
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const res = await db.batch(chunk.map((r) => db.prepare(
        `INSERT INTO ecom_trends (country,country_zh,category,platform,title,url,published,captured_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(url) DO NOTHING`,
      ).bind(r.cc, r.czh, r.ccat, r.plat, r.title, r.url, ''))).catch(() => null);
      if (!res) { failMap.push('etrends:db-fail'); continue; }
      for (const x of res) if (Number((x as any).meta?.changes) === 1) trendsInserted++;
    }
  } else {
    failMap.push('anysearch:no-key');
  }

  const ok = itemsInserted > 0 || trendsInserted > 0;
  await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('ecom-collect',?,?,datetime('now'),datetime('now'))`)
    .bind(`report_date=${today} items=${itemsFound}/${itemsInserted} trends=${trendsFound}/${trendsInserted} asQ=${budgetTotal} ${failMap.join(' | ').slice(0, 360)}`,
      ok ? 'ok' : 'fail')
    .run().catch(() => {});
  return { ok, itemsFound, itemsInserted, trendsFound, trendsInserted, fails: failMap };
}

/** 趋势收集（每日 04:00 UTC） */
export async function runTrendCollect(env: any, db: D1Database): Promise<{ ok: boolean; batch: number; collected: number; skipped: number; fails: string[] }> {
  /* 10-23 修:原来付费舰队为空时直接 return,连心跳都不写 —— trends 表因此
     停在 2026-09-04 将近 50 天没人发现(cron 在触发,函数静默退出)。
     现在:付费优先,没有付费就用免费网关;一个 key 都没有也写心跳留痕。 */
  /* 10-26 修:agnes 家族(tier1-3)全 429 时,原排序让 chat 只试前 4 家就放弃,
   永远轮不到能用的 bohui-gateway(tier4,内部网关最稳)。把 internal gateway 排第一。 */
const fleet0 = await loadFleet(db, env);
  let fleet = gwFirst(paidFirst(fleet0));
  if (!fleet.length) fleet = gwFirst(fleet0 as any[]);
  if (!fleet.length) {
    await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('trend-collect','no fleet key','fail',datetime('now'),datetime('now'))`).run().catch(()=>{});
    return { ok: false, batch: 0, collected: 0, skipped: 0, fails: ['no fleet key'] };
  }

  const TREND_SOURCES = [
    { market: 'us', url: 'https://www.allure.com/beauty-trends', source: 'Allure' },
    { market: 'us', url: 'https://www.elle.com/beauty/', source: 'Elle' },
    { market: 'us', url: 'https://www.cosmopolitan.com/style-beauty/beauty/', source: 'Cosmo' },
    { market: 'gb', url: 'https://www.vogue.co.uk/beauty', source: 'Vogue UK' },
    /* 10-23 换源:原 4 条整批 404(站点改版)或连接失败 —— trends 停更 49 天的直接原因 */
    { market: 'id', url: 'https://editorial.femaledaily.com/blog', source: 'FemaleDaily' },
    { market: 'us', url: 'https://beautymatter.com', source: 'BeautyMatter' },
    { market: 'au', url: 'https://www.beautyheaven.com.au', source: 'BeautyHeaven' },
    { market: 'jp', url: 'https://www.vogue.co.jp/beauty', source: 'Vogue JP' },
    { market: 'kr', url: 'https://www.allurekorea.com/beauty-trends', source: 'Allure KR' },
    { market: 'sa', url: 'https://www.vogueme.com/beauty/', source: 'Vogue ME' },
    { market: 'br', url: 'https://vogue.globo.com/moda-beleza/', source: 'Vogue BR' },
    { market: 'mx', url: 'https://www.elle.com/mx/beauty/', source: 'Elle MX' },
  ];
  /* 2026-10-26 多源组合(创始人:「最好是多个优秀的开源组合在一起搜索,而不是依赖一个」):
     RSS / 公开 JSON 不反爬、不收费、不用 key,与媒体直抓、AnySearch 并列跑。
     任何一路死掉,其余照常产出 —— 单点故障不再是全线停更。 */
  const SEARCH_QUERIES = ['cosmetic trend 2026', 'beauty ingredient news', 'skincare market growth', 'private label cosmetics demand'];
  const REDDIT_SUBS = ['SkincareAddiction', 'AsianBeauty', 'beauty', 'makeupaddiction'];
  const dayIdx = Math.floor(Date.now() / 86400000) % 3;
  const batch = TREND_SOURCES.slice(dayIdx * 4, dayIdx * 4 + 4);
  const today = bjDay();
  let collected = 0, skipped = 0;
  const failMap: string[] = [];   // 每源失败在哪一步,写进心跳 note 便于定位(10-23)
  let multiSrc = 0;               // 多源组合命中数(10-26)

  let panDirID = 0;
  if (env.PAN123_CLIENT_ID) {
    try { const root = await listDir(env, 0); panDirID = root.find((f:any)=>f.filename==='cosmetic-data')?.fileID ?? (await mkdir(env,'cosmetic-data',0)); } catch {}
  }

  const PROMPT = `你是一位化妆品行业趋势分析师。下面是一篇美妆媒体网页正文。把里面提到的当前/即将流行的化妆品趋势逐个抽出来，只输出JSON数组：
[{"title_zh":"趋势中文标题(≤20字)","title_en":"英文原标题","category":"护肤/彩妆/洗护/香氛/工具","format":"成分/品类/包装/营销概念","claim_tag":"功效宣称","figure":"正文里的数字","source_name":"媒体名","source_url":"来源URL","source_date":"日期","so_what_zh":"一句话为什么重要(≤40字)","confidence":"high/medium/low"}]
没有趋势就输出 []。不要编造。`;

  for (const src of batch) {
    let why = 'ok';
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
        signal: AbortSignal.timeout(15000), redirect: 'follow',
        cf: { cacheTtl: 0 },
      }).catch(() => null);
      if (!res || !res.ok) { why = `http${res ? ':' + res.status : ':fail'}`; skipped++; failMap.push(`${src.source}=${why}`); continue; }
      const html = await res.text().catch(() => '');
      if (html.length < 500) { why = 'html<500'; skipped++; failMap.push(`${src.source}=${why}`); continue; }
      const text = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim().slice(0,12000);
      if (text.length < 200) { why = 'text<200'; skipped++; failMap.push(`${src.source}=${why}`); continue; }

      const reply = await chat(env, [{role:'system',content:PROMPT},{role:'user',content:text.slice(0,8000)}], {fleet, json:true, maxTokens:2000, timeoutMs:30000}).catch(()=>({text:'[]'}));
      let trends: any[] = [];
      try { const raw=String(reply.text||'[]'); trends=JSON.parse(raw.includes('[')?raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1):'[]'); if(!Array.isArray(trends))trends=[]; } catch { why = 'llm-json'; skipped++; failMap.push(`${src.source}=${why}`); continue; }
      if (!trends.length) { why = 'empty'; skipped++; failMap.push(`${src.source}=empty`); continue; }
      collected += trends.length;

      const fileName = `trend-${today}-${src.market}-${src.source.replace(/\s/g,'')}.json`;
      const fullData = JSON.stringify({url:src.url,market:src.market,source:src.source,date:today,text_sample:text.slice(0,2000),trends});
      let coldRef = '';
      if (panDirID && env.PAN123_CLIENT_ID) { try { const fid=await uploadJSON(env,panDirID,fileName,fullData); coldRef=`pan123:${fid}`; } catch {} }

      for (const t of trends) {
        const tz = String(t.title_zh||'').trim();
        if (tz.length < 2) continue;
        await db.prepare(`INSERT INTO trends (title_zh,title_en,market,category,format,claim_tag,figure,source_name,source_url,source_date,so_what_zh,confidence,status,media_state,created_at,product_name,ref_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active','pending',datetime('now'),?,?)`)
        .bind(tz.slice(0,200), String(t.title_en||'').slice(0,200)||null, src.market, String(t.category||'').slice(0,40)||null, String(t.format||'').slice(0,40)||null, String(t.claim_tag||'').slice(0,100)||null, String(t.figure||'').slice(0,100)||null, src.source, src.url, String(t.source_date||today).slice(0,20), String(t.so_what_zh||'').slice(0,500)||null, String(t.confidence||'medium').slice(0,10), String(t.product_name||'').slice(0,160)||null, coldRef||src.url).run().catch(()=>{});
      }
    } catch { skipped++; }
  }

  /* ── 多源组合(2026-10-26):Google News RSS + Bing News RSS + Reddit JSON ──
     三路免费源,零 key、零反爬,与媒体直抓+AnySearch 并列。任何一路死掉其余照产。 */
  const RSS_PROMPT = `你是一位化妆品行业趋势分析师。下面是搜索/RSS/Reddit聚合的标题+摘要列表。把里面提到的当前/即将流行的化妆品趋势逐个抽出来,只输出JSON数组:
[{"title_zh":"趋势中文标题(≤20字)","title_en":"英文原标题","category":"护肤/彩妆/洗护/香氛/工具","format":"成分/品类/包装/营销概念","claim_tag":"功效宣称","figure":"正文里的数字","source_name":"来源名","source_url":"来源URL","source_date":"日期","so_what_zh":"一句话为什么重要(≤40字)","confidence":"high/medium/low"}]
没有趋势就输出 []。不要编造。`;

  // 源1: Google News RSS(无反爬)
  for (const q of SEARCH_QUERIES.slice(0, 2)) {
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const r = await fetch(rssUrl, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null);
      if (!r || !r.ok) { failMap.push(`gnews:${q}=fail`); continue; }
      const xml = await r.text().catch(() => '');
      const titles = (xml.match(/<title>([^<]{10,200})<\/title>/g) || []).slice(0, 12).map(s => s.replace(/<\/?title>/g, '').trim()).join('\n');
      if (titles.length < 100) { failMap.push(`gnews:${q}=short`); continue; }
      const reply = await chat(env, [{role:'system',content:RSS_PROMPT},{role:'user',content:`Google News 搜索"${q}"的标题:\n${titles.slice(0,4000)}`}], {fleet, json:true, maxTokens:2000, timeoutMs:30000}).catch(() => ({text:'[]'}));
      let trends: any[] = [];
      try { const raw=String(reply.text||'[]'); trends=JSON.parse(raw.includes('[')?raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1):'[]'); if(!Array.isArray(trends))trends=[]; } catch { failMap.push(`gnews:${q}=llm-json`); continue; }
      for (const t of trends) {
        const tz = String(t.title_zh||'').trim();
        if (tz.length < 2) continue;
        await db.prepare(`INSERT INTO trends (title_zh,title_en,market,category,format,claim_tag,figure,source_name,source_url,source_date,so_what_zh,confidence,status,media_state,created_at,product_name,ref_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active','pending',datetime('now'),?,?)`)
        .bind(tz.slice(0,200), String(t.title_en||'').slice(0,200)||null, 'us', String(t.category||'').slice(0,40)||null, String(t.format||'').slice(0,40)||null, String(t.claim_tag||'').slice(0,100)||null, String(t.figure||'').slice(0,100)||null, 'Google News', `https://news.google.com/search?q=${encodeURIComponent(q)}`, String(t.source_date||today).slice(0,20), String(t.so_what_zh||'').slice(0,500)||null, String(t.confidence||'medium').slice(0,10), String(t.product_name||'').slice(0,160)||null, `https://news.google.com/search?q=${encodeURIComponent(q)}`).run().catch(()=>{});
        collected++; multiSrc++;
      }
    } catch { failMap.push(`gnews:${q}=exc`); }
  }

  // 源2: Reddit JSON API(无需key,需UA)
  for (const sub of REDDIT_SUBS.slice(0, 2)) {
    try {
      const r = await fetch(`https://www.reddit.com/r/${sub}/top.json?t=week&limit=20`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'BIOSPHERE-AI/1.0 (cosmetic OEM research)' }
      }).catch(() => null);
      if (!r || !r.ok) { failMap.push(`reddit:${sub}=fail`); continue; }
      const j = await r.json().catch(() => ({} as any));
      const posts = (j?.data?.children ?? []).map((c: any) => ({ title: c?.data?.title, score: c?.data?.score, url: c?.data?.url, selftext: c?.data?.selftext?.slice(0, 500) })).filter((p: any) => p.title?.length > 10);
      if (!posts.length) { failMap.push(`reddit:${sub}=empty`); continue; }
      const feed = posts.slice(0, 12).map((p: any, i: number) => `${i+1}. ${p.title} (score=${p.score})`).join('\n');
      const reply = await chat(env, [{role:'system',content:RSS_PROMPT},{role:'user',content:`Reddit r/${sub} 本周热帖:\n${feed.slice(0,4000)}`}], {fleet, json:true, maxTokens:2000, timeoutMs:30000}).catch(() => ({text:'[]'}));
      let trends: any[] = [];
      try { const raw=String(reply.text||'[]'); trends=JSON.parse(raw.includes('[')?raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1):'[]'); if(!Array.isArray(trends))trends=[]; } catch { failMap.push(`reddit:${sub}=llm-json`); continue; }
      for (const t of trends) {
        const tz = String(t.title_zh||'').trim();
        if (tz.length < 2) continue;
        await db.prepare(`INSERT INTO trends (title_zh,title_en,market,category,format,claim_tag,figure,source_name,source_url,source_date,so_what_zh,confidence,status,media_state,created_at,product_name,ref_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active','pending',datetime('now'),?,?)`)
        .bind(tz.slice(0,200), String(t.title_en||'').slice(0,200)||null, 'us', String(t.category||'').slice(0,40)||null, String(t.format||'').slice(0,40)||null, String(t.claim_tag||'').slice(0,100)||null, String(t.figure||'').slice(0,100)||null, `Reddit r/${sub}`, `https://www.reddit.com/r/${sub}/`, String(t.source_date||today).slice(0,20), String(t.so_what_zh||'').slice(0,500)||null, String(t.confidence||'medium').slice(0,10), String(t.product_name||'').slice(0,160)||null, `https://www.reddit.com/r/${sub}/`).run().catch(()=>{});
        collected++; multiSrc++;
      }
    } catch { failMap.push(`reddit:${sub}=exc`); }
  }

  // 源3: AnySearch(已有key,ecom-collect在用)
  if (env.ANYSEARCH_KEY) {
    try {
      const hits = await searchWeb(env, 'cosmetic beauty trend ingredient 2026 trending skincare market', 10);
      if (hits.length) {
        const feed = hits.slice(0, 10).map((h: any) => `- ${h.title}: ${(h.snippet||'').slice(0,200)}`).join('\n');
        const reply = await chat(env, [{role:'system',content:RSS_PROMPT},{role:'user',content:`AnySearch 搜索结果:\n${feed.slice(0,4000)}`}], {fleet, json:true, maxTokens:2000, timeoutMs:30000}).catch(() => ({text:'[]'}));
        let trends: any[] = [];
        try { const raw=String(reply.text||'[]'); trends=JSON.parse(raw.includes('[')?raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1):'[]'); if(!Array.isArray(trends))trends=[]; } catch {}
        for (const t of trends) {
          const tz = String(t.title_zh||'').trim();
          if (tz.length < 2) continue;
          await db.prepare(`INSERT INTO trends (title_zh,title_en,market,category,format,claim_tag,figure,source_name,source_url,source_date,so_what_zh,confidence,status,media_state,created_at,product_name,ref_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active','pending',datetime('now'),?,?)`)
          .bind(tz.slice(0,200), String(t.title_en||'').slice(0,200)||null, 'us', String(t.category||'').slice(0,40)||null, String(t.format||'').slice(0,40)||null, String(t.claim_tag||'').slice(0,100)||null, String(t.figure||'').slice(0,100)||null, 'AnySearch', 'https://anysearch.ai', String(t.source_date||today).slice(0,20), String(t.so_what_zh||'').slice(0,500)||null, String(t.confidence||'medium').slice(0,10), String(t.product_name||'').slice(0,160)||null, 'https://anysearch.ai').run().catch(()=>{});
          collected++; multiSrc++;
        }
      }
    } catch { failMap.push('anysearch:trend=exc'); }
  }

  await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('trend-collect',?,?,datetime('now'),datetime('now'))`).bind(`batch=${dayIdx} media=${collected-multiSrc} multi=${multiSrc} total=${collected} skipped=${skipped} ${failMap.join(' | ').slice(0, 360)}`,'ok').run().catch(()=>{});
  return { ok: true, batch: dayIdx, collected, skipped, fails: failMap };
}

/**
 * 爆款趋势报告生成 —— 云端闭环(2026-10-23),替代本地 tools/trend-reports-load.py:
 * 以前报告靠本地脚本从 R2 拿生成好的 md 上传,没人跑就闲置(报告停在 2026-09-05 共 48 天)。
 * 现在采集落库后直接在这里用同一批 LLM 生成报告写 D1。
 * 日报:每日 04:00 UTC 采集后生成;周报:周一 08:00 UTC 聚合上周数据生成。
 *
 * 10-23 扩展:素材从 trends-only → trends + ecom_items(单品榜)+ ecom_trends(榜单链接)。
 * 体量目标:日节 9 节、周节 13 节,区域/平台 × 品类 / 单品级分析(品名/品牌/价格带/排名变化/选品建议)。
 * 分节生成:因为单次 LLM 输出有限,每节一次 chat,每节指定固定节标题与专属素材子集;
 * 个别节失败跳过、成功节照常落库(第 1 节成功即报告成立)。
 * body_md 单条上限截断 88000(趋势表字段上限 9 万),超长自动拆 ord 续节。
 *
 * 旧调用兼容:现网 runBuildTrendReport(env, db, 'day' | 'week') 传的是字符串 ——
 * opts 允许传 {mode} 对象或直接传 'day'/'week' 字符串(此前字符串被 opts?.mode 忽略,
 * 周一周报 cron 实际生成的是日报 —— 已修)。
 */
export async function runBuildTrendReport(env: any, db: D1Database, opts?: { mode?: 'day' | 'week'; backfill?: boolean; from?: string } | 'day' | 'week'): Promise<{ ok: boolean; sections: number; bytes: number; fails?: string[] }> {
  const o: { mode: 'day' | 'week'; backfill?: boolean; from?: string } = typeof opts === 'string'
    ? { mode: opts === 'week' ? 'week' : 'day' }
    : { mode: (opts?.mode ?? 'day') === 'week' ? 'week' : 'day', backfill: opts?.backfill, from: opts?.from };
  const mode = o.mode;
  const today = bjDay();
  let from = today, to = today, date = today, titlePre = '跨境美妆爆款监控日报';
  if (mode === 'week') {
    if (o.from && /^\d{4}-\d{2}-\d{2}$/.test(o.from)) {
      from = o.from;
      const d = new Date(`${o.from}T00:00:00+08:00`);
      const su = new Date(d); su.setDate(su.getDate() + 7);
      to = su.toISOString().slice(0, 10);
      date = from;
    } else {
      const d = new Date(Date.now() + 8 * 36e5);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);   // 上周一
      from = d.toISOString().slice(0, 10);
      const su = new Date(d); su.setUTCDate(d.getUTCDate() + 7);
      to = su.toISOString().slice(0, 10);
      date = from;
    }
    titlePre = '跨境美妆爆款监控周报';
  }
  const jname = mode === 'day' ? 'trend-report' : 'trend-week-report';
  const noteOnly = async (status: string, note: string) => {
    await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES (?,?,?,datetime('now'),datetime('now'))`)
      .bind(jname, note, status).run().catch(() => {});
  };

  /* ── 素材装载:trends + ecom_items + ecom_trends 三路 ── */
  const { results } = await db.prepare(
    `SELECT title_zh, title_en, market, category, format, claim_tag, figure, source_name, source_url, so_what_zh, confidence
       FROM trends WHERE status='active' AND date(created_at) >= ? AND date(created_at) <= ?
      ORDER BY created_at LIMIT 250`
  ).bind(from, to).all<any>().catch(() => ({ results: [] as any[] }));

  /* ecom_items:当天(day)或窗口(week);窗口内没有则退到「此前最近一期采集」并如实标注日期 */
  let items: any[] = ((await db.prepare(
    `SELECT report_date,region,platform,category,subcategory,board,rank_no,title,brand,price,rating,reviews,rank_change,shop,url
       FROM ecom_items WHERE report_date >= ? AND report_date <= ? ORDER BY region, platform, rank_no LIMIT 1000`
  ).bind(from, to).all<any>()).results ?? []);
  let itemsDate = from; let itemsStale = false;
  if (!items.length) {
    const last = await db.prepare(
      `SELECT report_date FROM ecom_items ORDER BY report_date DESC LIMIT 1`).first<any>().catch(() => null);
    if (last?.report_date) {
      items = ((await db.prepare(
        `SELECT report_date,region,platform,category,subcategory,board,rank_no,title,brand,price,rating,reviews,rank_change,shop,url
           FROM ecom_items WHERE report_date = ? ORDER BY region, platform, rank_no LIMIT 1000`
      ).bind(last.report_date).all<any>()).results ?? []);
      itemsDate = String(last.report_date); itemsStale = true;
    }
  }
  /* ecom_trends 榜单链接(当天/窗口,给区域节补"可核对链接"素材) */
  const links = ((await db.prepare(
    `SELECT country,country_zh,category,platform,title,url,published FROM ecom_trends
      WHERE date(captured_at) >= ? AND date(captured_at) <= ? ORDER BY captured_at LIMIT 200`
  ).bind(from, to).all<any>()).results ?? []);

  const hasAny = results.length > 0 || items.length > 0 || links.length > 0;
  /* 补录模式(2026-10-23):采集中断时基于模型公开知识归纳行业主旋律,注明「补录」,绝不伪造品牌数字 */
  if (!hasAny) {
    if (!o.backfill) { await noteOnly('ok', `${mode} no data ${from}~${to}`); return { ok: true, sections: 0, bytes: 0 }; }
  }
  /* 10-23 修:原来 slice(0,3) 只取同一家 3 个子模型,一家限流就全军覆没。
     现在用全部 text provider(agnes 155 key + sensenova + nvidia 等),10亿 token/月随便跑。 */
  const fleet = gwFirst((await loadFleet(db, env)).filter((p: any) => p.keys?.length && !p.image));
  if (!fleet.length) { await noteOnly('fail', 'no fleet'); return { ok: false, sections: 0, bytes: 0 }; }
  const isBackfill = !!o.backfill && !hasAny;

  /* ── 素材压缩成行(每行 ≤ ~260 字,分节材料控制总长,避免一次 chat 塞爆) ── */
  const fmtItem = (r: any) => {
    const price = r.price ? `${r.price}` : '—';
    const rating = r.rating ? `★${r.rating}` : '';
    const reviews = r.reviews ? `(${r.reviews}评)` : '';
    return `${r.platform}/${r.subcategory || r.category} #${r.rank_no} ${r.title} | 品牌:${r.brand || '未知'} | 价格:${price} | ${rating}${reviews}`;
  };
  const fmtTrend = (r: any) => JSON.stringify({
    zh: r.title_zh, market: r.market, category: r.category, claim: r.claim_tag,
    figure: r.figure, source: r.source_name, why: r.so_what_zh,
  });
  const fmtLink = (r: any) => `${r.platform}/${r.country_zh}: ${r.title} — ${r.url}`;

  const byRegion = (it: any[], names: string[]) => it.filter((r) => names.some((n) => String(r.platform || '').includes(n)));
  const byCat = (it: any[], c: string) => it.filter((r) => String(r.category || '') === c);
  const j = (rows: string[], cap = 80) => rows.slice(0, cap).join('\n');

  /* ── 分节计划:每节 = {heading, prompt, material}。节失败跳过,节顺序即 ord。
        day 9 节 / week 13 节,达不到要求低的素材量时仍然生成(注明数据空档,不编造)。 ── */
  const nItem = items.length, nTrend = results.length, nLink = links.length;
  const overviewM = [
    `本期窗口 ${from} ~ ${to}:媒体趋势 ${nTrend} 条、单品榜 ${nItem} 条(数据日期 ${itemsDate}${itemsStale ? ',非窗口内最新一期' : ''})、榜单链接 ${nLink} 条。`,
    ...results.slice(0, 20).map(fmtTrend),
    ...items.slice(0, 40).map(fmtItem),
    ...links.slice(0, 20).map(fmtLink),
  ];
  const euItems = byRegion(items, ['Amazon', 'Temu', 'TikTok Shop（欧美）']);
  const seaItems = byRegion(items, ['Shopee', 'Lazada', 'TikTok Shop（东南亚）']);
  const saItems = byRegion(items, ['Mercado', 'TikTok Shop（南美）']);
  const skinItems = [...byCat(items, '护肤'), ...byCat(items, '防晒')];
  const otherItems = [...byCat(items, '口腔护理'), ...byCat(items, '身体护理'), ...byCat(items, '洗护')];
  const trendEU = results.filter((r) => ['us', 'gb', 'de', 'fr', 'es', 'mx', 'br'].includes(r.market));
  const trendAP = results.filter((r) => ['id', 'th', 'my', 'vn', 'ph', 'sg', 'jp', 'kr', 'in'].includes(r.market));
  const sub = (x: any[]) => x.slice(0, 70);

  type PlanSec = { heading: string; sys: string; mat: string };
  const secHead = (h: string) => `你现在写《${titlePre}(${date})》的固定一节,节标题就是【${h}】。`;
  const rules = (target: string) => `写作规则(必须遵守):
- 只基于下面给的素材,不编造品牌/数字/价格;素材里没有的字段(如销量)不要硬写。
- 每条分析落到品名+品牌层:品名、品牌、价格带、排名位置、与相邻排名/上周位置的对比;素材没给排位变化就写"本素材未记录环比"。
- 末尾给出 2-4 条面向化妆品 OEM/ODM 代工厂的选品启发(结合意象与代工可行性,属于分析,不算编造)。
- 多用量表格与无序列表;正文含 "###" 小标题;总长 1400-2600 字;${target}`;
  const titleSec: PlanSec = {
    heading: '本日要点摘要',
    sys: `${secHead('本日要点摘要')} 概述本期${mode === 'day' ? '日报' : '周报'}最重要的爆款信号。`,
    mat: rules('以中文学术化专业口吻写;不要市场废话;每条要点标出来源(平台/媒体名)。') + '\n\n素材:\n' + j(overviewM, 90).slice(0, 16000),
  };
  const regionSec = (name: string, its: any[], trs: any[], lks: any[]): PlanSec => ({
    heading: `${name} · 单品榜深度`,
    sys: `${secHead(`${name} · 单品榜深度`)} 对${name}市场做单品级分析。`,
    mat: rules(`若单品素材不足 10 条,如实写「本期${name}单品数据不足(仅N条)」,然后基于对应用媒体趋势与链接做区域观察;禁止补造单品。`)
      + `\n\n单品素材(${its.length} 条):\n` + j(its.map(fmtItem), 70).slice(0, 15000)
      + `\n\n媒体趋势(${trs.length} 条):\n` + j(trs.map(fmtTrend), 25).slice(0, 5000)
      + `\n\n榜单链接(${lks.length} 条):\n` + j(lks.map(fmtLink), 20).slice(0, 4000),
  });
  const catSec = (name: string, its: any[], trs: any[]): PlanSec => ({
    heading: `品类深读:${name}`,
    sys: `${secHead(`品类深读:${name}`)} 对这一品类做横向比较。`,
    mat: rules(`若单品不足 10 条,说明数据不足并基于媒体趋势写${name}动向。`)
      + `\n\n单品素材(${its.length} 条):\n` + j(its.map(fmtItem), 60).slice(0, 14000)
      + `\n\n媒体趋势(相关条目):\n` + j(trs.filter((r) => String(r.category || '').includes(name.slice(0, 2))).map(fmtTrend), 15).slice(0, 4000),
  });
  const plan: PlanSec[] = mode === 'day' ? [
    titleSec,
    regionSec('北美/欧洲', sub(euItems), sub(trendEU), links.filter((r) => ['us', 'de'].includes(r.country))),
    regionSec('东南亚', sub(seaItems), sub(trendAP), links.filter((r) => ['id', 'th', 'my', 'vn', 'ph', 'sg'].includes(r.country))),
    regionSec('南美', sub(saItems), sub(trendEU.filter((r) => r.market === 'br')), links.filter((r) => r.country === 'br')),
    catSec('护肤/防晒', sub(skinItems), sub(results)),
    catSec('口腔/身体/洗护', sub(otherItems), sub(results)),
    { heading: '媒体趋势综合', sys: `${secHead('媒体趋势综合')} 汇总媒体侧信号。`, mat: rules('按成分/品类/包装/营销概念分组;每条趋势给来源媒体名,媒体来源不充分就只写有的。') + '\n\n素材:\n' + j(results.map(fmtTrend), 80).slice(0, 14000) },
    { heading: '选品与代工机会清单', sys: `${secHead('选品与代工机会清单')} 面向跨境卖家的机会清单。`, mat: rules('每条机会附:机会点、依据(本报告素材)、参考价格带(仅当素材有价)、适合的品类代工方案。') + '\n\n可用素材回顾:\n' + j(overviewM, 60).slice(0, 12000) },
    { heading: '今日小结', sys: `${secHead('今日小结')} 收尾。`, mat: rules('180 字内:今天最值得动手的机会;如本报告素材源于历史采集,注明数据日期。') + '\n\n素材回顾:\n' + j(overviewM, 30).slice(0, 6000) },
  ] : [
    titleSec,
    regionSec('北美/欧洲', sub(euItems), sub(trendEU), links.filter((r) => ['us', 'de'].includes(r.country))),
    regionSec('东南亚', sub(seaItems), sub(trendAP), links.filter((r) => ['id', 'th', 'my', 'vn', 'ph', 'sg'].includes(r.country))),
    regionSec('南美', sub(saItems), sub(results.filter((r) => r.market === 'br')), links.filter((r) => r.country === 'br')),
    catSec('护肤', sub(byCat(items, '护肤')), sub(results)),
    catSec('防晒', sub(byCat(items, '防晒')), sub(results)),
    catSec('口腔护理', sub(byCat(items, '口腔护理')), sub(results)),
    catSec('身体护理/洗护', sub([...byCat(items, '身体护理'), ...byCat(items, '洗护')]), sub(results)),
    { heading: '媒体趋势综合 · 全球', sys: `${secHead('媒体趋势综合 · 全球')} 汇总媒体侧信号。`, mat: rules('按成分/品类/包装/营销概念分组,每条给来源媒体名;媒体空档如实说明。') + '\n\n素材:\n' + j(results.map(fmtTrend), 100).slice(0, 16000) },
    { heading: '榜单链接哨站', sys: `${secHead('榜单链接哨站')} 汇总可核对的公开榜单链接。`, mat: rules('按市场/平台分组列出链接与观察标题;无链接的市场说明空缺;保留原文标题与 URL,不重写事实。') + '\n\n素材:\n' + j(links.map(fmtLink), 120).slice(0, 16000) },
    { heading: '排名变化与黑马观察', sys: `${secHead('排名变化与黑马观察')} 分析榜单位次。`, mat: rules('只使用素材里的 rank_no 与排位信息;素材无环比时给出「黑马候选」判断并注明依据是绝对排名而非环比;不编造涨跌幅。') + '\n\n素材:\n' + j(items.map(fmtItem), 120).slice(0, 18000) },
    { heading: '选品与代工机会清单', sys: `${secHead('选品与代工机会清单')} 面向跨境卖家的机会清单。`, mat: rules('每条机会附:机会点、依据、参考价格带(仅当素材有价)、适合的品类代工方案;分区域分平台组织。') + '\n\n可用素材回顾:\n' + j(overviewM, 80).slice(0, 14000) },
    { heading: '本周小结', sys: `${secHead('本周小结')} 收尾。`, mat: rules('220 字内:本周最值得动手的机会;如素材源于历史采集,注明数据日期。') + '\n\n素材回顾:\n' + j(overviewM, 30).slice(0, 6000) },
  ];

  /* ── 逐节生成(顺序执行,免费网关限流;单节失败重试一次,仍失败跳过) ── */
  const secs: Array<{ lv: number; h: string; b: string }> = [];
  const fails: string[] = [];
  const genOnce = async (sec: PlanSec, isBackfill: boolean): Promise<string> => {
    const backfillNote = isBackfill ? '素材整体为空,本报告为补录:基于公开行业知识写这一节,不写具体品牌与数字,每条要点标注「(行业归纳)」。' : '';
    try {
      const reply = await chat(env, [
        { role: 'system', content: sec.sys + (isBackfill ? backfillNote : '') },
        { role: 'user', content: isBackfill ? '按补录说明写这一节。' : sec.mat.slice(0, 12000) },
      ], { fleet, json: false, maxTokens: 3200, timeoutMs: 70000 });
      return String((reply as any).text || '').trim();
    } catch (e) {
      throw e;   /* 让调用方决定是否重试 */
    }
  };
  for (let i = 0; i < plan.length; i++) {
    const sec = plan[i];
    const isFirst = i === 0;
    let body = '';
    try {
      body = await genOnce(sec, isBackfill).catch(() => '');
      if (body.length < 160) {
        /* 重试一次:免费网关限流抖动常见,退避 2 秒再打 */
        await new Promise((r) => setTimeout(r, 2000));
        body = await genOnce(sec, isBackfill).catch((e) => { fails.push(`${i}:${sec.heading}=retry-${e instanceof Error ? e.message.slice(0, 50) : 'exc'}`); return ''; });
      }
      if (body.length < 160) { fails.push(`${i}:${sec.heading}=short${body.length}`); continue; }
      const clean = body.replace(/^\s*#{1,3}\s*.{0,60}\n/, '').trim();
      const chunks: string[] = [];
      for (let off = 0; off < clean.length; off += 88000) chunks.push(clean.slice(off, off + 88000));
      secs.push({ lv: 2, h: sec.heading, b: chunks[0] });
      for (let ci = 1; ci < chunks.length; ci++) secs.push({ lv: 3, h: `${sec.heading}(续${ci})`, b: chunks[ci] });
    } catch (e) {
      fails.push(`${i}:${sec.heading}=${e instanceof Error ? e.message.slice(0, 40) : 'exc'}`);
      if (isFirst) break;
    }
  }
  if (!secs.length) { await noteOnly('fail', `${mode} ${date} all sections failed: ${fails.join(' | ').slice(0, 200)}`); return { ok: false, sections: 0, bytes: 0, fails }; }

  const title = isBackfill ? `${titlePre}（补录 ${date}）` : `${titlePre} ${date}`;
  const bytes = secs.reduce((s, x) => s + x.h.length + x.b.length, 0);

  /* ── 落库:meta.changes 检查,INSERT 后不应为 0(changes=0 = 参数/绑定事故,历史教训) ── */
  const up = await db.prepare(`INSERT INTO trend_reports (date,title,sections,bytes,source) VALUES (?,?,?,?,?)
      ON CONFLICT(date) DO UPDATE SET title=excluded.title, sections=excluded.sections, bytes=excluded.bytes, source=excluded.source`)
    .bind(date, title, secs.length, bytes, `cron:${mode}${isBackfill ? ':backfill' : ''}`).run().catch(() => null);
  if (!up || (up.meta && Number(up.meta.changes) < 1)) fails.push(`report-upsert=changes${up?.meta?.changes}`);
  /* 成本#3 C1 审核:DELETE + 逐段 INSERT 中间被打断会留下空报告;
     生成已在内存完成,这里用 db.batch() 让「删旧 + 插新」一次原子提交。 */
  const stmts = [
    db.prepare(`DELETE FROM trend_report_sections WHERE date = ?`).bind(date),
    ...secs.map((s, i) => db.prepare(`INSERT INTO trend_report_sections (date, ord, level, heading, body_md) VALUES (?,?,?,?,?)`)
      .bind(date, i, s.lv, s.h, s.b)),
  ];
  const bres = await db.batch(stmts).catch(() => null);
  let secOk = 0, secFail = 0;
  if (!bres) { secFail = secs.length; fails.push('sections-batch=fail'); }
  else {
    for (let i = 0; i < secs.length; i++) {
      const x = bres[i + 1];
      if (x && Number(x.meta?.changes) === 1) secOk++; else { secFail++; fails.push(`sec-ord${i}=changes${x?.meta?.changes}`); }
    }
  }
  await noteOnly(secOk ? 'ok' : 'fail',
    `${mode} ${date}: trends=${nTrend} items=${nItem}(${itemsDate}${itemsStale ? '-stale' : ''}) links=${nLink} file=${jname} secs=${secOk}/${secs.length} bytes=${bytes} fail=${secFail} ${fails.slice(0, 6).join(' | ').slice(0, 220)}`);
  return { ok: secOk > 0, sections: secOk, bytes, fails };
}

/** D1 备份到 123 云盘（每日 02:00 UTC） */
export async function runD1Backup(env: any, db: D1Database): Promise<void> {
  const TABLES = ['prospects','prospect_contacts','prospect_seeds','trends','ecom_trends','trend_reports','outreach_log','outreach_suppress','outreach_outbox','jobs'];
  const today = bjDay();
  let panDirID = 0;
  if (env.PAN123_CLIENT_ID) {
    try { const root=await listDir(env,0); panDirID=root.find((f:any)=>f.filename==='cosmetic-data')?.fileID ?? (await mkdir(env,'cosmetic-data',0)); } catch {
      await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('d1-backup',?,?,datetime('now'),datetime('now'))`).bind('123云盘目录不可用','fail').run().catch(()=>{});
      return;
    }
  } else {
    await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('d1-backup',?,?,datetime('now'),datetime('now'))`).bind('未配 PAN123_CLIENT_ID','fail').run().catch(()=>{});
    return;
  }

  const backup: Record<string,any> = {_backup_date:today, _tables:TABLES};
  let totalRows = 0;
  for (const table of TABLES) {
    try { const {results}=await db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 5000`).all<any>(); backup[table]=results||[]; totalRows+=(results?.length||0); }
    catch { backup[table]={_error:'failed'}; }
  }
  const fileName=`backup-d1-${today}.json`;
  try { await uploadJSON(env,panDirID,fileName,JSON.stringify(backup)); } catch {}
  await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('d1-backup',?,?,datetime('now'),datetime('now'))`).bind(`backup=${today} tables=${TABLES.length} rows=${totalRows}`,'ok').run().catch(()=>{});
}

/** 开发信自动生成（每日 06:00 UTC） */
export async function runOutreachAuto(env: any, db: D1Database): Promise<void> {
  /* 走网关优先:paidFirst 会把 agnes 排在最前,而那一家长期 402/429,
     chat() 试满 4 家就放弃,永远到不了可用的 bohui-gateway —— 10-26 报告
     全军覆没就是这条,开发信 10 月 0 封也是同一条。 */
  const fleet = gwFirst(paidFirst(await loadFleet(db, env)));
  if (!fleet.length) {
    await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('outreach-auto',?,?,datetime('now'),datetime('now'))`)
      .bind('no fleet key 无可用模型','fail').run().catch(()=>{});
    return;
  }

  const {results:prospects} = await db.prepare(
    `SELECT p.id,p.brand,p.website,p.country,p.market,p.icp_score,p.positioning,p.categories,p.contact_channels,p.hook
     FROM prospects p WHERE p.icp_score>=60 AND p.status='new'
       AND p.id NOT IN (SELECT prospect_id FROM outreach_log WHERE status IN ('draft','approved','sent','unknown'))
     ORDER BY p.icp_score DESC LIMIT 5`
  ).all<any>().catch(()=>({results:[] as any[]}));

  let generated=0, approved=0, skipped=0;
  let panDirID=0;
  if (env.PAN123_CLIENT_ID) { try { const root=await listDir(env,0); panDirID=root.find((f:any)=>f.filename==='cosmetic-data')?.fileID ?? (await mkdir(env,'cosmetic-data',0)); } catch {} }

  const PROMPT = `You are a cosmetics OEM/ODM factory sales assistant writing a cold outreach email. Write ONLY the email body (no subject), in English, ≤95 words. Open with a specific fact about the prospect's brand. One clear CTA. No MOQ/price/lead time. No "professional/high-quality/one-stop". End will be appended separately. Natural tone.`;
  const signOff = `BIOSPHERE · cosmetics OEM/ODM manufacturer · sales@biosphere-ai.com\nBusiness solicitation. Reply "unsubscribe" to opt out.`;

  for (const p of prospects) {
    try {
      let email='';
      try { const c=JSON.parse(p.contact_channels||'[]'); for(const ch of c){const m=String(ch).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);if(m&&!/no-?reply/i.test(m[0])){email=m[0].toLowerCase();break;}} } catch {}
      if (!email) { const c=await db.prepare('SELECT email FROM prospect_contacts WHERE prospect_id=? AND email IS NOT NULL LIMIT 1').bind(p.id).first<any>(); email=c?.email||''; }
      if (!email) { skipped++; continue; }

      const reply = await chat(env, [{role:'system',content:PROMPT},{role:'user',content:`Brand:${p.brand}\nWebsite:${p.website||'N/A'}\nCountry:${p.country||p.market}\nPositioning:${p.positioning||'N/A'}`}], {fleet, maxTokens:300, timeoutMs:20000}).catch(()=>({text:''}));
      const draftBody=String(reply.text||'').trim();
      if (draftBody.length<20) { skipped++; continue; }
      const fullBody=`${draftBody}\n\n${signOff}`;
      const subject=`Quick question about ${p.brand}'s product strategy`;

      const review=await reviewOutreach(env,db,fullBody,{brand:p.brand,website:p.website,country:p.country,market:p.market,positioning:p.positioning,hook:p.hook,categories:p.categories},undefined).catch(()=>({finalBody:fullBody,scores:[],consensus:''}));
      const topScore=review.scores?.length?Math.max(...review.scores.map(s=>s.score)):0;
      const status=topScore>=85?'approved':'draft';
      if (status==='approved') approved++;
      generated++;

      await db.prepare(`INSERT INTO outreach_log (prospect_id,contact_email,step,subject,body_text,status,created_at) VALUES (?,?,1,?,?,?,datetime('now'))`).bind(p.id,email,subject.slice(0,160),fullBody.slice(0,4000),status).run().catch(()=>{});
      await db.prepare(`UPDATE prospects SET status='outreached' WHERE id=?`).bind(p.id).run().catch(()=>{});

      if (panDirID && env.PAN123_CLIENT_ID) {
        try { await uploadJSON(env,panDirID,`outreach-${bjDay()}-${p.brand.replace(/\s/g,'')}.json`,JSON.stringify({prospect_id:p.id,brand:p.brand,email,subject,draft:draftBody,final_body:fullBody,scores:review.scores,top_score:topScore,status})); } catch {}
      }
    } catch { skipped++; }
  }
  await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('outreach-auto',?,?,datetime('now'),datetime('now'))`).bind(`generated=${generated} approved=${approved} skipped=${skipped}`,'ok').run().catch(()=>{});
}

/**
 * 买家信号雷达（2026-10-26）—— 创始人:「更快的获客 + 开源搜索 + AI」
 *
 * 与 prospect-mine 互补:那个抓榜单上的"已存在品牌",这个搜"正在行动的买家":
 * 刚发新品牌、公开说在找代工、拿到融资要扩品 —— 这些是有采购意图的实时信号。
 * 多源:AnySearch(主力,可替换成 Google News RSS / Reddit / SearXNG 任一路)。
 * AI 只留 icp_score>=40 的高意向,查重后直接进 prospects,进入 outreach 队列。
 */
export async function runBuyerRadar(env: any, db: D1Database): Promise<{ ok: boolean; scanned: number; added: number; note?: string }> {
  const fleet0 = await loadFleet(db, env);
  let fleet = gwFirst(paidFirst(fleet0));
  if (!fleet.length) fleet = gwFirst(fleet0 as any[]);
  if (!fleet.length) {
    await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('buyer-radar','no fleet','fail',datetime('now'),datetime('now'))`).run().catch(()=>{});
    return { ok: false, scanned: 0, added: 0, note: 'no fleet' };
  }
  /* 8 条高意图查询,每天轮换 4 条(免费档子请求有限,分两天覆盖) */
  const QUERIES = [
    '"launching new skincare brand" 2026 private label manufacturer',
    '"looking for a manufacturer" skincare brand OEM cosmetics',
    '"new beauty brand" launch 2026 cosmetics private label',
    'site:reddit.com "start my own skincare brand" manufacturer',
    'site:reddit.com "cosmetic manufacturer" recommendation OEM',
    '"private label skincare" new brand launch 2026',
    '"halal cosmetics" new brand Indonesia launch 2026',
    '"clean beauty" brand launch funding Series A 2026',
  ];
  const dayIdx = Math.floor(Date.now() / 86400000) % 2;
  const batch = QUERIES.slice(dayIdx * 4, dayIdx * 4 + 4);
  const today = bjDay();
  const PROMPT = `你是化妆品代工厂的B2B销售分析师。下面是一条高意图搜索查询的结果。判断哪些是"真实的潜在代工客户信号",只输出JSON数组:
[{"brand":"品牌名(没有就写unknown)","website":"品牌官网URL(没有留空)","market":"目标市场国家代码(us/gb/id/th/vn/sa/br/mx/de/jp/kr)","signal_type":"new_brand_launch|seeking_manufacturer|funding_expansion|product_launch","intent":"为什么是采购信号(≤50字)","fit":"为什么适合中国代工(≤40字)","icp_score":0-100}]
判定:1)刚发/即将发新品牌或新产品线;2)公开说在找制造商/OEM/ODM;3)融资要扩品;4)中小品牌。排除:招聘广告、纯媒体稿、大集团(欧莱雅/宝洁/联合利华等)、与化妆品无关。没有符合就输出 []。不要编造。`;
  let added = 0, scanned = 0;
  const diag: string[] = [];
  for (const q of batch) {
    try {
      const hits = await searchWeb(env, q, 8);
      if (!hits.length) { diag.push(`${q.slice(0,20)}=0hits`); continue; }
      scanned++;
      const feed = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet.slice(0, 200)}\n   ${h.url}`).join('\n');
      const reply = await chat(env, [{ role: 'system', content: PROMPT }, { role: 'user', content: `查询: ${q}\n\n结果:\n${feed.slice(0, 6000)}` }], { fleet, json: true, maxTokens: 2500, timeoutMs: 40000 }).catch(() => ({ text: '[]' }));
      let items: any[] = [];
      try { const raw = String(reply.text || '[]'); items = JSON.parse(raw.includes('[') ? raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1) : '[]'); if (!Array.isArray(items)) items = []; } catch { diag.push(`${q.slice(0,14)}=jsonfail`); continue; }
      diag.push(`${q.slice(0,14)}=${hits.length}h/${items.length}i${items.length ? '(' + items.map((x:any)=>x.icp_score).join(',') + ')' : ''}`);
      /* 规则兜底(2026-10-26):免费模型时好时坏,AI 返回空时用关键词规则从搜索结果直接捞信号,
         不让"模型抽风"变成"今天零线索"。 */
      if (!items.length) {
        const SIG = /(looking for|need|seeking|recommend|anyone know|how to find).{0,40}(manufacturer|supplier|OEM|ODM|private label|factory)|(start|launch|create).{0,30}(my own|a new|brand)|(private label|OEM|ODM).{0,30}(brand|launch|new)/i;
        for (const h of hits) {
          if (!SIG.test(h.title + ' ' + h.snippet)) continue;
          items.push({ brand: 'unknown', website: h.url, market: 'us', signal_type: 'seeking_manufacturer', intent: h.title.slice(0, 80), fit: '公开讨论找代工/开品牌信号', icp_score: 55 });
          if (items.length >= 3) break;
        }
        if (items.length) diag.push('rulefallback+' + items.length);
      }
      for (const it of items) {
        const rawBrand = String(it.brand || '').trim();
        const score = Number(it.icp_score) || 0;
        if (score < 40) continue;
        /* Reddit 求代工帖通常没有品牌名 —— 用信号摘要做标识入库,不丢最热的线索 */
        const brand = (rawBrand.length >= 2 && rawBrand.toLowerCase() !== 'unknown')
          ? rawBrand
          : `Reddit信号:${String(it.intent || q).replace(/\s+/g, ' ').slice(0, 28)}`;
        const dup = await db.prepare(`SELECT id FROM prospects WHERE lower(brand)=lower(?) LIMIT 1`).bind(brand).first<any>().catch(() => null);
        if (dup) continue;
        /* website NOT NULL:没官网用品牌哨兵值占位,否则约束违反静默丢线索(2026-10-28 审核 H3) */
        const wsite = String(it.website || '').slice(0, 200)
          || (hits[0]?.url ? String(hits[0].url).slice(0, 200) : `unknown://radar/${encodeURIComponent(brand.slice(0, 40))}`);
        const insR = await db.prepare(`INSERT INTO prospects (brand, website, market, segment, categories, positioning, channels, mfg_signal, expansion_signal, contact_channels, icp_score, icp_reason, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
          .bind(brand.slice(0, 80), wsite, String(it.market || '').slice(0, 8) || 'us', '品牌方', '[]', String(it.fit || '').slice(0, 300) || null, '[]', null, String(it.signal_type || '').slice(0, 40), '[]', score, String(it.intent || '').slice(0, 500) || null, `radar:${String(it.signal_type || 'signal')}`, 'new').run().catch(() => null);
        if (insR) added++;   /* 只在真正入库后计数 */
      }
    } catch { /* 单查询失败不影响其他 */ }
  }
  const r = await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('buyer-radar',?,?,datetime('now'),datetime('now'))`).bind(`${'queries='}${batch.length} scanned=${scanned} added=${added} day=${today}`, 'ok').run().catch((e: any) => ({ err: String(e).slice(0, 120) }));
  return { ok: true, scanned, added, note: `queries=${batch.length} ${(r as any)?.err ? 'jobErr:' + (r as any).err : 'heartbeat-ok'} diag=${diag.join('|').slice(0,300)}` };
}
