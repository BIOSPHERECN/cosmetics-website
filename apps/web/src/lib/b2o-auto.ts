/**
 * BEAUTY2OEM 第一期自动化(2026-09-24 C1)。依据 SOP执行版-v1/06-全自动化流水线与经验资本账本-v2.md:
 *   P03 卖家提交店铺 → 几分钟内出《客户产品机会简报》草稿,挂后台待审(事件:api/b2o/brief.ts;兜底:Cron 每 10 分钟扫一次)
 *   P04 简报「已发」后第 3 / 7 / 14 天各出一条再触达草稿,进今日待办(Cron)
 *   P12 每次 Cron 在 jobs 记一行 b2o-auto(note 带 out=N),任务中心按间隔判红
 * 铁律:草稿只进后台;批准只给管理员;发送永远是人在企业微信里发,系统只记「已发」。没有处理同意(consent_at)的客户一律跳过。
 * 模型只用免费白名单(Agnes / 商汤),国内节点排前;送模型的只有客户代号和企业层生意信息。
 */
import { env as cfEnv } from 'cloudflare:workers';
import { chat, loadFleet } from './fleet';
import { custCode, briefFlags } from './b2o';

/** 简报提示词(W3 原稿;C1 按 06-v2 P03 改三处:卡池 = 已冻结且国家对得上的卡;不写出样天数;不写「现成」) */
export const BRIEF_SYS = `你是化妆品代工厂的跨境产品顾问助手,替顾问起草《客户产品机会简报》草稿(客户版,两页),写给国内跨境卖家。只输出简报正文(Markdown),中文。
结构固定:
第一行:**客户**:{代号} **店铺**:{平台}·{国家} **出具日期**:{今天} **简报编号**:B-{代号}-{序号留空}
## 第一页:市场上的变化(半页内)
【1 张图】写图名和出处(可选:类目变化速度图 = market_snapshots,只给 Amazon 美国站客户;或客户店铺六角色分布图 = 店铺链接 + 取数日期)
【3 个数字】表格:# | 数字 | 含义 | 出处·取数日期。只准用下面「真实数据」里给出的数字并照抄出处;没有就写 {待顾问补:在售款数/主力价格带/前三款评论数,出处写店铺链接+取数日期}。Amazon 名次旁写「排名≠销量」。
市场信号只准引用平台和国家都与客户对得上的;对不上就改用客户店里的事实,并写明「这个市场我们还没有连续数据,这是推测」。
【1 个判断】{国家}{平台}的{品类}正在出现{变化},{信号1}与{信号2}同时在动。我们建议先小量测一下,不是说它一定会起来。最大不确定性:…。出现这种情况我们就撤回判断:…。依据不足处标「推测」。
## 第二页:放到您店里看
六角色表(引流/利润/复购/内容/品牌/实验:您现在有几款 | 判断);不知道款数写 {待顾问补}。
一句话结论:您缺的可能不是再多一款爆款,而是{缺的角色}。
两个方向表(A 最快验证(建议) / B 备选):行 = 方向、为什么现在、为什么适合您、为什么帛卉、风险在哪、样品。A 只能用「可选机会卡」里的卡;没有就写 {待选卡:暂无对得上的机会卡}。B 写「研发签字后才写」。
A 的「为什么帛卉」固定写:方向可行,打样路径待研发确认。A 的样品固定写:打样路径待研发确认。
帛卉能支持到哪一步:市场机会判断、产品定义、配方、包材、工程、打样、生产;GMPC · ISO 22716;有 HALAL 证书,覆盖范围以证书为准;15 条自动化产线;成立于 2012 年。流量、广告、达人、内容、运营由您负责。
起订量、大货交期、价格:待业务确认(我跟厂里核好后单独发您)。
想听您的判断:您在前线,哪里我们看错了?两个方向里您倾向哪个?
落款:帛卉化妆品 · BIOSPHERE
禁写:AI 预测爆款、保证、任何起订量/交期/价格/成本/出样天数、内部实测数字、拿其他品牌名做卖点、集团、海外工厂、现成、现货。不要编造任何数字、店铺数据或客户说过的话。`;

