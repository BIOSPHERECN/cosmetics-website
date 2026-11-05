/**
 * 插入至少 3 条一码一物测试码。默认只打印 SQL，不连生产库。
 *
 *   node tools/seed-product-codes.mjs
 *   node tools/seed-product-codes.mjs --check
 *   node tools/seed-product-codes.mjs --sqlite path/to/local.sqlite
 *
 * --check 在内存库里先跑 db/migrations/0132_product_codes.sql，再插入，确认不少于 3 行。
 * 包装二维码指向 /{lang}/verify/?code=码。生产库由运维另行执行打印出的 SQL，本脚本不打远程。
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TEST_CODES = [
  { code: 'BH-TEST-001', sku: 'SERUM-A', batch: '2026-A' },
  { code: 'BH-TEST-002', sku: 'CREAM-B', batch: '2026-B' },
  { code: 'BH-TEST-003', sku: 'LOTION-C', batch: '2026-C' },
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function seedSql() {
  return TEST_CODES.map((c) =>
    `INSERT OR IGNORE INTO product_codes (code, sku, batch, status) VALUES (${q(c.code)}, ${q(c.sku)}, ${q(c.batch)}, 'unused');`,
  ).join('\n') + '\n';
}

async function apply(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec(readFileSync(new URL('../db/migrations/0132_product_codes.sql', import.meta.url), 'utf8'));
  db.exec(seedSql());
  const n = db.prepare(`SELECT COUNT(*) AS n FROM product_codes`).get();
  console.log(`product_codes=${n.n}`);
  if (Number(n.n) < 3) process.exit(1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const sqliteAt = process.argv.indexOf('--sqlite');
  if (process.argv.includes('--check')) await apply(':memory:');
  else if (sqliteAt >= 0) {
    const file = process.argv[sqliteAt + 1];
    if (!file) { console.error('用法: node tools/seed-product-codes.mjs --sqlite <file>'); process.exit(1); }
    await apply(file);
  } else {
    process.stdout.write(seedSql());
  }
}
