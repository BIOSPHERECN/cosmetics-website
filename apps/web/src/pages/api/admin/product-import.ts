/**
 * 产品批量导入 —— 网页版(A9 · 2026-09-23)。
 *
 * 复用 B2 线的历史产品导入管道(tools/b2o-products/import.py + 迁移 0108 暂存表 product_staging):
 * 同一张模板、同一套字段与枚举、同一个去重键、同一张暂存表、同一套「白名单拷进 products(draft)」发布规则。
 * 区别只有入口:脚本给技术线跑大批带图的,这个接口给后台页面用 —— 表格在浏览器里解析好再发过来。
 * 规则改动请两边一起改(本文件的 FIELDS / CATEGORY / FORMAT / norm / dedupKey 与 import.py 一一对应)。
 *
 *  POST {op:'check', rows}              逐行体检,不写库
 *  POST {op:'stage', rows, file}        体检后把 成功/需人工 的行写进暂存表(一个批次)
 *  POST {op:'publish', ids}             把勾选的暂存行发布为本站草稿产品(slug = legacy-<暂存id>)
 *  GET  ?batch=<批次>                    这一批的暂存行(页面审核用;敏感字段不回传);不带参数 = 最近 20 批
 *
 * 写库全是 json_each 整批语句,固定条数、一个事务。
 * 网页版不传图:未审的图不能先有公开的 /media/{id}(B2 定的规矩),带图的大批走脚本,或发布后在一页式编辑里拖图。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';

export const prerender = false;

/* ── 与 import.py 一一对应 ─────────────────────────────── */
const FIELDS: [string, string, string][] = [
  ['name_zh', '产品名', '必填'], ['category', '品类', '必填'], ['format', '剂型', '必填'],
  ['name_en', '英文名', '推荐'], ['efficacy', '功效', '推荐'], ['capacity', '容量', '推荐'], ['packaging', '包材', '推荐'],
  ['inci', '主要成分INCI', '推荐'], ['markets', '适用市场', '推荐'], ['launch_year', '上市年份', '推荐'],
  ['mass_produced', '是否量产', '推荐'], ['reorder', '返单情况', '推荐'], ['prod_issues', '生产问题', '推荐'],
  ['solutions', '解决办法', '推荐'], ['images', '图片文件名', '推荐'],
  ['customer_type', '客户类型', '基因'], ['price_band', '价格带', '基因'], ['skin_feel', '肤感', '基因'],
  ['fragrance', '香型', '基因'], ['emulsion_system', '乳化体系', '基因'], ['preservative_system', '防腐体系', '基因'],
  ['formula_pct', '配方比例', '敏感'], ['cost', '成本', '敏感'], ['customer_name', '客户名称', '敏感'],
  ['customer_brand', '客户品牌', '敏感'], ['internal_note', '内部备注', '敏感'],
];
const SENSITIVE = FIELDS.filter((f) => f[2] === '敏感').map((f) => f[0]);
const HEAD2KEY: Record<string, string> = Object.fromEntries(FIELDS.map(([k, h]) => [h, k]));
const CATEGORY: Record<string, string> = { 护肤: 'skincare', 彩妆: 'makeup', 清洁: 'cleansing', 口腔护理: 'oral',
  身体护理: 'body', 防晒: 'suncare', 洗护: 'hair', 儿童护理: 'kids', 香氛: 'fragrance' };
