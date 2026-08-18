/**
 * 上线闸门 —— 每次发布后跑一遍,把「肉眼看不出来但客户会撞上」的问题拦在门口。
 *
 * 为什么要有它:
 *   这次一口气加了三个语种、改了页头结构。人工点几页看着都对,
 *   可实际躺着三处硬伤(首页两个 h1、顶部 81px 空白、未上线语种直接 500)——
 *   都是点开看不出来、量一下才现形的那类。
 *   靠人每次发版逐页量 5 站 × 6 语 × 8 页 = 240 个页面,做一次就不会做第二次。
 *
 * 闸门只查能自动判死的事实,不替人判断好不好看:
 *   ① 每页恰好一个非空 h1     —— 多一个搜索引擎不知道信谁,少一个等于没说自己讲什么
 *   ② 页面不出现价格/货币字样 —— 这条产品线只接单不报价,价格泄漏是商务问题不是排版问题
 *   ③ hreflang 六语齐全 + x-default —— 少一条,那个语种在 Google 眼里就不存在
 *   ④ <html lang> 与 URL 语种一致 —— 不一致会让读屏器用错发音、翻译工具误判
 *   ⑤ 地区自动跳与语言码别名按预期落地
 *
 * 跑法:node tools/ship-gate.mjs [基址]
 *      node tools/ship-gate.mjs https://bohui-web.huanggw20.workers.dev
 */
/* Node 的 fetch 默认不认 HTTP_PROXY/HTTPS_PROXY —— 在走代理的机器上会直接连接超时,
   报出来的是 UND_ERR_CONNECT_TIMEOUT,看着像站挂了,其实是本机出不去。
   Node 24 起有这个开关,进程内自己打开,不用调用方记得加环境变量。 */
if ((process.env.HTTPS_PROXY || process.env.HTTP_PROXY) && !process.env.NODE_USE_ENV_PROXY) {
  process.env.NODE_USE_ENV_PROXY = '1';
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env });
  process.exit(r.status ?? 1);
}

const BASE = (process.argv[2] ?? 'https://bohui-web.huanggw20.workers.dev').replace(/\/+$/, '');
const SITES = ['beauty2oem', 'skin2oem', 'medierba', 'biosphere-ai', 'biosphere-oralcare'];
const LOCALES = ['en', 'zh-cn', 'ja', 'ko', 'id', 'ms', 'th', 'vi', 'hi', 'bn', 'tl', 'ur', 'pa', 'te', 'ta', 'mr', 'gu', 'jv', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'sv', 'da', 'fi', 'no', 'cs', 'el', 'hu', 'ro', 'uk', 'ru', 'pt-br', 'es-mx', 'ar', 'tr', 'fa', 'he', 'sw', 'ha', 'am', 'kk', 'uz'];
const HREFLANG = { en: 'en', 'zh-cn': 'zh-CN', ja: 'ja', ko: 'ko', id: 'id', ms: 'ms', th: 'th', vi: 'vi', hi: 'hi', bn: 'bn', tl: 'tl', ur: 'ur', pa: 'pa', te: 'te', ta: 'ta', mr: 'mr', gu: 'gu', jv: 'jv', fr: 'fr', de: 'de', es: 'es', it: 'it', pt: 'pt', nl: 'nl', pl: 'pl', sv: 'sv', da: 'da', fi: 'fi', no: 'no', cs: 'cs', el: 'el', hu: 'hu', ro: 'ro', uk: 'uk', ru: 'ru', 'pt-br': 'pt-BR', 'es-mx': 'es-MX', ar: 'ar', tr: 'tr', fa: 'fa', he: 'he', sw: 'sw', ha: 'ha', am: 'am', kk: 'kk', uz: 'uz' };

/* 价格字样。故意不收「MOQ / 起订量」——
   那是数量不是价格,B 端采购看完能做什么下一个问题必是「多少起做」,该留。 */
const MONEY = /[¥$€£₹]|\b(USD|CNY|EUR|GBP|RMB|IDR|MYR)\b|单价|售价|报价|价格表|价目|每支[\d.]|元\/(?:支|瓶|克|kg)/gi;

const fails = [];
const warns = [];
const fail = (where, what) => fails.push(`${where}  ${what}`);

async function get(path, headers = {}) {
  const r = await fetch(BASE + path, { headers, redirect: 'manual' });
  return { status: r.status, loc: r.headers.get('location'), html: r.status === 200 ? await r.text() : '' };
}

/** 从首页导航里取出这一站真实存在的页面,而不是我拍脑袋列一张清单 */
function linksOf(html, locale) {
  const set = new Set(['']);
  for (const m of html.matchAll(new RegExp(`href="/${locale}/([a-z0-9\\-/]*)/?"`, 'g'))) {
    const s = m[1].replace(/\/+$/, '');
    if (s && !s.includes('#')) set.add(s);
  }
  return [...set];
}

