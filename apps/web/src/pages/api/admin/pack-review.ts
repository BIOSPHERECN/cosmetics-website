/**
 * 图册审核台的写接口 —— 一次提交一批,不逐张写。
 *
 * 为什么必须批量:D1 免费档每天的写次数有限,而待审的有五千多张。
 * 一张一次 fetch 会把额度烧在往返上,人也会因为每点一下要等一下而放弃审下去。
 * 前端攒够一屏再提交,一次几十行,人几乎无感。
 */
import type { APIRoute } from 'astro';
import { apiGuard } from '../../../lib/guard';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (!c) return json({ ok: false, error: 'auth' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400); }

  const pass: string[] = Array.isArray(body.pass) ? body.pass.slice(0, 400) : [];
  const reject: { code: string; reason?: string }[] = Array.isArray(body.reject) ? body.reject.slice(0, 400) : [];
  if (!pass.length && !reject.length) return json({ ok: false, error: 'empty' }, 400);

  const stmts: any[] = [];
  /* 通过:reviewed=1,顺手清掉上一次的否决原因,免得页面上留着一句自相矛盾的说明 */
  for (let i = 0; i < pass.length; i += 60) {
    const chunk = pass.slice(i, i + 60);
    stmts.push(c.db.prepare(
      `UPDATE pack_assets SET reviewed = 1, reject_reason = NULL
        WHERE our_code IN (${chunk.map(() => '?').join(',')})`).bind(...chunk));
  }
  /* 否决:留 -1 而不是 0。0 是「还没看过」,-1 是「看过并且判掉了」——
     两者混在一起,下次就分不清哪些是真没审、哪些是审过不要的,只能从头再来一遍。 */
  for (const r of reject) {
    stmts.push(c.db.prepare(
      `UPDATE pack_assets SET reviewed = -1, reject_reason = ? WHERE our_code = ?`)
      .bind(String(r.reason ?? '').slice(0, 80) || '人工否决', r.code));
  }

  try {
    await c.db.batch(stmts);
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 500);
  }
  return json({ ok: true, passed: pass.length, rejected: reject.length });
};