const FORMAT: Record<string, string> = { 精华: 'serum', 面霜: 'cream', 乳液: 'lotion', 爽肤水: 'toner', 安瓶: 'ampoule',
  精华水: 'essence', 眼霜: 'eye-cream', 凝胶: 'gel', '精油/油': 'oil', '膏霜/香膏': 'balm',
  '面膜(贴片)': 'sheet-mask', '面膜(涂抹)': 'mask', 睡眠面膜: 'sleeping-mask', 冻膜: 'jelly-mask',
  眼贴: 'eye-patch', '洁面乳/泡沫': 'foam', 洁面啫喱: 'cleansing-gel', 卸妆油: 'cleansing-oil',
  卸妆水: 'micellar', 喷雾: 'mist', 磨砂: 'scrub', 泥膜: 'mud', 身体乳: 'body-lotion',
  沐浴露: 'body-wash', 护手霜: 'hand-cream', 洗发水: 'shampoo', 护发素: 'conditioner',
  发膜: 'hair-mask', 护发精油: 'hair-oil', 防晒乳: 'sun-lotion', 防晒喷雾: 'sun-spray',
  防晒棒: 'sun-stick', 棒状: 'stick', 粉类: 'powder', 气垫: 'cushion', 粉底液: 'foundation',
  口红: 'lipstick', 唇釉: 'gloss', 睫毛膏: 'mascara', 香水: 'edp', 固体香膏: 'solid-perfume',
  牙膏: 'toothpaste', 牙膏片: 'tooth-tablet', 牙粉: 'gum-powder', 漱口水: 'mouthwash',
  口喷: 'oral-spray', 牙贴: 'tooth-strip', 其他: 'other' };
const LISTS: Record<string, string[]> = {
  mass_produced: ['是', '否', '只打样'],
  reorder: ['无返单', '返单1次', '返单多次', '持续返单', '不清楚'],
  customer_type: ['跨境卖家', '品牌方', '贸易商', '线下渠道', '自有品牌', '其他'],
};
/** 入库期归一:全角转半角 + 去不可见字符 + 压空白,保留标点括号(并行规则铁令) */
const norm = (s: unknown) => String(s ?? '').normalize('NFKC').replace(/(?!\n)[\p{Cf}\p{Cc}]/gu, '').replace(/[ \t]+/g, ' ').trim();
const dedupKey = (...xs: string[]) => xs.map((x) => norm(x).replace(/\s+/g, '').toUpperCase()).join('|');
const splitList = (s: string) => norm(s).split(/[;、\n]|(?<!\d),|,(?!\d)/).map((x) => x.trim()).filter(Boolean);
const inciKey = (x: string) => norm(x).toUpperCase().replace(/[(][^)]*[)]/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
const headKey = (h: string) => HEAD2KEY[norm(h).replace(/【[^】]*】|\([^)]*\)/g, '').replace(/\*/g, '').trim()];
const MAX_ROWS = 500;
const HAN = /[一-鿿]/;

type Checked = { row: number; result: '成功' | '需人工' | '失败' | '重复'; issues: string[]; rec: Record<string, any> };

