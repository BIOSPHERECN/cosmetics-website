/**
 * CSS 变量断链静态检查 —— 「令牌名错配」这一类病的架构级防线。
 *
 * 这类病在本仓库已经犯了四次,长相各不相同,病根完全一样:
 *   定义写一个名,使用写另一个名,浏览器不报错,值静默落空 ——
 *   登录页整页黑掉(--panel vs --ad-panel)、生态段白卡(猜类名)、
 *   页脚暗字(特异度打不过)、仪表盘引用不存在的 --ad-surface。
 * 创始人的原话:「在整体架构就需要考虑到,别又那么多bug啊」。
 *
 * 做法:扫全部样式来源(.css/.astro/.ts/.tsx),
 *   定义 = `--name:` 或 setProperty('--name');使用 = `var(--name`。
 *   任何用了却无人定义的名字 → 输出一行,exit 1。
 * 白名单必须写原因,空原因不收。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [
  'F:/0cosmetic/cosmetic-sites/packages/core/src',
  'F:/0cosmetic/cosmetic-sites/apps/web/src',
];

/* 有意在运行期注入、静态扫描看不见定义的变量:名字 → 原因 */
const ALLOW = new Map([
  /* Open Props(packages/core 依赖):tokens.css 顶部 @import 'open-props/…',
     定义在 node_modules 里,本扫描不进去。仓库纪律:组件只准读 --ck-*,
     open-props 变量只允许出现在 tokens.css 的映射行里,且必须带兜底值。 */
  ['--shadow-1', 'open-props/shadows.min.css(tokens.css @import)'],
  ['--shadow-3', 'open-props/shadows.min.css(tokens.css @import)'],
  ['--ease-out-3', 'open-props/easings.min.css(tokens.css @import)'],
]);

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(css|astro|ts|tsx|jsx|html)$/.test(name)) files.push(p);
  }
};
ROOTS.forEach(walk);

const defined = new Set();
const used = new Map();   // name → [file …]

const DEF_RE = /(--[a-z][a-z0-9-]*)\s*:/g;
const SETP_RE = /setProperty\(\s*['"](--[a-z][a-z0-9-]*)['"]/g;
const USE_RE = /var\(\s*(--[a-z][a-z0-9-]*)/g;

for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(DEF_RE)) defined.add(m[1]);
  for (const m of text.matchAll(SETP_RE)) defined.add(m[1]);
  for (const m of text.matchAll(USE_RE)) {
    if (!used.has(m[1])) used.set(m[1], []);
    const list = used.get(m[1]);
    if (list.length < 3) list.push(f.replace(/^F:\/0cosmetic\/cosmetic-sites\//, ''));
  }
}

let bad = 0;
for (const [name, where] of [...used].sort()) {
  if (defined.has(name) || ALLOW.has(name)) continue;
  bad++;
  console.log(`  ★ ${name} 被使用但全仓无定义 → ${where.join(' , ')}`);
}
console.log(bad === 0
  ? `CSS 变量断链:0(定义 ${defined.size} 个,使用 ${used.size} 个,全部接上)`
  : `CSS 变量断链:${bad} 个 —— 值会静默落空,页面在某处一定在裸奔`);
process.exit(bad === 0 ? 0 : 1);