const HEAD = '【草稿 · 待产品顾问核对 + 管理员审批 · 审批前不得发给客户】\n\n';
const KIND: Record<string, string> = { brief: '机会简报', retouch3: '第 3 天再触达', retouch7: '第 7 天电话要点', retouch14: '第 14 天再触达' };
export const kindName = (k: string) => KIND[k] ?? k;
const bjDay = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);

/* 客户市场 → 国家名集合 / regulation_updates.market_id。「东南亚」展开成六国 */
const SEA = ['印尼', '泰国', '马来', '菲律宾', '越南', '新加坡'];
const MID: Record<string, string> = { 印尼: 'id', 泰国: 'th', 马来: 'my', 菲律宾: 'ph', 越南: 'vn', 新加坡: 'sg', 美国: 'us', 巴西: 'br', 墨西哥: 'mx', 欧盟: 'eu', 欧洲: 'eu', 英国: 'uk', 日本: 'jp', 韩国: 'kr', 台湾: 'tw', 加拿大: 'ca', 澳大利亚: 'au' };
export function custMarkets(p: Record<string, any>): Set<string> {
  const t = [p.markets_now, p.markets_next, p.platforms].map((x) => String(x ?? '')).join(' ');
  const s = new Set(Object.keys(MID).filter((k) => t.includes(k)));
  if (t.includes('东南亚')) SEA.forEach((k) => s.add(k));
  return s;
}
const cardHits = (country: string | null, m: Set<string>) => String(country ?? '').split(/[、,,/ ]+/).some((c) => c && m.has(c));

async function freeFleet(db: D1Database) {
  const cn = (id: string) => (id.endsWith('-cn') ? 0 : id.startsWith('sensenova') ? 1 : 2);
  return (await loadFleet(db, cfEnv as any))
    .filter((f) => f.free && f.text !== false && /^(agnes|sensenova)/.test(f.id))
    .sort((a, z) => cn(a.id) - cn(z.id) || a.tier - z.tier);
}

/** 抹掉档案里的联系方式原值 + 手机 / 邮箱正则(03-v2 第 6 条 · G13) */
function redact(s: string, p: Record<string, any>) {
  for (const v of [p.contact, p.wechat, p.phone, p.email, p.company]) { const x = String(v ?? '').trim(); if (x.length >= 2) s = s.split(x).join('{{已隐去}}'); }
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '{{邮箱}}').replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '{{手机}}');
}

type Gen = { ok: boolean; draft?: string; flags?: string[]; model?: string; code?: string; evidence?: string; msg?: string; status?: number };

