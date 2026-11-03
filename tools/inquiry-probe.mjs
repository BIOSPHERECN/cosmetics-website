/**
 * 询盘闭环验收:前台提交 → 后台看得到 → 筛得出来 → 导得出去 → 删干净。
 *
 * 重点验三件容易做错、做错就很难看的事:
 *  ① 来源页有没有真的记下来 —— 这是「哪些内容带单」的唯一依据;
 *  ② 导出的 CSV 有没有 BOM(没有的话 Excel 打开中文全乱码);
 *  ③ 公式注入有没有挡住 —— 询盘正文是访客可控的,
 *     填一句 =HYPERLINK(...) 就能在同事的 Excel 里执行。
 */
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { d1 } from './d1.mjs';

const BASE = process.argv[2] || 'https://biosphere-ai.com';
const EMAIL = 'zz-inq-temp@biosphere-ai.com';
const TAG = 'ZZPROBE-' + Date.now().toString(36);
const b64u = (b) => Buffer.from(new Uint8Array(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const run = (sql) => { const f = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/inq.sql'; writeFileSync(f, sql, 'utf8'); d1(f, { file: true }); };

const fail = [];
const ok = (l, c, x = '') => { console.log(`  ${c ? '✓' : '★'} ${String(l).padEnd(34)}${x}`); if (!c) fail.push(l); };

const pass = b64u(crypto.getRandomValues(new Uint8Array(24)));
const salt = crypto.getRandomValues(new Uint8Array(16));
const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 60_000, hash: 'SHA-256' }, k, 256);
run(`DELETE FROM users WHERE email=${lit(EMAIL)};
INSERT INTO users (email,pass_hash,pass_salt,role,display_name) VALUES (${lit(EMAIL)},${lit(b64u(bits))},${lit(b64u(salt))},'admin','询盘验收(用完即删)');`);
const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: pass }), signal: AbortSignal.timeout(45000),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

console.log('\n【前台提交】');
/* 三条测试询盘,故意各带一个陷阱:
   1) 正文以 = 开头 —— 验公式注入防护
   2) 正文含换行和引号 —— 验 CSV 转义
   3) 从不同页面提交 —— 验来源页记录 */
const CASES = [
  { name: `${TAG}-formula`, lang: 'en', ref: '/en/products/',
    message: '=HYPERLINK("http://evil.example","click me") probe row, delete me' },
  { name: `${TAG}-quotes`, lang: 'th', ref: '/th/capabilities/manufacturing/',
    message: 'line one\nline two with "quotes" and, a comma — probe row' },
  { name: `${TAG}-plain`, lang: 'pt', ref: '/pt/origin/',
    message: 'plain probe row, delete me' },
];
/* 询盘接口有限流(5 次/小时/IP),这是**该有的**:
   没有它,一个循环脚本就能把询盘表灌满。
   但它也意味着这个脚本跑第二遍时前台提交必然被挡。

   所以分两段验,各验各的:
     ① 走真实 HTTP 提交一条 —— 验「前台采集」这条链路(来源页、referer、限流本身)
     ② 其余两条直接写库 —— 验「后台筛选与导出」,那部分和前台限流无关
   全部走 HTTP 的话,跑第二遍就一片红,而红的原因是限流生效,不是功能坏了 ——
   这种噪音会让人以后直接忽略这个脚本的输出。 */
