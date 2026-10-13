import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { chat, loadFleet, paidFirst } from '../../../lib/fleet';
import { uploadJSON, mkdir, listDir } from '../../../lib/pan123-client';

export const prerender = false;

/**
 * 爆款趋势收集 cron —— 每日 04:00 UTC 跑一次，抓美妆媒体趋势页 → AI 抽趋势 → D1 + 123云盘。
 * 跟 prospect-mine 同模式：Worker fetch SSR 页面 → AI 提取 → D1 轻量行 + 云盘全文。
 *
 * 趋势源（SSR 可 fetch 的美妆媒体）：
 *   Vogue/Elle/Allure/Beautymatter/Cosmopolitan 的趋势榜单页
 *   按市场分批：美/欧/东南亚/中东/大洋洲 轮转。
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function guard(request: Request): Response | null {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  return null;
}

/** 趋势源：按市场分组的美妆媒体趋势页 URL */
const TREND_SOURCES: { market: string; url: string; source: string }[] = [
  { market: 'us', url: 'https://www.allure.com/beauty-trends', source: 'Allure' },
  { market: 'us', url: 'https://www.elle.com/beauty/', source: 'Elle' },
  { market: 'us', url: 'https://www.cosmopolitan.com/style-beauty/beauty/', source: 'Cosmo' },
  { market: 'gb', url: 'https://www.vogue.co.uk/beauty', source: 'Vogue UK' },
  { market: 'id', url: 'https://www.femaledaily.com/best-of-beauty', source: 'FemaleDaily' },
  { market: 'th', url: 'https://www.beautymatter.com/trends', source: 'BeautyMatter' },
  { market: 'au', url: 'https://www.beautyheaven.com.au/trends', source: 'BeautyHeaven' },
  { market: 'jp', url: 'https://www.vogue.jp/beauty/', source: 'Vogue JP' },
  { market: 'kr', url: 'https://www.allurekorea.com/beauty-trends', source: 'Allure KR' },
  { market: 'sa', url: 'https://www.vogueme.com/beauty/', source: 'Vogue ME' },
  { market: 'br', url: 'https://vogue.globo.com/moda-beleza/', source: 'Vogue BR' },
  { market: 'mx', url: 'https://www.elle.com/mx/beauty/', source: 'Elle MX' },
];

const PROMPT = `你是一位化妆品行业趋势分析师。下面是一篇美妆媒体网页正文。把里面提到的当前/即将流行的化妆品趋势逐个抽出来，只输出 JSON 数组：
[{"title_zh":"趋势中文标题(≤20字)","title_en":"英文原标题","category":"护肤/彩妆/洗护/香氛/工具","format":"成分/品类/包装/营销概念","claim_tag":"功效宣称(如维C/烟酰胺/防晒)","figure":"正文里的数字(如增长X%)","source_name":"媒体名","source_url":"来源URL","source_date":"日期","so_what_zh":"一句话为什么重要(≤40字)","confidence":"high/medium/low"}]
没有趋势就输出 []。不要编造。`;

const bjDay = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);

export const GET: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const fleet = paidFirst(await loadFleet(db, env));
  if (!fleet.length) return json({ ok: false, msg: 'no fleet' }, 500);

  // 选 5 个源（按 UTC 日期轮转，每天不同批）
  const dayIdx = Math.floor(Date.now() / 86400000) % 3;
  const batch = TREND_SOURCES.slice(dayIdx * 4, dayIdx * 4 + 4);

  const today = bjDay();
  let collected = 0, skipped = 0;

  // 123 云盘目录
  let panDirID = 0;
  if ((env as any).PAN123_CLIENT_ID) {
    try {
      const root = await listDir(env, 0);
      panDirID = root.find((f: any) => f.filename === 'cosmetic-data')?.fileID ?? (await mkdir(env, 'cosmetic-data', 0));
    } catch {}
  }

  for (const src of batch) {
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiosphereBot/1.0; +https://biosphere-ai.com/)' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      }).catch(() => null);
      if (!res || !res.ok) { skipped++; continue; }
      const html = await res.text().catch(() => '');
      if (html.length < 500) { skipped++; continue; }

      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12000);
      if (text.length < 200) { skipped++; continue; }

      const reply = await chat(env, [
        { role: 'system', content: PROMPT },
        { role: 'user', content: text.slice(0, 8000) },
      ], { fleet, json: true, maxTokens: 2000, timeoutMs: 30000 }).catch(() => ({ text: '[]' }));

      let trends: any[] = [];
      try {
        const raw = String(reply.text || '[]');
        trends = JSON.parse(raw.includes('[') ? raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1) : '[]');
        if (!Array.isArray(trends)) trends = [];
      } catch { skipped++; continue; }

      collected += trends.length;

      // 全文存 123 云盘
      const fileName = `trend-${today}-${src.market}-${src.source.replace(/\s/g,'')}.json`;
      const fullData = JSON.stringify({ url: src.url, market: src.market, source: src.source, date: today, text_sample: text.slice(0, 2000), trends });
      let coldRef = '';
      if (panDirID && (env as any).PAN123_CLIENT_ID) {
        try { const fid = await uploadJSON(env, panDirID, fileName, fullData); coldRef = `pan123:${fid}`; } catch {}
      }

      // D1 只存轻量行
      for (const t of trends) {
        const tz = String(t.title_zh || '').trim();
        if (tz.length < 2) continue;
        await db.prepare(
          `INSERT INTO trends (title_zh, title_en, market, category, format, claim_tag, figure, source_name, source_url, source_date, so_what_zh, confidence, status, media_state, created_at, product_name, ref_url)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active','pending',datetime('now'),?,?)`,
        ).bind(
          tz.slice(0, 200),
          String(t.title_en || '').slice(0, 200) || null,
          src.market,
          String(t.category || '').slice(0, 40) || null,
          String(t.format || '').slice(0, 40) || null,
          String(t.claim_tag || '').slice(0, 100) || null,
          String(t.figure || '').slice(0, 100) || null,
          src.source,
          src.url,
          String(t.source_date || today).slice(0, 20),
          String(t.so_what_zh || '').slice(0, 500) || null,
          String(t.confidence || 'medium').slice(0, 10),
          String(t.product_name || '').slice(0, 160) || null,
          coldRef ? `pan123:${coldRef}` : src.url,
        ).run().catch(() => {});
      }
    } catch { skipped++; }
  }

  // 记心跳
  await db.prepare(
    `INSERT INTO jobs (name, note, status, heartbeat_at, started_at) VALUES ('trend-collect', ?, 'ok', datetime('now'), datetime('now'))`,
  ).bind(`batch=${dayIdx} collected=${collected} skipped=${skipped}`).run().catch(() => {});

  return json({ ok: true, collected, skipped, batch: dayIdx });
};
