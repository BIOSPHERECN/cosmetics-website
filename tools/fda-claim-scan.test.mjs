// FDA 化妆品宣称禁词：站侧文案源必须 0 命中。node tools/fda-claim-scan.test.mjs
// 测试负例不扫：apps/web/src/lib/comply-copy.test.ts 用 /FDA certified/ 断言改写结果不得出现该词。
// 排除：tools/**/*.html（FDA.gov 镜像 URL 含 not-fda-approved；tools/.sel.html 是旧页快照里的防晒原料新闻标题）。
// TFDA-approved（台湾食品药物管理署）用字母边界排除，不是美国 FDA 宣称。
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

const hits = [];
const rootPath = new URL(root).pathname;
for (const abs of walk(rootPath)) {
  const rel = relative(rootPath, abs);
  if (skipFile(rel)) continue;
  let text = '';
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (BANNED.test(lines[i])) hits.push(`${rel}:${i + 1}`);
  }
}

assert.deepEqual(hits, [], `FDA claim hits:\n${hits.join('\n')}`);

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

console.log('fda-claim-scan.test.mjs: 禁词 0 命中（测试负例与两份 HTML 快照除外）');
