/**
 * 上线终检 —— 对**真实域名**跑,不是对预览地址。
 *
 * 检查项按「出了问题会怎样」排序,不按「好不好做」排:
 *   页面 500 / 图片 404  → 采购当场关掉
 *   noindex / 无 sitemap → 搜索引擎收不到,等于没上线
 *   老 URL 404           → 外链与书签全断
 *   语言残缺             → 出海站的核心卖点落空
 *   AI 爬虫被挡          → GEO 白做
 */
const BASE = process.argv[2] || 'https://biosphere-ai.com';
const LANGS = ["zh-cn", "en", "jp", "kr", "id", "my", "th", "vn", "ph", "es", "pt", "ar", "tr", "in", "fr", "de", "ru"];  // 路由码,不是 ISO 码 —— /ja/ 会 302 到 /jp/
/* about/group 已随「先删除集团,只是帛卉」(2026-08-31)转草稿下线,404 是设计行为 */
const PAGES = ['', 'about', 'about/history', 'about/plants', 'origin',
  'origin/ginseng', 'origin/rose', 'origin/green-tea', 'origin/aloe', 'origin/centella',
  'capabilities', 'capabilities/manufacturing', 'capabilities/incubation', 'capabilities/packaging',
  'rnd', 'rnd/formulation', 'rnd/lab', 'products', 'quality', 'contact', 'skin', 'studio'];
const LEGACY = ['/index.html', '/company.html', '/brand-story.html', '/ai-center.html', '/all-products.html',
  '/membership.html', '/news.html', '/heritage/', '/origin-ginseng.html', '/origin-rose.html',
  '/origin-green-tea.html', '/origin-aloe.html', '/origin-centella.html', '/bhbohui.html'];

const get = async (u, opts = {}) => {
  try {
    const r = await fetch(BASE + u, { redirect: opts.follow === false ? 'manual' : 'follow', signal: AbortSignal.timeout(45000) });
    const body = opts.head ? '' : await r.text();
    return { ok: r.ok, status: r.status, body, loc: r.headers.get('location'), type: r.headers.get('content-type') || '' };
  } catch (e) { return { ok: false, status: 0, body: '', err: String(e.message).slice(0, 40) }; }
};

const fail = [];
const note = (msg) => { fail.push(msg); console.log('  ★ ' + msg); };
const line = (label, val) => console.log('  ' + String(label).padEnd(34) + val);

console.log(`\n════ ${BASE} 上线终检 ════`);

/* ① 中文页面 —— 结构、图、SEO 标签 */
console.log('\n【1】页面结构与 SEO');
const imgSrcs = new Set();
let minSec = 99, pagesChecked = 0;
for (const p of PAGES) {
  const r = await get(`/zh-cn/${p}`);
  if (!r.ok) { note(`/zh-cn/${p} → HTTP ${r.status} ${r.err ?? ''}`); continue; }
  pagesChecked++;
  const sec = (r.body.match(/<section/g) || []).length;
  const h1 = (r.body.match(/<h1/g) || []).length;
  minSec = Math.min(minSec, sec);
  if (h1 !== 1) note(`/zh-cn/${p} 有 ${h1} 个 h1(应当正好 1 个)`);
  if (sec < 6) note(`/zh-cn/${p} 只有 ${sec} 个版块,内容过薄`);
  if (/noindex/.test(r.body)) note(`/zh-cn/${p} 带 noindex`);
  if (!/rel="canonical"/.test(r.body)) note(`/zh-cn/${p} 缺 canonical`);
  if (!/hreflang=/.test(r.body)) note(`/zh-cn/${p} 缺 hreflang`);
  if (!/property="og:image"/.test(r.body)) note(`/zh-cn/${p} 缺 og:image`);
  for (const m of r.body.matchAll(/<img[^>]+src="([^"]+)"/g)) imgSrcs.add(m[1]);
  // JSON-LD 必须能解析 —— 语法坏掉的结构化数据等于没有,而且不会报错
  for (const m of r.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { note(`/zh-cn/${p} 的 JSON-LD 解析失败`); }
  }
}
line('检查页面数', `${pagesChecked}/${PAGES.length}`);
line('最少版块数', minSec);
line('不重复图片', imgSrcs.size);

/* ② 图片 */
console.log('\n【2】图片可用性');
let imgOk = 0, imgBytes = 0;
for (const src of imgSrcs) {
  const r = await get(src, { head: true });
  if (r.ok) { imgOk++; } else note(`图片 ${src} → HTTP ${r.status}`);
}
line('可正常加载', `${imgOk}/${imgSrcs.size}`);

