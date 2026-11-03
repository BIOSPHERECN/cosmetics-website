/**
 * 页面的草稿与回退快照(A9 · 2026-09-23,表见 db/migrations/0106_a9_admin_easy.sql)。
 *
 * 快照在库里一句 SQL 拼好(json_group_array),不经 Worker 搬运;还原是一个 batch 事务,
 * 用 json_each 整批写回 —— 不管这一页有几百行译文,都是固定 6 句,不会撞单次调用的查询条数上限。
 * ponytail: 整页全语种快照,biosphere-ai 首页约 0.8MB;D1 单值上限 2MB,页面再涨 2.5 倍前要改成只存改动的语种。
 */

const KEEP = 10;   // 每页留最近 10 个回退点

/** 存一份整页快照(版块结构 + 全部语种文案 + 页面标题)。失败不抛:回退点没存上不该挡住保存本身 */
export async function snapPage(db: D1Database, pageId: number, uid: number, note: string): Promise<boolean> {
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO page_versions (page_id, kind, note, user_id, snap_json)
         SELECT ?1, 'backup', ?2, ?3, json_object(
           'blocks', json((SELECT json_group_array(json_object('id',id,'type',type,'sort_order',sort_order,'is_visible',is_visible,'config_json',config_json))
                             FROM blocks WHERE page_id=?1)),
           'i18n',   json((SELECT json_group_array(json_object('b',bi.block_id,'l',bi.lang,'d',bi.data_json,'mt',bi.mt,'at',bi.mt_at))
                             FROM block_i18n bi JOIN blocks b ON b.id=bi.block_id WHERE b.page_id=?1)),
           'meta',   json((SELECT json_group_array(json_object('l',lang,'n',nav_label,'t',title,'s',seo_desc,'mt',mt,'at',mt_at))
                             FROM page_i18n WHERE page_id=?1)))`,
      ).bind(pageId, note.slice(0, 80), uid),
      db.prepare(
        `DELETE FROM page_versions WHERE page_id=?1 AND kind='backup'
           AND id NOT IN (SELECT id FROM page_versions WHERE page_id=?1 AND kind='backup' ORDER BY id DESC LIMIT ${KEEP})`,
      ).bind(pageId),
    ]);
    return true;
  } catch { return false; }
}

/** 还原最新一个回退点,并把它从栈里弹掉 —— 连点就一步步往回退 */
export async function rollbackPage(db: D1Database, pageId: number): Promise<{ ok: boolean; at?: string; note?: string }> {
  const v = await db.prepare(
    `SELECT id, created_at, note, snap_json FROM page_versions WHERE page_id=? AND kind='backup' ORDER BY id DESC LIMIT 1`,
  ).bind(pageId).first<{ id: number; created_at: string; note: string; snap_json: string }>();
  if (!v) return { ok: false };
  const S = v.snap_json;
  await db.batch([
    db.prepare(`DELETE FROM block_i18n WHERE block_id IN (SELECT id FROM blocks WHERE page_id=?1)`).bind(pageId),
    db.prepare(`DELETE FROM blocks WHERE page_id=?1`).bind(pageId),
    db.prepare(
      `INSERT INTO blocks (id, page_id, type, sort_order, is_visible, config_json)
       SELECT json_extract(value,'$.id'), ?1, json_extract(value,'$.type'), json_extract(value,'$.sort_order'),
              json_extract(value,'$.is_visible'), json_extract(value,'$.config_json')
         FROM json_each(?2, '$.blocks')`,
    ).bind(pageId, S),
    db.prepare(
      `INSERT INTO block_i18n (block_id, lang, data_json, mt, mt_at)
       SELECT json_extract(value,'$.b'), json_extract(value,'$.l'), json_extract(value,'$.d'), json_extract(value,'$.mt'), json_extract(value,'$.at')
         FROM json_each(?1, '$.i18n')`,
    ).bind(S),
    db.prepare(`DELETE FROM page_i18n WHERE page_id=?1`).bind(pageId),
    db.prepare(
      `INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc, mt, mt_at)
       SELECT ?1, json_extract(value,'$.l'), json_extract(value,'$.n'), json_extract(value,'$.t'), json_extract(value,'$.s'),
              json_extract(value,'$.mt'), json_extract(value,'$.at')
         FROM json_each(?2, '$.meta')`,
    ).bind(pageId, S),
    db.prepare(`DELETE FROM page_versions WHERE id=?`).bind(v.id),
    db.prepare(`UPDATE pages SET updated_at=datetime('now') WHERE id=?`).bind(pageId),
  ]);
  return { ok: true, at: v.created_at, note: v.note };
}

/** 草稿:与保存接口同一形状 { meta, blocks }。每页只留一份,存草稿不碰线上 */
export type PageDraft = {
  meta: { lang: string; nav_label: string; title: string; seo_desc: string }[];
  blocks: { id: number; is_visible: number; data: Record<string, Record<string, unknown>> }[];
};

export async function getDraft(db: D1Database, pageId: number): Promise<(PageDraft & { at: string }) | null> {
  const r = await db.prepare(`SELECT snap_json, created_at FROM page_versions WHERE page_id=? AND kind='draft' ORDER BY id DESC LIMIT 1`)
    .bind(pageId).first<{ snap_json: string; created_at: string }>().catch(() => null);
  if (!r) return null;
  try { return { ...(JSON.parse(r.snap_json) as PageDraft), at: r.created_at }; } catch { return null; }
}

export async function putDraft(db: D1Database, pageId: number, uid: number, d: PageDraft) {
  await db.batch([
    db.prepare(`DELETE FROM page_versions WHERE page_id=? AND kind='draft'`).bind(pageId),
    db.prepare(`INSERT INTO page_versions (page_id, kind, user_id, snap_json) VALUES (?, 'draft', ?, ?)`)
      .bind(pageId, uid, JSON.stringify({ meta: d.meta ?? [], blocks: d.blocks ?? [] })),
  ]);
}

export async function dropDraft(db: D1Database, pageId: number) {
  await db.prepare(`DELETE FROM page_versions WHERE page_id=? AND kind='draft'`).bind(pageId).run();
}
