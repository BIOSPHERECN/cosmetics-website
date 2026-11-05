/**
 * 一码一物验真接口。
 * GET 或 POST /api/verify?code=…
 * 也接受 JSON / 表单里的 code、lang。查询串里的 code 优先。
 * 响应：{ genuine, firstScan, scanCount, sku?, batch?, message }
 * 不写询盘，不缓存。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hashesFromRequest, verifyProductCode, verifyUnavailable, type VerifyBody } from '../../lib/verify-code';

export const prerender = false;

const json = (body: VerifyBody, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

async function readFields(request: Request): Promise<{ code: string; lang: string }> {
  const url = new URL(request.url);
  let code = url.searchParams.get('code') ?? '';
  let lang = url.searchParams.get('lang') ?? '';
  if (request.method === 'POST' && (!code.trim() || !lang.trim())) {
    const ctype = request.headers.get('content-type') ?? '';
    try {
      if (ctype.includes('application/json')) {
        const b = await request.json() as Record<string, unknown>;
        if (!code.trim()) code = String(b.code ?? '');
        if (!lang.trim()) lang = String(b.lang ?? '');
      } else if (ctype.includes('form-urlencoded') || ctype.includes('multipart/form-data')) {
        const fd = await request.formData();
        if (!code.trim()) code = String(fd.get('code') ?? '');
        if (!lang.trim()) lang = String(fd.get('lang') ?? '');
      }
    } catch { /* 坏正文按没带码处理，下面会回 400 */ }
  }
  if (!lang.trim()) {
    const al = request.headers.get('accept-language') ?? '';
    if (al.trim().toLowerCase().startsWith('zh')) lang = 'zh';
  }
  return { code, lang };
}

const handle: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  const { code, lang } = await readFields(request);
  if (!db) {
    const miss = verifyUnavailable(lang);
    return json(miss.body, miss.status);
  }
  const hashes = await hashesFromRequest(request);
  const out = await verifyProductCode(db, { code, lang, ipHash: hashes.ipHash, uaHash: hashes.uaHash });
  return json(out.body, out.status);
};

export const GET = handle;
export const POST = handle;
