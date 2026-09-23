/**
 * 死链检查 —— 把站上所有内部链接抓出来逐条打,看哪些是空的。
 *
 * 创始人 2026-09-09:「空白的瓶子链接要清除了」「我是说那些空链接」。
 * 空链接分两种,都要查:
 *   · 打不开的(404 / 500)
 *   · 打得开但是空的(页面几乎没内容 —— 比死链更难发现,因为它返回 200)
 *
 * 目录类详情页(包材/配方/原料)有几千条,不逐条打 —— 每类抽样 30 条。
 * 其余内部链接全打。
 */
const BASE = 'https://biosphere-ai.com';
const UA = { 'user-agent': 'Mozilla/5.0 (link-check)' };
const SEEDS = ['/zh-cn/', '/zh-cn/libraries/', '/zh-cn/packaging/', '/zh-cn/formulas/',
  '/zh-cn/ingredients/', '/zh-cn/products/', '/zh-cn/services/', '/zh-cn/faq/',
  '/zh-cn/compare/', '/zh-cn/guides/', '/zh-cn/cases/', '/zh-cn/chain/',
  '/zh-cn/capabilities/', '/zh-cn/origin/', '/zh-cn/about/', '/zh-cn/about/founder/',
  '/zh-cn/contact/', '/zh-cn/news/', '/zh-cn/ai/', '/zh-cn/quality/', '/zh-cn/rnd/'];

const CATALOG = /^\/zh-cn\/(packaging|formula|ingredients|news)\/[^/]+\/$/;
const seen = new Set(), links = new Map();   // href -> [来源页...]

const get = async (u) => {
  const r = await fetch(BASE + u, { headers: UA, redirect: 'manual' });
  const body = r.status < 300 ? await r.text() : '';
  return { status: r.status, loc: r.headers.get('location') || '', body };
};

for (const s of SEEDS) {
  let page;
  try { page = await get(s); } catch { continue; }
  for (const m of page.body.matchAll(/href="(\/zh-cn\/[^"#?]*)"/g)) {
    const h = m[1].endsWith('/') ? m[1] : m[1] + '/';
    if (!links.has(h)) links.set(h, []);
    links.get(h).push(s);
  }
}

/* 目录页每类只抽 30 条 —— 全打是几千次请求,而同一个模板坏了会一起坏 */
const all = [...links.keys()];
const bucket = new Map();
const pick = [];
for (const h of all) {
  const m = h.match(CATALOG);
  if (!m) { pick.push(h); continue; }
  const k = m[1];
  bucket.set(k, (bucket.get(k) ?? 0) + 1);
  if (bucket.get(k) <= 30) pick.push(h);
}
console.log(`抓到内部链接 ${all.length} 条 · 实测 ${pick.length} 条(目录类每种抽 30)`);

const dead = [], thin = [], redir = [];
for (const h of pick) {
  if (seen.has(h)) continue;
  seen.add(h);
  try {
    const r = await get(h);
    if (r.status >= 400) { dead.push(`${h}  ${r.status}  ← ${links.get(h).join(' ')}`); continue; }
    if (r.status >= 300) { redir.push(`${h}  ${r.status} → ${r.loc}`); continue; }
    /* 「打得开但是空的」:去掉标签之后正文不足 200 字 */
    const text = r.body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 200) thin.push(`${h}  正文仅 ${text.length} 字  ← ${links.get(h).join(' ')}`);
  } catch (e) { dead.push(`${h}  ERR ${String(e).slice(0, 60)}`); }
}

const show = (t, a) => { console.log(`\n${t} ${a.length} 条`); a.slice(0, 40).forEach((x) => console.log('  ', x)); };
show('✗ 打不开', dead);
show('· 空内容(200 但几乎没正文)', thin);
show('· 跳转', redir);
if (!dead.length && !thin.length) console.log('\n没有死链,也没有空页。');
process.exitCode = dead.length || thin.length ? 1 : 0;
