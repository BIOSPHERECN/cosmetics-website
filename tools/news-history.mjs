/**
 * 行业资讯历史回填驱动器(完全体)——「先搜寻 2-3 年前的,按时间轴搜索发布,先准备 200」。
 *
 * 管线:CDX 按月列行业站文章页存档 → 逐条取快照 HTML →
 *       抽 og:title / og:description / article:published_time(**真实发布日**)→
 *       发布日落在目标月才收 → POST /api/cron/news {leads} 改写发布。
 * 为什么逐条取页面:首次存档时间 ≠ 发布日(实测 2017 老文 2024 才被爬),
 * 只有页面 meta 里的日期是真的 ——「发布时间要和新闻一致」是硬红线。
 * 启动需带代理:NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:1082
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const BASE = 'https://biosphere-ai.com';
const TARGET = 900;   // 创始人:「增加到800-1000,真的成为专业的行业资讯」
const PER_MONTH_CAP = 15;
const CAND_PER_MONTH = 40;   // 80 实测单月扫不完(8分钟净增0),40 已够挖满月上限      // 每月最多翻这么多候选页,凑够线索就停

const env = readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8');
const KEY = /^CRON_KEY=(.+)$/m.exec(env)[1].trim();

/* 断点续跑:整轴要 ~90 分钟,单任务上限 10 分钟 ——
   进度存文件,每次最多跑 MAX_RUN_MS 就自己退出,唤醒循环接力续跑。 */
const PROG = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/news-history.progress';
const MAX_RUN_MS = 8 * 60_000;
const startedAt = Date.now();
let doneUntil = '';
try { doneUntil = readFileSync(PROG, 'utf8').trim(); } catch {}

/* skip:该源已被前几遍消化的 CDX 头部行数(排序稳定,重抓=纯浪费);新源从 0 起 */
const SITES = [
  { prefix: 'cosmeticsbusiness.com/news/*', source: 'Cosmetics Business', skip: 22 },
  { prefix: 'premiumbeautynews.com/en/*', source: 'Premium Beauty News', skip: 22 },
  { prefix: 'cosmeticsdesign-europe.com/Article/*', source: 'CosmeticsDesign Europe', skip: 0 },
  { prefix: 'happi.com/contents/*', source: 'Happi', skip: 0 },
];

const meta = (html, re) => re.exec(html)?.[1]?.trim() ?? '';
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

async function harvestMonth(after, before) {
  const from = after.replace(/-/g, ''), to = before.replace(/-/g, '');
  const t0 = Date.parse(after), t1 = Date.parse(before) + 86400_000;
  const leads = [];
  for (const s of SITES) {
    if (leads.length >= PER_MONTH_CAP + 5) break;
    let rows = [];
    try {
      rows = await (await fetch(
        `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(s.prefix)}&from=${from}&to=${to}`
        + `&output=json&filter=statuscode:200&collapse=urlkey&limit=${CAND_PER_MONTH}`,
        { signal: AbortSignal.timeout(90000) },
      )).json();
    } catch (e) { console.log(`    cdx ★ ${s.source} ${String(e.message ?? e).slice(0, 40)}`); continue; }

    for (const row of (rows ?? []).slice(1 + (s.skip ?? 0))) {
      if (leads.length >= PER_MONTH_CAP + 5) break;
      /* 时限检查必须下沉到候选循环:只在月间检查时,一个慢月(几十个候选
         各超时 60s)能把整段拖死在里面 —— 实测段 3 就陷在 2024-05。 */
      if (Date.now() - startedAt > MAX_RUN_MS) break;
      const [, ts, original] = row;
      try {
        const html = await (await fetch(`https://web.archive.org/web/${ts}id_/${original}`,
          { signal: AbortSignal.timeout(25000) })).text();
        const pub = meta(html, /article:published_time"?\s+content="([^"]+)"/i)
          || meta(html, /"datePublished"\s*:\s*"([^"]+)"/i);
        const t = Date.parse(pub);
        if (!Number.isFinite(t) || t < t0 || t >= t1) continue;   // 发布日不在本月 → 丢
        const title = dec(meta(html, /og:title"?\s+content="([^"]+)"/i));
        const snippet = dec(meta(html, /og:description"?\s+content="([^"]+)"/i)).slice(0, 350);
        if (!title || title.length < 8) continue;
        /* 正文节选:快照本身就是全文页 —— <p> 聚合做深度稿底料
           (创始人对标 premiumbeautynews:「内容编辑的太少了」)。
           只取 >40 字符的段,滤掉导航/版权碎屑;上限 3200 字。 */
        const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
          .map((m) => dec(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
          .filter((p) => p.length > 40);
        const excerpt = paras.join('\n').slice(0, 3200);
        leads.push({
          title, link: original, source: s.source, topic: 'industry',
          date: new Date(t).toUTCString(), snippet, excerpt,
        });
      } catch { /* 单页失败跳过 */ }
    }
  }
  return leads;
}

const months = [];
for (let y = 2021, m = 1; y < 2026 || (y === 2026 && m <= 7); m === 12 ? (y++, m = 1) : m++) {
  const mm = String(m).padStart(2, '0');
  months.push({ after: `${y}-${mm}-01`, before: `${y}-${mm}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}` });
}

let total = d1('SELECT COUNT(*) n FROM news')[0].n;
console.log(`时间轴 ${months[0].after} → ${months.at(-1).before}(${months.length} 月);起点 ${total},目标 ${TARGET}`);

for (const r of months) {
  if (total >= TARGET) { console.log('已达目标,收工'); break; }
  if (doneUntil && r.after <= doneUntil) continue;          // 断点之前的月份跳过
  if (Date.now() - startedAt > MAX_RUN_MS) { console.log(`本次时限已到,断点 ${doneUntil},下次续跑`); break; }
  const leads = await harvestMonth(r.after, r.before);
  if (!leads.length) {
    console.log(`${r.after.slice(0, 7)}  无合格线索`);
    doneUntil = r.after; writeFileSync(PROG, doneUntil, 'utf8');   // 空月也记进度,别反复重扫
    continue;
  }
  try {
    const res = await fetch(`${BASE}/api/cron/news/`, {
      method: 'POST',
      headers: { 'x-cron-key': KEY, origin: BASE, 'content-type': 'application/json' },
      body: JSON.stringify({ cap: Math.min(PER_MONTH_CAP, TARGET - total), after: r.after, before: r.before, leads }),
      signal: AbortSignal.timeout(280_000),
    });
    const j = await res.json().catch(() => ({}));
    total += j.inserted ?? 0;
    console.log(`${r.after.slice(0, 7)}  线索${String(leads.length).padStart(2)} 入${j.inserted ?? '?'} 滤${j.skipped ?? '?'}  累计 ${total}`);
    doneUntil = r.after; writeFileSync(PROG, doneUntil, 'utf8');
  } catch (e) { console.log(`${r.after.slice(0, 7)}  ★ ${String(e.message ?? e).slice(0, 50)}`); }
}
const stock = d1('SELECT COUNT(*) n FROM news')[0].n;
console.log(`完成:库存 ${stock} 条`);
/* 段摘要追加到固定日志 —— 计划任务模式下的「动静」都在这里,一眼看进度 */
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/news-history.log',
  `${new Date().toISOString().slice(0, 16)}  断点 ${doneUntil || '(起点)'}  库存 ${stock}/${TARGET}\n`,
  { flag: 'a' });