/* ③ 多语种 */
console.log('\n【3】多语种');
for (const l of LANGS) {
  const r = await get(`/${l}/`);
  if (!r.ok) { note(`/${l}/ → HTTP ${r.status}`); continue; }
  const txt = r.body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  const cn = (txt.match(/[一-鿿]/g) || []).length;
  const kana = (txt.match(/[぀-ヿ]/g) || []).length;
  // 日语本来就用汉字 —— 只数汉字会把翻好的日语页判成没翻。看假名才作数。
  const looksUntranslated = l === "jp" ? (cn > 120 && kana < 40) : (l !== "zh-cn" && cn > 120);
  if (looksUntranslated) note(`/${l}/ 正文里有 ${cn} 个汉字` + (l === "jp" ? `、假名只有 ${kana} 个` : "") + ",该语种多半没翻完");
}
line('语种数', LANGS.length);

/* ④ 老 URL */
console.log('\n【4】老站 URL 重定向');
let redirOk = 0;
for (const u of LEGACY) {
  const r0 = await get(u, { follow: false, head: true });
  if (r0.status !== 301) { note(`${u} → HTTP ${r0.status}(应当 301)`); continue; }
  const r1 = await get(u);
  if (!r1.ok || r1.body.length < 3000) { note(`${u} 跳转后 → HTTP ${r1.status},${r1.body.length}B`); continue; }
  redirOk++;
}
line('301 且落地有内容', `${redirOk}/${LEGACY.length}`);

/* ⑤ SEO / GEO 端点 */
console.log('\n【5】SEO / GEO 端点');
const rb = await get('/robots.txt');
line('robots.txt', `HTTP ${rb.status} · ${rb.body.length}B`);
if (/Cloudflare Managed Content|Content-Signal/.test(rb.body)) note('robots.txt 里仍有 Cloudflare 托管段');
for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot']) {
  const m = new RegExp(`User-agent: ${bot}\\s*\\n(Allow|Disallow): ([^\\n]*)`).exec(rb.body);
  if (!m) note(`robots.txt 没有 ${bot} 的规则`);
  else if (m[1] === 'Disallow' && m[2].trim() === '/') note(`robots.txt 仍在封禁 ${bot}`);
}
if (!/Sitemap:/.test(rb.body)) note('robots.txt 没有指向 sitemap');

const sm = await get('/sitemap.xml');
const locs = (sm.body.match(/<loc>/g) || []).length;
line('sitemap.xml', `HTTP ${sm.status} · ${locs} 个 URL`);
if (locs < PAGES.length * LANGS.length * 0.8) note(`sitemap 只有 ${locs} 个 URL,少于预期`);
if (!/xhtml:link/.test(sm.body)) note('sitemap 缺 hreflang 互指');

const ll = await get('/llms.txt');
line('llms.txt', `HTTP ${ll.status} · ${ll.body.length}B`);
if (ll.ok && !/20,000|13,000/.test(ll.body)) note('llms.txt 里没有核心数字');

/* ⑥ 编造数字复查 —— 这是最容易悄悄溜回来的 */
console.log('\n【6】编造数字复查');
/* 两条踩过的坑,都写进正则里:
 *
 * ① 数字和单位之间可能隔着标签。数字条把数值和单位渲染成两个独立元素,
 *    写 /25\s*天/ 匹配不到 —— 上一轮就是这么漏掉 products 页那块的。
 *    所以中间用 [\s\S]{0,60} 容忍标签。
 *
 * ② 但要挡住前面是数字的情况。13,000 里含 3,000,而「13,000+ 配方…支持定制」
 *    的「支」正好落在 60 字内 —— 不加前置断言就会误报首页。
 *
 * ③ 这个文件里的正则**不要用脚本去改**。前两次用 heredoc / node -e 改,
 *    反斜杠被吞掉两次,\d 变成字母 d、\s\S 变成 sS,检查静悄悄地失效,
 *    而结果照样打印「全部通过」。要改就直接编辑本文件。
 */
const FAKE = [
  /28,?000/,
  /(?<![\d,])43[\s\S]{0,60}?国/,
  /(?<![\d,])25[\s\S]{0,60}?天/,
  /(?<![\d,])18[\s\S]{0,60}?年/,
  /(?<![\d,])3,000[\s\S]{0,40}?支起/,
  /(?<![\d,])12[\s\S]{0,40}?条产线/,
];

