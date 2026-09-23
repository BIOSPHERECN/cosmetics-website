/**
 * R2 跨账号搬迁 —— 由 Worker 自己搬,不需要任何新凭据。
 *
 * 创始人 2026-09-07:「又要修改 api 吗,能不能一次性到位」。
 * 他说得对。上一版方案要他去控制台新建一把目标账号的 R2 令牌,
 * 而那一步根本不必要:**Worker 手里已经有旧桶的 S3 密钥**(env 里那套),
 * 新桶只要挂成原生绑定(PHOTO),读旧写新就都在 Worker 里完成了。
 * 本地那份 551 MB 中转留着当备份,但迁移不再依赖它。
 *
 * 纪律:
 *   · **零删除**。这里没有任何 delete —— 源桶一个字节都不动,
 *     创始人还要拿它建另一个站。以后也不许往这个文件里加删除。
 *   · **幂等**。已经在新桶里、且大小一致的直接跳过,重跑不重传、不重复计费。
 *   · **分批**。一次最多几百个,由调用方推进,不做「一个请求搬九千个」——
 *     那样一超时就不知道搬到哪了。
 *   · **只读源、只写目标**,两边都不做任何结构性改动。
 *
 * 鉴权沿用 cron 那套 x-cron-key,和 pack-jobs 一致。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { r2Get, type StorageEnv } from '../../../lib/storage';

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, url }) => {
  const ck = (env as any).CRON_KEY as string | undefined;
  if (!ck || request.headers.get('x-cron-key') !== ck) return json({ ok: false }, 403);

  const dst = (env as any).PHOTO as R2Bucket | undefined;

  /* 直传分支:带 ?key= 时请求体就是一张图,用原生绑定写进本账号的桶。
     2026-09-07 桶迁到网站所在账号后,.env 里那套 S3 密钥指向的是旧账号 ——
     本机继续用它上传会把新图写进已经不服务的旧桶,而且不报错。
     新账号的 S3 密钥不需要:Worker 有原生绑定,本机交字节即可。
     用 POST 不用 PUT。当时我把 PUT 的失败判成「框架方法路由 404」,
     2026-09-08 装上类型检查才看清真因:那个 PUT 处理器里调了一个
     **根本不存在的 `guard()`** —— 运行时 ReferenceError,和方法路由无关。
     既然 POST 这条分支已经做完同一件事,直接把那段死代码删掉,不重复一遍。 */
  const okey = url.searchParams.get('key');
  if (okey) {
    if (!dst) return json({ ok: false, error: 'PHOTO binding 不在' }, 500);
    /* 白名单按前缀,而不是「随便什么 key 都能写」——
       这个接口只认 CRON_KEY,一旦 key 不受限,拿到 key 的人就能覆盖桶里任何东西。
       2026-09-08 加 video / design 两个前缀:变身片与设计效果图要上站。 */
    const OK_PREFIX = ['media/pack/', 'media/video/', 'media/design/', 'media/origin/'];
    if (okey.includes('..') || !OK_PREFIX.some((p) => okey.startsWith(p))) {
      return json({ ok: false, error: `key 必须以 ${OK_PREFIX.join(' / ')} 之一开头且不含 ..` }, 400);
    }
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ ok: false, error: '空文件' }, 400);
    if (buf.byteLength > 8 * 1024 * 1024) return json({ ok: false, error: '超过 8 MB' }, 413);
    const h = await dst.head(okey).catch(() => null);
    if (h && h.size === buf.byteLength) return json({ ok: true, skipped: true });
    await dst.put(okey, buf, { httpMetadata: {
      contentType: request.headers.get('content-type') || 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable' } });
    return json({ ok: true, bytes: buf.byteLength });
  }
  if (!dst) return json({ ok: false, error: 'PHOTO binding 不在' }, 500);

  let body: { keys?: string[] };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'body 不是 JSON' }, 400);
  }
  const keys = (body.keys ?? []).filter((k) => typeof k === 'string' && k && !k.includes('..'));
  if (!keys.length) return json({ ok: false, error: '没给 keys' }, 400);
  if (keys.length > 400) return json({ ok: false, error: '一批最多 400 个' }, 400);

  let copied = 0, skipped = 0, failed = 0, bytes = 0;
  const errors: string[] = [];

  for (const k of keys) {
    try {
      /* 幂等:目标已有且大小一致就跳过。head 比 get 便宜,而且不产生出网。 */
      const head = await dst.head(k).catch(() => null);

      const src = await r2Get(env as unknown as StorageEnv, k).catch(() => null);
      if (!src || !src.ok) { failed++; if (errors.length < 5) errors.push(`${k}: 源取不到`); continue; }

      const buf = await src.arrayBuffer();
      if (head && head.size === buf.byteLength) { skipped++; continue; }

      await dst.put(k, buf, {
        httpMetadata: {
          contentType: src.headers.get('content-type') ?? 'application/octet-stream',
          /* 图片一旦生成就不再变(要换就换编码),给长效缓存 */
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
      copied++; bytes += buf.byteLength;
    } catch (e) {
      failed++;
      if (errors.length < 5) errors.push(`${k}: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
    }
  }

  return json({ ok: true, copied, skipped, failed, bytes, errors });
};
