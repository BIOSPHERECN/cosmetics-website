/**
 * 包材入库 —— 一张图 + 几个字段,直接进包材库。
 *
 * 创始人 2026-09-09:「后台管理上传更新的功能你也需要跟上优化,我们要开始转移给其他的人来上传」
 * 以及「后台你要跟上优化啊」。
 *
 * 现在的流程断在中间:媒体库能传图,但传完之后要人自己去别的地方把它挂到包材上 ——
 * 那一步只有我会做,交不出去。这个接口把「传图」和「入库」并成一次操作,
 * 让不懂后台结构的人也能把一批新包材上完。
 *
 * 三条纪律:
 *   1. **一张图一条记录,图先落 R2 再写库**。图没传成就不写库 ——
 *      库里有条目而货架上是破图,比少一款难查得多(今天上午刚下架 42 款「实拍整理中」)。
 *   2. **编码冲突要说清楚**。同编码默认拒收并回报,加 overwrite 才覆盖 ——
 *      静默覆盖会把别人刚录的东西冲掉,而且没人知道。
 *   3. **逐条回报成败**。一批里坏了三条,要能指出是哪三条、为什么,
 *      不能只回一句「部分失败」。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard } from '../../../lib/guard';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

/* 编码规则:两到四位字母 + 短横 + 数字字母。与库里现有的 ST- / SX- / MZ- 一致。
   放宽到允许中文会让 /pack/{code} 这类地址需要转义,得不偿失。 */
const CODE_RE = /^[A-Z]{2,4}-[A-Z0-9-]{1,20}$/;
const MAX_BYTES = 8 * 1024 * 1024;
const OK_MIME = new Set(['image/webp', 'image/jpeg', 'image/png']);

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  if (!c) return json({ ok: false, error: 'auth' }, 401);

  const db = (env as any).DB as D1Database | undefined;
  const bucket = (env as any).PHOTO as R2Bucket | undefined;
  if (!db) return json({ ok: false, error: '数据源未就绪' }, 503);
  if (!bucket) return json({ ok: false, error: 'PHOTO binding 不在,图片没地方放' }, 503);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, error: '请求格式错误' }, 400); }

  const code = String(form.get('code') ?? '').trim().toUpperCase();
  const type = String(form.get('type') ?? '').trim();
  const material = String(form.get('material') ?? '').trim().slice(0, 200);
  const capacity = String(form.get('capacity') ?? '').trim().slice(0, 120);
  const neck = String(form.get('neck_size') ?? '').trim().slice(0, 60);
  const fmts = String(form.get('compat_formats') ?? '').trim().slice(0, 200);
  const supplier = String(form.get('supplier_ref') ?? '').trim().slice(0, 120);
  const sourceUrl = String(form.get('source_url') ?? '').trim().slice(0, 500);
  const overwrite = String(form.get('overwrite') ?? '') === '1';
  const file = form.get('file');

  if (!CODE_RE.test(code)) {
    return json({ ok: false, code, error: '编码格式不对。要求:2–4 位大写字母 + 短横 + 数字或字母,例如 TL-A101' }, 400);
  }
  if (!type) return json({ ok: false, code, error: '没选类型' }, 400);
  if (!(file instanceof File)) return json({ ok: false, code, error: '没有收到图片' }, 400);
  if (!OK_MIME.has(file.type)) return json({ ok: false, code, error: `不支持的图片格式 ${file.type}` }, 400);
  if (!file.size) return json({ ok: false, code, error: '图片是空的' }, 400);
  if (file.size > MAX_BYTES) {
    return json({ ok: false, code, error: `图片 ${(file.size / 1048576).toFixed(1)}MB,超出 8MB` }, 400);
  }

  const exists = await db.prepare('SELECT code FROM packaging WHERE code = ?').bind(code)
    .first<{ code: string }>().catch(() => null);
  if (exists && !overwrite) {
    return json({ ok: false, code, error: '这个编码库里已经有了。要替换请勾选「覆盖同编码」', exists: true }, 409);
  }

  /* R2 的 key 由编码前缀推出来,和 /pack/{code} 那条路由用的是同一套规则:
     media/pack/{前缀小写}/{编码}.webp,其中 ST→stnewwave、SX→shunxu 是历史目录。
     两边规则必须一致 —— 不一致的后果是库里有条目、货架上是破图。 */
  const PREFIX_DIR: Record<string, string> = { ST: 'stnewwave', SX: 'shunxu' };
  const pre = (code.match(/^([A-Z]{2,4})-/) ?? [])[1] ?? '';
  const key = `media/pack/${PREFIX_DIR[pre] ?? pre.toLowerCase()}/${code}.webp`;
  try {
    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return json({ ok: false, code, error: `图片没传上去:${e instanceof Error ? e.message.slice(0, 120) : ''}` }, 502);
  }

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO packaging (code, type, material, capacity, neck_size, compat_formats,
                                supplier_ref, source_url, status, updated_at)
         VALUES (?,?,?,?,?,?,?,?, 'active', datetime('now'))
         ON CONFLICT(code) DO UPDATE SET
           type=excluded.type, material=excluded.material, capacity=excluded.capacity,
           neck_size=excluded.neck_size, compat_formats=excluded.compat_formats,
           supplier_ref=excluded.supplier_ref, source_url=excluded.source_url,
           status='active', updated_at=datetime('now')`,
      ).bind(code, type, material || null, capacity || null, neck || null,
             fmts || null, supplier || null, sourceUrl || null),
      /* pack_assets 是货架判断「有没有实拍」的依据(EXISTS our_code AND reviewed=1)。
         这张表没有 r2_key 列,也没有 our_code 的唯一索引 ——
         所以不能用 ON CONFLICT,先删同码旧行再插一行。
         reviewed=1:后台上传的图是人自己挑的,不必再过一遍图册审核。 */
      db.prepare('DELETE FROM pack_assets WHERE our_code = ?').bind(code),
      db.prepare(
        `INSERT INTO pack_assets (our_code, reviewed, source, source_url, kind, created_at)
         VALUES (?, 1, 'admin-upload', ?, 'pack', datetime('now'))`,
      ).bind(code, sourceUrl || null),
    ]);
  } catch (e) {
    return json({ ok: false, code, error: `写库失败:${e instanceof Error ? e.message.slice(0, 160) : ''}` }, 500);
  }

  return json({ ok: true, code, key, replaced: !!exists });
};
