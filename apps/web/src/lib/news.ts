/**
 * 行业资讯采集 + AI 改写 ——「自动收集国内外化妆品新闻,自动发布到前台」。
 *
 * 三条创始人指令一次说清:
 *   ① 覆盖面:新原料 / 新技术 / 爆款产品 / 国内外品牌动态(topic 字段分桶);
 *   ② 「改写内容,不要抄」:源头只取 RSS 的标题与摘要线索,
 *     正文由模型**用自己的话**写成 120–220 字快讯 + 一句 B2B 采购视角,
 *     并标注「信息来源」链接 —— 是转述评论,不是转载;
 *   ③ 每条做好 SEO/GEO:独立 slug 详情页 + NewsArticle JSON-LD + 首段直答,
 *     由前台路由与 sitemap 负责(见 pages/[lang]/news/*)。
 *
 * 采集源用 Google News RSS 聚合查询(中英各若干主题):
 *   单一站点的 RSS 说停就停,聚合源稳得多,且天然覆盖「国内外」。
 */
import { extractPage, searchWeb, budget, hostName, type Budget } from './anysearch';
import { loadFleet, chat } from './fleet';

export interface CollectResult { fetched: number; inserted: number; skipped: number; errors: string[] }

const QUERIES: { topic: string; q: string; hl: string; gl: string; ceid: string }[] = [
  { topic: 'ingredient', q: 'cosmetic ingredient innovation', hl: 'en-US', gl: 'US', ceid: 'US:en' },
  { topic: 'tech', q: 'beauty technology skincare science', hl: 'en-US', gl: 'US', ceid: 'US:en' },
  { topic: 'brand', q: 'cosmetics brand launch', hl: 'en-US', gl: 'US', ceid: 'US:en' },
  { topic: 'regulation', q: 'cosmetics regulation FDA MoCRA EU', hl: 'en-US', gl: 'US', ceid: 'US:en' },
  { topic: 'tech', q: 'cosmetic packaging innovation', hl: 'en-US', gl: 'US', ceid: 'US:en' },
  { topic: 'ingredient', q: '化妆品 新原料', hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' },
  { topic: 'product', q: '美妆 爆款 新品', hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' },
  { topic: 'brand', q: '化妆品 品牌 动态', hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' },
  { topic: 'regulation', q: '化妆品 法规 备案', hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' },
  /* 国内垂媒定向(创始人 2026-08-31/09-01:关注「青眼」,确认无「青锋传媒」)——
     iqingyan.cn 直连被挡,走聚合通道抓其署名稿与转载(青眼号/青眼情报同名覆盖) */
  { topic: 'industry', q: '青眼 化妆品', hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' },
  /* TikTok 爆款(创始人:「那才是最重要的」)—— 选品风向标 */
  { topic: 'product', q: 'TikTok viral beauty product', hl: 'en-US', gl: 'US', ceid: 'US:en' },
  { topic: 'product', q: 'TikTok Shop 美妆 爆款', hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' },
];

/* 直连行业媒体 RSS(第三通道,2026-08-30 实测存活)——
   行业浓度比聚合查询高一截;source 固定写死,不从标题里猜。
   探测过但已死的路径别再回填:cosmeticsdesign 系 / gcimagazine / happi 均 404。 */
const DIRECT_FEEDS: { url: string; source: string; topic: string }[] = [
  { url: 'https://www.cosmeticsbusiness.com/rss', source: 'Cosmetics Business', topic: 'industry' },
  { url: 'https://www.premiumbeautynews.com/spip.php?page=backend', source: 'Premium Beauty News', topic: 'brand' },
];

interface Item { title: string; link: string; source: string; date: string; snippet: string; topic: string; excerpt?: string }

/** 轻量 RSS 解析:item 结构标准,正则够用且零依赖。
 *  defaultSource:直连源的 source 固定传入 —— 聚合源才需要从
 *  「标题 - 媒体名」里剥媒体名,对直连源这么剥会切掉正经标题。 */
function parseRss(xml: string, topic: string, defaultSource?: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
    const seg = m[1];
    const pick = (tag: string) => {
      const mm = seg.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return (mm?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    };
    const rawTitle = pick('title');
    let source = defaultSource ?? '';
    let title = rawTitle;
    if (!source) {
      source = pick('source') || rawTitle.split(' - ').slice(-1)[0] || '';
      title = rawTitle.replace(new RegExp(` - ${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim();
      /* 标题里没有「 - 媒体名」时,fallback 会把整句标题当来源 ——
         卡片上「信息来源:K-Beauty Trends Redefining…」很业余。超长即弃用。 */
      if (source.length > 40 || source === rawTitle) { source = '综合报道'; title = rawTitle; }
    }
    const snippet = pick('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
    const link = pick('link');
    if (title && link) items.push({ title, link, source, date: pick('pubDate'), snippet, topic });
  }
  return items;
}

/* RSS 的 pubDate 是 RFC822 字符串,入库前统一转 ISO ——
   前台展示与 NewsArticle 的 datePublished 都用**新闻原始日期**,
   不是我们的入库时刻(创始人抓到过直连源翻出两年前旧文的展示错位)。 */
const toIso = (raw: string): string => {
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 19).replace('T', ' ') : '';
};
const MAX_AGE_DAYS = 14;
const tooOld = (raw: string): boolean => {
  const t = Date.parse(raw);
  return Number.isFinite(t) && (Date.now() - t) > MAX_AGE_DAYS * 86400_000;
};

const slugify = (d: Date, seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `${d.toISOString().slice(0, 10)}-${h.toString(36)}`;
};

/**
 * 手动投喂 →「边收集边改写,立刻发布」。
 * 小红书 / 微信公众号没有公开接口,自动爬取有封禁与法律风险 ——
 * 合规姿势是人把看到的线索(链接 + 标题/要点)贴进后台,
 * 走同一条改写管线,几十秒后就是一篇带 SEO/GEO 的原创快讯。
 */
export async function publishLead(
  env: unknown, db: D1Database,
  lead: { title: string; url: string; source: string; notes?: string },
): Promise<{ ok: boolean; slug?: string; msg?: string }> {
  const fleet = await loadFleet(db, env as any);
  if (!fleet.length) return { ok: false, msg: '模型舰队为空' };
  const dup = await db.prepare(`SELECT id FROM news WHERE source_url = ?`).bind(lead.url).first().catch(() => null);
  if (dup) return { ok: false, msg: '这条来源已发布过' };
  try {
    const rich = (lead.notes ?? '').length > 400;   // 投喂了长要点/原文摘录 → 值得写深度稿
    const r = await chat(env as any, [
      { role: 'system', content: rich ? REWRITE_DEEP : REWRITE_BRIEF },
      { role: 'user', content: `标题:${lead.title}\n来源:${lead.source}\n要点线索:${(lead.notes ?? '').slice(0, 3000) || '(无,仅标题)'}` },
    ], { maxTokens: 3600, timeoutMs: 150000, fleet });
    const d = parseArticle(r.text);
    if (!d) return { ok: false, msg: '模型输出缺关键段,请重试' };
    const slug = slugify(new Date(), lead.url);
    await db.prepare(
      `INSERT INTO news (slug, source_url, source_name, topic, title_zh, title_en, summary_zh, summary_en, body_zh, body_en, orig_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(slug, lead.url, lead.source.slice(0, 80), String(d.topic || 'industry').slice(0, 20),
      String(d.title_zh).slice(0, 120), String(d.title_en).slice(0, 200),
      String(d.summary_zh ?? '').slice(0, 300), String(d.summary_en ?? '').slice(0, 400),
      String(d.body_zh).slice(0, 3200), String(d.body_en).slice(0, 5200), '').run();
    return { ok: true, slug };
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message.slice(0, 480) : String(e) };
  }
}

/* 两档改写(创始人拿 premiumbeautynews 原文对比:「内容编辑的太少了,太不专业」):
   有原文节选(excerpt)→ 深度稿:500–800 字、3–4 个小标题段;
   只有标题/摘要线索  → 快讯:200–300 字。
   小标题协议:正文里以「## 」开头的独立行,渲染层转 <h2>。
   红线不变:只依据给到的材料,不编数字、不编引语 —— 深度来自原文底料,不来自想象。 */
/* ══ 改写编辑规范(创始人:「改写一定要有规则!而不是乱写!」)══════════
   单一事实源:这份规则数组既渲染进提示词,也驱动下面的机器校验闸门 ——
   规则改一处,提示与校验同步变,不会各说各话。 */
export const EDIT_RULES = [
  '事实边界:只使用给到材料(标题/摘要/原文节选)中确有的事实;材料没有的不写。',
  '数字纪律:正文中的每一个数字、金额、百分比、年份,必须能在材料中找到原文;不得估算、换算或补充行业常识数字。',
  '禁止引语:不使用任何直接引语("某某说/表示")—— 材料里的引语也改为间接转述。',
  '禁止评级:不给企业/产品下"最大""第一""领先"等材料未支撑的判断词。',
  '结构(深度稿):导语后 3–4 个小节,每节以「## 小标题」独立行开头;末节必须是对 B2B 采购与品牌方的启示。',
  '长度:深度稿中文正文 500–800 字;快讯 200–300 字;宁短勿编。',
  '去 AI 味(创始人 2026-09-10:「文章要写得更真实,而不是 AI 味太重」):不用套话开头与过渡 —— 随着…的发展 / 近年来 / 值得注意的是 / 综上所述 / 总的来说 / 不难看出 / 在这一背景下 / 可以说 / 众所周知 / 毋庸置疑;每段第一句是具体事实或数字,不是判断;不写三连并列与对称排比;一句话不超过 40 字。',
  '署名与改写:全文是转述与梳理,不逐句翻译;来源在文末由系统署名,正文不写"据本报"之类自称。',
] as const;

/* 输出协议:哨兵分段纯文本,不是 JSON ——
   长正文塞进 JSON 字符串,引号/换行的转义十次里坏两三次(实测深度稿档连败),
   哨兵格式对任意长文本零转义、逐段可校验。 */
const REWRITE_BASE =
  '你是化妆品 B2B 平台的资深行业编辑。用**你自己的话**写双语行业报道 —— 是转述、梳理与点评,绝不逐句翻译或摘抄原文。' +
  '严格按以下格式输出(方括号标记行原样保留,各段之间不加多余说明,不用 Markdown 代码块):\n' +
  '[TITLE_ZH]中文标题(≤30字,信息量优先)\n[TITLE_EN]英文标题\n' +
  '[SUMMARY_ZH]中文导语,两三句讲清发生了什么与为什么重要,≤100字\n[SUMMARY_EN]对应英文导语\n' +
  '[TOPIC]ingredient/tech/product/brand/regulation/industry 之一\n' +
  '[BODY_ZH]\n中文正文(可多段)\n[BODY_EN]\n英文正文\n[END]\n' +
  '【编辑规范(逐条强制,违反将被机器校验拒稿)】\n' +
  EDIT_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n');

/* ── 多源检索(创始人:「每个新闻都要 Google 搜索,多个新闻整合成我们自己的」)──
   用标题关键词搜 Google News,拿同事件其他媒体的报道并入底料:
   交叉核对 + 细节互补,综合成稿;附加来源记入 extra_sources 供文末署名。 */
async function searchRelated(it: Item, env?: unknown, b?: Budget): Promise<{ material: string; sources: string[] }> {
  /* AnySearch 优先(2026-09-02 接入):中文垂媒 Google News 覆盖薄,它能直接搜到青眼、聚美丽;
     英文源也一样能用。拿不到再退回 Google News RSS —— 两路都在,单路挂了不影响成稿。 */
  if (env) {
    const q = it.title.replace(/[「」“”"'’]/g, ' ').split(/\s+/).slice(0, 10).join(' ');
    const hits = (await searchWeb(env as any, q, 8, b))
      .filter((h) => h.url !== it.link && hostName(h.url) && hostName(h.url) !== hostName(it.link))
      .slice(0, 3);
    if (hits.length) {
      const material = '\n同一事件的其他报道(交叉核对与补充,数字纪律同样适用):\n'
        + hits.map((h) => `- [${hostName(h.url)}] ${h.title}${h.snippet ? ' — ' + h.snippet.slice(0, 200) : ''}`).join('\n');
      return { material, sources: [...new Set(hits.map((h) => hostName(h.url)))].slice(0, 3) };
    }
  }
  try {
    const q = it.title.replace(/[「」“”"'’]/g, ' ').split(/\s+/).slice(0, 8).join(' ');
    const zhq = /[一-鿿]/.test(it.title);
    const u = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}`
      + (zhq ? '&hl=zh-CN&gl=CN&ceid=CN:zh-Hans' : '&hl=en-US&gl=US&ceid=US:en');
    const xml = await (await fetch(u, { signal: AbortSignal.timeout(12000) })).text();
    const rel = parseRss(xml, it.topic)
      .filter((r) => r.link !== it.link && r.source && r.source !== it.source)
      .slice(0, 3);
    if (!rel.length) return { material: '', sources: [] };
    const material = '\n同一事件的其他报道(交叉核对与补充,数字纪律同样适用):\n'
      + rel.map((r) => `- [${r.source}] ${r.title}${r.snippet ? ' — ' + r.snippet.slice(0, 160) : ''}`).join('\n');
    return { material, sources: [...new Set(rel.map((r) => r.source))].slice(0, 3) };
  } catch { return { material: '', sources: [] }; }
}

/* ── 稿件校验闸门:EDIT_RULES 的机器执行面 ──────────────────────
   最硬一条是数字纪律:成稿(中英)里的每个多位数字/带单位数字,
   必须能在底料文本里找到 —— 找不到 = 模型自己编的 = 拒稿。 */
const numTokens = (t: string) =>
  [...t.matchAll(/\d[\d,.]*/g)].map((m) => m[0].replace(/[,.]/g, '')).filter((s) => s.length >= 2);

export function validateArticle(
  d: Record<string, string>, material: string, deep: boolean,
): string[] {
  const problems: string[] = [];
  const matNums = new Set(numTokens(material));
  const bad = [...new Set([...numTokens(d.body_zh), ...numTokens(d.body_en)])]
    .filter((n) => !matNums.has(n));
  if (bad.length) problems.push(`正文出现材料中没有的数字:${bad.slice(0, 6).join('、')} —— 删除或改为材料中的原数字`);

  const zhLen = d.body_zh.replace(/\s/g, '').length;
  const enLen = d.body_en.trim().length;
  if (enLen < zhLen * 1.5) problems.push(`英文正文过短(${enLen} 字符,中文 ${zhLen} 字)—— 疑似被截断,英文须完整对应中文全部内容`);
  if (deep) {
    const secs = (d.body_zh.match(/^## /gm) ?? []).length;
    if (secs < 3 || secs > 5) problems.push(`深度稿需 3–4 个「## 」小节,现在是 ${secs} 个`);
    if (!/##[^\n]*(启示|采购|品牌方|B2B)/.test(d.body_zh)) problems.push('末节必须是对 B2B 采购与品牌方的启示');
    if (zhLen < 380 || zhLen > 1100) problems.push(`深度稿中文正文应 500–800 字,现在 ${zhLen} 字`);
  } else if (zhLen < 100 || zhLen > 450) {
    problems.push(`快讯中文正文应 200–300 字,现在 ${zhLen} 字`);
  }
  if (/[」"”]\s{0,3}[,,]?\s{0,3}(某?\S{0,8})(说|表示|称)|(说|表示|称)[::]\s*[「"“]/.test(d.body_zh)) {
    problems.push('检测到直接引语句式 —— 改为间接转述');
  }
  /* 去 AI 味闸门:这些词一出现,读者一眼就知道是模型写的,AI 引擎也会把它当低质模板文。
     和数字纪律一样机器拦,不靠提示词里的「请不要」。 */
  const AI_ZH = /(随着[^,,。]{0,12}的(发展|推进|到来|普及)|近年来|值得注意的是|综上所述|总的来说|总而言之|不难看出|在这一背景下|在此背景下|众所周知|毋庸置疑|可以说[,,]|让我们|首先[,,][^。]*其次[,,][^。]*(最后|再次)[,,])/;
  const AI_EN = /(In today's|It is worth noting|In conclusion|In summary|delve|landscape of|game-changer|leverag(e|ing)|unlock(s|ing)? the|a testament to|paradigm|synerg(y|ies)|cutting-edge|Furthermore, )/;
  const tellZh = d.body_zh.match(AI_ZH); const tellEn = d.body_en.match(AI_EN);
  if (tellZh) problems.push(`中文出现模板套话「${tellZh[0].slice(0, 12)}」—— 改成具体事实或直接删掉`);
  if (tellEn) problems.push(`英文出现模板套话「${tellEn[0]}」—— 改成具体事实或直接删掉`);
  const longZh = (d.body_zh.replace(/^## .*$/gm, '').split(/[。!?!?]/).filter((x) => x.replace(/\s/g, '').length > 70)).length;
  if (longZh >= 3) problems.push(`中文有 ${longZh} 句超过 70 字 —— 拆短,一句一个事实`);
  return problems;
}

/** 哨兵格式解析:任何缺关键段的输出都判坏(交给上层重试) */
function parseArticle(text: string): Record<string, string> | null {
  const keys = ['TITLE_ZH', 'TITLE_EN', 'SUMMARY_ZH', 'SUMMARY_EN', 'TOPIC', 'BODY_ZH', 'BODY_EN'];
  const out: Record<string, string> = {};
  const src = text.replace(/^```\w*|```$/gm, '');
  if (!/\[END\]/.test(src)) return null;   // 没有 [END] 收尾 = 撞 max_tokens 被切断(2026-09-02 #209 英文半截入库),整篇判坏
  for (const k of keys) {
    const m = src.match(new RegExp(`\\[${k}\\]([\\s\\S]*?)(?=\\n?\\[(?:${keys.join('|')}|END)\\]|$)`));
    out[k.toLowerCase()] = (m?.[1] ?? '').trim();
  }
  if (!out.title_zh || !out.title_en || !out.body_zh || !out.body_en) return null;
  return {
    title_zh: out.title_zh, title_en: out.title_en,
    summary_zh: out.summary_zh, summary_en: out.summary_en,
    body_zh: out.body_zh, body_en: out.body_en, topic: out.topic,
  };
}

export const REWRITE_DEEP = REWRITE_BASE +
  'body 写成**结构化深度稿(中文 500–800 字)**:导语后分 3–4 个小节,每节以「## 小标题」独立一行开头,' +
  '小节依次覆盖:事件细节与背景 → 关键数据或做法(仅用材料中确有的)→ 行业语境(这类动向在行业里意味着什么)→ ' +
  '给 B2B 采购与品牌方的启示(选品、供应链或合规视角)。body_en 为对应英文,同样结构。';

export const REWRITE_BRIEF = REWRITE_BASE +
  'body 写成快讯(中文 200–300 字):展开事实,最后一句给 B2B 采购/品牌方的视角;材料太薄宁短勿编。';

/** 存量薄稿升级:带着新抓的原文底料,按现行深度稿标准重写正文。
 *  只动 body/summary/topic —— 标题、slug、日期、浏览数不动(URL 与统计连续性优先)。 */
export async function upgradeArticles(
  env: unknown, db: D1Database,
  ups: { id: number; excerpt: string }[],
): Promise<{ done: number; errors: string[] }> {
  const out = { done: 0, errors: [] as string[] };
  if (!ups.length) return out;
  const fleet = await loadFleet(db, env as any);
  if (!fleet.length) { out.errors.push('模型舰队为空'); return out; }
  /* AnySearch 一轮预算 —— 必须很小(2026-09-02 实测教训):
     Worker 单次调用有子请求上限,发现阶段 ~28 次 RSS 拉取已占大半;
     每多一次 AnySearch 调用就少一次模型调用的余量,超限后连改写都失败
     (「Too many subrequests by single Worker invocation」→ 整轮 0 入库)。
     所以只给「抽全文」留名额,同事件搜索继续走原来的 Google RSS(它已计入原预算)。 */
  const asb = budget(Math.min(8, ups.length * 2));   // 2026-09-03:原写 cap,该函数没有 cap → 每次调用 ReferenceError

  for (const u of ups) {
    try {
      const row = await db.prepare(
        `SELECT title_zh, title_en, source_name, COALESCE(orig_date, published_at) AS d FROM news WHERE id = ?`,
      ).bind(u.id).first<any>();
      if (!row) { out.errors.push(`#${u.id} 不存在`); continue; }
      const material =
        `标题:${row.title_zh}\n英文标题:${row.title_en}\n来源:${row.source_name}\n日期:${String(row.d).slice(0, 10)}`
        + `\n原文节选(仅作事实底料,禁止逐句翻译):\n${u.excerpt}`;
      let d: any = null, feedback = '';
      for (let attempt = 0; attempt < 3 && !d; attempt++) {
        const r = await chat(env as any, [
          { role: 'system', content: REWRITE_DEEP },
          { role: 'user', content: material + feedback },
        ], { maxTokens: 3600, timeoutMs: 150000, fleet });
        const cand = parseArticle(r.text);
        if (!cand) { feedback = '\n【上稿被拒:输出缺关键段或未以 [END] 收尾(被截断),精简篇幅、严格按哨兵格式完整重写】'; continue; }
        const problems = validateArticle(cand, material, true);
        if (problems.length) { feedback = `\n【上稿被机器校验拒绝,逐条修正后重写】\n${problems.map((p) => '- ' + p).join('\n')}`; continue; }
        d = cand;
      }
      if (!d) { out.errors.push(`#${u.id} 三稿未过`); continue; }
      await db.prepare(
        `UPDATE news SET summary_zh=?, summary_en=?, body_zh=?, body_en=?, topic=COALESCE(NULLIF(?, ''), topic) WHERE id=?`,
      ).bind(String(d.summary_zh ?? '').slice(0, 300), String(d.summary_en ?? '').slice(0, 400),
        String(d.body_zh).slice(0, 3200), String(d.body_en).slice(0, 5200),
        String(d.topic ?? '').slice(0, 20), u.id).run();
      out.done++;
    } catch (e) { out.errors.push(`#${u.id}: ${e instanceof Error ? e.message.slice(0, 480) : e}`); }
  }
  return out;
}

/**
 * range:历史回填模式(创始人:「先搜寻 2-3 年前的,按时间轴来搜索发布,先准备 200」)。
 * 传 {after, before}(YYYY-MM-DD)时:
 *   - 只走 Google News 通道(它支持 after:/before: 查询算子;Bing 与直连源不支持);
 *   - 新鲜度过滤换成范围校验 —— 历史文章标历史真实日期,时间轴才是真的。
 */
export async function collectNews(
  env: unknown, db: D1Database, cap = 6,
  range?: { after: string; before: string },
  leads?: Item[],
): Promise<CollectResult> {
  const out: CollectResult = { fetched: 0, inserted: 0, skipped: 0, errors: [] };
  const fleet = await loadFleet(db, env as any);
  if (!fleet.length) { out.errors.push('模型舰队为空'); return out; }
  /* AnySearch 一轮预算 —— 必须很小(2026-09-02 实测教训):
     Worker 单次调用有子请求上限,发现阶段 ~28 次 RSS 拉取已占大半;
     每多一次 AnySearch 调用就少一次模型调用的余量,超限后连改写都失败
     (「Too many subrequests by single Worker invocation」→ 整轮 0 入库)。
     所以只给「抽全文」留名额,同事件搜索继续走原来的 Google RSS(它已计入原预算)。 */
  const asb = budget(Math.min(8, cap * 2));

  /* 双通道冗余(创始人:「做一套稳定的系统采集」):
     Google News + Bing News 两路聚合 RSS,单路整体故障另一路兜着;
     每条查询独立 try,一条挂不拖累整轮。要加第三通道(站点直连 RSS)
     只需往这里多推一个 URL 生成器。 */
  const CHANNELS = [
    (s: typeof QUERIES[number]) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(s.q)}&hl=${s.hl}&gl=${s.gl}&ceid=${s.ceid}`,
    (s: typeof QUERIES[number]) =>
      `https://www.bing.com/news/search?q=${encodeURIComponent(s.q)}&format=rss&setlang=${s.hl.startsWith('zh') ? 'zh-CN' : 'en-US'}`,
  ];
  const all: Item[] = [];

  /* 线索直喂模式:抓取放在本机驱动器(archive.org 挡 Worker 出口的 HTML 挑战页,
     挡不住本机),Worker 只做它擅长的 —— 过滤、改写、入库。 */
  if (leads?.length) {
    all.push(...leads.slice(0, 40).filter((l) => l?.title && l?.link));
  }

  /* 历史模式走 Wayback Machine:
     Google News RSS 只索引近期(实测历史片 fetched=0),GDELT 彼时整体 522。
     行业媒体的 RSS 在 archive.org 里按天躺着 —— CDX 列该月快照,
     拉当时的 RSS 原文,标题/链接/pubDate 全是**当年真实数据**,
     线索质量比检索式历史库还高。正文照旧自己改写。 */
  if (range && !leads?.length) {
    const ARCHIVE_FEEDS = [
      { url: 'https://www.cosmeticsbusiness.com/rss', cdx: 'cosmeticsbusiness.com/rss', source: 'Cosmetics Business' },
    ];
    const from = range.after.replace(/-/g, ''), to = range.before.replace(/-/g, '');
    for (const f of ARCHIVE_FEEDS) {
      try {
        const cdx = await (await fetch(
          `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(f.cdx)}&from=${from}&to=${to}`
          + `&output=json&filter=statuscode:200&collapse=timestamp:8&limit=4`,
          { signal: AbortSignal.timeout(20000) },
        )).json() as string[][];
        for (const row of (cdx ?? []).slice(1)) {
          const [, ts, original] = row;
          try {
            const xml = await (await fetch(`https://web.archive.org/web/${ts}id_/${original}`,
              { signal: AbortSignal.timeout(25000) })).text();
            all.push(...parseRss(xml, 'industry', f.source));
          } catch { /* 单快照失败不拖整月 */ }
        }
      } catch (e) { out.errors.push(`wayback ${f.source}: ${e instanceof Error ? e.message.slice(0, 50) : e}`); }
    }
  }

  /* 直连行业源打头阵:行业浓度高,优先占 cap 名额(历史模式跳过 —— 直连 RSS 只有近期存货) */
  if (!range && !leads?.length) {
    for (const f of DIRECT_FEEDS) {
      try {
        const xml = await (await fetch(f.url, { signal: AbortSignal.timeout(15000) })).text();
        all.push(...parseRss(xml, f.topic, f.source).slice(0, 6));
      } catch (e) { out.errors.push(`${f.source}: ${e instanceof Error ? e.message.slice(0, 480) : e}`); }
    }
  }
  /* 发现阶段轮转(免费档子请求 50 次/调用):13 条查询不再一次全跑,
     按当前小时切 4 条,一天 6 轮正好把 13 条都轮到;每轮发现开销 4–8 次,给改写留足额度。 */
  const slot = Math.floor(new Date().getUTCHours() / 4) % Math.ceil(QUERIES.length / 4);
  const todays = QUERIES.slice(slot * 4, slot * 4 + 4);
  for (const s of (range || leads?.length) ? [] : todays) {
    const q2 = s;
    /* 子请求预算(免费档单次 50):Google 已给够 3 条就不再拉 Bing,发现阶段从 26 次降到 ~14 次 */
    let gotEnough = false;
    for (const mk of CHANNELS) {
      if (gotEnough) break;
      try {
        const xml = await (await fetch(mk(q2), { signal: AbortSignal.timeout(15000) })).text();
        const got = parseRss(xml, s.topic).slice(0, 6);
        all.push(...got);
        if (got.length >= 3) gotEnough = true;
        if (got.length) break;   // 本查询这一路有货就够,下一路留作故障备胎
      } catch (e) { out.errors.push(`${s.q}: ${e instanceof Error ? e.message.slice(0, 480) : e}`); }
    }
  }
  out.fetched = all.length;

  /* 语义级去重的底料:近 100 条的中英标题 3-gram 集。
     同一事件常被两路聚合源用不同链接、不同标题各送一遍(Ulta 指引、
     Lumson×兰蔻都双条上过站)—— URL 去重挡不住,按字面相似度挡。 */
  const grams = (s: string) => {
    const t = s.toLowerCase().replace(/[^一-鿿a-z0-9]/g, '');
    const g = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3));
    return g;
  };
  const sim = (a: Set<string>, b: Set<string>) => {
    let hit = 0;
    for (const x of a) if (b.has(x)) hit++;
    return hit / Math.max(1, Math.min(a.size, b.size));
  };
  const recent = ((await db.prepare(
    `SELECT title_zh, title_en FROM news ORDER BY id DESC LIMIT 100`,
  ).all<{ title_zh: string; title_en: string }>().catch(() => ({ results: [] as any[] }))).results ?? [])
    .flatMap((r) => [r.title_zh, r.title_en]).filter(Boolean).map(grams);

  for (const it of all) {
    if (out.inserted >= cap) break;
    /* 无可信日期的一律不采(「发布时间要和新闻一致」是硬要求)。
       常规模式再挡旧闻;历史模式改为落在目标月内(±3 天容差)才收。 */
    const iso = toIso(it.date);
    if (!iso) { out.skipped++; continue; }
    if (!range && tooOld(it.date)) { out.skipped++; continue; }
    if (range) {
      const t = Date.parse(it.date);
      if (t < Date.parse(range.after) - 3 * 86400_000 || t > Date.parse(range.before) + 3 * 86400_000) {
        out.skipped++; continue;
      }
    }
    const dup = await db.prepare(`SELECT id FROM news WHERE source_url = ? OR title_zh = ? OR title_en = ?`)
      .bind(it.link, it.title, it.title).first().catch(() => null);
    if (dup) { out.skipped++; continue; }
    const g = grams(it.title);
    if (recent.some((r) => sim(g, r) > 0.45)) { out.skipped++; continue; }
    recent.push(g);   // 本轮内部也互相去重

    try {
      /* 模型偶发吐坏 JSON(标题里的引号没转义是常见病)——
         整条线索因此作废太亏,重试一次;两次都坏才放弃。 */
      /* 全文底料(2026-09-02 AnySearch 接入):此前只有 RSS 摘要四五百字,
         改写出来是"摘要的摘要"。实测聚美丽 / Cosmetics Business 能抽到 2.6K–11.6K 字。
         抽不到(青眼系防抓)就沿用摘要,不算失败。 */
      if ((it.excerpt ?? '').length < 400) {
        /* Google/Bing 聚合源给的是跳转链接(news.google.com/rss/articles/…),不是原文地址,
           直接抽只会抽到 Google 的中间页。先按标题搜出出版方原文,再抽。直连源链接则直接抽。 */
        let target = it.link;
        if (/news\.google\.com|bing\.com\/news/.test(it.link)) {
          const hits = await searchWeb(env as any, it.title, 5, asb);
          const real = hits.find((h) => !/google\.|bing\.com|msn\.com|news\.yahoo\./.test(h.url));
          target = real?.url ?? '';
          if (real && !it.excerpt) it.excerpt = real.snippet;   // 至少把出版方摘要带上
        }
        const full = target ? await extractPage(env as any, target, asb) : null;
        if (full) it.excerpt = full.slice(0, 6000);
      }
      /* 多源整合:每条先搜同事件其他报道并入底料(创始人指令);AnySearch 优先,Google 兜底 */
      const rel = await searchRelated(it);   // 同事件多源暂走 Google RSS,省子请求(见上)
      const deep = (it.excerpt ?? '').length > 400 || rel.material.length > 300;
      const material =
        `标题:${it.title}\n来源:${it.source}\n日期:${it.date}\n摘要线索:${it.snippet || '(无)'}`
        + (it.excerpt ? `\n原文节选(仅作事实底料,禁止逐句翻译):\n${it.excerpt.slice(0, 3200)}` : '')
        + rel.material;

      let d: any = null;
      let feedback = '';
      for (let attempt = 0; attempt < 3 && !d; attempt++) {
        let r;
        try {
          r = await chat(env as any, [
            { role: 'system', content: deep ? REWRITE_DEEP : REWRITE_BRIEF },
            { role: 'user', content: material + feedback },
          ], { maxTokens: 3600, timeoutMs: 150000, fleet });
        } catch (e) {
          /* 全部模型不可用 = 舰队级故障,不是这篇稿的问题;再试两次只是再烧两轮子请求 */
          if (String(e).includes('全部模型不可用')) throw e;
          throw e;
        }
        const cand = parseArticle(r.text);
        if (!cand) { feedback = '\n【上稿被拒:输出缺关键段或未以 [END] 收尾(被截断),精简篇幅、严格按哨兵格式完整重写】'; continue; }
        const problems = validateArticle(cand, material, deep);
        if (problems.length) {
          feedback = `\n【上稿被机器校验拒绝,逐条修正后重写】\n${problems.map((p) => '- ' + p).join('\n')}`;
          continue;
        }
        d = cand;
      }
      if (!d) { out.errors.push(`三稿未过校验:${it.title.slice(0, 40)}`); continue; }
      (d as any).__extra = rel.sources.join('、');
      if (!d.title_zh || !d.body_zh || !d.title_en || !d.body_en) { out.errors.push(`字段缺失:${it.title.slice(0, 40)}`); continue; }
      /* slug 用新闻原始日期:历史文的 URL 挂入库日,一眼就是「日期不一致」的老病 */
      const slug = slugify(new Date(Date.parse(it.date)), it.link);
      await db.prepare(
        `INSERT INTO news (slug, source_url, source_name, topic, title_zh, title_en, summary_zh, summary_en, body_zh, body_en, orig_date, extra_sources)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(slug, it.link, it.source.slice(0, 80), String(d.topic || it.topic).slice(0, 20),
        String(d.title_zh).slice(0, 120), String(d.title_en).slice(0, 200),
        String(d.summary_zh ?? '').slice(0, 300), String(d.summary_en ?? '').slice(0, 400),
        String(d.body_zh).slice(0, 3200), String(d.body_en).slice(0, 5200), toIso(it.date) || null,
        (d as any).__extra || null).run();
      out.inserted++;
    } catch (e) { out.errors.push(`${it.title.slice(0, 40)}: ${e instanceof Error ? e.message.slice(0, 80) : e}`); }
  }
  return out;
}
