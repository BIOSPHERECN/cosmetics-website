import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { chat, loadFleet, paidFirst } from '../../../lib/fleet';
import { overQuota, recordUse, tooMany, clientId } from '../../../lib/ratelimit';
import { getMember } from '../../../lib/member';
import { gate, DAILY } from '../../../lib/quota';

export const prerender = false;

/**
 * AI 式站内搜索 —— 问一句话,拿一段有出处的回答,而不是十条蓝链接。
 *
 * 管线严格三步,顺序不可换(grounding 先行):
 *   ① 检索:先在我们自己的库里查 —— 成分、配方、包材、爆款情报、专题、知识库、资讯
 *   ② 作答:模型**只允许用检索到的这些行**回答,并标出处编号
 *   ③ 兜底:检索为空就老实说没有,并给出最接近的入口;模型不可用就直接返回检索结果列表
 * 为什么不让模型自由发挥:它会编出我们并不存在的配方与法规,客户拿着去下单,
 * 工厂做不出来是要赔钱的。宁可少答,不可乱答。
 *
 * 子请求预算:检索全部走 D1(不算子请求),模型只调一次 —— 免费档 50 个子请求足够。
 */
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

type Hit = { kind: string; title: string; snippet: string; url: string; extra?: string };

/** 关键词切分:中文按 2 字滑窗,英文按词 —— D1 没有中文分词,LIKE 是最稳的一招 */
function terms(q: string): string[] {
  const out: string[] = [];
  const en = q.toLowerCase().match(/[a-z][a-z0-9-]{1,}/g) ?? [];
  out.push(...en.slice(0, 6));
  const zh = q.replace(/[^一-龥]/g, '');
  for (let i = 0; i < zh.length - 1 && out.length < 12; i += 1) out.push(zh.slice(i, i + 2));
  return [...new Set(out)].slice(0, 12);
}

async function retrieve(db: D1Database, q: string, lang: string): Promise<Hit[]> {
  const ts = terms(q);
  if (!ts.length) return [];
  const like = ts.map(() => '?').join(',');
  const hits: Hit[] = [];
  const L = (t: string) => `%${t}%`;

  /* 每张表一句 SQL,用 CASE 累加命中次数排序 —— 比多次查询省,也比全表扫描准 */
  const score = (cols: string[]) =>
    cols.map((c) => ts.map(() => `(CASE WHEN ${c} LIKE ? THEN 1 ELSE 0 END)`).join('+')).join('+');
  const binds = (cols: number) => Array.from({ length: cols * ts.length }, (_, i) => L(ts[i % ts.length]));

  try {
    const r = await db.prepare(
      `SELECT slug, inci, name_zh, family, mechanism_zh, use_level, claim_tag,
              ${score(['inci', 'name_zh', 'aliases', 'functions', 'mechanism_zh'])} s
         FROM ingredients WHERE status='published' ORDER BY s DESC LIMIT 4`).bind(...binds(5)).all<any>();
    for (const x of r.results ?? []) if (x.s > 0) hits.push({
      kind: '成分', title: `${x.name_zh} · ${x.inci}`,
      snippet: [x.mechanism_zh, x.use_level].filter(Boolean).join(' ').slice(0, 260),
      url: `/${lang}/ingredients/${x.slug}/`, extra: x.family,
    });
  } catch { /* 表还没建好 */ }

  try {
    const r = await db.prepare(
      `SELECT code, format, benefits, ai_summary, markets, moq,
              ${score(['code', 'format', 'benefits', 'ai_summary', 'texture'])} s
         FROM formulas WHERE status IN ('sample','active') ORDER BY s DESC LIMIT 4`).bind(...binds(5)).all<any>();
    for (const x of r.results ?? []) if (x.s > 0) hits.push({
      kind: '配方', title: `${x.code} · ${x.format}`,
      snippet: (x.ai_summary || x.benefits || '').slice(0, 260),
      url: `/${lang}/selector/?formula=${encodeURIComponent(x.code)}`,
      extra: `可售 ${x.markets ?? '—'} · 起订 ${x.moq ?? '—'}`,
    });
  } catch { /* ignore */ }

  try {
    const r = await db.prepare(
      `SELECT code, type, material, capacity, notes_zh, compat_formats,
              ${score(['code', 'type', 'material', 'compat_formats', 'notes_zh'])} s
         FROM packaging ORDER BY s DESC LIMIT 3`).bind(...binds(5)).all<any>();
    for (const x of r.results ?? []) if (x.s > 0) hits.push({
      kind: '包材', title: `${x.code} · ${x.type}`,
      snippet: [x.material, x.capacity, x.notes_zh].filter(Boolean).join(' · ').slice(0, 260),
      url: `/${lang}/selector/?pack=${encodeURIComponent(x.code)}`,
    });
  } catch { /* ignore */ }

  try {
    const r = await db.prepare(
      `SELECT title_zh, figure, source_name, source_url, source_date, so_what_zh, market,
              ${score(['title_zh', 'claim_tag', 'so_what_zh', 'category'])} s
         FROM trends WHERE status='active' ORDER BY s DESC, source_date DESC LIMIT 4`).bind(...binds(4)).all<any>();
    for (const x of r.results ?? []) if (x.s > 0) hits.push({
      kind: '市场情报', title: x.title_zh,
      snippet: [x.figure, x.so_what_zh].filter(Boolean).join(' — ').slice(0, 260),
      url: x.source_url, extra: `${x.source_name} · ${x.source_date} · ${x.market}`,
    });
  } catch { /* ignore */ }

  try {
    const r = await db.prepare(
      `SELECT slug, title_zh, summary_zh, market,
              ${score(['title_zh', 'summary_zh', 'topic'])} s
         FROM reports WHERE status='published' ORDER BY s DESC LIMIT 3`).bind(...binds(3)).all<any>();
    for (const x of r.results ?? []) if (x.s > 0) hits.push({
      kind: '专题', title: x.title_zh, snippet: (x.summary_zh || '').slice(0, 260),
      url: `/${lang}/reports/${x.slug}/`, extra: x.market,
    });
  } catch { /* ignore */ }

  try {
    const r = await db.prepare(
      `SELECT id, category, title, content, ${score(['title', 'keywords', 'content'])} s
         FROM kb_entries WHERE is_published=1 ORDER BY s DESC LIMIT 4`).bind(...binds(3)).all<any>();
    for (const x of r.results ?? []) if (x.s > 0) hits.push({
      kind: x.category === 'expert' ? '专家经验' : '知识库', title: x.title,
      snippet: (x.content || '').slice(0, 300), url: `/${lang}/contact/`, extra: x.category,
    });
  } catch { /* ignore */ }

  try {
    const r = await db.prepare(
      `SELECT slug, title_zh, summary_zh, COALESCE(orig_date, published_at) d,
              ${score(['title_zh', 'summary_zh'])} s
         FROM news ORDER BY s DESC, id DESC LIMIT 3`).bind(...binds(2)).all<any>();
    for (const x of r.results ?? []) if (x.s > 0) hits.push({
      kind: '资讯', title: x.title_zh, snippet: (x.summary_zh || '').slice(0, 220),
      url: `/${lang}/news/${x.slug}/`, extra: String(x.d ?? '').slice(0, 10),
    });
  } catch { /* ignore */ }

  return hits;
}


