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
 *      node tools/ship-gate.mjs                 默认打两个正式域名(按域名认站,自动带自家探针头 x-bohui-probe)
 *      node tools/ship-gate.mjs http://127.0.0.1:4321   给基址就沿用 ?site= 切五站(本地 / 副本)
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

import { LIVE, ALL_SITES, siteBase } from './probe-fetch.mjs';
const ARG = process.argv[2];
const BASE = (ARG ?? LIVE['biosphere-ai']).replace(/\/+$/, '');
const SITES = ARG ? ALL_SITES : Object.keys(LIVE);
const LOCALES = ['en', 'zh-cn', 'jp', 'kr', 'fr', 'de', 'ru', 'id', 'my', 'th', 'vn', 'ph', 'es', 'pt', 'ar', 'tr', 'in'];
const HREFLANG = { en: 'en', 'zh-cn': 'zh-CN', jp: 'ja', kr: 'ko', fr: 'fr', de: 'de', ru: 'ru', id: 'id', my: 'ms', th: 'th', vn: 'vi', ph: 'tl', es: 'es', pt: 'pt', ar: 'ar', tr: 'tr', in: 'hi' };

/* 价格字样 —— 2026-11-02 重写(原规则 09-01 写就,09-16 创始人要求「自动换货币」并上了
   包材参考价「Indicative $0.20-0.32 / pc · FOB Guangzhou」,原规则从此每页都红,
   实测 1,186 项里绝大多数是它 —— 一个长期全红的闸门等于没有闸门,它把真故障埋掉了)。

   现在的判据分清三类:
     允许:带「Indicative / 参考 / 约」的区间价(页脚已写明只表示数量级,以书面报价为准)
     禁止:承诺性报价 —— 价格表 / 价目 / 单价 / 报价单,以及 ¥€£ 开头的裸金额
     不算:币种下拉本身(<select> 与 .cur-sym 是控件,不是报价)

   旧正则的两处硬伤一并修掉:
     · re.I 配 \b(USD|…|TRY)\b 会把英文单词 "Try a different keyword" 当成土耳其里拉;
     · 不排除 select,页头 23 个币种码全部计入命中。 */
/* 承诺性报价的词。只留「成表的报价」这类硬信号;
   单价/售价 交给下面按「邻接数字」判 —— 不收进这里,否则「用量大、单价低」这种成本结构叙述又被无条件打死。
   两处误伤实测过,都写清免得下次又踩:
   · 不收裸 "quote" —— 站上反复写 "price are quoted per project in writing"(不报价的声明本身);
   · 不收裸 单价/售价 —— 同上,按邻接数字判。 */
const PRICE_COMMITTED = /价格表|价目表?|\bPrice\s*(list|table|sheet)\b/i;
/* $ 金额:没有 Indicative/参考 限定就视为承诺价。
   但要先排掉带币种代码前缀的外币金额 —— NT$1 million(法规罚金)、US$157.6B(平台大盘)
   都是引用第三方数字,不是我们对访客报价。 */
const DOLLAR_AMOUNT = /(?<![A-Z]{1,3})\$\s*\d[\d,.]*(?:\s*[-–]\s*\$?\s*\d[\d,.]*)?/g;
const INDICATIVE = /(?:indicative|reference|estimated|approx|参考|约|起|\bfrom\b)/i;
/* ¥€£ 金额只在「像是在对我们报价」时才算违规。
   /brands/ 上的「Pricing (€35-149) sits at the prestige end」「a hero balm priced at €36」
   是对**竞品零售价**的市场观察 —— 那是可核查的公开事实,也正是最容易被 AI 引用的内容,不该拦。 */
