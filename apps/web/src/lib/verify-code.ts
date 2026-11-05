/**
 * 一码一物验真。页面 /{lang}/verify/ 与 /api/verify 共用这一份。
 *
 * 未知码不是正品，也不写查询记录（避免拿随机码把 code_scans 撑满）。
 * 在册且未作废：插入一条查询。查询次数变成 1 时是首查，并把 unused 改成 activated。
 * 次数 ≥ 2 仍是正品，但文案改成「已被查询 N 次」。void 永远不是正品。
 *
 * 表：product_codes、code_scans（db/migrations/0132_product_codes.sql）。
 * 不读、不写 inquiries。
 */

export interface VerifyBody {
  genuine: boolean;
  firstScan: boolean;
  scanCount: number;
  sku?: string;
  batch?: string;
  message: string;
}

export interface VerifyOutcome {
  status: number;
  body: VerifyBody;
}

interface VerifyDb {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
}

interface CodeRow {
  sku: string | null;
  batch: string | null;
  status: string;
}

const isZh = (lang?: string) => String(lang ?? '').toLowerCase().startsWith('zh');

/** 只留大写字母、数字和连字符。空串表示没有可查的码。 */
export function normalizeCode(raw: string): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 64);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 给查询记录用的哈希。没有 IP / UA 时对应字段为 null，不拿空串冒充。 */
export async function hashesFromRequest(request: Request): Promise<{ ipHash: string | null; uaHash: string | null }> {
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const ua = request.headers.get('user-agent') ?? '';
  return {
    ipHash: ip ? await sha256Hex(`verify-ip:${ip}`) : null,
    uaHash: ua ? await sha256Hex(`verify-ua:${ua}`) : null,
  };
}

function down(zh: boolean): VerifyOutcome {
  return {
    status: 503,
    body: {
      genuine: false,
      firstScan: false,
      scanCount: 0,
      message: zh ? '验证服务暂时不可用' : 'Verification is temporarily unavailable',
    },
  };
}

export function verifyUnavailable(lang?: string): VerifyOutcome {
  return down(isZh(lang));
}

function withSku(body: VerifyBody, row: CodeRow): VerifyBody {
  const sku = String(row.sku ?? '').trim();
  const batch = String(row.batch ?? '').trim();
  if (sku) body.sku = sku;
  if (batch) body.batch = batch;
  return body;
}

export async function verifyProductCode(db: VerifyDb, input: {
  code: string;
  lang?: string;
  ipHash?: string | null;
  uaHash?: string | null;
}): Promise<VerifyOutcome> {
  const zh = isZh(input.lang);
  const code = normalizeCode(input.code);
  if (!code) {
    return {
      status: 400,
      body: { genuine: false, firstScan: false, scanCount: 0, message: zh ? '请输入防伪码' : 'Enter a code' },
    };
  }

  try {
    const row = await db.prepare(
      `SELECT sku, batch, status FROM product_codes WHERE code = ?`,
    ).bind(code).first<CodeRow>();
    if (!row) {
      return {
        status: 200,
        body: {
          genuine: false,
          firstScan: false,
          scanCount: 0,
          message: zh ? '查无此码，不是正品' : 'Code not found. Not a genuine unit.',
        },
      };
    }

    const live = row.status === 'unused' || row.status === 'activated';
    await db.prepare(
      `INSERT INTO code_scans (code, scanned_at, ip_hash, ua_hash) VALUES (?, datetime('now'), ?, ?)`,
    ).bind(code, input.ipHash || null, input.uaHash || null).run();
    const counted = await db.prepare(
      `SELECT COUNT(*) AS n FROM code_scans WHERE code = ?`,
    ).bind(code).first<{ n: number }>();
    const scanCount = Number(counted?.n ?? 0);

    if (!live) {
      return {
        status: 200,
        body: {
          genuine: false,
          firstScan: false,
          scanCount,
          message: zh ? '此码已作废，不是正品' : 'This code has been voided. Not a genuine unit.',
        },
      };
    }

    const firstScan = scanCount === 1;
    if (firstScan && row.status === 'unused') {
      await db.prepare(
        `UPDATE product_codes
            SET status = 'activated',
                activated_at = COALESCE(activated_at, datetime('now'))
          WHERE code = ? AND status = 'unused'`,
      ).bind(code).run();
    }

    const body: VerifyBody = {
      genuine: true,
      firstScan,
      scanCount,
      message: firstScan
        ? (zh ? '正品·首次查询' : 'Genuine · first check')
        : (zh ? `已被查询 ${scanCount} 次` : `Checked ${scanCount} times`),
    };
    return { status: 200, body: withSku(body, row) };
  } catch {
    return down(zh);
  }
}
