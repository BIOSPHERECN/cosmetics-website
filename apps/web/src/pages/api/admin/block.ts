/**
 * 版块增删改排 —— 让运营真的能自己拼页面。
 *
 * 在此之前后台只能改已有版块的文字:想加一屏、调顺序、临时藏一屏,
 * 都得改代码再发版。那不叫后台,叫「文案输入框」。
 *
 * 五个动作:
 *   add        加一块(带该类型的默认内容,不是空壳)
 *   move       上移/下移
 *   toggle     显示/隐藏 —— 藏比删安全,内容还在,随时能放回来
 *   duplicate  复制一块(连同所有语种的译文)
 *   delete     删(级联删掉 block_i18n)
 *
 * 每个动作都写修订记录:页面是对外的东西,谁在什么时候加了/删了一屏,
 * 必须查得到。出了事靠记忆复盘是查不清的。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';
import { BLOCK_BY_ID } from '@cosmetic/core/blocks';

export const prerender = false;

/** 确认这个版块属于当前管理员能管的站点 —— 光有 block_id 不够,地址栏能改 */
async function own(db: D1Database, blockId: number, siteId: string) {
  return db.prepare(
    `SELECT b.id, b.page_id, b.type, b.sort_order, b.is_visible
       FROM blocks b JOIN pages p ON p.id = b.page_id
      WHERE b.id = ? AND p.site_id = ?`,
  ).bind(blockId, siteId).first<{ id: number; page_id: number; type: string; sort_order: number; is_visible: number }>();
}

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  try {
    const b = (await request.json()) as {
      action: string; pageId?: number; blockId?: number; type?: string; after?: number; dir?: number;
    };
    const site = c.tenant.siteId;

    /* ── 加一块 ─────────────────────────────────────── */
    if (b.action === 'add') {
      const def = BLOCK_BY_ID.get(String(b.type));
      if (!def) return json({ ok: false, msg: `未知版块类型:${b.type}` }, 400);

      const page = await c.db.prepare(`SELECT id FROM pages WHERE id=? AND site_id=?`)
        .bind(Number(b.pageId), site).first<{ id: number }>();
      if (!page) return json({ ok: false, msg: '页面不存在或不属于当前站点' }, 404);

      if (def.once) {
        const has = await c.db.prepare(`SELECT id FROM blocks WHERE page_id=? AND type=?`)
          .bind(page.id, def.id).first();
        if (has) return json({ ok: false, msg: `「${def.name}」每页只能有一个` }, 400);
      }

      /* 插到指定版块之后:把后面的整体腾一位。
         不用「取最大值 +1」是因为那样只能追加到末尾 ——
         运营想在中间插一屏,是最常见的需求。 */
      const after = Number(b.after);
      let order: number;
      if (Number.isFinite(after) && after >= 0) {
        await c.db.prepare(`UPDATE blocks SET sort_order = sort_order + 1 WHERE page_id=? AND sort_order > ?`)
          .bind(page.id, after).run();
        order = after + 1;
      } else {
        const max = await c.db.prepare(`SELECT IFNULL(MAX(sort_order), -1) n FROM blocks WHERE page_id=?`)
          .bind(page.id).first<{ n: number }>();
        order = (max?.n ?? -1) + 1;
      }
      /* 通告条永远排在最前:它渲染在页头之上,给它一个正序号没有意义 */
      if (def.id === 'announce') order = -1;

      const ins = await c.db.prepare(
        `INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json) VALUES (?,?,?,1,'{}') RETURNING id`,
      ).bind(page.id, def.id, order).first<{ id: number }>();
      const newId = ins!.id;

      /* 默认内容写进中英两语:新加的版块直接就能看,不是一个要人从零填的空壳。
         其余语种交给翻译中心补,不在这里硬造。 */
      const payload = JSON.stringify(def.defaults);
      await c.db.batch([
        c.db.prepare(`INSERT INTO block_i18n (block_id, lang, data_json) VALUES (?, 'zh-cn', ?)`).bind(newId, payload),
        c.db.prepare(`INSERT INTO block_i18n (block_id, lang, data_json) VALUES (?, 'en', ?)`).bind(newId, payload),
      ]);
      await logRevision(c.db, 'blocks', newId, null, null, { action: 'add', type: def.id, page: page.id }, c.sess.uid);
      return json({ ok: true, id: newId, order });
    }

    /* ── 以下动作都先验归属 ─────────────────────────── */
    const cur = await own(c.db, Number(b.blockId), site);
    if (!cur) return json({ ok: false, msg: '版块不存在或不属于当前站点' }, 404);

    if (b.action === 'move') {
      const dir = Number(b.dir) > 0 ? 1 : -1;
      /* 和相邻那一块换位置。用「找邻居再互换」而不是「序号 ±1」——
         序号可能不连续(中间删过),±1 会撞到空档,看起来像点了没反应。 */
      const nb = await c.db.prepare(
        dir > 0
          ? `SELECT id, sort_order FROM blocks WHERE page_id=? AND sort_order > ? AND sort_order >= 0 ORDER BY sort_order LIMIT 1`
          : `SELECT id, sort_order FROM blocks WHERE page_id=? AND sort_order < ? AND sort_order >= 0 ORDER BY sort_order DESC LIMIT 1`,
      ).bind(cur.page_id, cur.sort_order).first<{ id: number; sort_order: number }>();
      if (!nb) return json({ ok: true, moved: false });
      await c.db.batch([
        c.db.prepare(`UPDATE blocks SET sort_order=? WHERE id=?`).bind(nb.sort_order, cur.id),
        c.db.prepare(`UPDATE blocks SET sort_order=? WHERE id=?`).bind(cur.sort_order, nb.id),
      ]);
      return json({ ok: true, moved: true });
    }

    if (b.action === 'toggle') {
      const to = cur.is_visible ? 0 : 1;
      await c.db.prepare(`UPDATE blocks SET is_visible=?, updated_at=datetime('now') WHERE id=?`).bind(to, cur.id).run();
      await logRevision(c.db, 'blocks', cur.id, null, { is_visible: cur.is_visible }, { is_visible: to }, c.sess.uid);
      return json({ ok: true, visible: !!to });
    }

    if (b.action === 'duplicate') {
      await c.db.prepare(`UPDATE blocks SET sort_order = sort_order + 1 WHERE page_id=? AND sort_order > ?`)
        .bind(cur.page_id, cur.sort_order).run();
      const ins = await c.db.prepare(
        `INSERT INTO blocks (page_id, type, sort_order, is_visible, config_json)
         SELECT page_id, type, ?, is_visible, config_json FROM blocks WHERE id=? RETURNING id`,
      ).bind(cur.sort_order + 1, cur.id).first<{ id: number }>();
      /* 连同所有语种一起复制 —— 只复制中文的话,复制出来的那块在别的语种下是空的,
         而这种空要等那个语种的访客打开才暴露。 */
      await c.db.prepare(
        `INSERT INTO block_i18n (block_id, lang, data_json, mt, mt_at)
         SELECT ?, lang, data_json, mt, mt_at FROM block_i18n WHERE block_id=?`,
      ).bind(ins!.id, cur.id).run();
      await logRevision(c.db, 'blocks', ins!.id, null, null, { action: 'duplicate', from: cur.id }, c.sess.uid);
      return json({ ok: true, id: ins!.id });
    }

    if (b.action === 'delete') {
      const langs = await c.db.prepare(`SELECT lang, data_json FROM block_i18n WHERE block_id=?`).bind(cur.id).all();
      /* 删之前把内容整份存进修订记录 —— 删错了还能捞回来。
         没有这一步,「删除」就是不可逆操作,而运营点错是必然会发生的。 */
      await logRevision(c.db, 'blocks', cur.id, null, { type: cur.type, i18n: langs.results }, { action: 'delete' }, c.sess.uid);
      await c.db.prepare(`DELETE FROM blocks WHERE id=?`).bind(cur.id).run();
      return json({ ok: true });
    }

    return json({ ok: false, msg: `未知动作:${b.action}` }, 400);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return json({ ok: false, msg: `操作失败:${m.slice(0, 200)}` }, 500);
  }
};
