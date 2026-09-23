/**
 * 给配方库的活性物补 INCI 名。
 *
 * 起因:AI 智造工作室给韩语访客回的方案里夹着「神经酰胺」「胆固醇」「尿囊素」。
 * 追下去不是模型的问题 —— **库里的原料名本来就是中文**,模型翻掉了大部分、漏了几个。
 *
 * 正确的做法不是"把中文翻得更干净",是根本不该翻:
 * 化妆品原料在 B2B 场景里的国际通行写法是 INCI(国际化妆品原料命名),
 * 韩国、巴西、沙特的采购看的都是 Sodium Hyaluronate,不是本国语的音译 ——
 * 音译过去他反而对不上自己手里的规格书。
 *
 * 所以给每个活性物挂一个 inci 字段,并把喂给模型的 ai_summary 换成 INCI 写法。
 * 中文名保留在 name 里,后台和中文站照常用。
 *
 * 复配类(「氨基酸表活复配」「蜡体复配」)不是单一原料,没有 INCI 号,
 * 给一个通行的英文描述 —— 硬编一个假的 INCI 比留空更糟。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}
const W = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const run = (a) => execFileSync(process.execPath, [W, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json', ...a],
  { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const q = (sql) => { const o = run(['--command', sql.replace(/\s+/g, ' ').trim()]); const j = JSON.parse(o.slice(o.indexOf('['))); return j[j.length - 1].results ?? []; };
const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/** 中文名 → INCI(单一原料)或通行英文描述(复配/体系类) */
const INCI = {
  '透明质酸钠': 'Sodium Hyaluronate',
  '多重透明质酸': 'Sodium Hyaluronate (multi-weight)',
  '泛醇': 'Panthenol',
  '烟酰胺': 'Niacinamide',
  'α-熊果苷': 'Alpha-Arbutin',
  '传明酸': 'Tranexamic Acid',
  '维生素C衍生物': 'Ascorbyl Glucoside',
  '视黄醇': 'Retinol',
  '神经酰胺NP': 'Ceramide NP',
  '胆固醇': 'Cholesterol',
  '尿囊素': 'Allantoin',
  '甘油': 'Glycerin',
  '甜菜碱': 'Betaine',
  '海藻糖': 'Trehalose',
  '木糖醇': 'Xylitol',
  '生育酚': 'Tocopherol',
  '角鲨烷': 'Squalane',
  '辛酸/癸酸甘油三酯': 'Caprylic/Capric Triglyceride',
  '乳木果油': 'Butyrospermum Parkii (Shea) Butter',
  '红没药醇': 'Bisabolol',
  '积雪草提取物': 'Centella Asiatica Extract',
  '积雪草苷': 'Asiaticoside',
  '水杨酸': 'Salicylic Acid',
  '二氧化钛': 'Titanium Dioxide',
  '云母': 'Mica',
  '硅石': 'Silica',
  '水合硅石': 'Hydrated Silica',
  '高岭土': 'Kaolin',
  '活性炭': 'Charcoal Powder',
  '羟基磷灰石': 'Hydroxyapatite',
  '西吡氯铵': 'Cetylpyridinium Chloride',
  '锌盐': 'Zinc Citrate',
  // 以下是复配/体系,没有单一 INCI 号 —— 给行业通行的英文说法
  '胜肽复合物': 'Peptide complex',
  '成膜剂': 'Film former',
  '植物油相': 'Plant oil phase',
  '冷压植物油复配': 'Cold-pressed plant oil blend',
  '氨基酸表活复配': 'Amino-acid surfactant blend',
  '温和非离子表活': 'Mild non-ionic surfactant',
  '皂基复配': 'Soap-base blend',
  '蜡体复配': 'Wax blend',
  '滑石粉替代体系': 'Talc-free filler system',
  '口腔益生菌冻干粉': 'Freeze-dried oral probiotics',
};

const rows = q(`SELECT code, actives_json, ai_summary FROM formulas ORDER BY code`);
const missing = new Set();
const stmts = [];

for (const r of rows) {
  let actives;
  try { actives = JSON.parse(r.actives_json); } catch { continue; }
  if (!Array.isArray(actives)) continue;

  const next = actives.map((a) => {
    const inci = INCI[a.name];
    if (!inci) missing.add(a.name);
    return inci ? { ...a, inci } : a;
  });

  // ai_summary 是喂给模型的检索文本,把活性物段换成 INCI 写法
  let sum = r.ai_summary ?? '';
  for (const a of next) if (a.inci) sum = sum.split(a.name).join(a.inci);

  stmts.push(`UPDATE formulas SET actives_json=${lit(JSON.stringify(next))}, ai_summary=${lit(sum)} WHERE code=${lit(r.code)};`);
}

if (missing.size) console.log('★ 没有 INCI 映射的原料:', [...missing].join('、'));
mkdirSync('node_modules/.cache', { recursive: true });
writeFileSync('node_modules/.cache/inci.sql', stmts.join('\n'), 'utf8');
run(['--file', 'node_modules/.cache/inci.sql', '-y']);
console.log(`已给 ${rows.length} 条配方补 INCI(${Object.keys(INCI).length} 种原料映射)`);
