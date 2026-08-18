/**
 * 首翻回填 —— 一次性把库里缺的译文全部补上。
 *
 * 为什么不在后台点按钮跑:
 *   首翻是 1100 多条,浏览器开着一小时不能关,中途切个页面就断。
 *   之后的日常增量(改一页、加一个版块)才是后台那颗按钮的活儿 —— 几条几十条,点一下就完。
 *   所以两条路并存,分工不同,但**共用同一份翻译逻辑**:
 *   本文件直接 import apps/web/src/lib/translate.ts,不另写一套。
 *   另写一套的下场是两边慢慢跑偏,线上翻出来的和这里翻出来的不是一个味儿。
 *
 * 跑法:node tools/translate-backfill.mjs [语种…]
 *      node tools/translate-backfill.mjs            # 补齐全部已上线语种
 *      node tools/translate-backfill.mjs id ms fr   # 只补这三种
 */
import { readFileSync, writeFileSync, mkdirSync, writeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildFleet } from '../apps/web/src/lib/fleet.ts';
import { translateJson, translateBatch, TARGETS } from '../apps/web/src/lib/translate.ts';

const DB = 'bohui-cms-v2';
/* 输出改成同步写 fd 1：node 的 stdout 一旦被管道接走就变成块缓冲，
   跑一小时看不到一行，人只能盯着黑屏猜它是不是死了。 */
const log = (m) => { try { writeSync(1, m + String.fromCharCode(10)); } catch { log(m); } };
const TMP = 'node_modules/.cache/tr';
mkdirSync(TMP, { recursive: true });

/* ── .env → 环境变量(舰队从这里取 key,与线上同一批) ─────────── */
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
/* 舰队的正式真源是**数据库**,不是环境变量 ——
   创始人是在后台页面填的 key,只读 .env 会得到一个空舰队然后干等着。
   .env 只当兜底,和线上 loadFleet 的优先级完全一致。 */
/* ── D1 读写（wrangler 是唯一入口，不直连 HTTP API）─────────────
   读用 --command，写用 --file，两者不能互换：
   --file 回的 JSON 里只有「执行了几条、读了几行」的汇总，拿不到结果集；
   而 --command 有命令行长度上限，装不下成百条写入。
   这一条踩过：当时统一用 --file，每次查询都返回 1 行汇总，
   看起来就像「库里没数据」—— 既不报错也不空手，最耗时间。 */
/* 直接跑 wrangler 的 JS 入口，不经 npx：
   Node 25 起禁止在 shell:false 下 spawn .cmd（EINVAL），而开 shell 又要为 SQL 里的
   引号和空格做一层转义 —— 转义写错是最难查的一类 bug。绕开两边，直接喂脚本路径。 */
const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const wrangler = (args) => execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', ...args],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

function q(sql) {
  const out = wrangler(['--command', sql.replace(/[\s　]+/g, ' ').trim()]);
  const j = JSON.parse(out.slice(out.indexOf('[')));
  return j[j.length - 1].results ?? [];
}
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/** 写回：按 90KB 切片提交 —— D1 远程 --file 有大小上限，超了整批静默失败 */
function exec(statements) {
  const f = `${TMP}/w.sql`;
  let buf = '';
  const flush = () => { if (!buf) return; writeFileSync(f, buf, 'utf8'); wrangler(['--file', f, '-y']); buf = ''; };
  for (const st of statements) {
    if (buf.length + st.length > 90_000) flush();
    buf += st + String.fromCharCode(10);
  }
  flush();
}

const fleet = (() => {
  const rows = q(`SELECT id,label,base_url,model,api_keys,tier,can_image,can_video,can_vision,vision_model,is_free
                    FROM providers WHERE enabled=1 ORDER BY tier,id`);
  const list = rows.map((r) => ({
    id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
    keys: String(r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
    image: !!r.can_image, video: !!r.can_video, vision: !!r.can_vision,
    visionModel: r.vision_model || r.model, free: !!r.is_free,
  })).filter((p) => p.keys.length > 0);
  return list.length ? list : buildFleet(process.env);
})();
if (!fleet.length) { console.error('没有可用的模型 key(库里和 .env 都没有)'); process.exit(1); }
log(`舰队 ${fleet.length} 家:${fleet.map((p) => p.id).join(' → ')}`);

/* ── 并发池:模型调用是网络等待,串行跑完要几个小时 ───────────── */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0, ok = 0, bad = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); ok++; }
      catch (e) { out[k] = null; bad++; log(`   × ${items[k].label ?? k}:${String(e.message).slice(0, 90)}`); }
      if ((ok + bad) % 10 === 0) process.stdout.write(`   …${ok + bad}/${items.length}(失败 ${bad})\n`);
    }
  }));
  return out.filter(Boolean);
}

const PRI = `CASE i.lang WHEN 'en' THEN 0 WHEN 'zh-cn' THEN 1 ELSE 2 END`;
const argLangs = process.argv.slice(2).filter((a) => TARGETS[a]);
const LANGS = argLangs.length ? argLangs : ['ja', 'id', 'ms', 'fr'];

