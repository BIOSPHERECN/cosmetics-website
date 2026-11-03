/**
 * D1 查询小工具 —— 把 wrangler 的输出解析这件事做对一次,别每次现写。
 *
 * 为什么值得单独一个文件:wrangler --json 在**出错时**返回的也是 JSON,
 * 而且外层结构完全不同(顶层是 {error:{notes:[...]}})。
 * 之前每次都现写 `s.slice(s.indexOf('['))`,遇到报错就把 notes 里的方括号当成结果数组,
 * 抛出的是 "Unexpected non-whitespace character" —— 看起来像解析 bug,
 * 其实是**查询失败了**,真正的错误信息被这层假象盖住了。
 *
 *   node tools/d1.mjs "SELECT ..."          表格输出
 *   node tools/d1.mjs --json "SELECT ..."   原样 JSON
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
for (const line of readFileSync(ROOT + '/.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

export function d1(sql, { file = false } = {}) {
  const args = ['d1', 'execute', 'bohui-cms-v2', '--remote', '--json',
    ...(file ? ['--file', sql, '-y'] : ['--command', sql])];
  let out;
  try {
    out = execFileSync(process.execPath, [ROOT + '/node_modules/wrangler/bin/wrangler.js', ...args],
      { encoding: 'utf8', maxBuffer: 128 << 20, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT + '/apps/web' });
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }

  const i = out.indexOf('{');
  const j = out.indexOf('[');
  const start = i >= 0 && (j < 0 || i < j) ? i : j;
  if (start < 0) throw new Error('wrangler 没有输出 JSON:\n' + out.slice(0, 400));
  let parsed;
  try { parsed = JSON.parse(out.slice(start)); }
  catch { throw new Error('解析不了 wrangler 输出:\n' + out.slice(start, start + 400)); }

  // 出错时顶层是对象;成功时顶层是数组
  if (!Array.isArray(parsed)) {
    const why = parsed?.error?.notes?.map((n) => n.text).join(' / ') || parsed?.error?.text || JSON.stringify(parsed).slice(0, 300);
    throw new Error('D1 报错:' + why);
  }
  return parsed[parsed.length - 1].results ?? [];
}

if (process.argv[1] && process.argv[1].endsWith('d1.mjs')) {
  const json = process.argv[2] === '--json';
  const sql = process.argv[json ? 3 : 2];
  if (!sql) { console.error('用法: node tools/d1.mjs "SELECT ..."'); process.exit(1); }
  const rows = d1(sql);
  if (json) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
  if (!rows.length) { console.log('(0 行)'); process.exit(0); }
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
  for (const r of rows) console.log(cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  '));
  console.log(`(${rows.length} 行)`);
}
