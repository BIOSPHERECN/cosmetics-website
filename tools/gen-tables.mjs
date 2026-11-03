/**
 * 从 tools/locales.json 重刷所有语种常量表。
 *
 * 语种表散落在四处,每处都必须一致,否则的错法都很隐蔽:
 *   packages/core/src/i18n/index.ts  下拉、hreflang、og、书写方向
 *   apps/web/src/middleware.ts       地区自动跳(中间件不能 import 组件包,只能各存一份)
 *   apps/web/src/lib/translate.ts    翻译引擎认识哪些目标语
 *   apps/web/src/pages/api/admin/translate.ts  后台进度矩阵按哪些语种统计
 *
 * 手工同步四处 = 迟早漏一处。漏在 hreflang 上,那门语言在 Google 眼里直接不存在;
 * 漏在中间件上,那门语言的访客永远跳不过去 —— 两种都不会报错,只会安静地少一块市场。
 *
 * 跑法:node tools/gen-tables.mjs   (改完 locales.json 就跑一次)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const LOC = JSON.parse(readFileSync('tools/locales.json', 'utf8'));

// 分区在 locales.json 里存稳定键(global/sea/latam/mesa):
// 前台按访客语言翻译(见 i18n 的 GROUP_LABELS);后台只有中文界面,落中文。
const ZH_GROUP = { global: '主要语言', sea: '东南亚', latam: '拉丁美洲', mesa: '中东与南亚' };
const codes = LOC.map((l) => l.code);
const key = (c) => (/^[a-z]+$/.test(c) ? c : `'${c}'`);
const pad = Math.max(...codes.map((c) => key(c).length)) + 2;
const tbl = (f) => LOC.map((l) => `  ${(key(l.code) + ':').padEnd(pad)} '${l[f]}',`).join('\n');

const groups = [];
for (const l of LOC) {
  if (!groups.length || groups.at(-1)[0] !== l.group) groups.push([l.group, []]);
  groups.at(-1)[1].push(l.code);
}

/* ── ① packages/core/src/i18n/index.ts ───────────────────────── */
{
  const f = 'packages/core/src/i18n/index.ts';
  let s = readFileSync(f, 'utf8');
  const put = (name, body) => {
    const re = new RegExp(`(export const ${name}[^=]*= \\{)[\\s\\S]*?(\\n\\};)`);
    if (!re.test(s)) throw new Error(`index.ts 找不到 ${name}`);
    s = s.replace(re, `$1\n${body}$2`);
  };
  s = s.replace(/export const LOCALES = \[[\s\S]*?\n\] as const;/,
    `export const LOCALES = [\n${codes.map((c) => `  '${c}',`).join('\n')}\n] as const;`);
  s = s.replace(/export const LOCALE_GROUPS: \{ group: string; codes: Locale\[\] \}\[\] = \[[\s\S]*?\n\];/,
    'export const LOCALE_GROUPS: { group: string; codes: Locale[] }[] = [\n'
    + groups.map(([g, cs]) => `  { group: '${g}', codes: [${cs.map((c) => `'${c}'`).join(', ')}] },`).join('\n')
    + '\n];');
  put('HREFLANG', tbl('hreflang'));
  put('OG_LOCALE', tbl('og'));
  put('LOCALE_LABELS', tbl('label'));
  put('LOCALE_SHORT', tbl('short'));
  s = s.replace(/export const RTL_LOCALES = new Set<string>\(\[[^\]]*\]\);/,
    `export const RTL_LOCALES = new Set<string>([${LOC.filter((l) => l.rtl).map((l) => `'${l.code}'`).join(', ')}]);`);
  writeFileSync(f, s, 'utf8');
  console.log(`✓ index.ts   ${codes.length} 语 · ${groups.length} 个大区 · RTL ${LOC.filter((l) => l.rtl).length} 语`);
}

/* ── ② apps/web/src/middleware.ts ────────────────────────────── */
{
  const f = 'apps/web/src/middleware.ts';
  let s = readFileSync(f, 'utf8');
  s = s.replace(/const LOCALES = \[[\s\S]*?\n\] as const;/,
    `const LOCALES = [\n${codes.map((c) => `  '${c}',`).join('\n')}\n] as const;`);
  writeFileSync(f, s, 'utf8');
  console.log('✓ middleware.ts');
}

/* ── ③ 翻译引擎的目标语表 ────────────────────────────────────── */
{
  const f = 'apps/web/src/lib/translate.ts';
  let s = readFileSync(f, 'utf8');
  const HAND = new Set(['zh-cn', 'en', 'jp', 'id', 'my', 'fr']);
  const body = LOC.filter((l) => !HAND.has(l.code)).map((l) =>
    `  ${key(l.code)}: { name: '${l.label}', hint: 'Write in ${l.label} (${l.code}). B2B register, plain and concrete, no marketing superlatives.`
    + (l.rtl ? ' Right-to-left script; keep Latin brand names and certificate codes as-is.' : '')
    + `' },`).join('\n');
  s = s.replace(/(\/\* 以下 \d+ 语由 tools\/locales\.json 同步生成[\s\S]*?\*\/\r?\n)[\s\S]*?\n\};/,
    `/* 以下 ${LOC.length - HAND.size} 语由 tools/locales.json 同步生成 —— 措辞提示是通用模板,\n`
    + `     哪个语种译得不对味,把它挪到上面手写一份更细的提示即可。 */\n${body}\n};`);
  writeFileSync(f, s, 'utf8');
  console.log('✓ translate.ts');
}