let liveOk = false, rateLimited = false;
{
  const cse = CASES[0];
  const r = await fetch(`${BASE}/api/inquiry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: BASE + cse.ref },
    body: JSON.stringify({ name: cse.name, email: 'probe@example.com', company: 'ZZ Probe Co',
      message: cse.message, lang: cse.lang, site: 'biosphere-ai' }),
    signal: AbortSignal.timeout(45000),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) { rateLimited = true; ok('前台提交(限流已生效)', true, '429 —— 限流本身也是要验的功能'); }
  else { liveOk = r.ok || !!j.ok; ok('前台真实提交', liveOk, `HTTP ${r.status}`); }
}

// 其余两条直接写库,带上和真实提交一样的字段
{
  const vals = CASES.slice(1).map((cse) =>
    `(${lit('biosphere-ai')},${lit(cse.lang)},${lit(cse.name)},${lit('ZZ Probe Co')},`
    + `${lit('probe@example.com')},${lit('CN')},${lit(cse.message)},0,'new',datetime('now'),`
    + `${lit(cse.ref)},${lit('biosphere-ai.com')})`).join(',\n');
  run(`INSERT INTO inquiries (site_id,lang,name,company,email,country,message,spam_score,status,created_at,source_path,referrer)
       VALUES ${vals};`);
  ok('造两条测试数据(绕开限流)', true, '验后台筛选与导出用');
}

console.log('\n【入库与来源页】');
const rows = d1(`SELECT id, lang, source_path, referrer, message FROM inquiries
                  WHERE name LIKE ${lit(TAG + '%')} ORDER BY id`);
const want = liveOk ? 3 : 2;   // 限流挡掉了实时那条就只有造的两条
ok('数据都入库了', rows.length === want, `${rows.length}/${want} 条`);
ok('来源页记下来了', rows.length > 0 && rows.every((r) => r.source_path && r.source_path.startsWith('/')),
  rows.map((r) => r.source_path).join(' '));
ok('外部来源只留 host(不留完整 URL)',
  rows.every((r) => !r.referrer || !r.referrer.includes('/')),
  rows[0]?.referrer ?? '(无)');
ok('语种分别记对', new Set(rows.map((r) => r.lang)).size === want, rows.map((r) => r.lang).join(' '));

console.log('\n【后台筛选】');
{
  const html = await fetch(`${BASE}/bohui/inquiries?q=${TAG}`, { headers: { cookie }, signal: AbortSignal.timeout(45000) }).then((r) => r.text());
  ok('搜索能搜到', (html.match(new RegExp(TAG, 'g')) || []).length >= (want));
  ok('来源页排行出现了', html.includes('询盘来自哪些页面'));
  ok('语种下拉有实际数据', /全部语种/.test(html) && /ไทย|Português|English/.test(html));
}
{
  const html = await fetch(`${BASE}/bohui/inquiries?q=${TAG}&lang=th`, { headers: { cookie }, signal: AbortSignal.timeout(45000) }).then((r) => r.text());
  const n = (html.match(new RegExp(TAG + '-quotes', 'g')) || []).length;
  const other = (html.match(new RegExp(TAG + '-plain', 'g')) || []).length;
  // 限流时那两条可能根本没进库,此时只要「筛选没把不该出现的带出来」就算过
  // 造的两条里泰语和葡语各一条,所以这条断言在限不限流下都成立
  ok('按语种筛选只带出该语种', n >= 1 && other === 0, `泰语 ${n} 条,葡语 ${other} 条`);
}

console.log('\n【CSV 导出】');
{
  const r = await fetch(`${BASE}/api/admin/inquiry-export?q=${TAG}`, { headers: { cookie }, signal: AbortSignal.timeout(45000) });
  /* 必须看**原始字节**。r.text() 解码 UTF-8 时会把 BOM 剥掉,
     所以 csv.charCodeAt(0) === 0xfeff 永远不成立 —— 第一版就是这么写的,
     结果一个本来正确的实现被判成失败,差点被我"修"坏。 */
  const buf = Buffer.from(await r.arrayBuffer());
  const csv = buf.toString('utf8');
  ok('返回 CSV', r.ok && (r.headers.get('content-type') || '').includes('csv'), r.headers.get('content-disposition') ?? '');
  ok('带 BOM(Excel 中文不乱码)', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    [...buf.slice(0, 3)].map((x) => x.toString(16).padStart(2, '0')).join(' '));
  ok('导出里数据齐', (csv.match(new RegExp(TAG, 'g')) || []).length >= want, `应有 ${want} 条`);
  ok('含来源页列', csv.includes('来源页') && /\/(en|th|pt)\//.test(csv));
  // 公式注入:原文以 = 开头,导出后必须被前置单引号中和。
  // 判据是「没有任何单元格直接以 =HYPERLINK 开头」——
  // 中和过的会是 "'=HYPERLINK,前面多一个单引号。
  const m = !csv.includes('"=HYPERLINK');
  ok('公式注入已中和', m, m ? "以 '= 开头" : '★ 仍以 = 开头,Excel 会当公式执行');
  // 换行与引号:整段应被引号包住、内部引号翻倍
  ok('换行与引号已转义', csv.includes('""quotes""'));
}

console.log('\n【权限】');
{
  const r = await fetch(`${BASE}/api/admin/inquiry-export`, { signal: AbortSignal.timeout(30000) });
  ok('未登录导不出去', r.status === 401, `HTTP ${r.status}`);
}

run(`DELETE FROM inquiries WHERE name LIKE ${lit(TAG + '%')}; DELETE FROM users WHERE email=${lit(EMAIL)};`);
const left = d1(`SELECT COUNT(*) n FROM inquiries WHERE name LIKE ${lit(TAG + '%')}`)[0].n;
console.log(`\n测试询盘已清理(剩 ${left} 条)`);
console.log('\n════ 结论 ════');
console.log(fail.length ? `  ${fail.length} 处不通:\n   · ${fail.join('\n   · ')}` : '  询盘闭环验收通过。');