async function check(db: D1Database, raw: Record<string, string>[]): Promise<Checked[]> {
  const year = new Date().getUTCFullYear();
  const rows = raw.map((r, i) => {
    const d: Record<string, string> = {};
    for (const [h, v] of Object.entries(r)) { const k = headKey(h); if (k) d[k] = norm(v); }
    return { n: Number(r._line) || i + 2, d };
  }).filter((x) => Object.values(x.d).some(Boolean));

  /* 成分对目录:一次查完(英文按 inci_key,中文按 name_zh) */
  const en = new Set<string>(), zh = new Set<string>();
  rows.forEach(({ d }) => splitList(d.inci ?? '').forEach((t) => (HAN.test(t) ? zh.add(t) : en.add(inciKey(t)))));
  const hit = new Map<string, string>();
  if (en.size) {
    const { results } = await db.prepare(`SELECT inci_key k, MIN(inci) inci FROM inci_catalog WHERE inci_key IN (SELECT value FROM json_each(?)) GROUP BY inci_key`)
      .bind(JSON.stringify([...en])).all<{ k: string; inci: string }>();
    (results ?? []).forEach((r) => hit.set(r.k, norm(r.inci).toUpperCase()));
  }
  if (zh.size) {
    // ponytail: name_zh 无索引,一次扫一遍目录(约 5.7 万行),与 import.py 同一取舍
    const { results } = await db.prepare(`SELECT name_zh k, MIN(inci) inci FROM inci_catalog WHERE name_zh IN (SELECT value FROM json_each(?)) GROUP BY name_zh`)
      .bind(JSON.stringify([...zh])).all<{ k: string; inci: string }>();
    (results ?? []).forEach((r) => hit.set(r.k, norm(r.inci).toUpperCase()));
  }

  const out: Checked[] = rows.map(({ n, d }) => {
    const fail: string[] = [], issues: string[] = [];
    FIELDS.forEach(([k, h, g]) => { if (g === '必填' && !d[k]) fail.push(`缺必填「${h}」`); });
    const rec: Record<string, any> = Object.fromEntries(FIELDS.map(([k]) => [k, d[k] ?? '']));
    for (const [k, map, zhName] of [['category', CATEGORY, '品类'], ['format', FORMAT, '剂型']] as const) {
      const v = rec[k];
      if (v && !(v in map) && !Object.values(map).includes(v)) issues.push(`${zhName}「${v}」不在下拉清单里`);
      else if (v in map) rec[k] = map[v];
    }
    for (const k of Object.keys(LISTS)) if (rec[k] && !LISTS[k].includes(rec[k])) issues.push(`「${rec[k]}」不在下拉清单里`);
    const y = rec.launch_year;
    const m = /^(\d{4})(\.0)?$/.exec(y);
    rec.launch_year = m && +m[1] >= 1990 && +m[1] <= year ? +m[1] : null;
    if (y && rec.launch_year === null) issues.push(`上市年份「${y}」不是 1990–${year} 的四位数`);
    rec.inci_list = splitList(rec.inci).map((t) => {
      const v = hit.get(t) ?? hit.get(inciKey(t));
      if (!v) issues.push(`成分「${t}」在成分目录里没找到`);
      return v ?? t.toUpperCase();
    });
    const imgs = splitList(rec.images);
    if (imgs.length) issues.push(`图片「${imgs.join('、')}」网页版不传,发布后在产品编辑页拖图(或交技术线用导入脚本)`);
    return { row: n, result: fail.length ? '失败' : issues.length ? '需人工' : '成功', issues: [...fail, ...issues], rec };
  });

  /* 去重:表内 + 暂存表已有(重复就跳过);与已有产品同名只提示 */
  const keys = out.map((c) => dedupKey(c.rec.name_zh, c.rec.format, c.rec.capacity));
  const { results: have } = await db.prepare(`SELECT dedup_key FROM product_staging WHERE dedup_key IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(keys)).all<{ dedup_key: string }>();
  const had = new Set((have ?? []).map((h) => h.dedup_key));
  const { results: liveRows } = await db.prepare(`SELECT DISTINCT name FROM product_i18n WHERE lang='zh-cn' AND name IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(out.map((c) => c.rec.name_zh).filter(Boolean))).all<{ name: string }>();
  const live = new Set((liveRows ?? []).map((r) => norm(r.name)));
  const seen = new Set<string>();
  out.forEach((c, i) => {
    const k = keys[i];
    c.rec.dedup_key = k;
    if (c.result !== '失败') {
      if (seen.has(k) || had.has(k)) {
        c.result = '重复';
        c.issues = [`产品名+剂型+容量 与${seen.has(k) ? '本表前面的行' : '库里已导入的'}相同,跳过`];
      } else if (live.has(c.rec.name_zh)) {
        c.result = '需人工'; c.issues.push('与已有产品同名,确认是不是同一款');
      }
    }
    seen.add(k);
  });
  return out;
}

const TEXT = ['name_zh', 'name_en', 'category', 'format', 'efficacy', 'capacity', 'packaging', 'markets', 'launch_year',
  'mass_produced', 'reorder', 'customer_type', 'price_band', 'skin_feel', 'fragrance', 'emulsion_system', 'preservative_system',
  'prod_issues', 'solutions'];