/** P03:机会简报草稿(后台手工按钮与自动流水线共用) */
export async function genBrief(db: D1Database, id: number, notes = '', cat = ''): Promise<Gen> {
  const p = await db.prepare(`SELECT * FROM b2o_profiles WHERE id=?`).bind(id).first<Record<string, any>>();
  if (!p) return { ok: false, msg: '档案不存在', status: 404 };
  const code = custCode(p as any);
  const F: [string, string][] = [['平台', 'platforms'], ['现做市场', 'markets_now'], ['想做市场', 'markets_next'], ['现做品类', 'cats_now'], ['想做品类', 'cats_next'],
    ['店铺链接', 'store_url'], ['核心商品链接', 'hero_urls'], ['价格带', 'price_band'], ['卖得最好', 'best_sellers'], ['月上新', 'monthly_new'], ['模式', 'mode'],
    ['流量', 'traffic'], ['现工厂痛点', 'factory_pain'], ['核心需求', 'core_need'], ['决策时效', 'decision_time'], ['规模', 'scale']];
  const prof = F.filter(([, k]) => String(p[k] ?? '').trim()).map(([l, k]) => `${l}:${String(p[k]).slice(0, 500)}`).join('\n');

  let facts = '';
  if (/^[a-z-]{2,30}$/.test(cat)) {
    const d = await db.prepare(`SELECT MAX(date) d FROM market_snapshots WHERE platform='amazon-us' AND cat=?`).bind(cat).first<{ d: string | null }>();
    if (d?.d) {
      const top = (await db.prepare(`SELECT s.rank, s.price, s.reviews, p.title FROM market_snapshots s LEFT JOIN market_products p ON p.platform=s.platform AND p.pid=s.pid WHERE s.platform='amazon-us' AND s.cat=? AND s.date=? ORDER BY s.rank LIMIT 10`).bind(cat, d.d).all<any>()).results;
      const pr = top.map((r) => r.price).filter((x) => x != null).sort((a, b) => a - b);
      facts = `Amazon 美国站「${cat}」畅销榜前 10(出处:market_snapshots · ${d.d};排名≠销量)。前 10 价格中位数 $${pr[Math.floor(pr.length / 2)] ?? '—'}。\n` +
        top.map((r) => `#${r.rank} ${String(r.title ?? '').slice(0, 60)} · $${r.price ?? '—'} · 评论 ${r.reviews ?? '—'}`).join('\n');
    }
  }
  /* 卡池 = 首批已冻结、已批准的预判对应的卡(06-v2 P03);国家和客户市场对不上的不给模型 */
  const m = custMarkets(p);
  const pool = (await db.prepare(`SELECT c.id, c.headline, c.country, c.platform, c.stage FROM b2o_opp_cards c JOIN b2o_predictions r ON r.card_id=c.id
      WHERE r.frozen_at IS NOT NULL AND r.review_status='approved' ORDER BY c.sort_order LIMIT 20`).all<any>().catch(() => ({ results: [] as any[] }))).results;
  const cards = pool.filter((k: any) => cardHits(k.country, m));
  const cardTxt = cards.length ? cards.map((k: any) => `卡#${k.id} ${k.country ?? ''} ${k.platform ?? ''} ${k.stage ?? ''}:${k.headline ?? ''}`).join('\n') : '(暂无对得上的机会卡)';

  const user = redact([`客户代号:${code}`, `认同级:L${p.trust_level ?? 0}`, `今天:${bjDay()}`,
    `【客户档案】\n${prof || '(档案几乎为空)'}`, `【顾问补充】\n${String(notes).slice(0, 3000) || '(无)'}`,
    `【真实数据】\n${facts || '(无;3 个数字全部留给顾问补)'}`, `【可选机会卡(已冻结,国家与客户市场对得上)】\n${cardTxt}`].join('\n\n'), p);
  try {
    const fleet = await freeFleet(db);
    if (!fleet.length) return { ok: false, msg: '白名单免费模型都没配 key', status: 502 };
    const r = await chat(cfEnv as any, [{ role: 'system', content: BRIEF_SYS }, { role: 'user', content: user }],
      { fleet, maxTokens: 3000, timeoutMs: 45000, promptKey: 'b2o-brief', entity: { type: 'b2o_profile', id } });
    const text = String(r.text ?? '').trim();
    if (!text) return { ok: false, msg: '模型没有返回,稍后再试', status: 502 };
    return { ok: true, draft: HEAD + text, flags: briefFlags(text), model: `${r.provider} / ${r.model}`, code, evidence: JSON.stringify(cards.map((k: any) => `b2o_opp_cards#${k.id}`)) };
  } catch (e: any) {
    return { ok: false, msg: `生成失败:${String(e?.message ?? e).slice(0, 160)}`, status: 502 };
  }
}

