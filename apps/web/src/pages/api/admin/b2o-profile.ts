import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';
import { TRUST } from '../../../lib/b2o';
import { FIELDS, SRC, ROLES, ACTS, PROVEN, REF_RE, calcGrade, fourDone, planTrust, piiHit, nextWorkday18, type GradeIn, type Sku } from '../../../lib/b2o-crm';

export const prerender = false;

/* 客户档案详情页的写接口(C2,2026-09-24)。页面 /bohui/b2o-profile/?id=N。
   op:save 企业层字段 + 分级输入(分级由代码按公式重算)/ grade-ok 确认分级 / trust 记沟通(等级变更必须附证据)/
       confirm、reject 主管确认或驳回待确认的等级 / sku 产品矩阵六角色 / contact 加联系人(只存内部编号)/ consent 记同意 / next 下一步。
   读量:每次 ≤ 档案 1 行 + companies 1 行(+ 首次建主键时按 inquiry 找 1 次,companies 全表现 ~1 行)+ 待确认记录 ≤ 20 行;写 ≤ 10 行。无定时任务。
   个人信息(G13):不读不写 contact / wechat / phone / email;证据和文字过 piiHit,联系人只收 contact_ref。 */

type P = Record<string, any>;
const s = (v: unknown, n = 500) => String(v ?? '').trim().slice(0, n);
const bad = (msg: string, code = 400) => json({ ok: false, msg }, code);
const jparse = <T>(t: unknown, d: T): T => { try { return JSON.parse(String(t ?? '')) ?? d; } catch { return d; } };

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const db = c.db, uid = c.sess.uid, boss = c.sess.role === 'admin';   // 主管 = 业务负责人,未指定前老板兼;系统里先用 admin(03-v2 §7.5)
  const b = (await request.json().catch(() => ({}))) as P;
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return bad('缺档案 id');
  const p = await db.prepare(`SELECT id, inquiry_id, company, company_id, trust_level, pool, seller_type, grade, grade_in_json, src_json, source_channel,
      store_url, hero_urls, factory_pain, markets_next, cats_next, test_cycle, brief_due_at, contact_ref FROM b2o_profiles WHERE id=?`).bind(id).first<P>();
  if (!p) return bad('档案不存在', 404);
  if (!boss) {   // 撞单保护:别人认领的客户只能看 —— 还没挂 company_id、但询盘已转成别人名下客户的,所有 op 一样挡
    // ponytail: source/source_id 无索引,companies 现 ~60 行全扫;过万行再加 (source, source_id) 索引
    const co = p.company_id ? await db.prepare(`SELECT owner_uid FROM companies WHERE id=?`).bind(p.company_id).first<P>()
      : p.inquiry_id ? await db.prepare(`SELECT owner_uid FROM companies WHERE source='inquiry' AND source_id=?`).bind(p.inquiry_id).first<P>() : null;
    if (co?.owner_uid && co.owner_uid !== uid) return bad('这家客户归别的顾问,你只能看', 403);
  }

  /** 建档即建 companies 行(03-v2 结论 1);已由询盘转过的直接挂上。公海,不抢归属 */
  const ensureCompany = async (): Promise<number> => {
    if (p.company_id) return p.company_id;
    let co = p.inquiry_id ? await db.prepare(`SELECT id, owner_uid FROM companies WHERE source='inquiry' AND source_id=?`).bind(p.inquiry_id).first<P>() : null;
    if (co?.owner_uid && co.owner_uid !== uid && !boss) throw new Error('owned');   // 询盘转过、归别人的客户:不挂、不写
    if (!co) co = await db.prepare(`INSERT INTO companies (name, type, channel, source, source_id) VALUES (?, 'cn-seller', ?, ?, ?) RETURNING id`)
      .bind(p.company || `B2O-${id}`, (p.source_channel || '').split('-')[0] || null, p.inquiry_id ? 'inquiry' : 'manual', p.inquiry_id || null).first<P>();
    await db.prepare(`UPDATE b2o_profiles SET company_id=? WHERE id=? AND company_id IS NULL`).bind(co!.id, id).run();
    return (p.company_id = co!.id);
  };
  const regrade = (q: P, gi: GradeIn) => calcGrade(q.seller_type, gi, fourDone(q));

  if (b.op === 'save') {
    const f = (b.f ?? {}) as P, src = jparse<P>(p.src_json, {});
    const sets: string[] = [], vals: unknown[] = [];
    for (const d of FIELDS) {
      if (!(d.k in f)) continue;
      const v = s(f[d.k], d.k === 'money_model' ? 300 : 500);
      if (d.t !== 'url') { const hit = piiHit(v); if (hit) return bad(`「${d.label}」里像是${hit}。个人联系方式只放企业微信,不进后台`); }
      if (d.opts && !d.opts.some(([k]) => k === v)) return bad(`「${d.label}」选项不对`);
      sets.push(`${d.k}=?`); vals.push(v || null);
      p[d.k] = v || null;
    }
    for (const [k, v] of Object.entries((b.src ?? {}) as P)) if (FIELDS.some((d) => d.k === k) && SRC.some(([x]) => x === v)) { if (v) src[k] = v; else delete src[k]; }
    const st = s(b.seller_type, 20), gi0 = (b.gi ?? {}) as P;
    const gi: GradeIn = { cat: s(gi0.cat, 5), scale: Array.isArray(gi0.scale) ? gi0.scale.map((x: unknown) => s(x, 10)).slice(0, 4) : [], timing: s(gi0.timing, 5), reach: s(gi0.reach, 10), x: s(gi0.x, 10), small_only: !!gi0.small_only };
    p.seller_type = st || null;
    const g = regrade(p, gi);
    const reset = g.grade !== p.grade ? ', grade_ok_by=NULL' : '';   // 级变了要重新确认
    await db.prepare(`UPDATE b2o_profiles SET ${sets.map((x) => x + ', ').join('')}src_json=?, seller_type=?, grade_in_json=?, grade=?, grade_score=?, grade_why=?${reset},
        pool=CASE WHEN ?='X' THEN 'dropped' ELSE pool END, updated_at=datetime('now') WHERE id=?`)
      .bind(...vals, JSON.stringify(src), p.seller_type, JSON.stringify(gi), g.grade, g.score, g.why, g.grade, id).run();
    if (g.grade === 'X' && p.grade !== 'X') await db.prepare(`INSERT INTO b2o_trust_log (profile_id, company_id, from_lv, to_lv, kind, evidence_type, evidence, trig, by_uid) VALUES (?,?,?,?, 'drop', 'system', ?, 'refuse-x', ?)`)
      .bind(id, p.company_id ?? null, p.trust_level, p.trust_level, g.why.slice(0, 100), uid).run();
    return json({ ok: true, msg: `已保存 · 分级 ${g.grade ?? '—'}${g.score !== null ? `(${g.score} 分)` : ''}`, grade: g });
  }

  if (b.op === 'grade-ok') {
    if (!p.grade) return bad('还没算出分级,先选卖家类型并保存');
    await db.prepare(`UPDATE b2o_profiles SET grade_ok_by=?, updated_at=datetime('now') WHERE id=?`).bind(uid, id).run();
    return json({ ok: true, msg: `已确认 ${p.grade} 级` });
  }

  if (b.op === 'trust') {
    const a = ACTS[String(b.act)];
    if (!a) return bad('先选客户做了什么');
    const ev = s(b.evidence, 100), et = b.evidence_type === 'action' ? 'action' : 'quote';
    if (ev.length < 4) return bad('必须附证据:贴客户原话或写清客户做了什么(4–100 字)');
    const hit = piiHit(ev); if (hit) return bad(`证据里像是${hit}。只写原话摘要,不写联系方式`);
    const cur = Number(p.trust_level) || 0, plan = planTrust(cur, p.pool || 'active', String(b.act), boss)!;
    let cid: number;
    try { cid = await ensureCompany(); } catch { return bad('这家客户归别的顾问,你只能看', 403); }
    const stmts: D1PreparedStatement[] = [];
    const ch = ['wecom', 'wechat', 'visit', 'show', 'call'].includes(b.channel) ? b.channel : 'wecom';
    stmts.push(db.prepare(`INSERT INTO activities (company_id, kind, text, uid, direction, trig, cust_act, effective, evidence, lv_at) VALUES (?,?,?,?, 'in', ?, ?, ?, ?, ?)`)
      .bind(cid, ch, `记沟通:${a.label.split(' ·')[0]} → ${plan.note}`, uid, a.trig, String(b.act), b.act === 'store' ? 1 : 0, ev, cur));
    for (const r of plan.rows) {
      const e = r.backfill ? `补记:由「${a.label.split('(')[0]}」带过:${ev}`.slice(0, 100) : ev;
      stmts.push(db.prepare(`INSERT INTO b2o_trust_log (profile_id, company_id, from_lv, to_lv, kind, evidence_type, evidence, trig, ref_type, next_proof, by_uid, confirmed_by, pending)
          VALUES (?,?,?,?,?,?,?,?, 'activity', ?, ?, ?, ?)`)
        .bind(id, cid, r.from, r.to, r.kind, a.hard ? 'action' : et, e, a.trig, TRUST[r.to]?.proof ?? null, uid, boss && (r.to >= 5 || r.kind === 'down') ? uid : null, r.pending));
    }
    const lvChanged = plan.lv !== cur;
    stmts.push(db.prepare(`UPDATE b2o_profiles SET last_in_at=datetime('now'), silent_n=0,
        trust_level=?, trust_at=CASE WHEN ? THEN datetime('now') ELSE trust_at END, proven_json=CASE WHEN ? THEN ? ELSE proven_json END,
        next_proof=CASE WHEN ? THEN ? ELSE next_proof END, pool=COALESCE(?, pool), grade=CASE WHEN ? THEN 'X' ELSE grade END,
        grade_in_json=CASE WHEN ? THEN json_set(grade_in_json, '$.x', 'other') ELSE grade_in_json END,
        brief_due_at=CASE WHEN ? AND brief_due_at IS NULL THEN ? ELSE brief_due_at END, updated_at=datetime('now') WHERE id=?`)
      .bind(plan.lv, lvChanged ? 1 : 0, lvChanged ? 1 : 0, JSON.stringify(PROVEN.slice(0, plan.lv)), lvChanged ? 1 : 0, TRUST[plan.lv]?.proof ?? null,
        plan.pool, b.act === 'x' ? 1 : 0, b.act === 'x' ? 1 : 0, b.act === 'store' ? 1 : 0, nextWorkday18(new Date()), id));
    if (b.act === 'dnd') stmts.push(db.prepare(`UPDATE contacts SET dnd_at=datetime('now') WHERE company_id=? AND dnd_at IS NULL`).bind(cid));
    await db.batch(stmts);
    return json({ ok: true, msg: plan.note });
  }

  if (b.op === 'confirm' || b.op === 'reject') {
    if (!boss) return bad('只有主管(业务负责人,未指定前老板)能确认', 403);
    const rows = (await db.prepare(`SELECT id, to_lv, kind, pending FROM b2o_trust_log WHERE profile_id=? AND confirmed_by IS NULL AND pending IN (0,1)
        AND (pending=1 OR to_lv>=5 OR kind='down') ORDER BY id LIMIT 20`).bind(id).all<P>()).results;
    if (!rows.length) return bad('没有待确认的记录');
    const stmts = rows.map((r) => db.prepare(`UPDATE b2o_trust_log SET confirmed_by=?, pending=? WHERE id=?`).bind(uid, b.op === 'reject' ? 2 : 0, r.id));   // 驳回一律记 2:硬信号已落的级不回退,但记录要显示「主管驳回」而不是「已确认」
    const last = [...rows].reverse().find((r) => r.pending === 1);
    if (b.op === 'confirm' && last) stmts.push(db.prepare(`UPDATE b2o_profiles SET trust_level=?, trust_at=datetime('now'), proven_json=?, next_proof=?, updated_at=datetime('now') WHERE id=?`)
      .bind(last.to_lv, JSON.stringify(PROVEN.slice(0, last.to_lv)), TRUST[last.to_lv]?.proof ?? null, id));
    await db.batch(stmts);
    return json({ ok: true, msg: b.op === 'confirm' ? (last ? `已确认,落到 L${last.to_lv}` : '已确认') : '已驳回(硬信号已落的级不回退,只记驳回)' });
  }

  if (b.op === 'sku') {
    const list = (Array.isArray(b.skus) ? b.skus : []).slice(0, 60).map((x: P): Sku => ({ sku: s(x.sku, 120), url: s(x.url, 300), role: s(x.role, 4), price: s(x.price, 30), note: s(x.note, 120) }))
      .filter((x: Sku) => x.sku);
    if (list.some((x: Sku) => !ROLES.includes(x.role))) return bad(`每款都要选一个角色:${ROLES.join(' / ')}`);
    const gap = s(b.gap_note, 500), hit = piiHit(gap + list.map((x: Sku) => x.sku + x.note).join(' '));
    if (hit) return bad(`里面像是${hit},删掉再存`);
    await db.prepare(`UPDATE b2o_profiles SET sku_roles_json=?, gap_note=?, updated_at=datetime('now') WHERE id=?`).bind(JSON.stringify(list), gap || null, id).run();
    return json({ ok: true, msg: `已保存 ${list.length} 款` });
  }

  if (b.op === 'contact') {
    const ref = s(b.contact_ref, 30);
    if (!REF_RE.test(ref)) return bad('内部编号格式:客户代号-角色,如 C9001-选品(角色:老板/选品/产品/供应链/运营/采购/其他)。不写姓名');
    const role = { 老板: 'boss', 选品: 'selection', 产品: 'selection', 供应链: 'supply', 运营: 'ops' }[ref.split('-')[1].replace(/\d$/, '')] ?? 'other';
    let cid: number;
    try { cid = await ensureCompany(); } catch { return bad('这家客户归别的顾问,你只能看', 403); }
    if (await db.prepare(`SELECT 1 FROM contacts WHERE company_id=? AND contact_ref=?`).bind(cid, ref).first()) return bad('这个编号已经有了');
    await db.batch([
      db.prepare(`INSERT INTO contacts (company_id, name, contact_ref, role, is_decision, consent_at) VALUES (?,?,?,?,?, CASE WHEN ? THEN datetime('now') END)`)
        .bind(cid, ref, ref, role, b.is_decision ? 1 : 0, b.consent ? 1 : 0),
      db.prepare(`UPDATE b2o_profiles SET contact_ref=COALESCE(contact_ref, ?), updated_at=datetime('now') WHERE id=?`).bind(ref, id),
    ]);
    return json({ ok: true, msg: '已加联系人(只存编号,手机号和微信放企业微信)' });
  }

  if (b.op === 'consent') {
    const via = ['web-checkbox', 'wecom-first-msg', 'paper', 'verbal-noted'].includes(b.via) ? b.via : '';
    if (!via) return bad('选同意方式');
    await db.prepare(`UPDATE b2o_profiles SET consent_at=datetime('now'), consent_via=?, consent_ver=?, consent_xb_at=CASE WHEN ? THEN datetime('now') ELSE consent_xb_at END,
        updated_at=datetime('now') WHERE id=?`).bind(via, s(b.ver, 40) || 'pi-2026-09-v1', b.xb ? 1 : 0, id).run();
    return json({ ok: true, msg: b.xb ? '已记处理同意 + 出境单独同意' : '已记处理同意(出境单独同意未记)' });
  }

  if (b.op === 'next') {
    const t = s(b.next_proof, 100) + s(b.next_action, 200);
    const hit = piiHit(t); if (hit) return bad(`里面像是${hit}`);
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.next_due)) ? b.next_due : null;
    await db.prepare(`UPDATE b2o_profiles SET next_proof=?, next_action=?, next_due=?, updated_at=datetime('now') WHERE id=?`)
      .bind(s(b.next_proof, 100) || null, s(b.next_action, 200) || null, due, id).run();
    return json({ ok: true, msg: '已保存下一步' });
  }
  return bad('未知操作');
};
