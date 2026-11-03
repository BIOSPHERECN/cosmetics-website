import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';

export const prerender = false;

/* 海关线索(customs_buyers)的两个动作:
   PATCH {id, status}           new / pushed / skip
   POST  {op:'push', id}        手动「进线索」:按已算好的 icp_score / icp_reason 建一条 prospects(source='customs-us'),回填 prospect_id。
   评分本身在 tools/prospect/customs-score.py(纯规则),这里不重算,只搬。website 为空就用提单页 URL 占位(prospects.website 非空唯一)。 */
const OK = new Set(['new', 'pushed', 'skip']);
const ZH: Record<string, string> = { China: '中国', 'South Korea': '韩国', 'Taiwan, Republic of China': '台湾', Thailand: '泰国', Japan: '日本', Vietnam: '越南', France: '法国', Italy: '意大利' };
const COUNTRY: Record<string, [string, string]> = { US: ['us', 'United States'], CA: ['ca', 'Canada'], MX: ['mx', 'Mexico'], GB: ['gb', 'United Kingdom'], ES: ['es', 'Spain'], AU: ['au', 'Australia'] };
const list = (v: unknown): any[] => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; } };

export const PATCH: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { id, status } = (await request.json().catch(() => ({}))) as { id?: number; status?: string };
  if (!id || !status || !OK.has(status)) return json({ ok: false, msg: '参数不合法' }, 400);
  await c.db.prepare(`UPDATE customs_buyers SET status=? WHERE id=?`).bind(status, id).run();
  return json({ ok: true });
};

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const { op, id } = (await request.json().catch(() => ({}))) as { op?: string; id?: number };
  if (op !== 'push' || !id) return json({ ok: false, msg: '参数不合法' }, 400);
  const b = await c.db.prepare(`SELECT * FROM customs_buyers WHERE id=?`).bind(id).first<any>();
  if (!b) return json({ ok: false, msg: '不存在' }, 404);
  if (b.prospect_id) return json({ ok: true, prospect_id: b.prospect_id, existed: true });
  let web: string = b.website && b.website.includes('.') ? b.website : b.source_url;
  if (web && !/^https?:/.test(web)) web = 'https://' + web;
  const [mk, cn] = COUNTRY[b.country] ?? [String(b.country).toLowerCase(), b.country];
  const sup = list(b.top_suppliers_json); const orig = list(b.top_origins_json);
  const from = orig.slice(0, 2).map((o) => ZH[o.country] ?? o.country).filter(Boolean).join('、') || '海外';
  const hook = b.shipments_12m != null ? `贵司近 12 个月从 ${from} 进口 ${b.shipments_12m} 批化妆品类产品(公开提单口径)` : `贵司有从 ${from} 进口化妆品类产品的公开提单记录`;
  await c.db.prepare(
    `INSERT OR IGNORE INTO prospects (brand, website, market, country, company, segment, scale_signals, mfg_signal, icp_score, icp_reason, hook, next_step, source, model, status)
     VALUES (?, ?, ?, ?, ?, 'importer', ?, ?, ?, ?, ?, ?, 'customs-us', 'manual', 'new')`)
    .bind(b.name, web, mk, cn, b.name,
      b.shipments_12m != null ? `公开提单:近 12 个月 ${b.shipments_12m} 批海运进口` : null,
      sup.length ? '现有供应商:' + sup.slice(0, 3).map((s) => `${s.name}(${s.country})`).join('、') : null,
      b.icp_score ?? null, b.icp_reason ?? null, hook, '先核实官网与采购负责人,再按知识库「工厂口径」发开发信').run();
  const p = await c.db.prepare(`SELECT id FROM prospects WHERE website=?`).bind(web).first<{ id: number }>();
  if (!p) return json({ ok: false, msg: '写入线索失败' }, 500);
  await c.db.prepare(`UPDATE customs_buyers SET prospect_id=?, status='pushed' WHERE id=?`).bind(p.id, id).run();
  return json({ ok: true, prospect_id: p.id });
};
