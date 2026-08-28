/**
 * 上传接口。浏览器端已把图压成 WebP(见媒体库页),这里只做校验与落库。
 *
 * 服务端仍然校验体积与类型 —— 前端的压缩是为了体验,不是安全边界;
 * 任何人都能绕过页面直接 POST,所以边界必须在服务端。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

const OK_MIME = new Set(['image/webp', 'image/jpeg', 'image/png', 'image/svg+xml', 'video/mp4']);
const MAX = 950_000; // D1 单值上限 1MB,留 5% 余量给编码开销

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  try {
    const form = await request.formData();
    const file = form.get('file');
    const folder = String(form.get('folder') ?? 'uncategorized').slice(0, 40) || 'uncategorized';
    const alt_zh = String(form.get('alt_zh') ?? '').slice(0, 200);
    const w = Number(form.get('width')) || null;
    const h = Number(form.get('height')) || null;

    if (!(file instanceof File)) return json({ ok: false, msg: '没有收到文件' }, 400);
    if (!OK_MIME.has(file.type)) return json({ ok: false, msg: `不支持的格式 ${file.type}` }, 400);
    if (file.size > MAX) return json({ ok: false, msg: `文件 ${(file.size / 1024 / 1024).toFixed(1)}MB 超出单个 0.9MB 上限(R2 开通后可放开)` }, 400);

    const buf = await file.arrayBuffer();

    /* 声明的 MIME 是客户端说了算的,不能信。
       栅格图按文件头核一遍;SVG 与 MP4 走各自的判据:
       SVG 是文本,看开头是不是 <svg / <?xml;MP4 看 ftyp 盒子。 */
    const head = new Uint8Array(buf.slice(0, 32));
    const sig = (a: number[], off = 0) => a.every((v, i) => head[off + i] === v);
    const text = new TextDecoder().decode(head).trimStart().toLowerCase();
    const realType =
      sig([0xff, 0xd8, 0xff]) ? 'image/jpeg'
      : sig([0x89, 0x50, 0x4e, 0x47]) ? 'image/png'
      : (sig([0x52, 0x49, 0x46, 0x46]) && sig([0x57, 0x45, 0x42, 0x50], 8)) ? 'image/webp'
      : sig([0x66, 0x74, 0x79, 0x70], 4) ? 'video/mp4'
      : (text.startsWith('<svg') || text.startsWith('<?xml')) ? 'image/svg+xml'
      : '';
    if (!realType || realType !== file.type) {
      return json({ ok: false, msg: `文件内容与声明的类型不符(声明 ${file.type},实际看起来是 ${realType || '未知格式'})` }, 400);
    }
    // 对象键现在就定下来:即使当前存在 D1,将来搬进 R2 时键不变,
    // 前台引用的 /media/<id> 也不用改 —— 迁移只是把 blob 挪走、把 driver 改成 r2。
    const ext = (file.name.match(/\.(\w{1,5})$/)?.[1] ?? 'bin').toLowerCase();
    const now = new Date();
    const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;

    const r = await c.db.prepare(
      `INSERT INTO media (r2_key, filename, mime, bytes, width, height, folder, alt_zh, uploaded_by, data, driver)
       VALUES (?,?,?,?,?,?,?,?,?,?,'d1') RETURNING id`
    ).bind(key, file.name.slice(0, 120), file.type, file.size, w, h, folder, alt_zh || null, c.sess.uid, buf)
      .first<{ id: number }>();

    return json({ ok: true, id: r?.id, url: `/media/${r?.id}` });
  } catch (e) {
    return json({ ok: false, msg: `上传失败:${e instanceof Error ? e.message.slice(0, 160) : String(e)}` }, 500);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { ids } = (await request.json().catch(() => ({}))) as { ids?: number[] };
  if (!Array.isArray(ids) || !ids.length) return json({ ok: false, msg: '未选择' }, 400);
  const q = ids.map(() => '?').join(',');
  await c.db.prepare(`DELETE FROM media WHERE id IN (${q})`).bind(...ids).run();
  return json({ ok: true, n: ids.length });
};

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, alt_zh, alt_en, folder } = (await request.json().catch(() => ({}))) as any;
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
  await c.db.prepare(`UPDATE media SET alt_zh=?, alt_en=?, folder=? WHERE id=?`)
    .bind(alt_zh || null, alt_en || null, folder || 'uncategorized', id).run();
  return json({ ok: true });
};
