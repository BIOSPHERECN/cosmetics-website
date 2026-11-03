/**
 * 薄稿升级驱动器:每轮取 6 条 body_zh<500 字且来源可抓的存量,
 * 抓原文(原站直连 → 404/失败落 Wayback 最近快照)抽 <p> 底料,
 * POST /api/cron/news-upgrade 按现行深度稿标准重写(worker 端校验闸门把关)。
 * 无可升条目时秒退 —— 计划任务空转无害。
 * 启动带代理:NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:1082
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

/* 抓不到底料的条目记本地跳过表 —— 不污染库(改 source_url 会弄断详情页来源链接) */
const SKIP_FILE = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/news-upgrade-skip.txt';
let skip = new Set();
try { skip = new Set(readFileSync(SKIP_FILE, 'utf8').split(/\r?\n/).filter(Boolean).map(Number)); } catch {}

const BASE = 'https://biosphere-ai.com';
const KEY = /^CRON_KEY=(.+)$/m.exec(readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8'))[1].trim();

const dec = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

const paras = (html) => [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
  .map((m) => dec(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
  .filter((p) => p.length > 40).join('\n').slice(0, 3200);

async function grab(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000),
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36' } });
    if (r.ok) { const ex = paras(await r.text()); if (ex.length > 400) return ex; }
  } catch {}
  try {   // 原站失效 → Wayback 最近快照
    const cdx = await (await fetch(
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&filter=statuscode:200&limit=1&fastLatest=true`,
      { signal: AbortSignal.timeout(40000) })).json();
    const ts = cdx?.[1]?.[1];
    if (!ts) return '';
    const ex = paras(await (await fetch(`https://web.archive.org/web/${ts}id_/${url}`,
      { signal: AbortSignal.timeout(40000) })).text());
    return ex.length > 400 ? ex : '';
  } catch { return ''; }
}

/* 可抓型来源:真实文章 URL(聚合跳转链 news.google/bing 抓不到,跳过) */
const rows = d1(`SELECT id, source_url FROM news
  WHERE is_published = 1 AND length(body_zh) < 500
    AND source_url NOT LIKE '%news.google%' AND source_url NOT LIKE '%bing.com%'
  ORDER BY id LIMIT 20`).filter((r) => !skip.has(r.id)).slice(0, 6);
if (!rows.length) { console.log('无可升级薄稿,收工'); process.exit(0); }

const upgrades = [];
for (const r of rows) {
  const excerpt = await grab(r.source_url);
  console.log(`#${r.id} ${excerpt.length > 400 ? '底料 ' + excerpt.length + '字' : '抓取失败,跳过'}`);
  if (excerpt.length > 400) upgrades.push({ id: r.id, excerpt });
  else appendFileSync(SKIP_FILE, r.id + '\n');
}

if (upgrades.length) {
  const res = await fetch(`${BASE}/api/cron/news-upgrade/`, {
    method: 'POST',
    headers: { 'x-cron-key': KEY, origin: BASE, 'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 bohui-cron/1.0' },
    body: JSON.stringify({ upgrades }),
    signal: AbortSignal.timeout(280_000),
  });
  const j = await res.json().catch(() => ({}));
  console.log(`升级 ${j.done}/${upgrades.length}${(j.errors ?? []).length ? ' 错:' + j.errors.join(' | ').slice(0, 200) : ''}`);
}
