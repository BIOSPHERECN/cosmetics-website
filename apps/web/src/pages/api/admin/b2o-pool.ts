import type { APIRoute } from 'astro';
import { apiGuard, json } from '../../../lib/guard';
import { VERDICTS, RESULTS, GAPS, frozenHash } from '../../../lib/b2o-pool';

export const prerender = false;

/* 机会卡池写接口(C3 预判引擎 MVP,2026-09-24)。页面 /bohui/b2o-pool/。依据 SOP 02-v2 §4.3 §4.5 §7.2、06-v2 §4.3。
   op:sign   研发签能力闸门(= 七层第 7 层「帛卉匹配」)。只认 lab_role=chief;管理员代录要写原审核人 + 依据(§4.1 一步流程)。
       status 改状态(五选一)。没有研发签字一律拒;研发签「不通过」只能改观察 / 放弃;「推进」只给管理员(老板拍板)。
              第一次改状态 = 预判批准:写 verdict、review_status=approved、due30/60/90、frozen_at、frozen_hash,并追加 b2o_ledger(kind=judgment)。
              冻结后判断原文由 0112 / 0118 触发器锁死,之后再改只动卡片,账本记 status_change。
       review 30/60/90 天复盘:人选 对 / 错 / 部分 / 无法判断 + 错误类型;第 90 天同时定 outcome。
   读量:每次 ≤ 卡 1 行 + 预判 1 行(idx_b2o_pred_card);写 ≤ 3 行。无定时任务。
   frozen_hash 公式见 lib/b2o-pool.ts。 */

