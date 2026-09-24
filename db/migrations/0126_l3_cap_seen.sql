-- 2026-09-24 安全架构 v1 · L3 自家点选码:交卷的一次性判定与答错计数(两站同表同义,SQL 在 lib/captcha.ts 的 CAP_ONCE_SQL)。
-- k:'n:<令牌 nonce>' 令牌只能交一次(n > 1 即重放);'f:<IP 段>:<小时>' 答错计数(满 6 次冷却 10 分钟)。
-- exp:unix 秒,过了就能删。交卷接口约每 100 次顺带 DELETE WHERE exp < now 一次,走 exp 索引,只读被删的行。
-- 出题与认通行证都不碰这张表;每次交卷最多写 2 行。
CREATE TABLE IF NOT EXISTS cap_seen (
  k   TEXT PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cap_seen_exp ON cap_seen (exp);