async function checkPage(site, locale, slug) {
  const path = `/${locale}/${slug ? slug + '/' : ''}?site=${site}`;
  const where = `${site} · ${locale} · /${slug}`;
  const { status, html } = await get(path);
  if (status !== 200) { fail(where, `HTTP ${status}`); return; }

  // ① h1
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  if (h1.length === 0) fail(where, '没有 h1');
  else if (h1.length > 1) fail(where, `${h1.length} 个 h1:${h1.join(' / ').slice(0, 80)}`);
  else if (!h1[0]) fail(where, 'h1 是空的');

  // ② 价格泄漏(只看可见正文,不看脚本与样式)
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ');
  const money = [...body.matchAll(MONEY)].map((m) => body.slice(Math.max(0, m.index - 30), m.index + 30).trim());
  if (money.length) fail(where, `出现价格字样 ${money.length} 处:${money[0]}`);

  // ③ hreflang
  const hl = new Set([...html.matchAll(/rel="alternate"\s+hreflang="([^"]+)"/g)].map((m) => m[1]));
  const missing = [...LOCALES.map((l) => HREFLANG[l]), 'x-default'].filter((x) => !hl.has(x));
  if (missing.length) fail(where, `hreflang 缺:${missing.join(' ')}`);

  // ④ html lang
  const lang = /<html[^>]*\slang="([^"]+)"/.exec(html)?.[1];
  if (lang !== HREFLANG[locale]) fail(where, `<html lang> 是 ${lang},应为 ${HREFLANG[locale]}`);

  // 附带提醒:整页还剩多少中文 —— 外语版残留大段中文说明翻译没跟上(不算失败,只提醒)
  if (locale !== 'zh-cn') {
    const zh = (body.match(/[一-龥]/g) ?? []).length;
    if (zh > 120) warns.push(`${where}  仍有 ${zh} 个汉字,译文可能没跟上`);
  }
}

console.log(`闸门基址:${BASE}`);

/* ── 一、地区自动跳与别名 ─────────────────────────────── */
console.log('\n[1/3] 地区自动跳与语言码别名');
const ROUTE = [
  ['zh-CN,zh;q=0.9', '/zh-cn/'], ['en-US,en;q=0.9', '/en/'], ['ja-JP,ja;q=0.9', '/ja/'],
  ['id-ID,id;q=0.9', '/id/'], ['ms-MY,ms;q=0.9', '/ms/'], ['fr-FR,fr;q=0.9', '/fr/'],
  ['de-DE,de;q=0.9', '/en/'],
];
for (const [al, want] of ROUTE) {
  const { loc } = await get('/', { 'Accept-Language': al });
  const got = (loc ?? '').replace(BASE, '');
  console.log(`   ${al.padEnd(18)} → ${got}${got === want ? '' : `   ✗ 应为 ${want}`}`);
  if (got !== want) fail('地区跳转', `${al} → ${got},应为 ${want}`);
}
for (const [from, want] of [['/jp/', '/ja/'], ['/jp/products/', '/ja/products/'], ['/zh/', '/zh-cn/'], ['/in/', '/id/'], ['/my/', '/ms/']]) {
  const { loc } = await get(from);
  const got = (loc ?? '').replace(BASE, '').replace(/\?.*$/, '');
  console.log(`   ${from.padEnd(18)} → ${got}${got === want ? '' : `   ✗ 应为 ${want}`}`);
  if (got !== want) fail('语言别名', `${from} → ${got},应为 ${want}`);
}
{
  const { loc } = await get('/', { 'Accept-Language': 'zh-CN', Cookie: 'bohui_lang=fr' });
  const got = (loc ?? '').replace(BASE, '');
  console.log(`   已选法文的 cookie 压过中文头 → ${got}${got === '/fr/' ? '' : '   ✗'}`);
  if (got !== '/fr/') fail('语言记忆', `cookie=fr 但跳到 ${got}`);
}

/* ── 二、逐页体检 ─────────────────────────────────────── */
console.log('\n[2/3] 逐页体检(h1 / 价格 / hreflang / lang)');
let n = 0;
for (const site of SITES) {
  const { html } = await get(`/zh-cn/?site=${site}`);
  const slugs = linksOf(html, 'zh-cn');
  console.log(`   ${site}:${slugs.length} 页 × ${LOCALES.length} 语`);
  for (const locale of LOCALES) {
    for (const slug of slugs) { await checkPage(site, locale, slug); n++; }
  }
}

/* ── 三、结论 ─────────────────────────────────────────── */
console.log(`\n[3/3] 共查 ${n} 个页面`);
if (warns.length) {
  console.log(`\n提醒 ${warns.length} 条(不拦发布):`);
  warns.slice(0, 12).forEach((w) => console.log('   · ' + w));
  if (warns.length > 12) console.log(`   …另有 ${warns.length - 12} 条`);
}
if (fails.length) {
  console.log(`\n✗ 闸门未通过,${fails.length} 项:`);
  fails.slice(0, 40).forEach((f) => console.log('   ' + f));
  if (fails.length > 40) console.log(`   …另有 ${fails.length - 40} 项`);
  process.exit(1);
}
console.log('\n✓ 闸门通过');