/* ── ④ 后台进度矩阵 ──────────────────────────────────────────── */
{
  const f = 'apps/web/src/pages/api/admin/translate.ts';
  let s = readFileSync(f, 'utf8');
  s = s.replace(/const LOCALES = \[[\s\S]*?\n\];/,
    `const LOCALES = [\n  ${codes.map((c) => `'${c}'`).join(', ')},\n];`);
  writeFileSync(f, s, 'utf8');
  console.log('✓ api/admin/translate.ts');
}

/* ── ⑤ 上线闸门 ──────────────────────────────────────────────── */
{
  const f = 'tools/ship-gate.mjs';
  let s = readFileSync(f, 'utf8');
  s = s.replace(/const LOCALES = \[[^\]]*\];/, `const LOCALES = [${codes.map((c) => `'${c}'`).join(', ')}];`);
  s = s.replace(/const HREFLANG = \{[^}]*\};/,
    `const HREFLANG = { ${LOC.map((l) => `${key(l.code)}: '${l.hreflang}'`).join(', ')} };`);
  writeFileSync(f, s, 'utf8');
  console.log('✓ ship-gate.mjs');
}


/* ── 6 后台语言页签 / RTL / hreflang(apps/web/src/lib/db.ts)──────
   中间件不能 import 组件包,后台页面也不能,所以这里必须各存一份。
   各存一份没问题,手工同步才是问题,所以一起生成。
   这份一直是手写的第六张表,而且已经漂了:主表 46 门时它只有 36 门 —— */
{
  const f = 'apps/web/src/lib/db.ts';
  let s = readFileSync(f, 'utf8');
  s = s.replace(/export const LANG_GROUPS: \{ group: string; langs: \[string, string\]\[\] \}\[\] = \[[\s\S]*?\n\];/,
    'export const LANG_GROUPS: { group: string; langs: [string, string][] }[] = [\n'
    + groups.map(([g, cs]) =>
        `  { group: '${ZH_GROUP[g] ?? g}', langs: [${cs.map((c) => {
          const l = LOC.find((x) => x.code === c);
          return `['${c}', '${l.label}']`;
        }).join(', ')}] },`).join('\n')
    + '\n];');
  s = s.replace(/export const RTL = new Set\(\[[^\]]*\]\);/,
    `export const RTL = new Set([${LOC.filter((l) => l.rtl).map((l) => `'${l.code}'`).join(', ')}]);`);
  const odd = LOC.filter((l) => l.hreflang !== l.code);
  s = s.replace(/return \(\{[^}]*\} as Record<string, string>\)\[lang\] \?\? lang;/,
    `return ({ ${odd.map((l) => `'${l.code}': '${l.hreflang}'`).join(', ')} } as Record<string, string>)[lang] ?? lang;`);
  writeFileSync(f, s, 'utf8');
  console.log(`OK db.ts      ${codes.length} 语 · hreflang 特例 ${odd.length} 条`);
}

// ── 收尾自检 ──────────────────────────────────────────────────
// String.replace 不匹配时原样返回,不抛错。所以上面每一句 writeFileSync
// 都会照写、控制台都会照打 OK —— 即使正则一个字都没改到。
// 真发生过:translate.ts 的正则要求注释结束符后紧跟 \n,而仓库是 CRLF,
// 中间隔着 \r,于是那张表停在 30 门旧语种上,日志却显示一切正常。
// 所以不查"替换跑没跑",直接查结果:出口文件里不许再出现已退役的语种码。
{
  const RETIRED = ['bn','ur','pa','te','ta','mr','gu','jv','it','nl','pl','sv','da','fi',
                   'no','cs','el','hu','ro','uk','pt-br','es-mx','fa','he','sw','ha','am','kk','uz',
                   'ja','ko','ms','vi','tl','hi'];
  const OUT = ['packages/core/src/i18n/index.ts', 'apps/web/src/lib/translate.ts',
               'apps/web/src/pages/api/admin/translate.ts', 'tools/ship-gate.mjs',
               'apps/web/src/lib/db.ts'];
  const live = new Set(codes);
  const bad = [];
  for (const f of OUT) {
    const src = readFileSync(f, 'utf8').replace(/\/\/.*/g, '');
    for (const c of RETIRED) {
      if (live.has(c)) continue;
      if (new RegExp(`(^|[\s\[{(,])'${c}'\s*[,:\]}]`, 'm').test(src)) bad.push(`${f} 仍含 '${c}'`);
    }
  }
  if (bad.length) {
    console.error('\n自检不过 —— 有替换没生效但没报错:');
    bad.forEach((b) => console.error('   ' + b));
    process.exit(1);
  }
  console.log('OK 自检通过:出口文件均无退役语种残留');
}
