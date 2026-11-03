import type { APIRoute } from 'astro';
import { apiGuard } from '../../../lib/guard';

export const prerender = false;

/* 与 WorkBuddy 原型互通:按它 metadata.ts 的对象名与字段名(account / contact / lead / opportunity)导出 JSON,
   原型的 store.ts 直接 import;它那边导出的同结构 JSON 以后也按这套字段收。线索 = 询盘(官网表单)+ 定向外联名单(AI 获客)。 */
export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const db = c.db;
  const [co, ct, dl, inq, pr] = await Promise.all([
    db.prepare(`SELECT * FROM companies ORDER BY id`).all<any>(), db.prepare(`SELECT * FROM contacts ORDER BY id`).all<any>(), db.prepare(`SELECT * FROM deals ORDER BY id`).all<any>(),
    db.prepare(`SELECT id, name, company, country, category, volume, ai_grade, ai_summary, status, created_at FROM inquiries WHERE status<>'archived' ORDER BY id DESC LIMIT 500`).all<any>(),
    db.prepare(`SELECT id, brand, country, market, icp_score, categories, hook, next_step, status, created_at FROM prospects ORDER BY icp_score DESC LIMIT 1000`).all<any>(),
  ]);
  const STAGE_LEAD: Record<string, string> = { new: 'new', sent: 'contacted', replied: 'qualified', meeting: 'qualified', quoted: 'sampling', won: 'won', lost: 'lost', skip: 'lost' };
  const out = {
    exportedAt: new Date().toISOString(), source: 'biosphere-ai.com /bohui',
    account: co.results.map((r) => ({ id: `a${r.id}`, name: r.name, country: r.country, channel: r.channel, type: r.type, website: r.website, annualVolume: r.annual_volume, tags: (r.tags || '').split(/[,，]/).map((x: string) => x.trim()).filter(Boolean), note: r.note, ownerId: r.owner_uid ? `u${r.owner_uid}` : null, createdAt: r.created_at })),
    contact: ct.results.map((r) => ({ id: `c${r.id}`, name: r.name, title: r.title, email: r.email, whatsapp: r.whatsapp, accountId: `a${r.company_id}`, lang: r.lang })),
    opportunity: dl.results.map((r) => ({ id: `o${r.id}`, name: r.name, stage: r.stage, amount: r.amount, winRate: r.prob, closeDate: r.close_date, accountId: `a${r.company_id}`, lostReason: r.lost_reason, competitor: r.competitor, ownerId: r.owner_uid ? `u${r.owner_uid}` : null })),
    lead: [
      ...inq.results.map((r) => ({ id: `li${r.id}`, name: r.company || r.name, stage: r.status === 'new' ? 'new' : r.status === 'following' ? 'contacted' : r.status === 'replied' ? 'qualified' : r.status === 'won' ? 'won' : 'contacted', score: r.ai_grade === 'A' ? 90 : r.ai_grade === 'B' ? 60 : r.ai_grade === 'C' ? 30 : null, country: r.country, source: '官网表单', intent: [r.category, r.volume].filter(Boolean).join(' · '), nextAction: r.ai_summary, createdAt: r.created_at })),
      ...pr.results.map((r) => ({ id: `lp${r.id}`, name: r.brand, stage: STAGE_LEAD[r.status] ?? 'new', score: r.icp_score, country: r.country, source: 'AI 获客', intent: r.categories, nextAction: r.next_step, createdAt: r.created_at })),
    ],
  };
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="sueai-crm-${new Date().toISOString().slice(0, 10)}.json"` } });
};
