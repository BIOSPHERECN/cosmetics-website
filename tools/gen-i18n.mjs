/**
 * 生成 packages/core/src/i18n/index.ts 的常量表 + 骨架词条字典。
 *
 * 为什么生成而不是手写:
 *   36 语 × 29 个骨架词条 = 1044 条字符串。手抄一定会漏、会串行、会把
 *   马来语抄成印尼语 —— 而这类错要等那个语种的客户点进来才暴露。
 *   常量表(hreflang / og / 书写方向 / 大区分组)更是错一个字母就让
 *   那门语言在 Google 眼里不存在,肉眼还看不出来。
 *
 * 已有人工确认的六语(中英日印马法)不重译,原样保留 ——
 * 机器译只补空缺,不覆盖已经定稿的。
 *
 * 跑法:node tools/gen-i18n.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildFleet } from '../apps/web/src/lib/fleet.ts';
import { translateBatch } from '../apps/web/src/lib/translate.ts';

const LOC = JSON.parse(readFileSync('tools/locales.json', 'utf8'));
const OUT = 'packages/core/src/i18n/';

/* ── 舰队(真源在库,.env 兜底)──────────────────────────── */
const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
const rows = (() => {
  const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json',
    '--command', 'SELECT id,label,base_url,model,api_keys,tier,can_image,can_video,can_vision,vision_model,is_free FROM providers WHERE enabled=1 ORDER BY tier,id'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.slice(out.indexOf('['))).at(-1).results ?? [];
})();
const fleet = rows.map((r) => ({
  id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
  keys: String(r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
  visionModel: r.vision_model || r.model, free: !!r.is_free,
})).filter((p) => p.keys.length);
const FLEET = fleet.length ? fleet : buildFleet(process.env);
console.log(`舰队 ${FLEET.length} 家`);

/* ── 骨架词条:以现有 index.ts 里的六语为准,不重译 ──────────── */
const cur = readFileSync(OUT + 'index.ts', 'utf8');
function dictOf(name) {
  const m = new RegExp(`const ${name}(?:: Record<UiKey, string>)? = \\{([\\s\\S]*?)\\n\\};`).exec(cur)
    ?? new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`).exec(cur);
  if (!m) return null;
  const d = {};
  for (const kv of m[1].matchAll(/'([\w.]+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    d[kv[1]] = (kv[2] ?? kv[3]).replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return d;
}
const HUMAN = { 'zh-cn': dictOf('zhCN'), en: dictOf('en'), ja: dictOf('ja'), id: dictOf('id'), ms: dictOf('ms'), fr: dictOf('fr') };
const KEYS = Object.keys(HUMAN.en);
console.log(`骨架词条 ${KEYS.length} 条;人工确认 ${Object.keys(HUMAN).length} 语`);

/* ── 缺的语种交给模型 ─────────────────────────────────── */
/* 已经生成过的不重跑 —— 每跑一次就是几十次模型调用,免费额度经不起白烧。
   要整体重译加 --force。 */
let PREV = {};
try {
  /* 按行解析旧文件,不用一个大正则去啃整份 —— 这文件是我们自己按固定格式写的,
     逐行读既好懂也不会因为某个语种里出现引号就整份读歪。 */
  let cur = null;
  for (const line of readFileSync(OUT + 'ui.generated.ts', 'utf8').split(/\r?\n/)) {
    const head = /^ {2}'?([a-z-]+)'?: \{$/.exec(line);
    if (head) { cur = head[1]; PREV[cur] = {}; continue; }
    if (line === '  },') { cur = null; continue; }
    if (!cur) continue;
    const kv = /^ {4}'([\w.]+)': (.+),$/.exec(line);
    if (!kv) continue;
    const raw = kv[2];
    try {
      PREV[cur][kv[1]] = raw[0] === '"' ? JSON.parse(raw) : raw.slice(1, -1);
    } catch { PREV[cur][kv[1]] = raw; }
  }
} catch { /* 首次生成,没有旧文件是正常的 */ }
const FORCE = process.argv.includes('--force');
const NEED = LOC.map((l) => l.code)
  .filter((c) => !HUMAN[c] && (FORCE || Object.keys(PREV[c] ?? {}).length < 29));
console.log(`待生成 ${NEED.length} 语`);
const gen = { ...PREV };
for (const k of Object.keys(HUMAN)) delete gen[k];
const jobs = [...NEED];
const { TARGETS } = await import('../apps/web/src/lib/translate.ts');
for (const L of LOC) {
  // 引擎的目标语表只认已定稿的六语,这 30 种临时登记进去
  TARGETS[L.code] ??= {
    name: L.label,
    hint: `Write in ${L.label} (${L.code}). Business-to-business register, plain and concrete, no marketing superlatives.`
      + (L.rtl ? ' Right-to-left script; keep Latin brand names and certificate codes as-is.' : ''),
  };
}
await Promise.all(Array.from({ length: 5 }, async () => {
  while (jobs.length) {
    const code = jobs.shift();
    const L = LOC.find((x) => x.code === code);
    try {
      const g = await translateBatch(process.env, FLEET, KEYS.map((k) => HUMAN.en[k]), code,
        '化妆品代工企业官网的骨架 UI 词条:导航项、按钮、表格标题、无障碍提示');
      const out = {};
      KEYS.forEach((k, i) => { if (g[String(i)]) out[k] = g[String(i)]; });
      gen[code] = out;
      console.log(`   ✓ ${L.label} (${code})  ${Object.keys(out).length}/${KEYS.length}`);
    } catch (e) {
      console.log(`   × ${L.label} (${code}) ${String(e.message).slice(0, 80)}`);
    }
  }
}));

/* ── 落盘 ─────────────────────────────────────────────── */
const q = (s) => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);
const genBody = LOC.filter((l) => gen[l.code]).map((l) => {
  const d = gen[l.code];
  const body = KEYS.map((k) => `    '${k}': ${q(d[k] ?? HUMAN.en[k])},`).join('\n');
  return `  '${l.code}': {\n${body}\n  },`;
}).join('\n');

writeFileSync(OUT + 'ui.generated.ts', `/**
 * 机器生成的骨架词条 —— 请勿手改,改了下次跑 tools/gen-i18n.mjs 会被覆盖。
 *
 * 这里只放**没有人工定稿**的语种。中英日印尼马来法六语在 index.ts 里手写,
 * 优先级高于本文件 —— 机器译只补空缺,不覆盖定稿。
 *
 * 要修某个语种的措辞:把它整份搬进 index.ts 的手写区,它就不再被生成覆盖。
 * 生成时间与模型见 git 记录。
 */
import type { UiKey } from './index.ts';

export const generated: Record<string, Record<UiKey, string>> = {
${genBody}
};
`, 'utf8');
console.log(`\n已写 ${OUT}ui.generated.ts:${Object.keys(gen).length} 语 × ${KEYS.length} 条`);
