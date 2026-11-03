/**
 * 会员站内搜索的查库部分(09-24 安全架构 C2 / 3.1「会员搜索」一行:单次读行上限 3,000)。
 * 进到这里之前,页面已经过了 searchGate —— 未登录、爬虫、超额都走不到这里。
 * 每个函数守三条:
 *   ① 读行有上限:≥3 字走 FTS5 trigram(不做全局排序,流式取到 CAP+1 条就停;回表只回命中行);
 *      1–2 字 trigram 查不了,只做名称前缀(普通索引的范围扫描,LIMIT 50)。不再对长文本做 '%词%'。
 *   ② 总数封顶:最多数到 CAP+1,页面显示「1000+」,不 COUNT 全表。
 *   ③ 同一个词重复搜不打库:searchMemo 按「目录+词+页」记 1 小时,空结果也记。
 * 用到的 FTS 表与索引:inci_catalog_fts(0113);market_products_fts、kg_nodes_fts、idx_mp_brand、idx_inci_reg_zh、
 * idx_inci_reg_key(0125)。0125 还没上时各自退回同样有上限的旧写法或空结果,页面不报错。
 */
import { memo } from './memo';

export const CAP = 1000;
/** 页面上的总数:超过 CAP 显示「1000+」 */
export const capText = (n: number) => (n > CAP ? `${CAP}+` : n.toLocaleString());
export const isShort = (q: string) => [...q].length < 3;
/** trigram 短语:整串当子串匹配、不分大小写;内部双引号加倍(与 0113 同写法),串本身走绑定参数 */
const phrase = (q: string) => `"${q.replace(/"/g, '""')}"`;
/** 前缀区间 [q, q+U+FFFF):普通 B-tree 索引直接走范围,不用 LIKE */
const upTo = (q: string) => q + '\uffff';
const all = async <T>(s: D1PreparedStatement) => ((await s.all<T>()).results ?? []) as T[];
const uniq = <T extends { id: number }>(xs: T[]) => { const seen = new Set<number>(); return xs.filter((x) => !seen.has(x.id) && !!seen.add(x.id)); };

/** 结果包成 {v} 再记:lib/memo 不记空数组,随机词每次都会打库 */
export async function searchMemo<T>(scope: string, q: string, page: number, fn: () => Promise<T>): Promise<T> {
  return (await memo(`s:${scope}:${q.toLowerCase()}:${page}`, 3600, async () => ({ v: await fn() }))).v;
}