type P = Record<string, any>;
const s = (v: unknown, n = 300) => String(v ?? '').trim().slice(0, n);
const bad = (msg: string, code = 400) => json({ ok: false, msg }, code);
const jparse = <T>(t: unknown, d: T): T => { try { return JSON.parse(String(t ?? '')) ?? d; } catch { return d; } };

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const db = c.db, uid = c.sess.uid, boss = c.sess.role === 'admin', chief = c.sess.lab_role === 'chief';
  const b = (await request.json().catch(() => ({}))) as P;
  const ledger = (etype: string, eid: number, kind: string, payload: P) =>
    db.prepare(`INSERT INTO b2o_ledger (entity_type, entity_id, kind, author, author_kind, payload_json) VALUES (?, ?, ?, ?, 'human', ?)`)
      .bind(etype, String(eid), kind, `uid:${uid}`, JSON.stringify(payload));

  if (b.op === 'review') {
    const pid = Number(b.pid), node = Number(b.node), result = s(b.result, 10);
    if (![30, 60, 90].includes(node)) return bad('复盘节点只能是 30 / 60 / 90 天');
    if (!RESULTS[result]) return bad('请选判断结果:对 / 错 / 部分 / 无法判断');
    const gap = s(b.gap_type, 10);
    if ((result === '错' || result === '部分') && !GAPS.includes(gap)) return bad('选「错」或「部分」时必须选错误类型');
    const nextRule = s(b.next_rule, 300);
    if ((result === '错' || result === '部分') && !nextRule) return bad('选「错」或「部分」时要写一句:下次应该怎么判断');
    const p = await db.prepare(`SELECT id, card_id, frozen_at, r30, r60, r90 FROM b2o_predictions WHERE id=?`).bind(pid).first<P>();
    if (!p) return bad('预判不存在', 404);
    if (!p.frozen_at) return bad('这条预判还没批准冻结,不用复盘');
    const r = jparse<P>(p[`r${node}`], {});
    if (!r.auto) return bad(`第 ${node} 天复盘草稿还没生成(到期当天机器自动出)`);
    if (r.result) return bad(`第 ${node} 天已经复盘过:${r.result}`);
    Object.assign(r, { result, gap_type: GAPS.includes(gap) ? gap : '无', best_signal: s(b.best, 20) || null, misleading_signal: s(b.misleading, 20) || null,
      next_rule: nextRule || null, by: uid, at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    await db.batch([
      db.prepare(`UPDATE b2o_predictions SET r${node}=?, ${node === 90 ? 'outcome=?, ' : ''}updated_at=datetime('now') WHERE id=?`)
        .bind(...[JSON.stringify(r), ...(node === 90 ? [RESULTS[result]] : []), pid]),
      ledger('b2o_predictions', pid, 'review', { prediction_id: pid, card_id: p.card_id, stage: node, result: RESULTS[result] }),
    ]);
    return json({ ok: true, msg: `第 ${node} 天复盘已记:${result}` });
  }

  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return bad('缺卡片 id');
  const card = await db.prepare(`SELECT id, verdict, gates_json FROM b2o_opp_cards WHERE id=?`).bind(id).first<P>();
  if (!card) return bad('卡片不存在', 404);
  const gates = jparse<P>(card.gates_json, {});

  if (b.op === 'sign') {
    const r = s(b.r, 10), note = s(b.note, 200);
    if (r !== 'pass' && r !== 'fail') return bad('请选:能做 / 做不了');
    if (r === 'fail' && !note) return bad('选「做不了」要写一句理由');
    const sig: P = { r, by: uid, at: new Date().toISOString().slice(0, 16).replace('T', ' '), note: note || null };
    if (!chief) {   // 代录:账号没开之前由管理员替研发负责人录,必须有原审核人和依据(微信截图文件名)
      if (!boss) return bad('只有研发负责人(实验室角色「总工」)能签;管理员可代录', 403);
      const who = s(b.proxy_for, 40), basis = s(b.proxy_basis, 120);
      if (!who || !basis) return bad('代录要填「原审核人」和「依据」(微信截图文件名)');
      Object.assign(sig, { by: who, proxy_by: uid, proxy_basis: basis });
    }
    gates.capability = sig;
    await db.batch([
      db.prepare(`UPDATE b2o_opp_cards SET gates_json=?, updated_at=datetime('now') WHERE id=?`).bind(JSON.stringify(gates), id),
      ledger('b2o_opp_cards', id, 'signoff', { card_id: id, gate: 'capability', r, proxy: sig.proxy_by ? 1 : 0 }),
    ]);
    return json({ ok: true, msg: r === 'pass' ? '已签:研发能做' : '已签:研发做不了(卡只能改观察或放弃)' });
  }

  if (b.op === 'status') {
    // 09-24 验收:第一次改状态 = 批准并冻结预判,只给签字人(SOP 02-v2 §4.3「人审只签四处」、§8.3「等我审按角色」);业务 / 打版 / 采购账号只能看和填复盘
    if (!chief && !boss) return bad('改状态要研发负责人(总工)或管理员', 403);
    const v = s(b.verdict, 10);
    if (!VERDICTS[v]) return bad('状态只能五选一:推进 / 提前准备 / 客户验证 / 观察 / 放弃');
    const cap = gates.capability?.r;
    if (cap !== 'pass' && cap !== 'fail') return bad('研发还没签字(能力闸门),不能改状态');
    if (cap === 'fail' && v !== '观察' && v !== '放弃') return bad('研发签了「做不了」,只能改成观察或放弃');
    if (v === '推进' && !boss) return bad('「推进」要老板拍板(管理员账号)', 403);
    const p = await db.prepare(`SELECT * FROM b2o_predictions WHERE card_id=? ORDER BY id DESC LIMIT 1`).bind(id).first<P>();
    const stmts = [db.prepare(`UPDATE b2o_opp_cards SET verdict=?, verdict_at=datetime('now'), verdict_by=?, updated_at=datetime('now') WHERE id=?`).bind(v, uid, id)];
    let msg = `状态已改为「${v}」`;
    if (p && !p.frozen_at) {
      const h = await frozenHash({ ...p, verdict: v });
      stmts.push(
        db.prepare(`UPDATE b2o_predictions SET verdict=?, review_status='approved', reviewer_uid=?, reviewed_at=datetime('now'),
            due30=date(made_at,'+30 day'), due60=date(made_at,'+60 day'), due90=date(made_at,'+90 day'),
            frozen_at=datetime('now'), frozen_hash=?, updated_at=datetime('now') WHERE id=? AND frozen_at IS NULL`).bind(v, uid, h, p.id),
        // 两人同时点:后到的 UPDATE 落空;账本只在「库里 frozen_hash 就是这次算的、且这条预判还没有 judgment」时记(账本只追加,多记删不掉)
        db.prepare(`INSERT INTO b2o_ledger (entity_type, entity_id, kind, author, author_kind, payload_json)
            SELECT 'b2o_predictions', ?, 'judgment', ?, 'human', ? WHERE EXISTS (SELECT 1 FROM b2o_predictions WHERE id=? AND frozen_hash=?)
            AND NOT EXISTS (SELECT 1 FROM b2o_ledger WHERE entity_type='b2o_predictions' AND entity_id=? AND kind='judgment')`)
          .bind(String(p.id), `uid:${uid}`, JSON.stringify({ prediction_id: p.id, card_id: id, verdict: VERDICTS[v], frozen_hash: h,
            rules_version: p.rules_version ?? null, capability: cap }), p.id, h, String(p.id)));
      msg += ';预判已冻结并记入经验账本,30 / 60 / 90 天自动出复盘';
    } else {
      stmts.push(ledger('b2o_opp_cards', id, 'status_change', { card_id: id, prediction_id: p?.id ?? null, verdict: VERDICTS[v], from: VERDICTS[card.verdict] ?? null }));
    }
    await db.batch(stmts);
    return json({ ok: true, msg });
  }

  return bad('未知操作');
};
