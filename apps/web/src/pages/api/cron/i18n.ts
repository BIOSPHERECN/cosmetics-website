import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { TARGETS } from '../../../lib/translate';

export const prerender = false;

/**
 * 选品台内容的多语「派工 / 交工」接口 —— 给 GitHub Actions 的翻译工人用。
 *
 * 为什么翻译不在 Worker 里做:
 *   ① Agnes 封了 Cloudflare Worker 的出口 IP(4ms 就 429/1015),舰队只剩商汤扛;
 *   ② Worker 单次调用有 50 个子请求的天花板,17 语 × 上百条 = 必然撞墙;
 *   ③ 翻译是可以慢慢跑的批活,天生适合定时任务,不该占客户请求的时间。
 * 所以模型调用挪到 GitHub(那边直连 Agnes 畅通),Worker 只做两件小事:
 *   GET  → 给一批「还没译的」原文
 *   POST → 收翻译结果写库
 * 工人手里只有 CRON_KEY 与模型 key,拿不到 D1 凭据。
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function guard(request: Request): Response | null {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  return null;
}

/** 源语言是中文;英文由模型直接从中文译,不做二次转译(转译会丢细节) */
const LANGS = Object.keys(TARGETS).filter((l) => l !== 'zh-cn');

type Item = { ref_type: string; ref_code: string; fields: Record<string, string> };

/** 三张事实表里真正需要翻译的字段(编号、剂型、市场代码这些不译) */
async function sources(db: D1Database): Promise<Item[]> {
  const out: Item[] = [];
  const f = await db.prepare(
    `SELECT code, texture, cert_notes, ai_summary FROM formulas WHERE status IN ('sample','active')`).all<any>();
  for (const r of f.results ?? []) {
    const fields: Record<string, string> = {};
    if (r.texture) fields.texture = r.texture;
    if (r.cert_notes) fields.cert_notes = r.cert_notes;
    if (r.ai_summary) fields.ai_summary = r.ai_summary;
    if (Object.keys(fields).length) out.push({ ref_type: 'formula', ref_code: r.code, fields });
  }
  const p = await db.prepare(
    `SELECT code, notes_zh, sustainability, decoration FROM packaging WHERE status IN ('sample','active')`).all<any>();
  for (const r of p.results ?? []) {
    const fields: Record<string, string> = {};
    if (r.notes_zh) fields.notes = r.notes_zh;
    if (r.sustainability) fields.sustainability = r.sustainability;
    if (r.decoration) fields.decoration = r.decoration;
    if (Object.keys(fields).length) out.push({ ref_type: 'packaging', ref_code: r.code, fields });
  }
  const t = await db.prepare(
    `SELECT id, title_zh, so_what_zh FROM trends WHERE status='active'`).all<any>();
  for (const r of t.results ?? []) {
    const fields: Record<string, string> = {};
    if (r.title_zh) fields.title = r.title_zh;
    if (r.so_what_zh) fields.so_what = r.so_what_zh;
    if (Object.keys(fields).length) out.push({ ref_type: 'trend', ref_code: String(r.id), fields });
  }
  return out;
}

export const GET: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const url = new URL(request.url);
  const want = Math.min(Math.max(Number(url.searchParams.get('n')) || 12, 1), 40);
  const onlyLang = url.searchParams.get('lang');
  const langs = onlyLang && LANGS.includes(onlyLang) ? [onlyLang] : LANGS;

  const src = await sources(db);
  /* 已有的翻译一次查出来放集合里比对 —— 逐条 SELECT 会把子请求预算烧光 */
  const done = new Set<string>();
  const have = await db.prepare(
    `SELECT ref_type, ref_code, lang, field FROM catalog_i18n`).all<any>();
  for (const r of have.results ?? []) done.add(`${r.ref_type}|${r.ref_code}|${r.lang}|${r.field}`);

  const jobs: { ref_type: string; ref_code: string; lang: string; hint: string; fields: Record<string, string> }[] = [];
  outer:
  for (const lang of langs) {
    for (const s of src) {
      const missing: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.fields)) {
        if (!done.has(`${s.ref_type}|${s.ref_code}|${lang}|${k}`)) missing[k] = v;
      }
      if (!Object.keys(missing).length) continue;
      jobs.push({ ref_type: s.ref_type, ref_code: s.ref_code, lang, hint: TARGETS[lang]?.hint ?? '', fields: missing });
      if (jobs.length >= want) break outer;
    }
  }
  const totalPairs = src.length * langs.length;
  return json({ ok: true, jobs, remaining_rows: totalPairs - Math.floor(done.size / 2), langs: langs.length });
};

export const POST: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const b = (await request.json().catch(() => ({}))) as {
    items?: { ref_type?: string; ref_code?: string; lang?: string; fields?: Record<string, string> }[];
  };
  const items = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
  if (!items.length) return json({ ok: false, msg: 'items 为空' }, 400);

  const stmts: D1PreparedStatement[] = [];
  const ins = db.prepare(
    `INSERT INTO catalog_i18n (ref_type, ref_code, lang, field, text, mt, updated_at)
     VALUES (?,?,?,?,?,1,datetime('now'))
     ON CONFLICT(ref_type, ref_code, lang, field)
     DO UPDATE SET text=excluded.text, mt=1, updated_at=datetime('now')`);
  for (const it of items) {
    const type = String(it.ref_type ?? '');
    const code = String(it.ref_code ?? '');
    const lang = String(it.lang ?? '');
    if (!['formula', 'packaging', 'trend'].includes(type)) continue;
    if (!code || !TARGETS[lang]) continue;
    for (const [field, text] of Object.entries(it.fields ?? {})) {
      const s = String(text ?? '').trim();
      if (!s || s.length > 1200) continue;
      stmts.push(ins.bind(type, code, lang, field.slice(0, 24), s));
    }
  }
  if (!stmts.length) return json({ ok: false, msg: '没有可写入的字段' }, 400);
  /* D1 batch 一次提交:60 条翻译 = 1 个子请求,不是 60 个 */
  await db.batch(stmts);
  return json({ ok: true, written: stmts.length });
};