/** 按 id 回表取展示行(≤50 个 id,主键查找),按传入顺序排好。sql 里用 %IDS% 占位 */
export async function byIds<T extends { id: number }>(db: D1Database, sql: string, ids: number[]): Promise<T[]> {
  if (!ids.length) return [];
  const got = await all<T>(db.prepare(sql.replace('%IDS%', ids.map(() => '?').join(','))).bind(...ids));
  const pos = new Map(ids.map((id, i) => [id, i]));
  return got.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

/* ── 原料目录(inci_catalog,5.7 万行,10 个目录)──────────────────────────── */
export type CatHit = { id: number; reg: string; no: string; len: number };
const CAT_COLS = 'c.rowid AS id, c.registry AS reg, c.no AS no, length(c.inci) AS len';

/** 一个目录在 rowid 上的区间(各目录基本是整批导入、rowid 连续):FTS 按区间只翻这一个目录的命中,不回表别的目录。
 *  两次索引定位各读 1 行,记 24 小时;索引不在就不框(退回按目录过滤,结果一样,只是多回表)。 */
const regSpan = (db: D1Database, reg: string) => memo(`inci-span:${reg}`, 86400, async () => {
  try {
    const end = (dir: string) => db.prepare(`SELECT rowid AS r FROM inci_catalog INDEXED BY idx_inci_registry WHERE registry = ? ORDER BY rowid ${dir} LIMIT 1`).bind(reg).first<{ r: number }>();
    const [lo, hi] = await Promise.all([end('ASC'), end('DESC')]);
    return lo && hi ? [lo.r, hi.r] : null;
  } catch { return null; }
});

/** 目录检索命中:最多 CAP+1 条,只带排序要用的几列。reg 给了只搜这一个目录。
 *  ≥3 字:序号 / CAS 精确命中(主键与 idx_inci_catalog_cas)+ FTS 命中。
 *  1–2 字:只在给定目录里做中文名、INCI 前缀,各 LIMIT 50;没给目录(原料总页)不查。 */
export async function catalogHits(db: D1Database, q: string, reg?: string): Promise<CatHit[]> {
  if (isShort(q)) {
    if (!reg) return [];
    const Q = q.toUpperCase();
    const [a, b] = await Promise.all([
      all<CatHit>(db.prepare(`SELECT ${CAT_COLS} FROM inci_catalog c INDEXED BY idx_inci_reg_zh WHERE c.registry = ? AND c.name_zh >= ? AND c.name_zh < ? LIMIT 50`).bind(reg, q, upTo(q))),
      all<CatHit>(db.prepare(`SELECT ${CAT_COLS} FROM inci_catalog c INDEXED BY idx_inci_reg_key WHERE c.registry = ? AND c.inci_key >= ? AND c.inci_key < ? LIMIT 50`).bind(reg, Q, upTo(Q))),
    ]);
    return uniq([...a, ...b]);
  }
  const span = reg ? await regSpan(db, reg) : null;
  const w: string[] = ['inci_catalog_fts MATCH ?']; const args: unknown[] = [phrase(q)];
  if (span) { w.push('f.rowid BETWEEN ? AND ?'); args.push(span[0], span[1]); }
  if (reg) { w.push('c.registry = ?'); args.push(reg); }
  const [exact, fts] = await Promise.all([
    /* 目录不写进 SQL:和 registry = ? 放一起,没有统计信息的规划器会改走目录索引整扫一个目录(EU 3.6 万行);精确命中就几行,内存里筛 */
    all<CatHit>(db.prepare(`SELECT ${CAT_COLS} FROM inci_catalog c WHERE c.no = ? OR c.cas = ?`).bind(q, q)).then((xs) => xs.filter((x) => !reg || x.reg === reg)),
    /* CROSS JOIN 固定 FTS 在外层:先出命中 rowid 再按主键回表,不会反过来按目录整扫 */
    all<CatHit>(db.prepare(`SELECT ${CAT_COLS} FROM inci_catalog_fts f CROSS JOIN inci_catalog c ON c.rowid = f.rowid WHERE ${w.join(' AND ')} LIMIT ${CAP + 1}`).bind(...args)),
  ]);
  return uniq([...exact, ...fts]).slice(0, CAP + 1);
}

/* ── 解读库(market_products,约 15 万款)─────────────────────────────────── */
export type MpHit = { id: number; country: string | null; k: string | null };
const MP_COLS = `m.id AS id, NULLIF(m.country, '') AS country, NULLIF(COALESCE(m.cat_zh, m.cat), '') AS k`;
const MP_BASE = 'm.inci IS NOT NULL AND length(m.inci) > 30';

/** 解读库检索:最多 CAP+1 条(id、市场、类目 —— 分面在内存里数,不再 GROUP BY)。
 *  ≥3 字:品牌 / 标题 / 中文标题的 FTS,只看最新的 3,000 条命中(回表至多 3,000 行);不再搜 inci 长文本(查成分请去原料页)。
 *  1–2 字:只做品牌前缀(idx_mp_brand)。 */
export async function productHits(db: D1Database, q: string): Promise<MpHit[]> {
  if (isShort(q)) {
    const out: MpHit[] = [];
    for (const v of new Set([q, q.toUpperCase()])) {
      out.push(...await all<MpHit>(db.prepare(`SELECT ${MP_COLS} FROM market_products m INDEXED BY idx_mp_brand WHERE m.brand >= ? AND m.brand < ? AND ${MP_BASE} LIMIT 50`).bind(v, upTo(v))));
    }
    return uniq(out);
  }
  try {
    return await all<MpHit>(db.prepare(
      `SELECT ${MP_COLS} FROM (SELECT rowid AS r FROM market_products_fts WHERE market_products_fts MATCH ? ORDER BY rowid DESC LIMIT 3000) f
         CROSS JOIN market_products m ON m.id = f.r WHERE ${MP_BASE} LIMIT ${CAP + 1}`).bind(phrase(q)));
  } catch {
    /* 0125 还没上,或 deploy-copy 导库时临时删了 FTS:只在最新 3,000 款里找,读行同样封顶 */
    const l = `%${q}%`;
    return all<MpHit>(db.prepare(
      `SELECT ${MP_COLS} FROM (SELECT id, country, cat, cat_zh, brand, title, title_zh FROM market_products INDEXED BY idx_mp_seen_ok
                               WHERE inci IS NOT NULL AND length(inci) > 30 ORDER BY last_seen DESC, id DESC LIMIT 3000) m
        WHERE m.brand LIKE ? OR m.title LIKE ? OR m.title_zh LIKE ? LIMIT ${CAP + 1}`).bind(l, l, l));
  }
}

/* ── 知识图谱实体(kg_nodes,8 千多个)────────────────────────────────────── */
export type NodeRow = { id: number; name: string; type: string; description: string; origin: string };
const KG_COLS = 'n.id AS id, n.name AS name, n.type AS type, n.description AS description, n.origin AS origin';

/** 实体检索:最多 60 个。≥3 字 FTS 取前 200 个命中再按「来源、名字长短」排;1–2 字只做名字前缀(name 唯一索引)。 */
export async function nodeHits(db: D1Database, q: string): Promise<NodeRow[]> {
  const rank = (xs: NodeRow[]) => xs.sort((a, b) => String(a.origin).localeCompare(String(b.origin)) || a.name.length - b.name.length || a.id - b.id).slice(0, 60);
  if (isShort(q)) return rank(await all<NodeRow>(db.prepare(`SELECT ${KG_COLS} FROM kg_nodes n WHERE n.name >= ? AND n.name < ? LIMIT 60`).bind(q, upTo(q))));
  try {
    return rank(await all<NodeRow>(db.prepare(`SELECT ${KG_COLS} FROM kg_nodes_fts f CROSS JOIN kg_nodes n ON n.id = f.rowid WHERE kg_nodes_fts MATCH ? LIMIT 200`).bind(phrase(q))));
  } catch {
    /* 0125 还没上:退回原来的子串匹配(全表 8 千多行,只有会员走得到、且按词记 1 小时) */
    return rank(await all<NodeRow>(db.prepare(`SELECT ${KG_COLS} FROM kg_nodes n WHERE n.name LIKE ? LIMIT 200`).bind(`%${q}%`)));
  }
}
