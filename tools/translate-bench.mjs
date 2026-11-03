/**
 * 翻译模型评测 —— 同一批文案让每家模型各翻一遍,按客观指标打分。
 *
 * 为什么要有这个:"哪家翻得好"是个会随时间变的问题(模型在更新、额度在变),
 * 而且**按语种不同答案不同** —— Llama 的法语没问题,韩语就吐半成品。
 * 所以不写死一个答案,写一把尺子,需要时重新量。
 *
 * 四项判据,都是可自动判定的,不掺"读起来顺不顺"这种没法复现的主观分:
 *   ① 完整度   —— 该回几条就回几条,少一条扣一条
 *   ② 书写系统 —— 韩/泰/阿/印地文里混汉字、非拉丁后面粘拉丁碎片,都算不合格
 *   ③ 术语     —— BOHUI / ISO 22716 / GMPC / OEM 必须原样在
 *   ④ 未译     —— 译文和原文一字不差 = 根本没翻(模型偷懒时最常见的失败)
 *
 * 跑法:node tools/translate-bench.mjs [语种…]      默认 kr jp ar th
 */
import { readFileSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { translateBatch, scriptProblems, wrongLanguage, TARGETS } from '../apps/web/src/lib/translate.ts';

const log = (m) => writeSync(1, m + String.fromCharCode(10));
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const q = (sql) => {
  const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json',
    '--command', sql.replace(/\s+/g, ' ').trim()], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  const j = JSON.parse(out.slice(out.indexOf('[')));
  return j[j.length - 1].results ?? [];
};

const rows = q(`SELECT id,label,base_url,model,api_keys,tier FROM providers WHERE enabled=1 ORDER BY tier,id`)
  .map((r) => ({ id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''),
                 model: r.model, keys: String(r.api_keys || '').split(',').map((x) => x.trim()).filter(Boolean) }))
  .filter((p) => p.keys.length);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

/* 候选池 = 库里配好的那几家 + **同一把 NVIDIA key 能调到的别家模型**。
   NVIDIA NIM 把 DeepSeek、OpenAI 开源版、Google Gemma、Kimi 都托管了,
   也就是说不用再申请三家的账号就能横向比 —— 这是选型时最省事的一条路。
   riva-translate 是 NVIDIA 自己的**专用翻译模型**,不是通用对话模型,
   放进来是想看看"专用"在这种带行业术语的文案上到底有没有优势。 */
const NV = byId.nvidia;
const CANDIDATES = [
  ...rows.filter((r) => r.id !== 'nvidia'),
  ...(NV ? [
    ['deepseek-v4-pro',  'deepseek-ai/deepseek-v4-pro-0813'],
    ['deepseek-v4-flash','deepseek-ai/deepseek-v4-flash-0731'],
    ['openai-gpt-oss',   'openai/gpt-oss-120b'],
    ['google-gemma-4',   'google/gemma-4-31b-it'],
    ['kimi-k3',          'moonshotai/kimi-k3'],
    ['mistral-large-2',  'mistralai/mistral-large-2-instruct'],
    ['nemotron-ultra',   'nvidia/nemotron-3-ultra-550b-a55b'],
    ['riva-translate',   'nvidia/riva-translate-4b-instruct-v2'],
  ].map(([id, model]) => ({ ...NV, id, label: id, model })) : []),
];
const fleet = CANDIDATES;

/* 评测样本:真实站上的文案,不是造的句子 ——
   造的句子翻起来都好看,真实文案里的行业词、缩写、长定语才是分水岭。 */
const SAMPLE = [
  '从一株药材到一支成品,护肤、彩妆、洁护、香氛四条线并行',
  '真空乳化 · 常温与冷制可选',
  '灌装线:膏霜、水剂、油类分线',
  'GMPC 洁净厂房 28,000 平方米',
  '最小起订量 3,000 支起,同一订单可跨品类组合',
  '配方定制与复刻,稳定性与相容性测试',
  '通过 ISO 22716 认证的受托制造商',
  '婴童与眼周产品单独排产,不与彩妆共线',
  '出口目的地 43 国,提供 MSDS 与 COA',
  '包材开发:泵头、软管、玻璃瓶与纸盒同步打样',
];
const GLOSS = ['BOHUI', 'ISO 22716', 'GMPC', 'OEM', 'MSDS', 'COA'];

const langs = process.argv.slice(2).filter((a) => TARGETS[a]);
const LANGS = langs.length ? langs : ['kr', 'ar', 'pt'];

log(`舰队 ${fleet.length} 家 · 样本 ${SAMPLE.length} 条 · 语种 ${LANGS.join(' ')}\n`);
const board = {};

for (const to of LANGS) {
  log(`── ${to} (${TARGETS[to].name}) ──`);
  for (const p of fleet) {
    const t0 = Date.now();
    let row;
    try {
      // 只给一家,绕开自动降级 —— 评测要的就是这一家自己的水平
      const out = await translateBatch(process.env, [p], SAMPLE, to, '化妆品代工工厂店铺', 180_000);
      const got = SAMPLE.map((_, i) => out[String(i)] ?? '');
      const missing = got.filter((x) => !x.trim()).length;
      const script = scriptProblems(to, out, SAMPLE).length;
      const wrongLang = wrongLanguage(to, out);   // 交回英文的模型必须判 0 分,否则它每门语言都满分
      // 术语:原文出现过的,译文必须还在
      let glossMiss = 0;
      SAMPLE.forEach((src, i) => {
        for (const g of GLOSS) if (src.includes(g) && !got[i].includes(g)) glossMiss++;
      });
      const untouched = got.filter((x, i) => x.trim() === SAMPLE[i]).length;
      const score = wrongLang ? 0 : Math.max(0, 100 - missing * 10 - script * 8 - glossMiss * 6 - untouched * 10);
      row = { score, missing, script, glossMiss, untouched, wrongLang, ms: Date.now() - t0, sample: got[1] || got[0] };
    } catch (e) {
      row = { score: 0, err: String(e.message).slice(0, 50), ms: Date.now() - t0 };
    }
    (board[p.id] ??= {})[to] = row;
    const f = row.err ? `挂了(${row.err})`
      : `${String(row.score).padStart(3)} 分 | ${row.wrongLang ? '★交回的不是目标语言' : `缺${row.missing} 混排${row.script} 术语${row.glossMiss} 未译${row.untouched}`} | ${row.ms}ms`;
    log(`  ${p.id.padEnd(13)}${f}`);
    if (row.sample) log(`  ${''.padEnd(13)}↳ ${row.sample.slice(0, 60)}`);
  }
  log('');
}

log('══ 汇总(按平均分)══');
const avg = Object.entries(board).map(([id, byLang]) => {
  const ss = Object.values(byLang).map((r) => r.score);
  return { id, avg: Math.round(ss.reduce((a, b) => a + b, 0) / ss.length), byLang };
}).sort((a, b) => b.avg - a.avg);
log('  模型'.padEnd(16) + '平均  ' + LANGS.map((l) => l.padStart(5)).join(''));
for (const a of avg) log('  ' + a.id.padEnd(14) + String(a.avg).padStart(4) + '  ' + LANGS.map((l) => String(a.byLang[l]?.score ?? 0).padStart(5)).join(''));
log('\n各语种最佳:');
for (const l of LANGS) {
  const best = avg.filter((a) => a.byLang[l]).sort((x, y) => y.byLang[l].score - x.byLang[l].score)[0];
  log(`  ${l}: ${best.id} (${best.byLang[l].score} 分)`);
}