const SYMBOL_OURS = /(?:^|[,;(.]|\s)(?:[¥€£]\s*\d[\d,.]*)\s*(?:\/\s*(?:pc|piece|kg|支|瓶)|\bper\b|FOB|起订|MOQ)/i;

const fails = [];
const warns = [];
const fail = (where, what) => fails.push(`${where}  ${what}`);

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

/* 本机出口到 CF 边缘会瞬时抖动(实测 20:18 一轮 1003 个串行请求里撞出 UND_ERR_CONNECT_TIMEOUT,
   未捕获直接把闸门打崩,退出码 1 看着像「页面有 1000 项错」其实一个都没判完)。
   抖动不是站挂了 —— 真挂了三连后仍失败,才按失败算。 */
async function get(path, headers = {}, base = BASE) {
  const url = base + path;
  const opt = { headers: { 'User-Agent': BROWSER_UA, ...headers }, redirect: 'manual' };
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, opt);
      return { status: r.status, loc: r.headers.get('location'), html: r.status === 200 ? await r.text() : '' };
    } catch (e) {
      err = e;
      await new Promise((s) => setTimeout(s, 400 * (i + 1)));
    }
  }
  fail('网络', `${url} 三连失败:${err?.name ?? err}`);
  return { status: 0, loc: null, html: '' };
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
  const [b, qs] = siteBase(ARG, site);
  let path = `/${locale}/${slug ? slug + '/' : ''}${qs ? '?' + qs : ''}`;
  const where = `${site} · ${locale} · /${slug}`;
  /* 跳转跟到终点再判 —— 闸门该问的是「访客最终能不能看到这一页」,不是「第一跳是不是 200」。
     按设计的跳转不该算失败:beauty2oem 只出简体中文(其余 302 回 zh-cn、非本站页 301 到工厂站)、
     老站 URL 的 301、尾斜杠与大小写规整、以及 11-03 加的 /products/ → /product/。
     实测这批一共 333 项,以前全记成失败 —— 一个长期全红的闸门等于没有闸门,它把真故障埋掉了。
     终点仍 404 才判死,所以 OEM 那 102 条照样会被抓到(0 字节 404 跟不出 200)。 */
  let status = 0, html = '';
  for (let hop = 0; hop <= 5; hop++) {
    const r = await get(path, {}, b);
    status = r.status; html = r.html;
    if (status < 300 || status > 399 || !r.loc) break;
    let next;
    try { next = new URL(r.loc, b + path); } catch { fail(where, `跳转目标不成地址:${r.loc}`); return; }
    if (next.hostname !== new URL(b).hostname && hop === 0 && site === 'beauty2oem') {
      /* beauty2oem 的非本站页 301 到 biosphere-ai.com 是设计如此(配方/法规只留一份),认下来 */
      console.log(`   ↳ ${where} 出站 → ${next.hostname}${next.pathname}(按设计,放行)`);
      return;
    }
    if (next.hostname !== new URL(b).hostname) { fail(where, `跳到外站 ${next.hostname}${next.pathname}`); return; }
    /* beauty2oem 只出简体中文:外语 URL 302 回 /zh-cn/ 是设计。
       跟着落到中文页再判「html lang 是 zh-CN 应为 en」是判据错怪它(实测 128 项),
       这里认下来 —— 该页在本站有没有简体中文版本,由 zh-cn 那一轮自己查。 */
    if (site === 'beauty2oem' && hop === 0 && /^\/zh-cn(\/|$)/.test(next.pathname)) {
      console.log(`   ↳ ${where} 302 回 /zh-cn(本站只出简体中文,放行)`);
      return;
    }
    path = next.pathname + next.search;
  }
  if (status !== 200) { fail(where, `HTTP ${status}(跟跳后仍不是 200)`); return; }

  // ① h1
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  if (h1.length === 0) fail(where, '没有 h1');
  else if (h1.length > 1) fail(where, `${h1.length} 个 h1:${h1.join(' / ').slice(0, 80)}`);
  else if (!h1[0]) fail(where, 'h1 是空的');

  // ② 价格泄漏 —— 只查「可能对访客报价」的那类页面
  /* 2026-11-03 实测:剩下的 18 项全打在 /brands、/insights、/regulations 这三类页面上,
     内容分别是对**竞品零售价**、**平台大盘**、**法定罚金**的引用(且都点了出处:Similarweb、
     Momentum Works、elcompanies.com)。那是本站最有引用价值的市场研究正文,不是我们报价。
     一把「凡 $ 加数字就拦」的尺子量不出「谁的钱包」,所以按页面族分口径:
     研究类页面(brands / news / insights / regulations / decoder / trends)不查价格,
     其余页面照常 —— 包材页的 "Indicative $0.20-0.32 / pc · FOB Guangzhou" 仍要有限定词才放过。 */
  const RESEARCH = /^(?:brands|news|insights|regulations|decoder|trends)(?:\/|$)/;
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<select[^>]*>[\s\S]*?<\/select>/g, ' ')
    .replace(/<span[^>]*class="cur-sym"[^>]*>[\s\S]*?<\/span>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  /* 用 if 包住整块,不能用 return —— return 会把下面的 hreflang 与 html lang 一起跳掉,
     那两项对研究类页面同样必须查。 */
  if (!RESEARCH.test(slug.replace(/^\/+/, ''))) {
  const problems = [];
  /* 单价/售价 必须邻接数字才算报价 ——
     「小规格意味着包材单价占比高」「用量大、单价低」讲的是成本结构,一个钱数都没有。 */
  const unit = /(?<!客)(?:单价|售价)/g;
  for (const m of body.matchAll(unit)) {
    if (/\d/.test(body.slice(m.index + 2, m.index + 14))) problems.push(`「${m[0]}」后跟金额`);
  }
  const committed = PRICE_COMMITTED.exec(body);
  if (committed) problems.push(`承诺性报价词「${committed[0]}」`);
  const sym = SYMBOL_OURS.exec(body);
  if (sym) problems.push(`像是对我们自己报价的 ¥€£ 金额「${body.slice(sym.index, sym.index + 24).trim()}」`);
  for (const m of body.matchAll(DOLLAR_AMOUNT)) {
    // 往前看 40 字有没有 Indicative/参考 这类限定词;有就是公开的政策性参考价,放过
    const before = body.slice(Math.max(0, m.index - 40), m.index);
    if (!INDICATIVE.test(before)) problems.push(`无「Indicative/参考」限定的金额「${m[0]}」`);
  }
  if (problems.length) fail(where, `价格字样 ${problems.length} 处:${problems[0]}`);
  }

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
/* 路由期望：Accept-Language 按中间件逻辑 → 国家码路径 (jp/kr/my/vn/ph/in)
   de 也是合法语言，直接落 /de/；旧表把 de 归英文是旧设计遗留。 */
const ROUTE = [
  ['zh-CN,zh;q=0.9', '/zh-cn/'], ['en-US,en;q=0.9', '/en/'], ['ja-JP,ja;q=0.9', '/jp/'],
  ['id-ID,id;q=0.9', '/id/'], ['ms-MY,ms;q=0.9', '/my/'], ['fr-FR,fr;q=0.9', '/fr/'],
  ['de-DE,de;q=0.9', '/de/'],
];
for (const [al, want] of ROUTE) {
  const { loc } = await get('/', { 'Accept-Language': al });
  const got = (loc ?? '').replace(BASE, '');
  console.log(`   ${al.padEnd(18)} → ${got}${got === want ? '' : `   ✗ 应为 ${want}`}`);
  if (got !== want) fail('地区跳转', `${al} → ${got},应为 ${want}`);
}
/* 别名 → 规范路径。设计已改为路径走国家码(jp/kr/my/vn/ph/in 是规范,200 直出)；
   旧语言码(ja/ko/ms/vi/tl/hi)作为别名 302 到国家码。这里只验「旧码仍能到」：
   /ja/→/jp/、/ko/→/kr/、/ms/→/my/、/zh/→/zh-cn/。规范码本身由逐页体检覆盖。 */
for (const [from, want] of [['/ja/', '/jp/'], ['/ko/', '/kr/'], ['/ms/', '/my/'], ['/zh/', '/zh-cn/'], ['/hi/', '/in/'], ['/vi/', '/vn/'], ['/tl/', '/ph/']]) {
  const { status, loc } = await get(from);
  const got = (loc ?? '').replace(BASE, '').replace(/\?.*$/, '');
  console.log(`   ${from.padEnd(18)} → ${got || `(${status})`}${got === want ? '' : `   ✗ 应为 ${want}`}`);
  if (got !== want) fail('语言别名', `${from} → ${got || `HTTP ${status}`},应为 ${want}`);
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
/* 6 路并发:串行 1003 个请求要 30 分钟,上线闸门等不起;
   再高会自己把 CF 限速打出 429,那就变成工具自己造故障(探针假象)。 */
const POOL = 6;
async function pool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}
for (const site of SITES) {
  const [b, qs] = siteBase(ARG, site);
  const { html } = await get(`/zh-cn/${qs ? '?' + qs : ''}`, {}, b);
  const slugs = linksOf(html, 'zh-cn');
  console.log(`   ${site}:${slugs.length} 页 × ${LOCALES.length} 语`);
  const jobs = LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
  await pool(jobs, async ({ locale, slug }) => { await checkPage(site, locale, slug); n++; });
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
  /* 只打印前 40 条 = 看不到真实分布,1,186 项时前 40 条全是同一类,
     其余几百项是同一类还是另有问题,当场无法判断。全量落盘,打印按类型聚合。 */
  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('gate-fails.txt', fails.join('\n'), 'utf8');
    console.log(`   (全量已写 gate-fails.txt,下面按类型聚合)`);
    const agg = new Map();
    for (const f of fails) {
      const k = f.replace(/^\S+ · \S+ · \/\S*\s+/, '').replace(/[\d,.]+ 处.*$/, '').replace(/缺:.*/, '缺:…').slice(0, 46);
      agg.set(k, (agg.get(k) ?? 0) + 1);
    }
    [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, v]) => console.log(`   ${String(v).padStart(5)} × ${k}`));
  } catch { fails.slice(0, 40).forEach((f) => console.log('   ' + f)); }
  process.exit(1);
}
console.log('\n✓ 闸门通过');
