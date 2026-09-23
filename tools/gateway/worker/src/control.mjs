/**
 * SueAI 网关控制面(0.3.1):管 key,不转发模型请求。客户端登录时 GET /v1/keys 拿一份 keys.json 直连官方模型;
 * 出错 POST /v1/report 一条,这里判定该冷却 / 该判死,下一次拉取就不再下发那把 key。
 * 表:gw_keys(一把 key 一行)· gw_roles(三条线各用哪个 provider)· gw_events(只记错误与人为操作)。
 * ponytail: 冷却写 gw_keys.cooldown_until 一列,不用 KV;并发上报互相覆盖只是少记一次,可接受。
 */
import { classify, nextMidnightBeijing } from '../../core.mjs';

const PROXY = 'http://127.0.0.1:7890';                       // 境外域名:客户端直连失败才走它(与 sync-config.py 同口径)
const ROLES = ['chat.primary', 'chat.backup', 'image.primary', 'image.backup', 'video.primary'];
export const accountOf = (baseUrl) => /sensenova/.test(baseUrl) ? 'sensenova' : /agnes/.test(baseUrl) ? 'agnes' : new URL(baseUrl).hostname;
const now = () => Math.floor(Date.now() / 1000);

/** GET /v1/keys → 与安装包 keys.json 同形,多带 key_ids(上报用)与 ttl_s */
export async function keysView(db, project, { dept = '', client = '' } = {}) {
  const [roles, keys] = await Promise.all([
    db.prepare(`SELECT r.role, p.id, p.base_url, p.model FROM gw_roles r JOIN providers p ON p.id = r.provider_id WHERE r.project = ? AND p.enabled = 1`).bind(project).all(),
    db.prepare(`SELECT id, account, secret FROM gw_keys WHERE project = ? AND status = 'active' AND (cooldown_until IS NULL OR cooldown_until < ?) ORDER BY priority, id`).bind(project, now()).all(),
  ]);
  const out = { fetched_at: new Date().toISOString(), ttl_s: 1800 };
  const sent = new Set();
  for (const r of roles.results) {
    if (!ROLES.includes(r.role)) continue;
    const [line, slot] = r.role.split('.');
    const acct = accountOf(r.base_url), mine = keys.results.filter((k) => k.account === acct);
    mine.forEach((k) => sent.add(k.id));
    (out[line] ??= {})[slot] = { base_url: r.base_url.replace(/\/+$/, ''), model: r.model, keys: mine.map((k) => k.secret), key_ids: mine.map((k) => k.id),
      proxy: /\.com\b/.test(new URL(r.base_url).hostname) ? PROXY : '' };
  }
  if (sent.size) await db.prepare(`UPDATE gw_keys SET last_seen_at = datetime('now') WHERE id IN (${[...sent].join(',')})`).run();
  console.log(JSON.stringify({ ctl: 'keys', project, dept, client, keys: sent.size }));
  return out;
}

/** POST /v1/report {key_id, model, status, text, dept, client} → {kind, cooldown_until, status} */
export async function report(db, project, b) {
  if (b.kind === 'skill_used') {   // 09-21 技能召唤上报(电脑端 0.3.8):只记事件,不碰 key;model 列放技能名,msg 放会话 id
    await db.prepare(`INSERT INTO gw_events(project, key_id, account, model, dept, client, kind, status, msg) VALUES(?,NULL,'',?,?,?,'skill_used',0,?)`)
      .bind(project, String(b.skill || '').slice(0, 60), String(b.dept || '').slice(0, 40), String(b.client || '').slice(0, 40), String(b.session || '').slice(0, 64)).run();
    return { kind: 'skill_used' };
  }
  const keyId = Number(b.key_id) || null, status = Number(b.status) || 0, text = String(b.text || '').slice(0, 300);
  const cls = classify(status, text);
  const key = keyId ? await db.prepare(`SELECT id, account, strikes, status, last_error_at FROM gw_keys WHERE id = ? AND project = ?`).bind(keyId, project).first() : null;
  const t = now();
  // 10 分钟没出错就从 0 数起(连续失败才算数)
  const stale = !key?.last_error_at || (t - Math.floor(Date.parse(key.last_error_at + 'Z') / 1000)) > 600;
  const strikes = (stale ? 0 : Number(key?.strikes || 0)) + 1;
  const retryAfter = Math.min(900, Math.max(0, Number(b.retry_after) || 0));
  let kind = 'other', cool = null, dead = false;
  if (cls === 'channel') { kind = 'quota'; cool = Math.floor(nextMidnightBeijing(Date.now()) / 1000); }      // 额度尽:锁到北京时间次日 0 点
  else if (cls === 'model') kind = 'model_missing';                                                            // 模型名不对,不罚 key
  else if (status === 401 || status === 403) { kind = 'auth'; dead = strikes >= 3; }                          // 坏 key:连错 3 次判死,人来恢复
  else if (status === 429) { kind = 'ratelimit'; cool = t + (retryAfter || Math.min(900, 20 * 2 ** (strikes - 1))); }
  else if (status >= 500 || status === 0) { kind = 'upstream'; cool = t + Math.min(900, 60 * 2 ** (strikes - 1)); }
  if (key) {
    await db.prepare(`UPDATE gw_keys SET strikes = ?, last_error = ?, last_error_at = datetime('now'), cooldown_until = COALESCE(?, cooldown_until), status = CASE WHEN ? THEN 'dead' ELSE status END WHERE id = ?`)
      .bind(strikes, `${status} ${text.slice(0, 120)}`, cool, dead ? 1 : 0, key.id).run();
  }
  await db.prepare(`INSERT INTO gw_events(project, key_id, account, model, dept, client, kind, status, msg) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(project, key?.id ?? null, key?.account ?? String(b.account || ''), String(b.model || '').slice(0, 60), String(b.dept || '').slice(0, 40), String(b.client || '').slice(0, 40), kind, status, text.slice(0, 200)).run();
  console.log(JSON.stringify({ ctl: 'report', project, key_id: key?.id ?? null, kind, status, cool, dead, strikes }));
  return { kind, cooldown_until: cool, status: dead ? 'dead' : key?.status ?? null, strikes };
}
