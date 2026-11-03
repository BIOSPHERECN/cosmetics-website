/**
 * 把新入库的实拍图换进对应版块。
 * 只替换**画面确实对得上**的那几处;对不上的宁可留着原来的 AI 图,不硬塞。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder='帛卉实拍'`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
const P = (n) => { const v = M[n]; if (!v) throw new Error('图库里没有 ' + n); return v; };

const blocks = d1(`SELECT b.id, b.type, b.sort_order, i.data_json
                     FROM blocks b JOIN pages p ON p.id=b.page_id
                     JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                    WHERE p.site_id='biosphere-ai' AND p.slug='' AND b.is_visible=1
                    ORDER BY b.sort_order`);

const edits = [];
for (const b of blocks) {
  const d = JSON.parse(b.data_json);
  let touched = false;

  // 工序流程带:称料 / 乳化 / 灌装三步有真图
  if (b.type === 'procribbon' && Array.isArray(d.steps) && /七道/.test(d.title || '')) {
    const map = { '称量配料': 'weighing-room-w720', '真空乳化': 'emulsify-hall-w720', '灌装旋盖': 'filling-line-w720' };
    for (const s of d.steps) if (map[s.name]) { s.image = P(map[s.name]); touched = true; }
  }
  // 生产实力网格:乳化车间与灌装线
  if (b.type === 'procgrid' && Array.isArray(d.items)) {
    const map = { '乳化车间': 'emulsify-hall-w720', '灌装线': 'filling-line-w720',
                  '研发团队': 'rnd-office-w720', '客户洽谈': 'meeting-room-w720',
                  '办公区': 'rnd-office-w720', '配方实验室': 'weighing-room-w720' };
    for (const it of d.items) if (map[it.label]) { it.image = P(map[it.label]); touched = true; }
  }
  // 通栏大图:换成车间分区走廊(这张厂名写对了「帛卉」)
  if (b.type === 'bandimg') {
    d.image = P('workshop-corridor-w1600');
    d.alt = '帛卉草本美妆 AI 智造平台车间分区:原料预处理到冷链仓储';
    touched = true;
  }
  if (touched) edits.push([b.id, d]);
}

// 企业文化那块只有文字,给它前面加一条通栏走廊图 —— 「AI 智造走廊」正是企业文化墙
const stmt = blocks.find((b) => b.type === 'statement' && /查证/.test(JSON.parse(b.data_json).title || ''));
const extra = [];
if (stmt) {
  const nid = (d1(`SELECT MAX(id) m FROM blocks`)[0].m ?? 0) + 1;
  const pid = d1(`SELECT p.id FROM pages p WHERE p.site_id='biosphere-ai' AND p.slug='' LIMIT 1`)[0].id;
  extra.push(`INSERT INTO blocks (id,page_id,type,sort_order,config_json,is_visible) VALUES (${nid},${pid},'bandimg',${stmt.sort_order - 5},'{}',1);`);
  extra.push(`INSERT INTO block_i18n (block_id,lang,data_json,mt,mt_at) VALUES (${nid},'zh-cn',${lit(JSON.stringify({
    image: P('culture-corridor-w1600'),
    alt: 'AI 智造走廊:从草本原料到智能护肤方案',
    display: 'CULTURE', title: '从草本原料到成品,这条走廊上写着的就是我们做事的顺序',
    ctaText: '看公司介绍', ctaHref: '/zh-cn/about/',
  }))},0,datetime('now')) ON CONFLICT(block_id,lang) DO UPDATE SET data_json=excluded.data_json;`);
}

const sql = [...edits.map(([id, d]) =>
  `UPDATE block_i18n SET data_json=${lit(JSON.stringify(d))}, mt=0, mt_at=datetime('now') WHERE block_id=${id} AND lang='zh-cn';`), ...extra];
const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/assign.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });
console.log(`换图:${edits.length} 个版块${extra.length ? ',新增 1 块通栏(企业文化走廊)' : ''}`);
for (const [id, d] of edits) console.log(`  #${id} ${d.title || d.eyebrow || ''}`.slice(0, 70));
