/**
 * 免费图库检索与导入 —— 只收可商用、免署名的授权。
 *
 * 为什么不直接用搜索引擎搜到的图:
 *   那些默认受版权保护。贴到对外的商业站上是给公司留法律风险,
 *   而且这种风险不会立刻爆,会在站点做起来、被人注意到之后才爆 —— 那时更难收拾。
 *   CC0 与公有领域的效果一样,但没有这个尾巴。
 *
 * 图源用 Openverse(WordPress 官方维护的 CC 图库聚合),无需 API key。
 * 只放行 cc0 / pdm 两种授权:可商用、可修改、免署名。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/** 只认这两种 —— CC-BY 之类要署名,挂在企业站上是长期负担,不值得为省事引进来 */
const OK_LICENSE = new Set(['cc0', 'pdm']);
const MAX_BYTES = 900_000; // 与上传接口一致:D1 单值上限留余量

export const GET: APIRoute = async ({ request, url }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return json({ ok: false, msg: '请输入检索词' }, 400);

  const api = new URL('https://api.openverse.org/v1/images/');
  api.searchParams.set('q', q);
  api.searchParams.set('license', 'cc0,pdm');
  api.searchParams.set('page_size', '24');
  api.searchParams.set('mature', 'false');
  // 只要够大的图 —— 小图放进首屏会糊,提前筛掉省得人白挑
  api.searchParams.set('size', 'large');

  try {
    const r = await fetch(api, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) return json({ ok: false, msg: `图库返回 ${r.status}` }, 502);
    const d = (await r.json()) as any;
    return json({
      ok: true,
      total: d.result_count ?? 0,
      list: (d.results ?? [])
        .filter((x: any) => OK_LICENSE.has(String(x.license).toLowerCase()))
        .map((x: any) => ({
          id: x.id,
          title: x.title ?? '',
          creator: x.creator ?? '',
          license: `${x.license}${x.license_version ? ' ' + x.license_version : ''}`,
          w: x.width, h: x.height,
          thumb: x.thumbnail,
          url: x.url,
          source: x.foreign_landing_url ?? x.url,
        })),
    });
  } catch (e) {
    return json({ ok: false, msg: `检索失败:${e instanceof Error ? e.message.slice(0, 120) : String(e)}` }, 502);
  }
};

/** 导入:服务端取图存库。走服务端是因为图库主机不给跨域,浏览器读不到像素 */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  try {
    const { items, folder = 'stock' } = (await request.json()) as {
      items: { url: string; thumb: string; title: string; creator: string; license: string; source: string; w: number; h: number }[];
      folder?: string;
    };
    if (!Array.isArray(items) || !items.length) return json({ ok: false, msg: '未选择图片' }, 400);
    if (!items.every((i) => OK_LICENSE.has(String(i.license).split(' ')[0].toLowerCase()))) {
      return json({ ok: false, msg: '含非 CC0/公有领域授权的图,已拒绝' }, 400);
    }

    const done: number[] = [];
    const failed: string[] = [];

    for (const it of items.slice(0, 12)) {
      try {
        // 先取原图;太大就退回缩略图 —— Worker 里没有图像处理能力,
        // 与其为了压缩再引一个服务,不如接受「大图用不了就用中图」
        let res = await fetch(it.url, { signal: AbortSignal.timeout(25_000) });
        let buf = res.ok ? await res.arrayBuffer() : null;
        let usedThumb = false;
        if (!buf || buf.byteLength > MAX_BYTES) {
          res = await fetch(it.thumb, { signal: AbortSignal.timeout(20_000) });
          if (!res.ok) { failed.push(it.title || it.url); continue; }
          buf = await res.arrayBuffer();
          usedThumb = true;
          if (buf.byteLength > MAX_BYTES) { failed.push((it.title || '') + '(缩略图仍超限)'); continue; }
        }
        const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
        const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const now = new Date();
        const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
        const name = (it.title || 'stock').replace(/[^\w一-龥 -]/g, '').slice(0, 60) + '.' + ext;

        const row = await c.db.prepare(
          `INSERT INTO media (r2_key, filename, mime, bytes, width, height, folder, alt_zh,
                              uploaded_by, data, driver, source_url, license, creator)
           VALUES (?,?,?,?,?,?,?,?,?,?,'d1',?,?,?) RETURNING id`
        ).bind(key, name, mime, buf.byteLength,
               usedThumb ? null : it.w, usedThumb ? null : it.h,
               folder, it.title || null, c.sess.uid, buf,
               it.source, it.license, it.creator || null)
          .first<{ id: number }>();
        if (row?.id) done.push(row.id);
      } catch {
        failed.push(it.title || it.url);
      }
    }

    return json({ ok: true, imported: done.length, ids: done, failed });
  } catch (e) {
    return json({ ok: false, msg: `导入失败:${e instanceof Error ? e.message.slice(0, 160) : String(e)}` }, 500);
  }
};