/* 正则自检 —— 上面说的失效是**静默**的,所以这里当场验一遍:
   给一段必定命中和一段必定不命中的样本,规则坏掉就直接抛错,
   而不是让整轮审计带着一个瞎掉的检查项跑完还报「通过」。 */
{
  const mustHit = '产能 28,000 ㎡,出口 43 个国,打样 25 天,起订 3,000 支起';
  const mustMiss = '13,000+ 成熟配方储备与 15 条智能产线,支持配方快速定制';
  if (!FAKE.some((re) => re.test(mustHit))) throw new Error('FAKE 正则失效:该命中的样本没命中');
  if (FAKE.some((re) => re.test(mustMiss))) throw new Error('FAKE 正则太松:不该命中的样本命中了');
}
/* 必须**先剥标签再查**。直接在 HTML 上跑会撞上一类很隐蔽的误报:
   Astro 的作用域样式哈希形如 data-astro-cid-k6mznf25,结尾是 "25",
   后面 60 字内正好有正文里的「3–7 天」—— 于是 /25…天/ 命中一个
   根本不存在于页面文字里的"数字"。我们要查的是访客读到的内容,不是标记。 */
const plain = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');

let fakeHit = 0;
for (const p of PAGES.slice(0, 21)) {
  const r = await get(`/zh-cn/${p}`);
  const txt = plain(r.body);
  for (const re of FAKE) if (re.test(txt)) { note(`/zh-cn/${p} 仍含编造数字 ${re}`); fakeHit++; break; }
}
line('含编造数字的页面', fakeHit);

/* ⑦ 假译文 —— 数条数永远查不出来的那一类
 *
 * 症状:某语种的 data_json 与英文那行**逐字节相同**,连 linkHref 里的
 * /en/contact/ 都照抄。条数是满的、后台显示「已翻译」、覆盖率统计也漂亮,
 * 只有真人打开那一页才看得出来。实测在五个站上一次性查出 55 条。
 *
 * 成因是翻译管线的兜底:所有模型都没过书写系统检查时,它交回「问题最少的一版」——
 * 而英文在那个检查里恰好问题最少(它不混排,只是错语言)。
 * 管线已加拦截,这里再补一道,防止以后又从别的路径漏进来。 */
console.log('\n【7】假译文(与英文逐字节相同)');
try {
  const { d1 } = await import('./d1.mjs');
  const rows = d1(`SELECT p.site_id, i.lang, COUNT(*) n
                     FROM block_i18n i
                     JOIN blocks b ON b.id = i.block_id
                     JOIN pages  p ON p.id = b.page_id
                     JOIN block_i18n e ON e.block_id = i.block_id AND e.lang = 'en'
                    WHERE b.is_visible = 1 AND i.lang NOT IN ('en','zh-cn')
                      AND i.data_json = e.data_json
                    GROUP BY p.site_id, i.lang ORDER BY n DESC`);
  const total = rows.reduce((a, r) => a + r.n, 0);
  line('全站假译文条目', total);
  if (total > 0) {
    for (const r of rows.slice(0, 8)) note(`${r.site_id} 的 ${r.lang} 有 ${r.n} 条译文其实是英文`);
    console.log('     修法:node tools/fix-untranslated.mjs [站点id]');
  }
} catch (e) {
  note('假译文检查跑不起来:' + String(e.message).slice(0, 60));
}

/* ⑧ 未验证功效数字与内部标记有没有跑到前台
 *
 * 产品文案来自公司资料,资料里带着内部研发数据(SPF 提升 64%、
 * 斑马鱼尾鳍修复 +19.07%、依克多因 0.3%)和内部优先级标签(P0/P1/P2)。
 * 这些是内部实测,不是第三方验证过的功效宣称 —— 发到公开页面上
 * 就是未经证实的功效宣称,而这个站自己写着「功效宣称一律配得出第三方报告」。
 *
 * 结构上已经隔开(存在 products.internal_note,前台查询不选这一列),
 * 这里守的是「以后有人把查询改成 SELECT p.* 」那种情况。
 *
 * 注意:成分名与机理名(TRPM8、依克多因、鞣花酸)**不算泄漏** ——
 * 那是 B2B 里正常的技术描述。第一版把它们也算进来,结果误报了一次。 */
