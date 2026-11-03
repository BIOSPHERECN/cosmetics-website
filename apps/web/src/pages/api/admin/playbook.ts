import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, requireAdmin } from '../../../lib/guard';
import { CARD_KINDS } from '../../../lib/kb-cards';
import { chat, loadFleet } from '../../../lib/fleet';

export const prerender = false;

/* 销售知识库:业务员改正文(op=save),或问它(op=ask)。
   问答不做向量库 —— 十来篇 Markdown 加起来不到 3 万字,整段喂给模型比检索准,也省一套基础设施。
   `rules-for-ai` 这一篇被开发信 / 首回的提示词原样带上,所以改它要谨慎:后台标了黄。 */
export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => ({}))) as any;
  if (b.op === 'save') {
    const slug = String(b.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    const title = String(b.title ?? '').trim().slice(0, 120), body = String(b.body ?? '').trim().slice(0, 40000), tags = String(b.tags ?? '').trim().slice(0, 200);
    const kind = String(b.kind ?? '规则').slice(0, 10), stage = String(b.stage ?? '通用').slice(0, 10);
    if (!slug || !title || body.length < 20) return json({ ok: false, msg: 'slug / 标题 / 正文(≥20 字)都要有' }, 400);
    const before = await c.db.prepare(`SELECT body, title, status FROM playbooks WHERE slug=?`).bind(slug).first<{ body: string; title: string; status: string | null }>();
    /* 卡片(知识卡片 / 方法卡)改了标题或正文就回到「待审」,等管理员重新人审 —— 审过的是旧文字,不能替新文字背书 */
    const isCard = CARD_KINDS.includes(kind) || before?.status != null;
    const status = !isCard ? null : before && before.status && before.body === body && before.title === title ? before.status : '待审';
    await c.db.prepare(`INSERT INTO playbooks (slug, kind, stage, title, tags, body, source, uid, status) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET kind=excluded.kind, stage=excluded.stage, title=excluded.title, tags=excluded.tags, body=excluded.body, uid=excluded.uid, status=excluded.status, reviewed_by=CASE WHEN excluded.status='待审' THEN NULL ELSE reviewed_by END, reviewed_at=CASE WHEN excluded.status='待审' THEN NULL ELSE reviewed_at END, updated_at=datetime('now')`)
      .bind(slug, kind, stage, title, tags, body, before ? 'edited' : 'manual', c.sess.uid, status).run();
    // 改过的版本留一份在 revisions,改坏了能找回
    await c.db.prepare(`INSERT INTO revisions (entity, entity_id, before_json, after_json, user_id) VALUES ('playbook', ?, ?, ?, ?)`).bind(slug, JSON.stringify({ body: before?.body ?? null }), JSON.stringify({ body }), c.sess.uid).run().catch(() => {});
    return json({ ok: true, slug });
  }
  if (b.op === 'ask') {
    const q = String(b.q ?? '').trim().slice(0, 1000); if (q.length < 2) return json({ ok: false, msg: '问一句具体的' }, 400);
    // 未经人审(待审)和已下线的卡不喂给模型;普通篇 status 为 NULL 照旧
    const { results } = await c.db.prepare(`SELECT slug, title, body FROM playbooks WHERE status IS NULL OR status='在用' ORDER BY slug`).all<any>();
    /* 外部参考库(WorkBuddy 抓的资料)按关键词取最相关 6 篇片段一起喂 —— 简单 LIKE 检索,不建向量库;每篇只给 1,500 字 */
    const kw = q.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
    let refs: any[] = [];
    if (kw.length) {
      const cond = kw.map(() => '(title LIKE ? OR tags LIKE ? OR body LIKE ?)').join(' OR ');
      refs = (await c.db.prepare(`SELECT title, source_url, substr(body, 1, 1500) body FROM kb_docs WHERE ${cond} LIMIT 6`).bind(...kw.flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`])).all<any>().catch(() => ({ results: [] as any[] }))).results;
    }
    const ctx = (results.map((p) => `### [${p.slug}] ${p.title}\n${p.body}`).join('\n\n') + (refs.length ? '\n\n## 外部参考(只作参考,标 [参考:标题])\n' + refs.map((r) => `### [参考:${r.title}] ${r.source_url ?? ''}\n${r.body}`).join('\n\n') : '')).slice(0, 80000);
    const fleet = await loadFleet(c.db, env as any);
    const r = await chat(env as any, [
      { role: 'system', content: `你是帛卉(BIOSPHERE)外贸团队的销售教练。只根据下面的知识库回答业务员的问题;知识库没有的就说「知识库里没有,建议问经理」并给出你的一般建议(标明是一般建议)。回答用中文,≤250 字,要点式;引用哪篇就在句末标 [slug]。\n\n知识库:\n${ctx}` },
      { role: 'user', content: q }], { fleet, maxTokens: 700, timeoutMs: 30000 });
    const a = String(r.text ?? '').trim(); if (!a) return json({ ok: false, msg: '模型没返回,稍后再试' }, 502);
    return json({ ok: true, answer: a });
  }
  if (b.op === 'review') {
    /* 卡片上下线。「人审通过并上线」只给管理员(销售主管签字这一步);下线谁都能点 —— 拿不准先下线最安全 */
    const slug = String(b.slug ?? '');
    const row = await c.db.prepare(`SELECT status FROM playbooks WHERE slug=?`).bind(slug).first<{ status: string | null }>();
    if (!row || row.status == null) return json({ ok: false, msg: '只有知识卡片 / 方法卡走上下线' }, 400);
    if (b.to === '在用') {
      const deny = requireAdmin(c); if (deny) return json({ ok: false, msg: '人审上线要管理员账号(销售主管)来点' }, 403);
      await c.db.prepare(`UPDATE playbooks SET status='在用', reviewed_by=?, reviewed_at=datetime('now') WHERE slug=?`).bind(c.sess.email, slug).run();
    } else if (b.to === '下线') {
      await c.db.prepare(`UPDATE playbooks SET status='下线' WHERE slug=?`).bind(slug).run();
    } else return json({ ok: false, msg: 'to 只能是 在用 / 下线' }, 400);
    await c.db.prepare(`INSERT INTO revisions (entity, entity_id, before_json, after_json, user_id) VALUES ('playbook', ?, ?, ?, ?)`).bind(slug, JSON.stringify({ status: row.status }), JSON.stringify({ status: b.to }), c.sess.uid).run().catch(() => {});
    return json({ ok: true });
  }
  return json({ ok: false, msg: '未知 op' }, 400);
};
