import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { GUIDES_ZH } from '@cosmetic/core/content/guides.ts';
import { COMPARE_ZH } from '@cosmetic/core/content/compare.ts';
import { CASES_ZH } from '@cosmetic/core/content/cases.ts';
import { CAT_LABEL, FMT_LABEL, BEN_LABEL, PACK_TYPE_LABEL, label } from '../../../lib/catalog';

export const prerender = false;

/**
 * 知识库灌库 —— 把配方、包材、原料与站上的问答/对比/指南写进向量索引。
 *
 * 为什么要有它(2026-09-08):
 *   选品台 `/api/studio` 此前是「大模型解析出关键词 → SQL 精确匹配 + LIKE」。
 *   客户说「适合油痘肌、夏天用不闷的清爽精华」,我们只能压成
 *   `benefits=['oil-control']` 去查表 —— 语义全丢了,而这恰恰是客户表达需求的方式。
 *
 * **这一层与 GEO 无关。** 外部 AI(豆包/ChatGPT)抓不到向量库,
 * 它们读的是公开 HTML 与 JSON-LD。建 RAG 不会让 AI 更会介绍我们;
 * 它解的是**我们自己的 AI 回答得准不准**。两条线不要混。
 *
 * 三条纪律(踩过的坑):
 *   1. **先检索再生成,结论必须挂得出来源编码**。没有出处的回答就是幻觉,
 *      而幻觉会以我们的名义讲给客户听。
 *   2. **每条向量带版本印**:来源表、原文 ID、embedding 模型、灌库时间。
 *      模型换了能整批重洗;没有版本印就只能全库重来。
 *   3. **原文不进向量库的 metadata**。metadata 只放能公开的字段
 *      (编码、类型、容量、功效),正文留在 D1。向量库是索引,不是内容库。
 *
 * 跑法(本机,带 CRON_KEY):
 *   POST /api/cron/kb-index/?scope=packaging|formulas|ingredients|content|all
 * 分批跑,每批上限由 ?limit= 控制 —— 一次灌几千条会超 Worker 的 CPU 时间。
 */
const MODEL = '@cf/baai/bge-m3';
const VER = 'kb-2026-09-09';

/** 逗号分隔的英文枚举 → 中文词。检索文本里出现的必须是客户会说的词。 */
const zhList = (m: Record<string, [string, string]>, v: unknown) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    .map((x) => label(m as any, x, true)).join('、');

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

type Doc = { id: string; text: string; meta: Record<string, string | number> };

/** 一次给一批文本,拿回向量。bge-m3 单次能吃的条数有限,按 32 切。 */
async function embed(ai: any, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 32) {
    const r = await ai.run(MODEL, { text: texts.slice(i, i + 32) });
    /* 返回形状按模型不同有两种,两种都认 —— 只认一种的话换模型就静默拿到空数组 */
    const v = r?.data ?? r?.result?.data ?? [];
    if (!Array.isArray(v) || !v.length) throw new Error(`embedding 返回为空:${JSON.stringify(r).slice(0, 160)}`);
    out.push(...v);
  }
  return out;
}

async function packagingDocs(db: D1Database, limit: number, offset: number): Promise<Doc[]> {
  const { results } = await db.prepare(
    `SELECT code, type, material, capacity, compat_formats, neck_size
       FROM packaging WHERE status IN ('sample','active')
      ORDER BY code LIMIT ? OFFSET ?`).bind(limit, offset).all<any>();
  return (results ?? []).map((r) => ({
    id: `pack:${r.code}`,
    /* 检索文本要写成**人会怎么问**的样子,不是字段拼接。
       「PET 真空瓶 30ml 适合精华」比 "PET|airless-bottle|30ml" 好检索得多。 */
    /* 同上:type 存的是 `airless-bottle` 这种 slug,直接喂进去等于喂英文。
       material 与 capacity 本来就是中文/数字,照原样用。 */
    text: [r.material, label(PACK_TYPE_LABEL as any, r.type, true), r.capacity, r.neck_size,
           r.compat_formats ? `适配 ${zhList(FMT_LABEL as any, r.compat_formats)}` : '']
      .filter(Boolean).join(' '),
    meta: { kind: 'packaging', code: r.code, type: r.type ?? '', capacity: r.capacity ?? '' },
  }));
}

async function formulaDocs(db: D1Database, limit: number, offset: number): Promise<Doc[]> {
  const { results } = await db.prepare(
    `SELECT code, category, format, benefits, texture, markets, moq, ai_summary
       FROM formulas WHERE status IN ('sample','active')
      ORDER BY code LIMIT ? OFFSET ?`).bind(limit, offset).all<any>();
  /* 2026-09-09 重写检索文本 —— 上一版把英文枚举直接拼起来
     (`skincare serum barrier,hydrating`),而客户问的是
     「夏天用不闷的清爽精华」。跨语言 + 标签对散文,余弦分被压在很窄一段:
     实测「敏感肌舒缓」得 0.425、「儿童牙膏」得 0.426 —— 一个该命中一个该拒绝,
     分数却几乎一样,**阈值再怎么调都没用,因为这两个分数本来就不该相等**。

     现在改成喂中文散文:ai_summary(「适合做入门款氨基酸洁面的品牌方…」)
     和 texture(「乳霜状但延展轻…」)本来就是给人看的句子,再补上中文品类与功效词。
     检索文本要长得像客户的问法,这一条比换模型重要。 */
  return (results ?? []).map((r) => ({
    id: `formula:${r.code}`,
    text: [
      r.ai_summary,
      r.texture,
      `${label(CAT_LABEL as any, r.category, true)}类 ${label(FMT_LABEL as any, r.format, true)}`,
      zhList(BEN_LABEL as any, r.benefits),
      r.markets ? `可售 ${r.markets}` : '',
    ].filter(Boolean).join(' '),
    meta: { kind: 'formula', code: r.code, category: r.category ?? '', format: r.format ?? '' },
  }));
}