console.log('\n【8】未验证功效数字 / 内部标记');
{
  const LEAK = [/\b64\s*%/, /19\.07\s*%/, /0\.3\s*%/, /不对外宣称/, /合规提醒/,
    /internal_note/, /资料标\s*P[012]/, /斑马鱼尾鳍修复/];
  let hit = 0;
  for (const p of ['products', '']) {
    for (const l of ['zh-cn', 'en']) {
      const r = await get(`/${l}/${p}`);
      if (!r.ok) continue;
      const bad = LEAK.filter((re) => re.test(r.body)).map(String);
      if (bad.length) { note(`/${l}/${p} 泄漏了内部内容:${bad.join(' ')}`); hit += bad.length; }
    }
  }
  line('泄漏项', hit);
}

/* ⑨ 写死的静态图路径指向不存在的文件 —— 跨全部五个站查
 *
 * 这一项补的是终检本身的一个盲区:前面几项都只查 BASE 那一个站,
 * 而这类问题是全站范围的。实测就漏过一次:
 * 把图批量转 webp 时,原图移出了 public/、media 表也跟着改了,
 * 但 medierba 的版块里是**硬编码的 /media/medierba/xxx.jpg**,一个都没跟着改 ——
 * 26 张图 404、403 处引用,而 media 表看起来完全正常。
 * 直到有一天去查 medierba 才暴露。 */
console.log('\n【9】写死的静态图路径(全部五站)');
try {
  const { existsSync } = await import('node:fs');
  const { d1 } = await import('./d1.mjs');
  const PUB = 'F:/0cosmetic/cosmetic-sites/apps/web/public';
  const rows = d1(`SELECT i.data_json FROM block_i18n i JOIN blocks b ON b.id=i.block_id WHERE b.is_visible=1`);
  const STATIC = /\/media\/[a-z0-9_-]+\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp|svg)/gi;
  const missing = new Map();
  for (const r of rows) {
    for (const m of String(r.data_json).matchAll(STATIC)) {
      if (!existsSync(PUB + m[0])) missing.set(m[0], (missing.get(m[0]) ?? 0) + 1);
    }
  }
  line('指向不存在文件的路径', missing.size);
  if (missing.size) {
    [...missing].slice(0, 5).forEach(([p, n]) => note(`${p} 被引用 ${n} 次,但文件不存在`));
    console.log('     修法:node tools/fix-dead-static.mjs --apply');
  }
} catch (e) {
  note('静态图检查跑不起来:' + String(e.message).slice(0, 60));
}

/* ⑩ 同站重复版块 —— 创始人在页面上抓到「资质认证有重复」之后加的全局检查。
 *
 * 同一个标题的版块在一个站里出现两次,访客读到的是「这站是拼的」。
 * 按 zh-cn 的 title 分组查重;集团生态/页脚不算(那是共用件,不进版块表)。
 * 少数刻意的重复(如古方研究在首页与研发页各一次)进白名单 ——
 * 白名单必须写原因,不写原因的白名单三个月后没人敢动。 */
console.log('\n【10】同站重复标题版块');
try {
  const { d1 } = await import('./d1.mjs');
  // 刻意保留的重复,每条必须写原因:
  //   古方研究   首页做钩子、研发页做正文,同一内容的两级深度
  //   原料档案   五个原料子页(人参/玫瑰/绿茶/芦荟/积雪草)的平行模板,
  //             访客一次只看一页,同题反而是一致性
  const ALLOW = new Set([
    '古方研究:配伍思路来自古籍,配方仍以法规与实测为准',
    '原料档案',
  ]);
  const rows = d1(`SELECT p.site_id, p.slug, b.id, i.data_json
                     FROM blocks b JOIN pages p ON p.id=b.page_id
                     JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                    WHERE b.is_visible=1`);
  const seen = new Map();
  for (const r of rows) {
    const m = /"title":"([^"]{4,40})"/.exec(r.data_json);
    if (!m || ALLOW.has(m[1])) continue;
    const key = r.site_id + '␟' + m[1];
    (seen.get(key) ?? seen.set(key, []).get(key)).push(`#${r.id}/${r.slug || '首页'}`);
  }
  let dup = 0;
  for (const [key, where] of seen) {
    if (where.length < 2) continue;
    dup++;
    const [siteId, title] = key.split('␟');
    note(`${siteId} 的「${title}」出现 ${where.length} 次:${where.join(' ')}`);
  }
  line('重复标题', dup);
} catch (e) { note('查重跑不起来:' + String(e.message).slice(0, 60)); }

console.log(`\n════ 结论 ════`);
if (!fail.length) console.log('  全部通过,没有发现问题。');
else { console.log(`  ${fail.length} 处问题:`); fail.forEach((f) => console.log('   · ' + f)); }
