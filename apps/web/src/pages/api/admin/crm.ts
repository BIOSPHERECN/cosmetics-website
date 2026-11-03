import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/* CRM v1 的写接口。一个文件、一个 op 字段,页面只发 JSON:
     convert   询盘 / 外联名单 → 客户 + 联系人 + 机会 + 第一条活动(按官网/公司名去重,已有就挂上去,不建第二个)
     company   建 / 改客户;claim 认领公海客户(归属一旦有人,别人改不了 —— 防抢单)
     contact   加联系人
     deal      建 / 改机会;阶段变更自动记一条 status 活动
     activity  记活动(电话 / 邮件 / WhatsApp / 寄样 / 报价 / 备注)
   阶段与赢率对齐 WorkBuddy 原型 metadata.ts 的 opportunity:两边 JSON 可互导。 */
import { STAGES, KINDS as KIND_LABELS } from '../../../lib/crm';
const KINDS = new Set(Object.keys(KIND_LABELS));
const s = (v: unknown, n = 500) => (v == null ? null : String(v).trim().slice(0, n) || null);
const host = (u: string | null) => (u ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as any;
  const db = c.db, uid = c.sess.uid;
  const act = (company_id: number, deal_id: number | null, kind: string, text: string) =>
    db.prepare(`INSERT INTO activities (company_id, deal_id, kind, text, uid) VALUES (?,?,?,?,?)`).bind(company_id, deal_id, kind, text.slice(0, 4000), uid).run();
  const touch = (id: number) => db.prepare(`UPDATE companies SET updated_at=datetime('now') WHERE id=?`).bind(id).run();

  if (b.op === 'convert') {
    const from = b.from === 'inquiry' ? 'inquiry' : b.from === 'prospect' ? 'prospect' : '';
    const id = Number(b.id); if (!from || !id) return json({ ok: false, msg: '参数不合法' }, 400);
    let name = '', country: string | null = null, website: string | null = null, type: string | null = null, channel = '', note = '', dealName = '', contact: any = null, extraContacts: string[] = [];
    if (from === 'inquiry') {
      const r = await db.prepare(`SELECT * FROM inquiries WHERE id=? AND site_id=?`).bind(id, c.tenant.siteId).first<any>(); if (!r) return json({ ok: false, msg: '询盘不存在' }, 404);   // site-scoped like the inquiry list
      name = r.company || r.name; country = r.country; type = '品牌方'; channel = '官网表单';
      note = `询盘 #${r.id}(${r.lang})${r.ai_summary ? ' · ' + r.ai_summary : ''}`; dealName = `${r.category || '询盘需求'}${r.volume ? ' · ' + r.volume : ''}`;
      contact = { name: r.name, email: r.email, lang: r.lang, whatsapp: r.whatsapp || null };
    } else {
      const r = await db.prepare(`SELECT * FROM prospects WHERE id=?`).bind(id).first<any>(); if (!r) return json({ ok: false, msg: '名单不存在' }, 404);
      name = r.company && r.company !== r.brand ? `${r.brand}(${r.company})` : r.brand; country = r.country; website = r.website; type = r.segment || '品牌方'; channel = 'AI 获客';
      note = `${r.positioning || ''}${r.hook ? ' · 切入点:' + r.hook : ''}`; dealName = `${r.brand} 代工机会`;
      try { extraContacts = (JSON.parse(r.contact_channels || '[]') as string[]).filter((x) => /^[^@\s]+@[^@\s]+$/.test(x)); } catch { /* 没有就没有 */ }
    }
    // 去重:先按官网域名,再按公司名(不区分大小写)。已有就挂到那个客户上,不建第二个。
    let co = website ? await db.prepare(`SELECT id, owner_uid FROM companies WHERE lower(replace(replace(replace(website,'https://',''),'http://',''),'www.',''))=?`).bind(host(website)).first<any>() : null;
    if (!co) co = await db.prepare(`SELECT id, owner_uid FROM companies WHERE lower(name)=lower(?)`).bind(name).first<any>();
    let company_id: number, created = false;
    if (co) company_id = co.id;
    else {
      const ins = await db.prepare(`INSERT INTO companies (name, country, channel, type, website, note, owner_uid, source, source_id) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`)
        .bind(name, country, channel, type, website, note, uid, from, id).first<{ id: number }>();
      company_id = ins!.id; created = true;
    }
    if (contact?.email && !(await db.prepare(`SELECT id FROM contacts WHERE company_id=? AND email=?`).bind(company_id, contact.email).first()))
      await db.prepare(`INSERT INTO contacts (company_id, name, email, lang, whatsapp) VALUES (?,?,?,?,?)`).bind(company_id, contact.name, contact.email, contact.lang, contact.whatsapp).run();
    if (from === 'prospect') {   // 决策人(姓名 / 职位 / LinkedIn / 公开邮箱)一起转成联系人
      const { results: dms } = await db.prepare(`SELECT name, title, linkedin, email FROM prospect_contacts WHERE prospect_id=?`).bind(id).all<any>().catch(() => ({ results: [] as any[] }));
      for (const d of dms) if (!(await db.prepare(`SELECT id FROM contacts WHERE company_id=? AND name=?`).bind(company_id, d.name).first()))
        await db.prepare(`INSERT INTO contacts (company_id, name, title, email, linkedin) VALUES (?,?,?,?,?)`).bind(company_id, d.name, d.title, d.email, d.linkedin).run();
    }
    for (const e of extraContacts.slice(0, 3))
      if (!(await db.prepare(`SELECT id FROM contacts WHERE company_id=? AND email=?`).bind(company_id, e).first()))
        await db.prepare(`INSERT INTO contacts (company_id, name, email, title) VALUES (?,?,?,?)`).bind(company_id, e.split('@')[0], e, '职能邮箱').run();
    // 同一来源重复点「转客户」不再建第二个机会:已有同名未关闭机会就复用
    const dup = await db.prepare(`SELECT id FROM deals WHERE company_id=? AND name=? AND stage NOT IN ('won','lost')`).bind(company_id, dealName).first<{ id: number }>();
    if (dup) return json({ ok: true, company_id, deal_id: dup.id, created: false });
    const deal = await db.prepare(`INSERT INTO deals (company_id, name, stage, prob, owner_uid) VALUES (?,?,'discover',10,?) RETURNING id`).bind(company_id, dealName, uid).first<{ id: number }>();
    await act(company_id, deal!.id, 'system', from === 'inquiry' ? `由询盘 #${id} 转入` : `由定向外联名单 #${id} 转入`);
    if (from === 'inquiry') { const r = await db.prepare(`SELECT message FROM inquiries WHERE id=?`).bind(id).first<any>(); if (r?.message) await act(company_id, deal!.id, 'email', `询盘原文:${r.message}`); }
    await touch(company_id);
    return json({ ok: true, company_id, deal_id: deal!.id, created });
  }

  if (b.op === 'company') {
    const f = { name: s(b.name, 200), country: s(b.country, 60), channel: s(b.channel, 60), type: s(b.type, 60), website: s(b.website, 300), annual_volume: s(b.annual_volume, 120), tags: s(b.tags, 300), note: s(b.note, 4000) };
    if (b.id) {
      const cur = await db.prepare(`SELECT owner_uid FROM companies WHERE id=?`).bind(Number(b.id)).first<any>(); if (!cur) return json({ ok: false, msg: '客户不存在' }, 404);
      if (cur.owner_uid && cur.owner_uid !== uid && c.sess.role !== 'admin') return json({ ok: false, msg: '这个客户归属别人,不能改(防撞单)' }, 403);
      const sets = Object.entries(f).filter(([k]) => b[k] !== undefined);
      if (sets.length) await db.prepare(`UPDATE companies SET ${sets.map(([k]) => `${k}=?`).join(', ')}, updated_at=datetime('now') WHERE id=?`).bind(...sets.map(([, v]) => v), Number(b.id)).run();
      return json({ ok: true, id: Number(b.id) });
    }
    if (!f.name) return json({ ok: false, msg: '公司名必填' }, 400);
    const dup = await db.prepare(`SELECT id FROM companies WHERE lower(name)=lower(?)`).bind(f.name).first<any>(); if (dup) return json({ ok: false, msg: `已有同名客户 #${dup.id},别建第二个` }, 409);
    const ins = await db.prepare(`INSERT INTO companies (name, country, channel, type, website, annual_volume, tags, note, owner_uid, source) VALUES (?,?,?,?,?,?,?,?,?,'manual') RETURNING id`)
      .bind(f.name, f.country, f.channel, f.type, f.website, f.annual_volume, f.tags, f.note, uid).first<{ id: number }>();
    await act(ins!.id, null, 'system', '手动建档'); return json({ ok: true, id: ins!.id });
  }

  if (b.op === 'claim') {
    const id = Number(b.id); const cur = await db.prepare(`SELECT owner_uid FROM companies WHERE id=?`).bind(id).first<any>(); if (!cur) return json({ ok: false, msg: '客户不存在' }, 404);
    if (cur.owner_uid && cur.owner_uid !== uid && c.sess.role !== 'admin') return json({ ok: false, msg: '已被认领,不能抢' }, 403);
    if (b.release) { await db.prepare(`UPDATE companies SET owner_uid=NULL, updated_at=datetime('now') WHERE id=?`).bind(id).run(); await act(id, null, 'status', '放回公海'); return json({ ok: true }); }
    await db.prepare(`UPDATE companies SET owner_uid=?, updated_at=datetime('now') WHERE id=?`).bind(Number(b.to) || uid, id).run();
    await act(id, null, 'status', Number(b.to) && Number(b.to) !== uid ? `归属改为用户 #${Number(b.to)}` : '认领(从公海)'); return json({ ok: true });
  }

  if (b.op === 'contact') {
    const company_id = Number(b.company_id); if (!company_id || !s(b.name, 120)) return json({ ok: false, msg: '姓名必填' }, 400);
    const ins = await db.prepare(`INSERT INTO contacts (company_id, name, title, email, whatsapp, lang, note) VALUES (?,?,?,?,?,?,?) RETURNING id`)
      .bind(company_id, s(b.name, 120), s(b.title, 120), s(b.email, 200), s(b.whatsapp, 60), s(b.lang, 40), s(b.note, 500)).first<{ id: number }>();
    await touch(company_id); return json({ ok: true, id: ins!.id });
  }

  if (b.op === 'deal') {
    const stage = b.stage && STAGES[b.stage] ? String(b.stage) : undefined;
    if (b.id) {
      const cur = await db.prepare(`SELECT company_id, stage FROM deals WHERE id=?`).bind(Number(b.id)).first<any>(); if (!cur) return json({ ok: false, msg: '机会不存在' }, 404);
      const f: Record<string, unknown> = {};
      if (s(b.name, 200)) f.name = s(b.name, 200);
      if (b.amount !== undefined) f.amount = b.amount === '' || b.amount == null ? null : Number(b.amount) || 0;
      if (b.close_date !== undefined) f.close_date = s(b.close_date, 10);
      if (b.lost_reason !== undefined) f.lost_reason = s(b.lost_reason, 200);
      if (b.competitor !== undefined) f.competitor = s(b.competitor, 120);
      if (stage) { f.stage = stage; f.prob = STAGES[stage][1]; }
      const keys = Object.keys(f); if (!keys.length) return json({ ok: false, msg: '没有要改的字段' }, 400);
      await db.prepare(`UPDATE deals SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=datetime('now') WHERE id=?`).bind(...keys.map((k) => f[k]), Number(b.id)).run();
      if (stage && stage !== cur.stage) await act(cur.company_id, Number(b.id), 'status', `阶段:${STAGES[cur.stage]?.[0] ?? cur.stage} → ${STAGES[stage][0]}${stage === 'lost' && f.lost_reason ? '(' + f.lost_reason + ')' : ''}`);
      await touch(cur.company_id); return json({ ok: true });
    }
    const company_id = Number(b.company_id); if (!company_id || !s(b.name, 200)) return json({ ok: false, msg: '机会名必填' }, 400);
    const st = stage ?? 'discover';
    const ins = await db.prepare(`INSERT INTO deals (company_id, name, stage, prob, amount, close_date, owner_uid) VALUES (?,?,?,?,?,?,?) RETURNING id`)
      .bind(company_id, s(b.name, 200), st, STAGES[st][1], b.amount ? Number(b.amount) || null : null, s(b.close_date, 10), uid).first<{ id: number }>();
    await act(company_id, ins!.id, 'system', `新建机会:${s(b.name, 200)}`); await touch(company_id); return json({ ok: true, id: ins!.id });
  }

  if (b.op === 'activity') {
    const company_id = Number(b.company_id), text = s(b.text, 4000); if (!company_id || !text) return json({ ok: false, msg: '内容不能为空' }, 400);
    const kind = KINDS.has(b.kind) ? String(b.kind) : 'note';
    await act(company_id, Number(b.deal_id) || null, kind, text); await touch(company_id); return json({ ok: true });
  }
  /* 报价单:行项目 [{name, qty, unit_price, cost}];subtotal / cost_total / margin 服务端算。cost 与 margin 只回给 admin(字段级脱敏,原型 metadata.ts 的 sensitive 思路)。 */
  if (b.op === 'quote') {
    const company_id = Number(b.company_id), deal_id = Number(b.deal_id) || null;
    let lines: any[] = [];
    try { lines = Array.isArray(b.lines) ? b.lines : JSON.parse(String(b.lines || '[]')); } catch { return json({ ok: false, msg: '行项目格式不对' }, 400); }
    lines = lines.map((l) => ({ name: s(l.name, 120) ?? '', qty: Number(l.qty) || 0, unit_price: Number(l.unit_price) || 0, cost: l.cost === '' || l.cost == null ? null : Number(l.cost) || 0 })).filter((l) => l.name && l.qty > 0);
    if (b.id) {
      const cur = await db.prepare(`SELECT company_id, status FROM quotes WHERE id=?`).bind(Number(b.id)).first<any>(); if (!cur) return json({ ok: false, msg: '报价单不存在' }, 404);
      const st = ['draft', 'sent', 'accepted', 'rejected', 'expired'].includes(b.status) ? String(b.status) : null;
      if (st) { await db.prepare(`UPDATE quotes SET status=?, updated_at=datetime('now') WHERE id=?`).bind(st, Number(b.id)).run(); if (st !== cur.status) await act(cur.company_id, deal_id, 'quote', `报价单 #${b.id}:${cur.status} → ${st}`); }
      await touch(cur.company_id); return json({ ok: true, id: Number(b.id) });
    }
    if (!company_id || !lines.length) return json({ ok: false, msg: '至少一行:品名、数量、单价' }, 400);
    const subtotal = lines.reduce((t, l) => t + l.qty * l.unit_price, 0);
    const hasCost = lines.every((l) => l.cost != null); const cost_total = hasCost ? lines.reduce((t, l) => t + l.qty * (l.cost as number), 0) : null;
    const margin = hasCost && subtotal > 0 ? Math.round((subtotal - (cost_total as number)) / subtotal * 1000) / 10 : null;
    const code = `Q${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${company_id}`;
    const ins = await db.prepare(`INSERT INTO quotes (company_id, deal_id, code, currency, lines_json, subtotal, cost_total, margin, valid_until, note, uid) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
      .bind(company_id, deal_id, code, s(b.currency, 8) ?? 'USD', JSON.stringify(lines), subtotal, cost_total, margin, s(b.valid_until, 10), s(b.note, 500), uid).first<{ id: number }>();
    await act(company_id, deal_id, 'quote', `新建报价单 ${code}:${lines.length} 项,合计 ${subtotal.toLocaleString()} ${s(b.currency, 8) ?? 'USD'}`);
    if (deal_id) { await db.prepare(`UPDATE deals SET amount=COALESCE(amount, ?), stage=CASE WHEN stage IN ('discover','design','sampling') THEN 'quote' ELSE stage END, prob=CASE WHEN stage IN ('discover','design','sampling') THEN 60 ELSE prob END, updated_at=datetime('now') WHERE id=?`).bind(subtotal, deal_id).run(); }
    await touch(company_id); return json({ ok: true, id: ins!.id, code });
  }

  /* 寄样:寄出 → 反馈截止日 → 反馈;今日待办按 feedback_due 催 */
  if (b.op === 'sample') {
    const company_id = Number(b.company_id), deal_id = Number(b.deal_id) || null;
    if (b.id) {
      const cur = await db.prepare(`SELECT company_id FROM samples WHERE id=?`).bind(Number(b.id)).first<any>(); if (!cur) return json({ ok: false, msg: '寄样记录不存在' }, 404);
      const f: Record<string, unknown> = {};
      if (b.feedback !== undefined) { f.feedback = s(b.feedback, 2000); f.status = 'feedback'; }
      if (['sent', 'received', 'feedback', 'no-response'].includes(b.status)) f.status = String(b.status);
      if (b.tracking !== undefined) f.tracking = s(b.tracking, 80);
      const keys = Object.keys(f); if (!keys.length) return json({ ok: false, msg: '没有要改的字段' }, 400);
      await db.prepare(`UPDATE samples SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=datetime('now') WHERE id=?`).bind(...keys.map((k) => f[k]), Number(b.id)).run();
      if (f.feedback) await act(cur.company_id, deal_id, 'sample', `样品反馈:${String(f.feedback).slice(0, 300)}`);
      await touch(cur.company_id); return json({ ok: true });
    }
    if (!company_id || !s(b.items, 500)) return json({ ok: false, msg: '寄了什么样品必填' }, 400);
    const sent_at = s(b.sent_at, 10) ?? new Date().toISOString().slice(0, 10);
    const due = s(b.feedback_due, 10) ?? new Date(Date.parse(sent_at) + 14 * 86400000).toISOString().slice(0, 10);   // 默认寄出 14 天后要反馈
    const ins = await db.prepare(`INSERT INTO samples (company_id, deal_id, items, sent_at, carrier, tracking, feedback_due, uid) VALUES (?,?,?,?,?,?,?,?) RETURNING id`)
      .bind(company_id, deal_id, s(b.items, 500), sent_at, s(b.carrier, 40), s(b.tracking, 80), due, uid).first<{ id: number }>();
    await act(company_id, deal_id, 'sample', `寄样:${s(b.items, 500)}${b.tracking ? ' · ' + s(b.tracking, 80) : ''} · 反馈截止 ${due}`);
    if (deal_id) await db.prepare(`UPDATE deals SET stage=CASE WHEN stage IN ('discover','design') THEN 'sampling' ELSE stage END, prob=CASE WHEN stage IN ('discover','design') THEN 40 ELSE prob END, updated_at=datetime('now') WHERE id=?`).bind(deal_id).run();
    await touch(company_id); return json({ ok: true, id: ins!.id, feedback_due: due });
  }
  return json({ ok: false, msg: '未知 op' }, 400);
};
