import { getCounts } from './counts';

/**
 * llms.txt「可引用数据表」(2026-09-23 GEO 第 2 条)—— 每个数都在请求时从库里读,不手写。
 * 计数读 pulse 'counts'(tools/counts-refresh.py);禁限用目录与广东牙膏备案读 pulse 'geo_facts'(tools/reg-digest.py,每月 1 号);
 * 法规动态条数现算(regulation_updates 只有几十行)。取不到的项整行不出,不拿兜底数凑。
 * lp = 链接用的语种前缀(en / zh-cn)。
 */
export async function citableTable(db: D1Database | undefined, base: string, zh: boolean, lp: string): Promise<string> {
  const c: any = (await getCounts(db)) ?? {};
  let f: any = {}; let upd = 0;
  if (db) {
    try { const r = await db.prepare(`SELECT json FROM pulse WHERE k = 'geo_facts'`).first<{ json: string }>(); if (r) f = JSON.parse(r.json); } catch { /* 还没生成 */ }
    try { upd = Number((await db.prepare('SELECT COUNT(*) n FROM regulation_updates').first<any>())?.n ?? 0); } catch { /* 表未建 */ }
  }
  const n = (v: unknown) => Number(v ?? 0).toLocaleString('en-US');
  const live = zh ? '库内实时计数' : 'live database count';
  const regN = c.registry ? Object.keys(c.registry).length : 0;
  const ims = f.ims ?? {}; const tp = f.gd_toothpaste ?? {};
  const rows: [unknown, string, string, string][] = [   // [数值, 指标(英), 指标(中), 口径 + 链接]
    [c.products, 'Market products with full ingredient lists', '带全成分表的市场在售产品', `${live} · ${base}/${lp}/decoder/`],
    [c.inci, `Ingredient catalogue entries across ${regN} national registries`, `${regN} 个国家 / 地区原料目录条目`, `${live} · ${base}/${lp}/inci/`],
    [ims.rows, `Ingredient status entries (prohibited / restricted / permitted) in ${ims.markets} markets`, `${ims.markets} 个市场的禁用 / 限用 / 准用目录条目`, `${zh ? '每月汇总' : 'monthly roll-up'} ${f.asof ?? ''} · ${base}/${lp}/regulations/changes/`],
    [c.regs, 'Markets with a regulation digest', '有法规整理的市场', `${live} · ${base}/${lp}/regulations/`],
    [upd, 'Regulatory changes tracked, 2025–2026', '2025–2026 跟踪的法规变化', `${live} · ${base}/${lp}/regulations/changes/`],
    [c.formulas, 'Formulation bases published in the online library', '线上配方库公开的配方基底', `${live} · ${base}/${lp}/formulas/`],
    [c.packaging, 'Packaging items on the online shelf', '线上包材货架在架款数', `${live} · ${base}/${lp}/packaging/`],
    [c.answers, 'Buyer Q&A pages', '买手问答页', `${live} · ${base}/${lp}/answers/`],
    [tp.filers, 'Toothpaste filers in Guangdong\'s public filing register', '广东省牙膏备案公示中的备案人', zh ? tp.scope_zh : tp.scope_en],
    [tp.brand_only, `…of which own no factory (all ${n(tp.brand_only_skus)} of their SKUs are made by contract manufacturers)`, `其中自己没有工厂的(名下 ${n(tp.brand_only_skus)} 个 SKU 全部委托生产)`, zh ? '同上;备案人集合减生产企业集合' : 'same register; filers minus listed manufacturers'],
  ];
  const body = rows.filter(([v]) => Number(v) > 0).map(([v, en, zhL, src]) => `| ${zh ? zhL : en} | ${n(v)} | ${src} |`).join('\n');
  return zh
    ? `## 可引用数据表\n\n表里每个数都是本文件被请求时从站点数据库读出的;引用时请带上日期和链接。\n\n| 指标 | 数值 | 口径 |\n|---|---|---|\n${body}`
    : `## Citable data\n\nEvery number in this table is read from the site database when this file is requested; please cite it with the date and link.\n\n| Metric | Value | Basis |\n|---|---|---|\n${body}`;
}
