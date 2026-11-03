/**
 * 上线后的路由体检 —— 逐条打线上地址,只读,不改任何东西。
 *
 * 为什么要有它:这个仓库没有 tsconfig、不跑类型检查,
 * 2026-09-08 一天之内两次把「用了却没 import 的标识符」发上线
 * (siteIdForHost 六处),表现是运行时 ReferenceError → 500 或空白页,
 * 构建全程零报错。这种错只有真打一遍地址才看得见。
 *
 * 跑法:node tools/route-sweep.mjs [域名,默认 biosphere-ai.com]
 * 有异常时退出码为 1,可以直接接在发布之后。
 */
/* 全站路由体检 —— 逐条打,记录状态码、字节数、标题、租户头。
   只读,不改任何东西。 */
const BASE = 'https://' + (process.argv[2] || 'biosphere-ai.com');
const LANGS = ['zh-cn', 'zh-tw', 'en'];
const PATHS = ['', 'libraries/', 'packaging/', 'formulas/', 'ingredients/', 'products/',
  'services/', 'chain/', 'capabilities/', 'origin/', 'contact/', 'news/', 'ai/',
  'quality/', 'rnd/', 'about/', 'search/', 'privacy/', 'terms/'];
const ROOT = ['/robots.txt', '/llms.txt', '/sitemap.xml', '/zh-cn/llms.txt', '/favicon.ico'];
const out = [];
const hit = async (u) => {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + u, { headers: { 'user-agent': 'Mozilla/5.0 (sweep)' } });
    const b = await r.text();
    const ti = (b.match(/<title>([^<]*)/) || [])[1] || '';
    out.push({ u, s: r.status, kb: Math.round(b.length / 1024), ms: Date.now() - t0,
      site: r.headers.get('x-bh-site') || '', mism: r.headers.get('x-bh-tenant-mismatch') || '',
      deg: r.headers.get('x-bh-degraded') || '', t: ti.slice(0, 40) });
  } catch (e) { out.push({ u, s: 'ERR', t: String(e).slice(0, 60) }); }
};
for (const p of ROOT) await hit(p);
for (const l of LANGS) for (const p of PATHS) await hit(`/${l}/${p}`);
const bad = out.filter(r => r.s !== 200 || r.mism || r.deg);
console.log(`共 ${out.length} 条 · 异常 ${bad.length} 条`);
for (const r of bad) console.log(' ×', r.u, r.s, r.mism || r.deg || '', r.t || '');
console.log('--- 体积最大的 5 条 ---');
out.filter(r => r.kb).sort((a, b) => b.kb - a.kb).slice(0, 5).forEach(r => console.log(' ', String(r.kb).padStart(5), 'KB', r.u));
console.log('--- 最慢的 5 条 ---');
out.filter(r => r.ms).sort((a, b) => b.ms - a.ms).slice(0, 5).forEach(r => console.log(' ', String(r.ms).padStart(5), 'ms', r.u));
const sites = [...new Set(out.map(r => r.site).filter(Boolean))];
console.log('渲染出的站点:', sites.join(', '));

if (bad.length) process.exitCode = 1;
