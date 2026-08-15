/**
 * 保存页面信息与版块内容。
 *
 * 两个刻意的设计:
 *  ① 全部走 UPSERT —— 某个语种原本没有记录时,保存等于新建译文,运营不需要先"添加语言";
 *  ② 每次写入前把旧值抄进 revisions —— 改错了能查是谁在什么时候改的,改成了什么。
 *     没有这一步的后台不叫 CMS,叫共享记事本。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';

export const prerender = false;

type MetaRow = { lang: string; nav_label: string; title: string; seo_desc: string };
type BlockRow = { id: number; is_visible: number; data: Record<string, unknown> };

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  try {
    const { page_id, meta, blocks } = (await request.json()) as
      { page_id: number; meta: MetaRow[]; blocks: BlockRow[] };
    if (!page_id) return json({ ok: false, msg: '缺少 page_id' }, 400);

    let nMeta = 0;
    for (const m of meta ?? []) {
      if (!m.lang || (!m.title && !m.nav_label)) continue; // 整行空 = 该语种还没写,不要写入空记录
      const before = await c.db.prepare(
        `SELECT nav_label, title, seo_desc FROM page_i18n WHERE page_id=? AND lang=?`
      ).bind(page_id, m.lang).first();
      await c.db.prepare(
        `INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES (?,?,?,?,?)
         ON CONFLICT(page_id, lang) DO UPDATE SET nav_label=excluded.nav_label,
           title=excluded.title, seo_desc=excluded.seo_desc`
      ).bind(page_id, m.lang, m.nav_label || m.title, m.title || m.nav_label, m.seo_desc || null).run();
      await logRevision(c.db, 'page_i18n', page_id, m.lang, before, m, c.sess.uid);
      nMeta++;
    }

    let nBlk = 0;
    for (const b of blocks ?? []) {
      await c.db.prepare(`UPDATE blocks SET is_visible=?, updated_at=datetime('now') WHERE id=? AND page_id=?`)
        .bind(b.is_visible ? 1 : 0, b.id, page_id).run();
      for (const [lang, data] of Object.entries(b.data ?? {})) {
        if (!data || !Object.keys(data as object).length) continue;
        const before = await c.db.prepare(`SELECT data_json FROM block_i18n WHERE block_id=? AND lang=?`)
          .bind(b.id, lang).first<{ data_json: string }>();
        const after = JSON.stringify(data);
        if (before?.data_json === after) continue; // 没变就不写,免得修订记录被无意义的保存刷满
        await c.db.prepare(
          `INSERT INTO block_i18n (block_id, lang, data_json) VALUES (?,?,?)
           ON CONFLICT(block_id, lang) DO UPDATE SET data_json=excluded.data_json`
        ).bind(b.id, lang, after).run();
        // 存的是已解析的对象,不是 JSON 字符串 —— 否则修订页会把整段当成一个"值"字段,
        // 逐字段对比就废了(改了哪一句根本看不出来)
        const beforeObj = before?.data_json ? JSON.parse(before.data_json) : null;
        await logRevision(c.db, 'block_i18n', b.id, lang, beforeObj, data, c.sess.uid);
        nBlk++;
      }
    }

    await c.db.prepare(`UPDATE pages SET updated_at=datetime('now') WHERE id=?`).bind(page_id).run();
    return json({ ok: true, meta: nMeta, blocks: nBlk });
  } catch (e) {
    return json({ ok: false, msg: `保存失败:${e instanceof Error ? e.message.slice(0, 200) : String(e)}` }, 500);
  }
};

/** 页面自身的属性:发布状态、是否进导航 */
export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, status, in_nav } = (await request.json().catch(() => ({}))) as any;
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
  const sets: string[] = [], bind: unknown[] = [];
  if (status) { sets.push('status=?'); bind.push(status); }
  if (in_nav !== undefined) { sets.push('in_nav=?'); bind.push(in_nav ? 1 : 0); }
  if (!sets.length) return json({ ok: false, msg: '没有要改的字段' }, 400);
  await c.db.prepare(`UPDATE pages SET ${sets.join(',')}, updated_at=datetime('now') WHERE id=?`).bind(...bind, id).run();
  return json({ ok: true });
};