/* P04 没有新证据时不让模型编,直接用 04-v2 S1 四问里还没问的那一问(不发「在吗」) */
const NO_EVIDENCE: Record<string, string> = {
  retouch3: '您好,上次发您的两个方向先不急着定。想请教一句:您下一步准备扩哪个国家,或者哪个品类?知道这个,我们下次给您的判断能更准。',
  retouch7: '【电话要点 · 顾问打 1 次电话,1 对 1,只问一个问题】\n1. 开场:上次发您的机会简报,想听听您的看法,不占您太久。\n2. 只问:现在供应链上最头疼的是哪件事?\n3. 客户说了什么,回后台点「客户回了」并在企业微信备注原话(原话不进系统)。',
  retouch14: '您好,最后再请教一句:如果有合适的产品,您那边一般多久能上架测?您说个大概,我们按您的节奏来准备。不需要的话回我一句就行。',
};
const RETOUCH_SYS = `你替跨境产品顾问起草一条企业微信再触达消息:客户收到我们的机会简报后一直没回。只输出消息正文,中文,不超过 120 字。
必须基于下面「新证据」里的一条来写,写明出处和日期;不许编造任何数字、店铺数据或客户说过的话。结构:「上次跟您说的方向,最近又出现了一个新信号:{证据}(出处 {出处},{日期})。我把变化更新在一页里,您有空看一眼。」
如果任务是「电话要点」,改为输出 3 行电话要点:开场一句、要讲的新证据一句、只问一个具体问题一句。
禁止:在吗、考虑得怎么样、看了吗、有项目吗、最近忙吗、给个机会;任何起订量、交期、价格、出样天数;称呼和顾问名字(程序会套)。`;

/** P04:再触达草稿。新证据 = 沉默起点之后新增的、市场对得上的法规动态(③)和新冻结的判断(⑥) */
export async function genRetouch(db: D1Database, id: number, kind: string, base: string): Promise<Gen> {
  const p = await db.prepare(`SELECT * FROM b2o_profiles WHERE id=?`).bind(id).first<Record<string, any>>();
  if (!p) return { ok: false, msg: '档案不存在', status: 404 };
  const code = custCode(p as any), m = custMarkets(p), mids = new Set([...m].map((k) => MID[k]));
  if ([...m].some((k) => SEA.includes(k))) mids.add('asean');
  const regs = (await db.prepare(`SELECT id, date, market_id, COALESCE(title_zh, title_en) t, source FROM regulation_updates WHERE date > substr(?,1,10) ORDER BY date DESC LIMIT 30`).bind(base).all<any>()).results
    .filter((r: any) => mids.has(r.market_id)).slice(0, 3);
  const preds = (await db.prepare(`SELECT r.id, substr(r.frozen_at,1,10) d, c.country, c.headline t FROM b2o_predictions r JOIN b2o_opp_cards c ON c.id=r.card_id
      WHERE r.frozen_at > ? AND r.review_status='approved' ORDER BY r.frozen_at DESC LIMIT 20`).bind(base).all<any>().catch(() => ({ results: [] as any[] }))).results
    .filter((r: any) => cardHits(r.country, m)).slice(0, 2);
  /* 给模型的证据只带对外能说的出处(法规原文出处 / 帛卉机会判断 + 日期);表名和 id 只进 evidence 列,不进正文 */
  const ev = [...regs.map((r: any) => `法规动态(${r.date},${r.market_id}):${r.t}${r.source ? `(出处 ${String(r.source).slice(0, 120)})` : ''}`),
    ...preds.map((r: any) => `帛卉机会判断(${r.d}):${r.t}(出处 帛卉机会判断,${r.d})`)];
  const note = kind === 'retouch14' ? ['提示:第三次仍没回 → 业务负责人确认后进培育(等级保留)'] : [];
  const evidence = JSON.stringify([...regs.map((r: any) => `regulation_updates#${r.id}`), ...preds.map((r: any) => `b2o_predictions#${r.id}`)]);
  if (!ev.length) return { ok: true, draft: HEAD + NO_EVIDENCE[kind], flags: note, model: '模板(无新证据,不调模型)', code, evidence };
  try {
    const fleet = await freeFleet(db);
    if (!fleet.length) return { ok: false, msg: '白名单免费模型都没配 key', status: 502 };
    const task = kind === 'retouch7' ? '电话要点(第 7 天,顾问打 1 次电话)' : `企业微信消息(第 ${kind.slice(7)} 天)`;
    const r = await chat(cfEnv as any, [{ role: 'system', content: RETOUCH_SYS },
      { role: 'user', content: redact(`客户代号:${code}\n任务:${task}\n客户市场:${[...m].join('、') || '未知'}\n【新证据】\n${ev.join('\n')}`, p) }],
      { fleet, maxTokens: 800, timeoutMs: 45000, promptKey: 'b2o-retouch', entity: { type: 'b2o_profile', id } });
    const text = String(r.text ?? '').trim();
    if (!text) return { ok: false, msg: '模型没有返回', status: 502 };
    return { ok: true, draft: HEAD + text, flags: [...briefFlags(text), ...note, `依据:${ev.join(';')}`], model: `${r.provider} / ${r.model}`, code, evidence };
  } catch (e: any) {
    return { ok: false, msg: `生成失败:${String(e?.message ?? e).slice(0, 160)}`, status: 502 };
  }
}