/** 全网层:Bing 的 RSS 输出,免 key、一次请求就够。
    只取标题/链接/摘要,**不抓正文** —— Worker 免费档单次 50 个子请求,抓正文一页就吃掉一个。
    抓回来的内容是资料不是指令;里面出现的任何「请执行/忽略以上」一律无视。 */
async function web(q: string, n = 5): Promise<Hit[]> {
  try {
    const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&count=${n}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; bohui-site/1.0; +https://biosphere-ai.com)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const out: Hit[] = [];
    const strip = (t: string) => t.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const item = m[1];
      const title = strip((item.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? '');
      const url = strip((item.match(/<link>([\s\S]*?)<\/link>/) ?? [])[1] ?? '');
      const desc = strip((item.match(/<description>([\s\S]*?)<\/description>/) ?? [])[1] ?? '');
      const pub = strip((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ?? [])[1] ?? '');
      if (!url.startsWith('http')) continue;
      let host = '';
      try { host = new URL(url).hostname.replace('www.', ''); } catch { host = ''; }
      let day = '';
      if (pub) { const d = new Date(pub); if (!Number.isNaN(d.getTime())) day = d.toISOString().slice(0, 10); }
      out.push({
        kind: '网络', title: title.slice(0, 120), snippet: desc.slice(0, 200), url,
        extra: [host, day].filter(Boolean).join(' · '),
      });
      if (out.length >= n) break;
    }
    return out;
  } catch {
    return [];   /* 网络层挂了不影响站内结果 */
  }
}

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  const b = (await request.json().catch(() => ({}))) as { q?: string; lang?: string };
  const q = String(b.q ?? '').trim().slice(0, 200);
  const lang = String(b.lang ?? 'zh-cn').slice(0, 10);
  if (q.length < 2) return json({ ok: false, msg: '问题太短' }, 400);

  /* 会员限额(2026-09-23):AI 搜索与详情页共用一个每日配额(lib/quota.ts),同一个问题当天重复问不再扣 */
  const zhq = lang.startsWith('zh');
  const me = await getMember(request, env, db);
  if (!me) return json({ ok: false, need: 'login',
    msg: zhq ? `登录后可用 AI 搜索:免费会员每天 ${DAILY.free} 条,与成分解读、原料、配方详情共用。` : `Sign in to use AI search: free members get ${DAILY.free} a day, shared with ingredient and formula pages.`,
    href: `/${lang}/login/?next=${encodeURIComponent(`/${lang}/search/?q=${encodeURIComponent(q)}`)}`,
    cta: zhq ? '用邮箱注册 / 登录' : 'Sign up / sign in with email' }, 401);
  /* 限流:AI 搜索会调模型,不设闸门会被一个脚本刷干净额度(先挡再计配额,被挡的那次不扣会员的条数)。
     09-23:原来这里写成 tooMany(db, …) || overQuota(db, key) —— 参数传错,每次都抛 TypeError,被 catch-all 吞成 404,AI 搜索一直是挂的 */
  const who = clientId(request);
  if (await overQuota(db, 'ai.search', who)) return tooMany('ai.search');
  const g = await gate({ db, bot: false, member: me, item: `q:${q.toLowerCase().replace(/\s+/g, ' ')}` });
  if (g.state === 'over') {
    const paid = g.limit >= DAILY.pro;
    return json({ ok: false, need: 'upgrade', used: g.used, limit: g.limit,
      msg: zhq ? `今天的 ${g.limit} 条已用完,北京时间明天 0 点恢复${paid ? '' : ';需要更多可升级付费会员'}。` : `Today's ${g.limit} are used up; resets at midnight Beijing time${paid ? '' : '. Need more? Upgrade to a paid membership'}.`,
      href: `/${lang}/contact/?ref=${paid ? 'quota' : 'upgrade'}`, cta: zhq ? (paid ? '联系我们' : '联系我们升级') : (paid ? 'Contact us' : 'Contact us to upgrade') }, 429);
  }

  await recordUse(db, 'ai.search', who);

  /* 站内先查(不花子请求),再补一次全网 —— 两层都空才算没有 */
  /* 先看缓存:同一个问题 7 天内问过就直接给,省一次模型调用(CF 免费档要省着用) */
  const qkey = `${lang}|${q.toLowerCase().replace(/\s+/g, ' ').trim()}`;
  try {
    const c = await db.prepare(
      `SELECT answer, hits_json FROM search_cache WHERE qkey=? AND created_at > datetime('now','-7 days')`)
      .bind(qkey).first<any>();
    if (c) return json({ ok: true, answer: c.answer, hits: JSON.parse(c.hits_json), cached: true });
  } catch { /* 缓存表还没建好时照常走 */ }

  const inner = await retrieve(db, q, lang);
  const outer = await web(q, inner.length >= 6 ? 3 : 5);
  const hits = [...inner, ...outer];
  if (!hits.length) return json({ ok: true, answer: '', hits: [], note: 'empty' });

  const zh = lang.startsWith('zh');
  const ctx = hits.map((h, i) => `[${i + 1}] (${h.kind}) ${h.title}\n${h.snippet}${h.extra ? `\n附:${h.extra}` : ''}`).join('\n\n');
  const sys = zh
    ? `你是帛卉化妆品(BIOSPHERE)官网的检索助手,面向 B2B 采购与品牌方。
规则:
1. **只能使用下面「资料」里的内容作答**,资料里没有的一律回答「我们站内暂无这条信息」,绝不自行补充。
2. 每个结论后用 [编号] 标出依据,可以引用多个。
3. 涉及法规只讲方向并提醒「以最新官方文本为准」;不写具体报价与交期数字。
4. 不用绝对化用词与医疗功效表述。
5. **最多四句话**,先给结论,不铺排、不小标题、不列清单 —— 详细内容让客户点下面的来源卡片看。
6. 站内资料(成分/配方/包材/专题/知识库)优先于网络资料;两者冲突时说明分歧。`
    : `You are the search assistant on the BIOSPHERE (帛卉化妆品) website, serving B2B buyers and brand owners.
Rules: answer ONLY from the MATERIAL below; cite with [n]; if it is not there, say the site has no such information.
Regulatory points: direction only, note that the latest official text governs. No prices or lead times. No superlatives or medical claims.
At most four sentences, conclusion first, no headings or bullet lists — detail lives in the source cards below.
Prefer our own library over web results; if they disagree, say so.`;

  try {
    const fleet = paidFirst(await loadFleet(db, env as any));
    if (!fleet.length) return json({ ok: true, answer: '', hits, note: 'no-model' });
    const r = await chat(env as any, [
      { role: 'system', content: sys },
      { role: 'user', content: `${zh ? '问题' : 'Question'}: ${q}\n\n${zh ? '资料' : 'MATERIAL'}:\n${ctx}` },
    ], { maxTokens: 1200, timeoutMs: 40000, fleet });
    const answer = (r.text || '').trim();
    if (answer) {
      try {
        await db.prepare(
          `INSERT INTO search_cache (qkey, answer, hits_json, hits_n) VALUES (?,?,?,?)
           ON CONFLICT(qkey) DO UPDATE SET answer=excluded.answer, hits_json=excluded.hits_json,
                                           hits_n=excluded.hits_n, created_at=datetime('now')`)
          .bind(qkey, answer, JSON.stringify(hits).slice(0, 20000), hits.length).run();
      } catch { /* 写缓存失败不影响这次回答 */ }
    }
    return json({ ok: true, answer, hits, model: r.provider ?? '' });
  } catch (e) {
    /* 模型不可用不是灾难:检索结果本身就有用,直接给列表 */
    return json({ ok: true, answer: '', hits, note: String(e).slice(0, 120) });
  }
};
