/**
 * 中 → 英补丁。
 *
 * 主回填把 en 和 zh-cn 都当**源语言**,只往外译 15 门目标语。
 * 这在原始播种(英文先行)时是对的,但我后来新建的版块是**只写中文**播的 ——
 * 于是它们永远拿不到英文:既不是目标语,又没有源。
 * 表现是 141 个版块里只有 42 个有英文,而英文恰恰是这个外贸站的兜底语言 ——
 * 任何一门译文缺失时,访客看到的就是中文。
 *
 * 这个脚本只做一件事:把有中文、没英文的条目补出英文。
 * 补完之后主回填就能正常从英文往外扇出。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { translateJson, translateBatch, translationFleet } from '../apps/web/src/lib/translate.ts';
import { buildFleet } from '../apps/web/src/lib/fleet.ts';
import { d1 } from './d1.mjs';

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const log = (m) => { console.log(m); };

let fleet = (() => {
  const rows = d1(`SELECT id,label,base_url,model,api_keys,tier,can_image,can_video,can_vision,vision_model,is_free
                     FROM providers WHERE enabled=1 ORDER BY tier,id`);
  const list = rows.map((r) => ({
    id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
    keys: String(r.api_keys || '').split(',').map((s) => s.trim()).filter(Boolean),
    image: !!r.can_image, video: !!r.can_video, vision: !!r.can_vision,
    visionModel: r.vision_model || r.model, free: !!r.is_free,
  })).filter((p) => p.keys.length > 0);
  return list.length ? list : buildFleet(process.env);
})();
const full = fleet.length;
fleet = translationFleet(fleet);
log(`翻译用 ${fleet.length} 家(从 ${full} 家里挑实测最好的):${fleet.map((p) => p.id).join(' → ')}`);

const SITE = process.argv[2] || null;   // 不传就全站点跑
const where = SITE ? `AND p.site_id=${lit(SITE)}` : '';

/* ── 并发池 ─────────────────────────────────────────────── */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0, done = 0, bad = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); }
      catch (e) { out[k] = null; bad++; log(`   × ${items[k].label ?? k}:${String(e.message).slice(0, 70)}`); }
      if (++done % 10 === 0) log(`   …${done}/${items.length}(失败 ${bad})`);
    }
  }));
  return out;
}

const sql = [];

/* ── ① 版块 ─────────────────────────────────────────────── */
const blocks = d1(`SELECT b.id, b.type, i.data_json
                     FROM blocks b
                     JOIN pages p ON p.id = b.page_id
                     JOIN block_i18n i ON i.block_id = b.id AND i.lang = 'zh-cn'
                    WHERE b.is_visible = 1 ${where}
                      AND NOT EXISTS (SELECT 1 FROM block_i18n e WHERE e.block_id = b.id AND e.lang = 'en')`);
log(`\n版块:${blocks.length} 个有中文、缺英文`);
if (blocks.length) {
  await pool(blocks.map((b) => ({ ...b, label: `版块 #${b.id} ${b.type}` })), 4, async (b) => {
    // translateJson 收发都是 JSON 字符串,不是对象 —— 传对象进去它会 JSON.parse('[object Object]')
    const out = await translateJson(process.env, fleet, b.data_json, 'en', `化妆品代工工厂站的「${b.type}」版块`);
    sql.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${b.id},'en',${lit(out)},1,datetime('now'))
              ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=1,mt_at=excluded.mt_at;`);
  });
}

/* ── ② 页面标题与 SEO ───────────────────────────────────── */
const pages = d1(`SELECT p.id, p.slug, i.nav_label, i.title, i.seo_desc
                    FROM pages p JOIN page_i18n i ON i.page_id = p.id AND i.lang = 'zh-cn'
                   WHERE 1=1 ${where}
                     AND NOT EXISTS (SELECT 1 FROM page_i18n e WHERE e.page_id = p.id AND e.lang = 'en')`);
log(`\n页面:${pages.length} 个有中文、缺英文`);
if (pages.length) {
  await pool(pages.map((r) => ({ ...r, label: `页面 /${r.slug}` })), 4, async (r) => {
    const g = await translateBatch(process.env, fleet, [r.nav_label ?? '', r.title ?? '', r.seo_desc ?? ''], 'en', '网站导航名、页面标题与 SEO 描述');
    sql.push(`INSERT INTO page_i18n (page_id,lang,nav_label,title,seo_desc,mt,mt_at)
              VALUES (${r.id},'en',${lit(g['0'] || r.nav_label)},${lit(g['1'] || r.title)},${lit(g['2'] ?? r.seo_desc)},1,datetime('now'))
              ON CONFLICT(page_id,lang) DO UPDATE SET nav_label=excluded.nav_label,title=excluded.title,seo_desc=excluded.seo_desc,mt=1,mt_at=excluded.mt_at;`);
  });
}

if (!sql.length) { log('\n没有需要补的'); process.exit(0); }
const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/en.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
log(`\n写入 ${sql.length} 条英文`);