const ledger = (db: D1Database, pid: number, kind: string, payload: unknown, author = 'job:b2o-auto@cf-worker', ak = 'machine') =>
  db.prepare(`INSERT INTO b2o_ledger (entity_type, entity_id, kind, author, author_kind, payload_json) VALUES ('b2o_profiles', ?, ?, ?, ?, ?)`)
    .bind(String(pid), kind, author, ak, JSON.stringify(payload)).run().catch(() => null);
export { ledger as b2oLedger };

/** 抢租约:新行 INSERT OR IGNORE;失败行(<3 次、3 分钟前)UPDATE 回 gen。changes=1 才算抢到,事件与 Cron 撞车也只生成一次 */
async function claim(db: D1Database, pid: number, kind: string, base: string): Promise<number | null> {
  const ins = await db.prepare(`INSERT OR IGNORE INTO b2o_auto_drafts (profile_id, kind, base_at) VALUES (?,?,?)`).bind(pid, kind, base).run();
  if (ins.meta.changes === 1) return Number(ins.meta.last_row_id);
  const up = await db.prepare(`UPDATE b2o_auto_drafts SET status='gen', tries=tries+1, updated_at=datetime('now') WHERE profile_id=? AND kind=? AND base_at=?
      AND status='failed' AND tries < 3 AND updated_at < datetime('now','-3 minutes') RETURNING id`).bind(pid, kind, base).first<{ id: number }>();
  return up?.id ?? null;
}

/** 生成一条并落库。返回 true = 出了草稿 */
export async function produce(db: D1Database, pid: number, kind: string, base: string): Promise<boolean | null> {
  const did = await claim(db, pid, kind, base);
  if (!did) return null;   // 别人已经在做或做过了
  const g = kind === 'brief' ? await genBrief(db, pid) : await genRetouch(db, pid, kind, base);
  if (!g.ok) {
    await db.prepare(`UPDATE b2o_auto_drafts SET status='failed', flags=?, updated_at=datetime('now') WHERE id=?`).bind(JSON.stringify([g.msg]), did).run();
    return false;
  }
  await db.prepare(`UPDATE b2o_auto_drafts SET status='draft', body=?, flags=?, model=?, evidence=?, updated_at=datetime('now') WHERE id=?`)
    .bind(g.draft, JSON.stringify(g.flags ?? []), g.model, g.evidence ?? null, did).run();
  await ledger(db, pid, kind === 'brief' ? 'brief_draft' : 'retouch_draft', { draft_id: did, kind, flags_n: (g.flags ?? []).length, model: g.model });
  return true;
}

/** 事件入口:api/b2o/brief.ts 入库后 waitUntil 调。没有处理同意就不做(同意闸门) */
export async function autoBrief(db: D1Database, pid: number) {
  const ok = await db.prepare(`SELECT 1 FROM b2o_profiles WHERE id=? AND consent_at IS NOT NULL`).bind(pid).first();
  if (ok) await produce(db, pid, 'brief', '').catch((e) => console.error('[b2o-auto] brief', e));
}

