// 化妆品宣称禁词：站侧文案源必须 0 命中。node tools/fda-claim-scan.test.mjs
// 测试负例不扫：apps/web/src/lib/comply-copy.test.ts 用 /FDA certified/ 断言改写结果不得出现该词。
// 排除：tools/**/*.html（FDA.gov 镜像 URL 含 not-fda-approved；tools/.sel.html 是旧页快照里的防晒原料新闻标题）。
// TFDA-approved（台湾食品药物管理署）用字母边界排除，不是美国 FDA 宣称。EU 用同一套字母边界。
// 「欧盟已批准 UV 滤剂清单」是法规清单指称，不是厂证/产品已批的「欧盟批准」。
// Omnibus VIII：不写未核实成分禁令当卖点。本刀只扩门禁，不改业务文案、不新开页面。
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const BANNED = new RegExp(
  [
    String.raw`(?<![A-Za-z])FDA[\s\-]+approved\b`,
    String.raw`(?<![A-Za-z])FDA-approved\b`,
    String.raw`approved by (the )?FDA`,
    String.raw`pre-approved by FDA`,
    String.raw`(?<![A-Za-z])EU[\s\-]+approved\b`,
    String.raw`(?<![A-Za-z])EU-approved\b`,
    String.raw`approved by (the )?EU\b`,
    String.raw`欧盟\s*批准`,
    String.raw`(?<![A-Za-z])FDA[\s\-]*(certified|certificate|certification|cleared)\b`,
    String.raw`FDA\s*/\s*CPNP\s*certified`,
    String.raw`FDA\s*/\s*CPNP\s*认证`,
    String.raw`FDA\s*批准`,
    String.raw`FDA核准`,
    String.raw`获FDA批准`,
    String.raw`FDA已批准`,
    String.raw`FDA\s*认证`,
    String.raw`FDA证书`,
    String.raw`FDA\s*注册证书`,
  ].join('|'),
  'i',
);

const SKIP_DIR = new Set(['.git', 'node_modules', 'dist', '.astro']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name) || name.startsWith('.tmp')) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const skipFile = (rel) =>
  rel.endsWith('.test.ts')
  || rel.endsWith('.test.mjs')
  || rel.endsWith('.html')
  || rel.endsWith('.png')
  || rel.endsWith('.jpg')
  || rel.endsWith('.webp')
  || rel.endsWith('.pdf');

function scanLines(text, rel) {
  const found = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (BANNED.test(lines[i])) found.push(`${rel}:${i + 1}`);
  }
  return found;
}

function gate(found) {
  assert.deepEqual(found, [], `claim hits:\n${found.join('\n')}`);
}

const mustFail = [
  'EU-approved',
  'EU approved',
  'EU  approved',
  'eu-approved',
  'EU-Approved',
  'approved by the EU',
  'approved by EU',
  'Approved by the EU',
  'pre-approved by the EU',
  '欧盟批准',
  '欧盟 批准',
  '本厂已欧盟批准',
];
for (const line of mustFail) {
  const found = scanLines(line, 'fixture/banned.txt');
  assert.deepEqual(found, ['fixture/banned.txt:1'], line);
  assert.throws(() => gate(found), assert.AssertionError, line);
}

const mixed = [
  '证墙仅 GMPC / ISO 22716 / HALAL。filings 是协助，注册≠批准。',
  'selling point: EU-approved',
  'TFDA-approved stays outside this ban',
  'TFDA approved',
  'XEU-approved code',
  'menu item was approved by the editor',
  '按欧盟已批准 UV 滤剂清单设计配方',
  'approved by the European Commission',
  '2011/84/EU',
  '欧盟 CPNP 是通报',
  '工厂宣称：欧盟批准',
].join('\n');
const mixedHits = scanLines(mixed, 'fixture/eu-approved.txt');
assert.deepEqual(mixedHits, [
  'fixture/eu-approved.txt:2',
  'fixture/eu-approved.txt:11',
]);
assert.throws(() => gate(mixedHits), assert.AssertionError);

gate(scanLines([
  '证墙仅 GMPC / ISO 22716 / HALAL。',
  'TFDA-approved',
  '欧盟 CPNP 通报。注册≠批准、不发证书。',
  '按欧盟已批准 UV 滤剂清单设计配方',
  'approved by the European Commission',
  '2011/84/EU',
].join('\n'), 'fixture/clean.txt'));

for (const sample of [
  'FDA approved',
  'FDA-approved',
  'approved by the FDA',
  'approved by FDA',
  'pre-approved by FDA',
  'not-fda-approved',
  'FDA certified',
  'FDA 批准',
  '获FDA批准',
]) assert.match(sample, BANNED, sample);

for (const sample of [
  'TFDA-approved',
  'TFDA approved',
  'TFDA-Approved',
  'XEU-approved',
  'nonEU-approved',
  'approved by the European Commission',
  '欧盟已批准 UV 滤剂清单',
  '欧盟 CPNP',
  '注册≠批准、不发证书）；欧盟 CPNP',
]) assert.doesNotMatch(sample, BANNED, sample);

const hits = [];
const rootPath = new URL(root).pathname;
for (const abs of walk(rootPath)) {
  const rel = relative(rootPath, abs);
  if (skipFile(rel)) continue;
  let text = '';
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  hits.push(...scanLines(text, rel));
}

assert.deepEqual(hits, [], `claim hits:\n${hits.join('\n')}`);

const htmlHits = [];
for (const abs of walk(rootPath)) {
  const rel = relative(rootPath, abs);
  if (!rel.endsWith('.html')) continue;
  const text = readFileSync(abs, 'utf8');
  if (BANNED.test(text)) htmlHits.push(rel);
}
htmlHits.sort();
assert.deepEqual(htmlHits, ['tools/.sel.html', 'tools/_fda-prohibited.html']);

const negative = readFileSync(new URL('../apps/web/src/lib/comply-copy.test.ts', import.meta.url), 'utf8');
assert.match(negative, /FDA certified/);
assert.match(negative, /doesNotMatch/);

console.log('fda-claim-scan.test.mjs: 禁词 0 命中（测试负例与两份 HTML 快照除外；夹带 EU-approved 的 fixture 已断言失败）');
