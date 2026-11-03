import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { putMedia, type StorageEnv } from '../../../lib/storage';

export const prerender = false;

/**
 * 资讯配图工 —— 创始人:「图片丢到 Agnes 重新生成,每个新闻图文并茂」。
 * 不碰原站图(版权),按标题主题让 Agnes 画**编辑插画风**封面:
 * 抽象化妆品元素、柔和渐变、无文字无 logo 无真人 —— 品牌安全。
 * 异步批处理:每轮补 N 张 cover 为空的,计划任务 15 分钟一班,
 * 新文章入库后最迟一刻钟就有图。图片经 putMedia 落 R2(hosonzuo 桶)。
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const STYLE: Record<string, string> = {
  ingredient: 'botanical extracts, laboratory glass, droplets and leaves',
  tech: 'futuristic cosmetic lab, holographic interface, molecular structures',
  product: 'elegant cosmetic bottles and jars still life',
  brand: 'premium retail shelf, abstract storefront, soft spotlight',
  regulation: 'documents, stamp and scales motif with cosmetic bottles',
  industry: 'factory line, packaging, global supply chain motif',
};

export const POST: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || !timingSafeEqual(request.headers.get('x-cron-key') ?? '', key)) {
    return new Response(JSON.stringify({ ok: false }), { status: 403 });
  }
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return new Response(JSON.stringify({ ok: false, msg: 'no db' }), { status: 500 });

  const agnes = await db.prepare(`SELECT base_url, api_keys FROM providers WHERE id='agnes'`)
    .first<{ base_url: string; api_keys: string }>();
  if (!agnes?.api_keys) return new Response(JSON.stringify({ ok: false, msg: 'agnes 未配置' }), { status: 503 });
  const AKEY = agnes.api_keys.split(',')[0].trim();
  const ABASE = agnes.base_url.replace(/\/+$/, '');

  const { results: rows } = await db.prepare(
    `SELECT id, topic, title_en, title_zh FROM news
      WHERE is_published = 1 AND cover_media IS NULL ORDER BY id DESC LIMIT 6`,
  ).all<any>();

  let done = 0;
  const errors: string[] = [];
  for (const n of rows ?? []) {
    try {
      const prompt =
        `Editorial illustration for a beauty industry news article about: ${n.title_en || n.title_zh}. ` +
        `Style: modern magazine cover art, ${STYLE[n.topic] ?? STYLE.industry}, ` +
        `soft ivory and sage color palette, abstract, premium, clean composition, ` +
        `no text, no letters, no logos, no real people, no brand marks. Wide 3:2 format.`;
      const r = await fetch(`${ABASE}/images/generations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${AKEY}` },
        body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, n: 1, size: '1536x1024' }),
        signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error(`agnes ${r.status}`);
      const d = (await r.json() as any).data?.[0];
      const buf = d?.b64_json
        ? Uint8Array.from(atob(d.b64_json), (c) => c.charCodeAt(0)).buffer
        : await (await fetch(d.url, { signal: AbortSignal.timeout(60000) })).arrayBuffer();
      const stored = await putMedia(env as unknown as StorageEnv, { body: buf, mime: 'image/png' });
      const m = await db.prepare(
        `INSERT INTO media (r2_key, filename, mime, bytes, folder, alt_zh, driver, url)
         VALUES (?,?,?,?,?,?,'r2',NULL) RETURNING id`,
      ).bind(stored.key, stored.key.split('/').pop(), 'image/png', buf.byteLength,
        '资讯配图', `${n.title_zh ?? ''} · AI 插画封面`).first<{ id: number }>();
      await db.prepare(`UPDATE news SET cover_media=? WHERE id=?`).bind(m!.id, n.id).run();
      done++;
    } catch (e) { errors.push(`#${n.id}: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }
  return new Response(JSON.stringify({ ok: true, done, pending: (rows ?? []).length - done, errors }),
    { headers: { 'content-type': 'application/json' } });
};
