/**
 * 主站回归 —— 只查「今天动过的东西」,跑得快,能天天跑。
 *
 * 与 ship-gate 的分工:
 *   ship-gate  全量扫 5 站 × 46 语 × 8 页 ≈ 1800 页,发大版本前跑一次(要几十分钟)
 *   regress    只覆盖改动面与关键路径,一两分钟跑完 —— 每次改完都该跑
 * 一份跑不动的检查等于没有检查,所以必须有一份跑得动的。
 *
 * 今天动过的:媒体下发(SVG 的 CSP)、上传(文件头校验)、
 * 三个后台接口的鉴权作用域、公开 AI 接口限流、新增的询盘接口。
 */
if ((process.env.HTTPS_PROXY || process.env.HTTP_PROXY) && !process.env.NODE_USE_ENV_PROXY) {
  process.env.NODE_USE_ENV_PROXY = '1';
  const { spawnSync } = await import('node:child_process');
  const self = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  process.exit(spawnSync(process.execPath, [self, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env }).status ?? 1);
}

import { LIVE } from './probe-fetch.mjs';   // 09-24:workers.dev 已关 → 默认打正式域名,自动带自家探针头
const B = (process.argv[2] || LIVE['biosphere-ai']).replace(/\/+$/, '');
let pass = 0, fail = 0;
const t = (name, ok, extra = '') => { ok ? (pass++, console.log('  ✓', name, extra)) : (fail++, console.log('  ✗', name, extra)); return ok; };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });

console.log(`回归目标:${B}\n`);

console.log('一、后台接口:未登录一律挡住');
for (const [m, p] of [['GET', '/api/admin/fleet-health'], ['POST', '/api/admin/site-variant'],
  ['POST', '/api/admin/provider'], ['POST', '/api/admin/block'], ['POST', '/api/admin/translate'],
  ['GET', '/api/admin/media-list'], ['POST', '/api/admin/upload'], ['POST', '/api/admin/user']]) {
  const r = await get(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'POST' ? '{}' : undefined });
  t(`${m.padEnd(4)} ${p}`, r.status === 401, `→ ${r.status}`);
}

console.log('\n二、公开接口:该开的开,该限的限');
{
  const r = await get('/api/inquiry');
  t('GET /api/inquiry 只认 POST', r.status === 405, `→ ${r.status}`);
  const bad = await get('/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"not-an-email"}' });
  t('无效邮箱被拒', bad.status === 400, `→ ${bad.status}`);
}

console.log('\n三、媒体下发');
{
  /* 必须跟随跳转:driver='url' 的媒体(剂型图那批)是 302 到静态文件的,
     这是设计不是故障。第一版这里沿用了 redirect:'manual',把正常的 302 判成失败 ——
     测试写错比代码写错更麻烦:它会让人去改本来是对的代码。 */
  const r = await fetch(B + '/media/10');
  t('图片可取(跟随 302)', r.status === 200 && (r.headers.get('content-type') || '').includes('image'),
    `→ ${r.status} ${r.headers.get('content-type')}`);
  t('走不可变长缓存', (r.headers.get('cache-control') || '').includes('immutable'));
  /* nosniff 由 D1 直存那条路径负责;302 到静态文件的由静态层管,不强求 */
  const inline = await fetch(B + '/media/3');
  t('D1 直存的图带 nosniff', inline.headers.get('x-content-type-options') === 'nosniff');
  const missing = await get('/media/999999');
  t('不存在的 id 给 404,不是 200', missing.status === 404, `→ ${missing.status}`);
}

console.log('\n四、前台页面(抽查,不是全量)');
for (const [site, path] of [['beauty2oem', '/zh-cn/'], ['medierba', '/zh-cn/'], ['skin2oem', '/en/'],
  ['biosphere-oralcare', '/ja/'], ['beauty2oem', '/ar/'], ['medierba', '/fr/products/']]) {
  const r = await get(`${path}?site=${site}`);
  const html = r.status === 200 ? await r.text() : '';
  const h1 = (html.match(/<h1[^>]*>/g) || []).length;
  const money = (html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').match(/[¥$€£]|\d+\s*元/g) || []).length;
  t(`${site} ${path}`, r.status === 200 && h1 === 1 && money === 0,
    `→ ${r.status} h1×${h1} 价格×${money}`);
}

console.log('\n五、地区自动跳与语言别名');
/* 不要拿「认不出的语言」去断言英文:判语言的链条是
   浏览器语言 → CF 国家码 → 英文兜底,认不出时会落到国家码那一档。
   本机出口在日本,所以 xx-YY 正确的结果就是日语 —— 那是功能在工作,不是 bug。
   这条断言我第一次就写错了,差点去改一段本来正确的代码。
   所以这里只测**能认出来**的语种;国家码那一档靠伪造 cf.country 才测得准,
   而伪造需要 wrangler dev 本地跑,不属于线上回归的范围。 */
for (const [al, want] of [['zh-CN', '/zh-cn/'], ['ar-SA', '/ar/'], ['pt-BR', '/pt-br/'], ['en-GB', '/en/']]) {
  const r = await get('/', { headers: { 'Accept-Language': al } });
  const got = (r.headers.get('location') || '').replace(B, '');
  t(`${al.padEnd(6)} → ${got}`, got === want, got === want ? '' : `应为 ${want}`);
}
{
  const r = await get('/jp/products/');
  t('/jp/ 别名 → /ja/', (r.headers.get('location') || '').includes('/ja/products/'));
}

console.log('\n六、RTL');
{
  const html = await (await get('/ar/?site=beauty2oem')).text();
  t('阿拉伯语页 dir=rtl', /<html[^>]*\sdir="rtl"/.test(html));
  t('阿拉伯语页 lang=ar', /<html[^>]*\slang="ar"/.test(html));
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