for (const site of q(`SELECT id FROM sites ORDER BY sort_order`).map((r) => r.id)) {
  for (const lang of LANGS) {
    const name = TARGETS[lang].name;

    /* ① 站点介绍 */
    const s1 = q(`SELECT i.name, i.tagline, i.description FROM site_i18n i
                   WHERE i.site_id=${lit(site)} AND i.lang IN ('en','zh-cn')
                     AND NOT EXISTS (SELECT 1 FROM site_i18n x WHERE x.site_id=i.site_id AND x.lang=${lit(lang)})
                   ORDER BY ${PRI} LIMIT 1`);
    /* ② 页面标题 */
    const s2 = q(`SELECT p.id, p.slug, i.nav_label, i.title, i.seo_desc, MIN(${PRI}) AS _p FROM pages p
                    JOIN page_i18n i ON i.page_id=p.id AND i.lang IN ('en','zh-cn')
                   WHERE p.site_id=${lit(site)}
                     AND NOT EXISTS (SELECT 1 FROM page_i18n x WHERE x.page_id=p.id AND x.lang=${lit(lang)})
                   GROUP BY p.id`);
    /* ③ 版块正文 */
    const s3 = q(`SELECT b.id, b.type, p.slug, i.data_json, MIN(${PRI}) AS _p FROM blocks b
                    JOIN pages p ON p.id=b.page_id
                    JOIN block_i18n i ON i.block_id=b.id AND i.lang IN ('en','zh-cn')
                   WHERE p.site_id=${lit(site)}
                     AND NOT EXISTS (SELECT 1 FROM block_i18n x WHERE x.block_id=b.id AND x.lang=${lit(lang)})
                   GROUP BY b.id`);
    /* ④ 产品 */
    const s4 = q(`SELECT p.id, i.name, i.summary, i.description, i.specs_json, i.highlights_json, MIN(${PRI}) AS _p
                    FROM products p JOIN product_i18n i ON i.product_id=p.id AND i.lang IN ('en','zh-cn')
                   WHERE p.site_id=${lit(site)}
                     AND NOT EXISTS (SELECT 1 FROM product_i18n x WHERE x.product_id=p.id AND x.lang=${lit(lang)})
                   GROUP BY p.id`);

    const total = s1.length + s2.length + s3.length + s4.length;
    if (!total) { log(`\n${site} · ${name} —— 已齐全`); continue; }
    log(`\n${site} · ${name} —— 待翻 ${total} 条(站点 ${s1.length} / 页面 ${s2.length} / 版块 ${s3.length} / 产品 ${s4.length})`);

    const sql = [];
    const MT = `1, datetime('now')`;

    for (const r of s1) {
      const g = await translateBatch(process.env, fleet, [r.name ?? '', r.tagline ?? '', r.description ?? ''], lang, '站点品牌名与一句话定位');
      sql.push(`INSERT INTO site_i18n (site_id,lang,name,tagline,description,mt,mt_at) VALUES (${lit(site)},${lit(lang)},${lit(g['0'] || r.name)},${lit(g['1'] ?? r.tagline)},${lit(g['2'] ?? r.description)},${MT}) ON CONFLICT(site_id,lang) DO UPDATE SET name=excluded.name,tagline=excluded.tagline,description=excluded.description,mt=1,mt_at=excluded.mt_at;`);
    }

    (await pool(s2.map((r) => ({ ...r, label: `页面 /${r.slug}` })), 6, async (r) => {
      const g = await translateBatch(process.env, fleet, [r.nav_label ?? '', r.title ?? '', r.seo_desc ?? ''], lang,
        `网站页面「${r.slug || '首页'}」的导航标签、页面标题、SEO 描述`);
      return `INSERT INTO page_i18n (page_id,lang,nav_label,title,seo_desc,mt,mt_at) VALUES (${r.id},${lit(lang)},${lit(g['0'] || r.nav_label)},${lit(g['1'] || r.title)},${lit(g['2'] ?? r.seo_desc)},${MT}) ON CONFLICT(page_id,lang) DO UPDATE SET nav_label=excluded.nav_label,title=excluded.title,seo_desc=excluded.seo_desc,mt=1,mt_at=excluded.mt_at;`;
    })).forEach((x) => sql.push(x));

    (await pool(s3.map((r) => ({ ...r, label: `/${r.slug} 的 ${r.type}` })), 6, async (r) => {
      const out = await translateJson(process.env, fleet, r.data_json, lang,
        `网站页面「${r.slug || '首页'}」上的「${r.type}」版块文案`);
      return `INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${r.id},${lit(lang)},${lit(out)},${MT}) ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=1,mt_at=excluded.mt_at;`;
    })).forEach((x) => sql.push(x));

    (await pool(s4.map((r) => ({ ...r, label: `产品 ${r.name}` })), 4, async (r) => {
      const g = await translateBatch(process.env, fleet, [r.name ?? '', r.summary ?? '', r.description ?? ''], lang, `产品「${r.name}」的名称、摘要、详情`);
      const sp = await translateJson(process.env, fleet, r.specs_json || '[]', lang, '产品规格参数表');
      const hl = await translateJson(process.env, fleet, r.highlights_json || '[]', lang, '产品成分亮点');
      return `INSERT INTO product_i18n (product_id,lang,name,summary,description,specs_json,highlights_json,mt,mt_at) VALUES (${r.id},${lit(lang)},${lit(g['0'] || r.name)},${lit(g['1'] ?? r.summary)},${lit(g['2'] ?? r.description)},${lit(sp)},${lit(hl)},${MT}) ON CONFLICT(product_id,lang) DO UPDATE SET name=excluded.name,summary=excluded.summary,description=excluded.description,specs_json=excluded.specs_json,highlights_json=excluded.highlights_json,mt=1,mt_at=excluded.mt_at;`;
    })).forEach((x) => sql.push(x));

    if (sql.length) { exec(sql); log(`   ✓ ${site} · ${name} 入库 ${sql.length}/${total} 条`); }
  }
}

log('\n══ 回填结束,复核统计 ══');
for (const r of q(`SELECT lang, COUNT(*) n, SUM(mt) mt FROM block_i18n GROUP BY lang ORDER BY lang`)) {
  log(`  版块 ${String(r.lang).padEnd(6)} ${String(r.n).padStart(4)} 条(机器译 ${r.mt ?? 0})`);
}
