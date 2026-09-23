/**
 * 网关 key 的发放与吊销。
 *
 * 明文只在**签发的那一次响应里**出现一次,之后无从找回 ——
 * 库里存的是哈希。这样做的代价是用户丢了 key 只能重发一把;
 * 换来的是数据库泄露时,这些 key 本身没有价值。
 * 上游那 9 把 key 不能这样保护(要拿去调用),所以更要靠这一层把它们挡在后面。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';
import { mintKey, hashKey } from '../../../lib/gateway';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  // 网关 key 等于把 9 家上游额度交出去,只有管理员能发
  if (c.sess.role !== 'admin') return json({ ok: false, msg: '只有管理员能管理网关 key' }, 403);

  let b: any;
  try { b = await request.json(); } catch { return json({ ok: false, msg: '请求格式不对' }, 400); }

  if (b.action === 'create') {
    const name = String(b.name ?? '').trim();
    if (!name) return json({ ok: false, msg: '请给这把 key 起个名字,说明是给谁用的' }, 400);
    const limit = Math.max(1, Math.min(10_000, Number(b.hourlyLimit) || 200));
    const scopes = Array.isArray(b.scopes) && b.scopes.length ? b.scopes.join(',') : 'chat';

    const key = mintKey();
    const r = await c.db.prepare(
      `INSERT INTO gateway_keys (name, prefix, key_hash, hourly_limit, scopes, created_by)
       VALUES (?,?,?,?,?,?)`,
    ).bind(name, key.slice(0, 11), await hashKey(key), limit, scopes, c.sess.uid).run();

    await logRevision(c.db, 'gateway_keys', Number(r.meta.last_row_id), null, null,
      { action: 'create', name, limit, scopes }, c.sess.uid);
    // key 只在这里出现一次
    return json({ ok: true, key, id: r.meta.last_row_id });
  }

  if (b.action === 'toggle' || b.action === 'delete') {
    const id = Number(b.id);
    if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
    if (b.action === 'delete') {
      // 流水留着 —— 删了 key 还要能回答「上个月那把 key 花了多少调用」
      await c.db.prepare(`DELETE FROM gateway_keys WHERE id = ?`).bind(id).run();
    } else {
      await c.db.prepare(`UPDATE gateway_keys SET enabled = 1 - enabled WHERE id = ?`).bind(id).run();
    }
    await logRevision(c.db, 'gateway_keys', id, null, null, { action: b.action }, c.sess.uid);
    return json({ ok: true });
  }

  if (b.action === 'limit') {
    const id = Number(b.id);
    const limit = Math.max(1, Math.min(10_000, Number(b.hourlyLimit) || 200));
    await c.db.prepare(`UPDATE gateway_keys SET hourly_limit = ? WHERE id = ?`).bind(limit, id).run();
    return json({ ok: true });
  }

  // ── 上游 key(控制面,0.3.1):电脑端拉取直连官方模型;这里只改人控状态,运行态由 Worker /v1/report 写 ──
  const ev = (kind: string, keyId: number | null, msg: string, account = '') =>
    c.db.prepare(`INSERT INTO gw_events(project, key_id, account, dept, client, kind, msg) VALUES('bohui',?,?,?,?,?,?)`)
      .bind(keyId, account, String(c.sess.email ?? ''), 'admin', kind, msg).run();
  if (b.action === 'up.add') {
    const account = String(b.account ?? '').trim(), secret = String(b.secret ?? '').trim();
    if (!['sensenova', 'agnes'].includes(account) || !/^sk-[\w-]{16,}$/.test(secret)) return json({ ok: false, msg: '账号只能是 sensenova / agnes;密钥要 sk- 开头的整串' }, 400);
    const priority = Math.max(1, Math.min(999, Number(b.priority) || 50));
    const r = await c.db.prepare(`INSERT OR IGNORE INTO gw_keys(project, account, secret, priority, note) VALUES('bohui',?,?,?,?)`).bind(account, secret, priority, `后台加入 ${c.sess.email ?? ''}`).run();
    if (!r.meta.changes) return json({ ok: false, msg: '这把 key 已经在了' }, 400);
    await ev('added', Number(r.meta.last_row_id), `${secret.slice(0, 8)}… 顺序 ${priority}`, account);
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (['up.pause', 'up.resume', 'up.uncool', 'up.delete'].includes(b.action)) {
    const id = Number(b.id);
    const k = await c.db.prepare(`SELECT id, account, secret FROM gw_keys WHERE id = ? AND project = 'bohui'`).bind(id).first<any>();
    if (!k) return json({ ok: false, msg: '没有这把 key' }, 404);
    const sql = ({
      'up.pause': `UPDATE gw_keys SET status = 'paused' WHERE id = ?`,
      'up.resume': `UPDATE gw_keys SET status = 'active', strikes = 0, cooldown_until = NULL WHERE id = ?`,   // 坏 key 人工启用也走这里
      'up.uncool': `UPDATE gw_keys SET cooldown_until = NULL, strikes = 0 WHERE id = ?`,
      'up.delete': `DELETE FROM gw_keys WHERE id = ?`,
    } as Record<string, string>)[b.action];
    await c.db.prepare(sql).bind(id).run();
    await ev(({ 'up.pause': 'paused', 'up.resume': 'resumed', 'up.uncool': 'uncool', 'up.delete': 'deleted' } as Record<string, string>)[b.action], id, `${k.secret.slice(0, 8)}…`, k.account);
    return json({ ok: true });
  }
  if (b.action === 'role.set') {
    const role = String(b.role ?? ''), pid = String(b.providerId ?? '');
    if (!/^(chat|image|video)\.(primary|backup)$/.test(role)) return json({ ok: false, msg: '线路名不对' }, 400);
    const p = await c.db.prepare(`SELECT id FROM providers WHERE id = ? AND enabled = 1`).bind(pid).first();
    if (!p) return json({ ok: false, msg: '没有这个模型或已停用' }, 400);
    await c.db.prepare(`INSERT OR REPLACE INTO gw_roles(project, role, provider_id) VALUES('bohui',?,?)`).bind(role, pid).run();
    await ev('role', null, `${role} → ${pid}`);
    return json({ ok: true });
  }

  return json({ ok: false, msg: '未知操作' }, 400);
};
