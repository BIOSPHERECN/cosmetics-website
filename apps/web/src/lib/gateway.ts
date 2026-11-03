/**
 * 自有 AI 网关的认证、限流与记账。
 *
 * 设计上只有一条硬规矩:**上游 key 永远不出这台服务器**。
 * 调用方拿到的是网关 key,可以随时吊销;上游那 9 把不能 ——
 * 一旦泄露,要挨家去后台重开,而其中几家的免费额度是不可再生的。
 */

const te = new TextEncoder();

/** SHA-256(key) 的十六进制。key 只存哈希,和用户口令一个道理。 */
export async function hashKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', te.encode(key));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 生成一把新 key。前缀 bh- 让人一眼看出是帛卉网关的,不至于和上游 key 混。 */
export function mintKey(): string {
  const raw = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `bh-${b64}`;
}

export interface GwKey {
  id: number; name: string; enabled: number; hourly_limit: number; scopes: string;
}

/**
 * 校验请求里的网关 key。
 * 返回 null 表示不通过 —— 调用方一律回同一句 401,不区分
 * 「没这把 key」「key 停用了」「超限了」,避免被拿来试探。
 * (超限例外:那个要明确告诉调用方,否则对方只会不停重试。)
 */
export async function authKey(
  db: D1Database, header: string | null,
): Promise<{ key: GwKey } | { error: string; status: number }> {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!m) return { error: 'missing_api_key', status: 401 };

  const row = await db
    .prepare(`SELECT id, name, enabled, hourly_limit, scopes FROM gateway_keys WHERE key_hash = ?`)
    .bind(await hashKey(m[1].trim()))
    .first<GwKey>();
  if (!row || !row.enabled) return { error: 'invalid_api_key', status: 401 };

  // 滑动一小时窗口。用调用流水计数,不另设计数器 ——
  // 单独的计数器会和流水对不上,而对账时人只会信流水。
  const { cnt } = (await db
    .prepare(`SELECT COUNT(*) AS cnt FROM gateway_calls WHERE key_id = ? AND at > datetime('now','-1 hour')`)
    .bind(row.id)
    .first<{ cnt: number }>()) ?? { cnt: 0 };
  if (cnt >= row.hourly_limit) {
    return { error: `rate_limit_exceeded: ${row.hourly_limit}/hour`, status: 429 };
  }
  return { key: row };
}

export function hasScope(key: GwKey, scope: string): boolean {
  return String(key.scopes || 'chat').split(',').map((s) => s.trim()).includes(scope);
}

/** 记一笔流水。失败也要记 —— 只记成功的话,排查「为什么老是超时」时无从下手。 */
export async function bill(
  db: D1Database, keyId: number,
  d: { kind: string; provider?: string; model?: string; ms?: number; ok: boolean; err?: string; inTok?: number; outTok?: number },
) {
  await db.batch([
    db.prepare(`INSERT INTO gateway_calls (key_id,kind,provider,model,ms,ok,err,in_tokens,out_tokens)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(keyId, d.kind, d.provider ?? null, d.model ?? null, d.ms ?? null,
            d.ok ? 1 : 0, d.err?.slice(0, 200) ?? null, d.inTok ?? null, d.outTok ?? null),
    db.prepare(`UPDATE gateway_keys SET calls = calls + 1, last_used_at = datetime('now') WHERE id = ?`).bind(keyId),
  ]);
}

/** OpenAI 形状的错误体 —— 调用方的 SDK 直接认这个结构 */
export function gwError(message: string, status: number, type = 'invalid_request_error') {
  return new Response(JSON.stringify({ error: { message, type, code: null } }), {
    status, headers: { 'content-type': 'application/json' },
  });
}
