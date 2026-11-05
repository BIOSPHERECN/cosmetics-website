// 公网渲染源不得出现外链主机或站点号码。后台 / API 不在这次扫描里。
// node tools/public-no-wa.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const roots = [
  'apps/web/src/components',
  'apps/web/src/pages',
  'apps/web/src/middleware.ts',
  'packages/core/src',
  'sites',
];
const skip = (rel) =>
  rel.includes('/bohui/')
  || rel.includes('/api/')
  || rel.includes('/node_modules/')
  || rel.endsWith('.html');

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = abs.slice(root.pathname.length);
    if (skip(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (/\.(astro|ts|mjs|js|tsx)$/.test(name)) out.push(abs);
  }
}

const files = [];
for (const rel of roots) {
  const abs = new URL(rel, root);
  const path = abs.pathname;
  if (statSync(path).isDirectory()) walk(path, files);
  else files.push(path);
}

const needles = ['wa.me', '8613600050502'];
const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const n of needles) {
    if (text.includes(n)) hits.push(`${file.slice(root.pathname.length)}: ${n}`);
  }
}

assert.deepEqual(hits, [], `公网源仍含外链或号码:\n${hits.join('\n')}`);
assert.match(
  readFileSync(new URL('../apps/web/src/middleware.ts', import.meta.url), 'utf8'),
  /const CACHE_V = 'v149'/,
);
assert.match(
  readFileSync(new URL('../apps/web/src/pages/[lang]/rfq/index.astro', import.meta.url), 'utf8'),
  /name="whatsapp"/,
  '询盘表单仍保留客户填写的联系方式',
);

console.log(`public-no-wa ok (${files.length} files)`);
