/**
 * 上传接口。浏览器端已把图压成 WebP(见媒体库页),这里只做校验与落库。
 *
 * 服务端仍然校验体积与类型 —— 前端的压缩是为了体验,不是安全边界;
 * 任何人都能绕过页面直接 POST,所以边界必须在服务端。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json } from '../../../lib/guard';
import { putMedia, pickDriver, MAX_UPLOAD_BYTES, type StorageEnv } from '../../../lib/storage';

export const prerender = false;

const OK_MIME = new Set(['image/webp', 'image/jpeg', 'image/png', 'image/svg+xml', 'video/mp4']);
/* 上限分两档:
   R2 通:10MB(手机原图、短视频都进得来)——「先放到 hosonzuo 的 R2」;
   R2 不通(回退 D1):0.9MB,D1 单值 1MB 留 5% 编码余量。 */
const MAX_D1 = 950_000;

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

    const senv = env as unknown as StorageEnv;
    const r2Ready = pickDriver(senv) === 'r2-s3' && !!senv.R2_ACCOUNT_ID && !!senv.R2_SECRET_ACCESS_KEY;
    const max = r2Ready ? MAX_UPLOAD_BYTES : MAX_D1;

    if (!(file instanceof File)) return json({ ok: false, msg: '没有收到文件' }, 400);
    if (!OK_MIME.has(file.type)) return json({ ok: false, msg: `不支持的格式 ${file.type}` }, 400);
    if (file.size > max) {
      return json({ ok: false, msg: `文件 ${(file.size / 1024 / 1024).toFixed(1)}MB 超出 ${r2Ready ? '10MB' : '0.9MB'} 上限` }, 400);
    }

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
    /* 先写 R2(hosonzuo 主账号的桶,S3 接口跨账号),失败且体积允许时回退 D1。
       对象键年月分层 + UUID,由 putMedia 统一生成 —— 将来帛卉账号的 R2 开通,
       迁移就是「同键拷对象 + 换四个环境值」,库和前台引用一个字都不用改。 */
    if (r2Ready) {
      /* R2 写入和落库分开 try:落库失败(如外键)不是「R2 坏了」,
         混在一个 catch 里报出来的病因是错的,还会带着大文件再撞一次 D1 */
      let stored: Awaited<ReturnType<typeof putMedia>> | null = null;
      try {
        stored = await putMedia(senv, { body: buf, mime: file.type });
      } catch (e) {
        if (file.size > MAX_D1) {
          return json({ ok: false, msg: `R2 写入失败且文件超出 D1 回退上限:${e instanceof Error ? e.message.slice(0, 120) : e}` }, 502);
        }
        /* 小文件静默回退 D1 —— 上传不该因为对象存储抖一下就失败 */
      }
      if (stored) {
        const pub = senv.R2_PUBLIC_BASE ? stored.url : null;  // 无公开域名则走 /media/{id} 签名代理
        const r = await c.db.prepare(
          `INSERT INTO media (r2_key, filename, mime, bytes, width, height, folder, alt_zh, uploaded_by, url, driver)
           VALUES (?,?,?,?,?,?,?,?,?,?,'r2') RETURNING id`
        ).bind(stored.key, file.name.slice(0, 120), file.type, file.size, w, h, folder, alt_zh || null, c.sess.uid, pub)
          .first<{ id: number }>();
        return json({ ok: true, id: r?.id, url: `/media/${r?.id}`, driver: 'r2' });
      }
    }

    const ext = (file.name.match(/\.(\w{1,5})$/)?.[1] ?? 'bin').toLowerCase();
    const now = new Date();
    const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;

    const r = await c.db.prepare(
      `INSERT INTO media (r2_key, filename, mime, bytes, width, height, folder, alt_zh, uploaded_by, data, driver)
       VALUES (?,?,?,?,?,?,?,?,?,?,'d1') RETURNING id`
    ).bind(key, file.name.slice(0, 120), file.type, file.size, w, h, folder, alt_zh || null, c.sess.uid, buf)
      .first<{ id: number }>();

    return json({ ok: true, id: r?.id, url: `/media/${r?.id}`, driver: 'd1' });
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