/**
 * Cron 入口(每 10 分钟,纯 SQL 扫描 + 最多 max 次模型调用)。每次在 jobs 记一行 b2o-auto,note 带 out=N;2 天前的 b2o-auto 行顺手删掉(约 288 行封顶)。
 * 读量(09-24 远端实测 rows_read):扫描 b2o_profiles 全表 = 59 行,drafts 按唯一键点查,jobs 删旧行走 idx_jobs_name_started = 1 行;
 *   有活时每条草稿另读 providers(10:5x 验收实测 35)+ 卡池 JOIN(实测 30)+ regulation_updates(无 date 索引 = 全表,实测 29)+ predictions JOIN,每条 ≤ 130;
 *   每轮最多 2 条 → 单次 ≤ 行数 + 15 + 260。空转每天 144 次 ≈ 144 × (b2o_profiles 行数 + 15) ≈ 1.1 万行(现 59 行);草稿只在新客户 / 沉默节点出,每条另加 ≤130,低于单任务 10 万行/天上限。
 * ponytail: b2o_profiles 全表扫,超过约 600 行会逼近 10 万行/天 → 那时给 created_at、brief_sent_at 各加索引(WHERE 的 OR 可走两个索引);
 *   regulation_updates 全表扫,过 500 行给 date 加索引。
 */
export async function runB2oAuto(db: D1Database, max = 2): Promise<{ out: number; fail: number; noConsent: number; left: number }> {
  const jid = (await db.prepare(`INSERT INTO jobs (name, job_type, host, status, heartbeat_at) VALUES ('b2o-auto','cron','cf-worker','running',datetime('now')) RETURNING id`).first<{ id: number }>().catch(() => null))?.id;
  let out = 0, fail = 0, noConsent = 0, left = 0, err: string | null = null;
  try {
    /* 事件路径跑在 waitUntil 里,响应后最多 30 秒就被掐,模型慢(实测 56 秒)时会留下 gen 行:3 分钟没完成就判失败,同一轮立刻重试(不动 updated_at) */
    await db.prepare(`UPDATE b2o_auto_drafts SET status='failed' WHERE status='gen' AND updated_at < datetime('now','-3 minutes')`).run();
    const todo: [number, string, string][] = [];
    const ps = (await db.prepare(`SELECT p.id, p.consent_at, p.status, p.brief_sent_at,
        (COALESCE(p.store_url,'') <> '' OR COALESCE(p.hero_urls,'') <> '') AS has_store,
        julianday('now') - julianday(p.brief_sent_at) AS silent,
        (SELECT group_concat(d.kind || '@' || d.base_at || '@' || d.status || '@' || d.tries || '@' || (d.updated_at < datetime('now','-3 minutes')), '|') FROM b2o_auto_drafts d WHERE d.profile_id = p.id) AS ds
      FROM b2o_profiles p WHERE p.created_at > datetime('now','-14 days') OR p.brief_sent_at > datetime('now','-30 days')`).all<any>()).results;
    for (const p of ps) {
      const ds = String(p.ds ?? '').split('|').filter(Boolean).map((s: string) => s.split('@'));
      const need = (kind: string, base: string) => { const d = ds.find((x) => x[0] === kind && x[1] === base); return !d || (d[2] === 'failed' && Number(d[3]) < 3 && d[4] === '1'); };
      if (!p.consent_at) { if (p.has_store) noConsent++; continue; }
      if (p.has_store && need('brief', '')) todo.push([p.id, 'brief', '']);
      if (p.brief_sent_at && !['replied', 'nurture', 'dropped', 'dnd'].includes(p.status)) {
        const step = [14, 7, 3].find((s) => p.silent >= s);   // 只出当前这一格(系统晚上线也不补发前面的格)
        if (step && need(`retouch${step}`, p.brief_sent_at)) todo.push([p.id, `retouch${step}`, p.brief_sent_at]);
      }
    }
    for (const [pid, kind, base] of todo.slice(0, max)) { const r = await produce(db, pid, kind, base); if (r) out++; else if (r === false) fail++; }
    left = Math.max(0, todo.length - max);
  } catch (e: any) { err = String(e?.message ?? e).slice(0, 200); }
  if (jid) await db.prepare(`UPDATE jobs SET status=?, note=?, error=?, finished_at=datetime('now'), heartbeat_at=datetime('now') WHERE id=?`)
    .bind(err ? 'failed' : 'done', `out=${out} fail=${fail} no_consent=${noConsent} left=${left}`, err, jid).run().catch(() => null);
  await db.prepare(`DELETE FROM jobs WHERE name='b2o-auto' AND started_at < datetime('now','-2 days')`).run().catch(() => null);
  return { out, fail, noConsent, left };
}