async function ingredientDocs(db: D1Database, limit: number, offset: number): Promise<Doc[]> {
  const { results } = await db.prepare(
    `SELECT slug, inci, name_zh, family, functions, mechanism_zh
       FROM ingredients WHERE status='published' ORDER BY slug LIMIT ? OFFSET ?`)
    .bind(limit, offset).all<any>();
  return (results ?? []).map((r) => ({
    id: `ing:${r.slug}`,
    text: [r.name_zh, r.inci, r.family, String(r.functions ?? '').replace(/,/g, '、'),
           String(r.mechanism_zh ?? '').slice(0, 400)].filter(Boolean).join(' '),
    meta: { kind: 'ingredient', slug: r.slug, inci: r.inci ?? '' },
  }));
}

/** 站上的问答 / 对比 / 指南 —— 让选品台能引用我们自己写过的判断,而不是现编 */
function contentDocs(): Doc[] {
  const out: Doc[] = [];
  for (const g of GUIDES_ZH) {
    out.push({
      id: `guide:${g.slug}`,
      text: [g.q, g.answer, ...g.steps.map((s) => `${s.name}:${s.text}`)].join(' '),
      meta: { kind: 'guide', slug: g.slug, href: `/guides/${g.slug}/` },
    });
  }
  for (const c of COMPARE_ZH) {
    out.push({
      id: `compare:${c.slug}`,
      text: [c.q, c.verdict, ...c.pick.map((p) => `${p.when} 选 ${p.take}`)].join(' '),
      meta: { kind: 'compare', slug: c.slug, href: `/compare/${c.slug}/` },
    });
  }
  /* 项目走查:客户描述自己的处境时,最容易命中的就是这一类
     (「我是跨境卖家,第一支自有品牌」)—— 语义检索在这里最有用。 */
  for (const c of CASES_ZH) {
    out.push({
      id: `case:${c.slug}`,
      text: [c.who, c.brief, c.verdict, ...c.facts.map((f) => `${f.k} ${f.v}`)].join(' '),
      meta: { kind: 'case', slug: c.slug, href: `/cases/${c.slug}/` },
    });
  }
  return out;
}

export const POST: APIRoute = async ({ request, url }) => {
  const ck = (env as any).CRON_KEY as string | undefined;
  if (!ck || request.headers.get('x-cron-key') !== ck) return json({ ok: false }, 403);

  const db = (env as any).DB as D1Database | undefined;
  const ai = (env as any).AI;
  const vec = (env as any).VECTORIZE;
  if (!db || !ai || !vec) return json({ ok: false, error: 'DB / AI / VECTORIZE 绑定缺一' }, 500);

  const scope = url.searchParams.get('scope') ?? 'content';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 400);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  let docs: Doc[] = [];
  try {
    if (scope === 'packaging') docs = await packagingDocs(db, limit, offset);
    else if (scope === 'formulas') docs = await formulaDocs(db, limit, offset);
    else if (scope === 'ingredients') docs = await ingredientDocs(db, limit, offset);
    else if (scope === 'content') docs = contentDocs();
    else return json({ ok: false, error: 'scope 只能是 packaging / formulas / ingredients / content' }, 400);
  } catch (e) {
    return json({ ok: false, error: `取数失败:${e instanceof Error ? e.message.slice(0, 200) : ''}` }, 500);
  }

  docs = docs.filter((d) => d.text.trim().length > 1);
  if (!docs.length) return json({ ok: true, scope, offset, indexed: 0, done: true });

  try {
    const vs = await embed(ai, docs.map((d) => d.text));
    if (vs.length !== docs.length) {
      return json({ ok: false, error: `向量数 ${vs.length} 与文档数 ${docs.length} 对不上` }, 500);
    }
    await vec.upsert(docs.map((d, i) => ({
      id: d.id,
      values: vs[i],
      /* namespace 是真分区,metadata filter 不是。
         2026-09-09 实测:库里 4,476 条包材 + 276 条配方,用 filter:{kind:'formula'} 查
         「儿童牙膏,要低泡不辣嘴」,回来的是身体乳和精华,最高分 0.426;
         换个完全不同的问法「亮白牙膏,去茶渍」,最高分还是 0.426。
         分数几乎不动 = 候选集根本不是按问题选出来的 —— 近邻先在全库里挑,
         挑完才按 metadata 筛,配方只剩边角料。
         namespace 在检索前就把搜索空间限定住,包材不参与竞争。 */
      namespace: String(d.meta.kind ?? ''),
      /* 版本印:模型换了能按 ver 整批重洗,不用全库重来 */
      metadata: { ...d.meta, ver: VER, model: MODEL, at: new Date().toISOString().slice(0, 10) },
    })));
  } catch (e) {
    /* 失败必须报出来。静默返回 ok 会让「灌了库」和「以为灌了库」变成同一件事 */
    return json({ ok: false, scope, offset, error: e instanceof Error ? e.message.slice(0, 300) : '未知错误' }, 500);
  }

  return json({ ok: true, scope, offset, indexed: docs.length, done: docs.length < limit || scope === 'content' });
};

export const GET: APIRoute = async () => json({ ok: false, msg: '此接口只接受 POST' }, 405);
