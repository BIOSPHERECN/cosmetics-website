import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard } from '../../../lib/guard';

export const prerender = false;

/**
 * 包材供应商档案的保存接口。
 *
 * 只允许改「资料字段」,不允许改 prefix / slug / name_zh ——
 * 那三样是编码体系的地基:编码 FLD-P042 已经印在方案、报价单和客户邮件里,
 * 改前缀等于把已经发出去的编号全废掉。要改只能新建一家。
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const EDITABLE = ['city', 'categories', 'contact', 'phone', 'wechat', 'email', 'website',
  'moq_note', 'lead_note', 'cert_note', 'price_note', 'notes', 'short_zh', 'rating', 'status'];

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (!c) return json({ ok: false, msg: '未登录' }, 403);

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(b.id);
  if (!Number.isFinite(id)) return json({ ok: false, msg: 'id 缺失' }, 400);

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of EDITABLE) {
    if (k in b) {
      sets.push(`${k} = ?`);
      vals.push(k === 'rating' ? Number(b[k]) || null : String(b[k] ?? '').slice(0, 2000));
    }
  }
  if (!sets.length) return json({ ok: false, msg: '没有可保存的字段' }, 400);

  await c.db.prepare(`UPDATE suppliers SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...vals, id).run();

  /* 供应商资料同时进知识库:客服被问「这个瓶型谁做的、多久能出」时,
     检索到的是同一份口径,不用再去翻后台。对外只给能公开的部分。 */
  try {
    const s = await c.db.prepare(`SELECT * FROM suppliers WHERE id = ?`).bind(id).first<any>();
    if (s) {
      const body = [
        s.categories ? `主营:${s.categories}` : '',
        s.moq_note ? `起订:${s.moq_note}` : '',
        s.lead_note ? `交期:${s.lead_note}` : '',
        s.cert_note ? `认证/审厂:${s.cert_note}` : '',
      ].filter(Boolean).join('\n');
      if (body) {
        await c.db.prepare(
          `INSERT INTO kb_entries (category, title, content, keywords, is_published, sort_order, ref_type, ref_code)
           VALUES ('包材供应', ?, ?, ?, 0, 300, 'supplier', ?)
           ON CONFLICT DO NOTHING`)
          .bind(`包材来源 ${s.prefix}(${s.short_zh})`, body,
            `${s.prefix},${s.short_zh},${s.categories ?? ''}`, s.slug).run();
      }
    }
  } catch { /* 知识库同步失败不影响档案保存 */ }

  return json({ ok: true });
};
