import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/* 包材采集的两个写操作(2026-09-16):
     shop     老板 / 采购对一家 1688 店铺拍板:want(要,继续收 + 可转正)/ drop(不要)/ 清空
     publish  把某家店的草稿(或指定编码)转正式上货架 —— 只有 admin;转正前要有图(R2 里有 media/pack/al/<code>.webp,这里不查 R2,由页面按 hasImg 提示) */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as { op?: string; shop_key?: string; decision?: string; note?: string; codes?: string[]; status?: string };
  const db = c.db;
  if (b.op === 'shop' && b.shop_key) {
    const d = ['want', 'drop', ''].includes(b.decision ?? '') ? (b.decision || null) : null;
    await db.prepare(`UPDATE pack_shops SET decision=?, note=COALESCE(?, note) WHERE shop_key=?`).bind(d, b.note ?? null, b.shop_key).run();
    return json({ ok: true });
  }
  if (b.op === 'publish') {
    if (c.sess.role !== 'admin') return json({ ok: false, msg: '只有管理员能上货架' }, 403);
    const status = b.status === 'draft' ? 'draft' : 'active';
    if (b.codes?.length) {
      const codes = b.codes.slice(0, 500).map((x) => String(x));
      await db.prepare(`UPDATE packaging SET status=?, updated_at=datetime('now') WHERE code IN (${codes.map(() => '?').join(',')})`).bind(status, ...codes).run();
      return json({ ok: true, n: codes.length });
    }
    if (b.shop_key) {
      const r = await db.prepare(`UPDATE packaging SET status=?, updated_at=datetime('now') WHERE source_offer_id IS NOT NULL AND code LIKE 'AL-%' AND supplier_ref=(SELECT name FROM pack_shops WHERE shop_key=?)`).bind(status, b.shop_key).run();
      return json({ ok: true, n: r.meta?.changes ?? 0 });
    }
  }
  return json({ ok: false, msg: '未知操作' }, 400);
};
