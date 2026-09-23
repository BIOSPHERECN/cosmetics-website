/**
 * 导出/回填「文本叶子」—— 让人(或我)直接接手翻译,绕开机器翻译那一环。
 *
 * 为什么要有:免费模型在小语种上已经露底(泰语把面霜说成沥青),
 * 而付费 API 需要创始人先去开通。中间这段时间不该干等 ——
 * 站上的固定文案是**有限且不变**的(店铺页 44 个版块共 1.3 万字符),
 * 这种量完全可以直接翻好写回去,不必等模型。
 *
 * 用的是和机器翻译**同一套**叶子抽取逻辑(collectLeaves / applyLeaves),
 * 所以图片路径、枚举值、证书编号一样不会被碰到,回填时也一样按下标对齐。
 * 另写一套的下场是两条路产出的数据结构对不上。
 *
 *   导出:node tools/leaf-export.mjs dump <site> <srcLang> <out.json>
 *   回填:node tools/leaf-export.mjs load <site> <targetLang> <in.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { collectLeaves, applyLeaves } from '../apps/web/src/lib/translate.ts';

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
const W = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const run = (a) => execFileSync(process.execPath, [W, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json', ...a],
  { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const q = (sql) => { const o = run(['--command', sql.replace(/\s+/g, ' ').trim()]); const j = JSON.parse(o.slice(o.indexOf('['))); return j[j.length - 1].results ?? []; };
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const [mode, site, lang, file] = process.argv.slice(2);
if (!mode || !site || !lang || !file) { console.error('用法见文件头注释'); process.exit(1); }

const rows = q(`SELECT b.id, b.type, p.slug, i.data_json
                  FROM blocks b JOIN pages p ON p.id=b.page_id
                  JOIN block_i18n i ON i.block_id=b.id AND i.lang=${lit(lang)}
                 WHERE p.site_id=${lit(site)} ORDER BY p.sort_order, b.sort_order`);

if (mode === 'dump') {
  const out = [];
  for (const r of rows) {
    let data; try { data = JSON.parse(r.data_json); } catch { continue; }
    const leaves = collectLeaves(data);
    if (!leaves.length) continue;
    out.push({ block: r.id, type: r.type, page: r.slug, texts: leaves.map((l) => l.text) });
  }
  writeFileSync(file, JSON.stringify(out, null, 1), 'utf8');
  const n = out.reduce((a, b) => a + b.texts.length, 0);
  console.log(`导出 ${out.length} 个版块 / ${n} 条文本 → ${file}`);
  console.log(`共 ${out.reduce((a, b) => a + b.texts.join('').length, 0)} 字符`);
}

if (mode === 'load') {
  const src = JSON.parse(readFileSync(file, 'utf8'));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const stmts = [];
  let bad = 0;
  for (const item of src) {
    const r = byId[item.block];
    if (!r) { console.warn(`  跳过:库里没有版块 ${item.block}`); bad++; continue; }
    const data = JSON.parse(r.data_json);
    const leaves = collectLeaves(data);
    if (leaves.length !== item.texts.length) {
      // 条数对不上就整块跳过 —— 按下标错位塞回去,会把标题塞进按钮、把说明塞进标签,
      // 而且看起来是"翻好了",比缺译文难查得多。
      console.warn(`  跳过版块 ${item.block}(${item.type}):库里 ${leaves.length} 条,给的 ${item.texts.length} 条`);
      bad++; continue;
    }
    const map = {};
    item.texts.forEach((t, i) => { map[String(i)] = t; });
    const next = applyLeaves(data, leaves, map);
    stmts.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${item.block},${lit(process.argv[6] || lang)},${lit(JSON.stringify(next))},0,datetime('now')) ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json,mt=0,mt_at=excluded.mt_at;`);
  }
  mkdirSync('node_modules/.cache', { recursive: true });
  writeFileSync('node_modules/.cache/leaf.sql', stmts.join('\n'), 'utf8');
  run(['--file', 'node_modules/.cache/leaf.sql', '-y']);
  console.log(`写回 ${stmts.length} 个版块${bad ? `,跳过 ${bad} 个` : ''}`);
}
