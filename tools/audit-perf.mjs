/**
 * 首屏重量与图片体检。
 *
 * 量的是**移动端最疼的那件事**:第一屏要拉多少字节。
 * 海外采购在 4G 或更差的网络上打开这个站,首屏几 MB 和几百 KB 是两种体验 ——
 * 而站上一页有 30–40 张图,很容易一不小心就把整页图全塞进首屏。
 *
 * 三个判据:
 *  ① HTML 本体大小 —— SSR 站的 HTML 里带着全部文案,50KB 以内算正常
 *  ② 首屏必拉的图(loading != lazy)总字节 —— 这才是真正影响打开速度的
 *  ③ 单张图上限 —— 有一张 2MB 的图就足以毁掉整页
 */
const BASE = process.argv[2] || 'https://biosphere-ai.com';
const PAGES = ['', 'about', 'products', 'origin', 'rnd', 'quality', 'contact',
  'capabilities/manufacturing', 'about/plants'];

const fail = [];
const note = (m) => { fail.push(m); console.log('  ★ ' + m); };
const kb = (n) => (n / 1024).toFixed(0) + 'KB';

console.log(`\n════ ${BASE} 首屏重量 ════\n`);
console.log('  页面'.padEnd(32) + 'HTML'.padStart(8) + '图片数'.padStart(8) + '首屏图'.padStart(9) + '首屏字节'.padStart(11));

let worstImg = { url: '', bytes: 0 };
const allImgs = new Map();

for (const p of PAGES) {
  const r = await fetch(`${BASE}/zh-cn/${p}`, { signal: AbortSignal.timeout(45000) });
  const html = await r.text();

  // loading="lazy" 的不算首屏 —— 浏览器不会在首屏拉它们
  const tags = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
  const eager = tags.filter((t) => !/loading=["']lazy["']/.test(t));
  const srcOf = (t) => (/src=["']([^"']+)["']/.exec(t) ?? [])[1];

  let eagerBytes = 0;
  for (const t of eager) {
    const u = srcOf(t);
    if (!u || !u.startsWith('/')) continue;
    if (!allImgs.has(u)) {
      const ir = await fetch(BASE + u, { signal: AbortSignal.timeout(30000) }).catch(() => null);
      const b = ir?.ok ? Number(ir.headers.get('content-length') ?? 0)
        || (await ir.arrayBuffer()).byteLength : 0;
      allImgs.set(u, b);
      if (b > worstImg.bytes) worstImg = { url: u, bytes: b };
    }
    eagerBytes += allImgs.get(u) ?? 0;
  }

  const htmlBytes = Buffer.byteLength(html);
  console.log(`  /${(p || '首页').padEnd(30)}${kb(htmlBytes).padStart(8)}${String(tags.length).padStart(8)}`
    + `${String(eager.length).padStart(9)}${kb(eagerBytes).padStart(11)}`);

  if (htmlBytes > 90 * 1024) note(`/${p || '首页'} 的 HTML ${kb(htmlBytes)},偏大`);
  // 首屏图超过 400KB,在 4G 上就是肉眼可见的白屏等待
  if (eagerBytes > 400 * 1024) note(`/${p || '首页'} 首屏要拉 ${kb(eagerBytes)} 图片,4G 下会明显白屏`);
  if (eager.length > 4) note(`/${p || '首页'} 有 ${eager.length} 张图没加 loading="lazy"`);
}

console.log('\n【图片体检】');
const sizes = [...allImgs.values()].filter(Boolean);
console.log('  首屏用到的不重复图片'.padEnd(28) + `${sizes.length} 张`);
if (sizes.length) {
  console.log('  平均'.padEnd(28) + kb(sizes.reduce((a, b) => a + b, 0) / sizes.length));
  console.log('  最大'.padEnd(28) + `${kb(worstImg.bytes)}  ${worstImg.url}`);
  if (worstImg.bytes > 300 * 1024) note(`单张最大 ${kb(worstImg.bytes)}(${worstImg.url}),超过 300KB`);
}

console.log('\n════ 结论 ════');
console.log(fail.length ? `  ${fail.length} 处待优化:\n   · ${fail.join('\n   · ')}` : '  首屏重量正常。');