const NOT_NULL = new Set(['name_zh', 'category', 'format']);

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => null)) as { op?: string; rows?: Record<string, string>[]; file?: string; ids?: number[] } | null;

  if (b?.op === 'check' || b?.op === 'stage') {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return json({ ok: false, msg: '表格里没有数据行' }, 400);
    if (rows.length > MAX_ROWS) return json({ ok: false, msg: `一次最多 ${MAX_ROWS} 行,请分成几个文件` }, 400);
    const res = await check(c.db, rows);
    const report = res.map((r) => ({ row: r.row, name: r.rec.name_zh, result: r.result, issues: r.issues }));
    if (b.op === 'check') return json({ ok: true, report });

    const ok = res.filter((r) => r.result === '成功' || r.result === '需人工');
    if (!ok.length) return json({ ok: false, msg: '没有可以导入的行', report }, 400);
    const now = new Date(Date.now() + 8 * 3600e3).toISOString().replace(/\D/g, '').slice(0, 14);
    const batch = `w${now.slice(0, 8)}-${now.slice(8)}`;   // 网页批次以 w 开头,脚本批次以 b 开头
    const J = JSON.stringify(ok.map((r) => ({
      ...Object.fromEntries(TEXT.map((k) => [k, r.rec[k]])), row: r.row, dedup_key: r.rec.dedup_key,
      status: r.result === '成功' ? 'pending' : 'review', issues: JSON.stringify(r.issues),
      inci_json: JSON.stringify(r.rec.inci_list),
      private_json: JSON.stringify(Object.fromEntries(SENSITIVE.filter((k) => r.rec[k]).map((k) => [k, r.rec[k]]))),
    })));
    const col = (k: string) => (NOT_NULL.has(k) ? `json_extract(value,'$.${k}')` : `NULLIF(json_extract(value,'$.${k}'),'')`);
    await c.db.prepare(
      `INSERT OR IGNORE INTO product_staging (batch_id, source_file, source_row, dedup_key, status, issues_json, ${TEXT.join(', ')}, inci_json, images_json, private_json)
       SELECT ?1, ?2, json_extract(value,'$.row'), json_extract(value,'$.dedup_key'), json_extract(value,'$.status'), json_extract(value,'$.issues'),
              ${TEXT.map(col).join(', ')}, json_extract(value,'$.inci_json'), '[]', json_extract(value,'$.private_json')
         FROM json_each(?3)`,
    ).bind(batch, String(b.file ?? '网页上传').slice(0, 120), J).run();
    await logRevision(c.db, 'product_staging', batch, null, null, { action: 'stage', n: ok.length }, c.sess.uid);
    return json({ ok: true, batch, staged: ok.length, report });
  }

  /* 发布:白名单拷进 products(draft)—— 与 import.py do_publish 同一规则;
     另把暂存行里的成本 / 配方比例写进 product_internal(只研发 / 财务 / 老板可见),客户名等其余敏感字段不拷 */
  if (b?.op === 'publish') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, MAX_ROWS);
    if (!ids.length) return json({ ok: false, msg: '先勾选要发布的行' }, 400);
    const site = c.tenant.siteId;
    const { results: rows } = await c.db.prepare(
      `SELECT id, format, capacity, inci_json, images_json, private_json FROM product_staging
        WHERE id IN (SELECT value FROM json_each(?)) AND status IN ('pending','review','approved')`,
    ).bind(JSON.stringify(ids)).all<any>();
    if (!rows?.length) return json({ ok: false, msg: '勾选的行都已发布过或不存在' }, 400);
    const parse = (s: string, d: any) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
    const P = JSON.stringify(rows.map((r: any) => {
      const inci: string[] = parse(r.inci_json || '[]', []);
      const priv = parse(r.private_json || '{}', {});
      return {
        id: r.id, slug: `legacy-${r.id}`,
        specs: JSON.stringify([{ label: '剂型', value: r.format }, ...(r.capacity ? [{ label: '容量', value: r.capacity }] : []),
          ...(inci.length ? [{ label: '主要成分', value: inci.join('、') }] : [])]),
        cost: priv.cost || null, formula: priv.formula_pct || null,
      };
    }));
    /* 脚本导入的批次带 R2 图(images_json 有 r2_key),发布时才建 media 行 —— 与 import.py 同 */
    const imgs = JSON.stringify(rows.flatMap((r: any) =>
      (parse(r.images_json || '[]', []) as any[]).filter((m) => m?.r2_key).map((m, i) => ({ ...m, sid: r.id, i }))));
    const SEL = `FROM json_each(?2) j JOIN product_staging s ON s.id = json_extract(j.value,'$.id')`;
    const PID = `(SELECT id FROM products WHERE site_id=?1 AND slug='legacy-'||s.id)`;
    await c.db.batch([
      c.db.prepare(`INSERT OR IGNORE INTO products (site_id, slug, category, status) SELECT ?1, json_extract(j.value,'$.slug'), s.category, 'draft' ${SEL}`).bind(site, P),
      c.db.prepare(`INSERT OR IGNORE INTO product_i18n (product_id, lang, name, summary, specs_json) SELECT ${PID}, 'zh-cn', s.name_zh, s.efficacy, json_extract(j.value,'$.specs') ${SEL}`).bind(site, P),
      c.db.prepare(`INSERT OR IGNORE INTO product_i18n (product_id, lang, name) SELECT ${PID}, 'en', s.name_en ${SEL} WHERE s.name_en IS NOT NULL AND s.name_en <> ''`).bind(site, P),
      c.db.prepare(`INSERT OR IGNORE INTO product_internal (product_id, cost, formula, updated_by)
                    SELECT ${PID}, json_extract(j.value,'$.cost'), json_extract(j.value,'$.formula'), ?3 ${SEL}
                     WHERE json_extract(j.value,'$.cost') IS NOT NULL OR json_extract(j.value,'$.formula') IS NOT NULL`).bind(site, P, c.sess.uid),
      c.db.prepare(`INSERT OR IGNORE INTO media (r2_key, filename, mime, bytes, width, height, folder, alt_zh, driver, creator)
                    SELECT json_extract(value,'$.r2_key'), json_extract(value,'$.file'), 'image/webp', json_extract(value,'$.bytes'),
                           json_extract(value,'$.width'), json_extract(value,'$.height'), '历史产品',
                           (SELECT name_zh FROM product_staging WHERE id=json_extract(value,'$.sid')), 'r2', 'b2o-products'
                      FROM json_each(?1)`).bind(imgs),
      c.db.prepare(`INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order)
                    SELECT (SELECT id FROM products WHERE site_id=?1 AND slug='legacy-'||json_extract(value,'$.sid')),
                           (SELECT id FROM media WHERE r2_key=json_extract(value,'$.r2_key')), json_extract(value,'$.i')
                      FROM json_each(?2)`).bind(site, imgs),
      c.db.prepare(`UPDATE products SET cover_media=(SELECT media_id FROM product_media WHERE product_id=products.id ORDER BY sort_order LIMIT 1)
                     WHERE site_id=?1 AND cover_media IS NULL AND slug IN (SELECT json_extract(value,'$.slug') FROM json_each(?2))`).bind(site, P),
      c.db.prepare(`UPDATE product_staging SET status='published', site_id=?1, updated_at=datetime('now'),
                           product_id=(SELECT id FROM products WHERE site_id=?1 AND slug='legacy-'||product_staging.id)
                     WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?2))`).bind(site, P),
    ]);
    await logRevision(c.db, 'product_staging', 'publish', null, null, { action: 'publish', site, ids: rows.map((r: any) => r.id) }, c.sess.uid);
    return json({ ok: true, published: rows.length });
  }

  return json({ ok: false, msg: '未知操作' }, 400);
};

/** 审核列表:最近 20 批,或某一批的行。敏感字段(private_json)不回传 */
export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const batch = new URL(request.url).searchParams.get('batch');
  if (batch) {
    const { results } = await c.db.prepare(
      `SELECT id, source_row, status, issues_json, name_zh, category, format, capacity, efficacy, product_id
         FROM product_staging WHERE batch_id=? ORDER BY source_row, id`,
    ).bind(batch).all<any>();
    return json({ ok: true, rows: results ?? [] });
  }
  const { results } = await c.db.prepare(
    `SELECT batch_id, MIN(source_file) file, MIN(created_at) at, COUNT(*) n,
            SUM(status IN ('pending','review','approved')) waiting, SUM(status='published') published
       FROM product_staging GROUP BY batch_id ORDER BY MIN(id) DESC LIMIT 20`,
  ).all<any>();
  return json({ ok: true, batches: results ?? [] });
};
