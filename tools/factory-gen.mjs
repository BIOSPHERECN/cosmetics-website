/**
 * 工厂实力图 —— 用出图模型生成,不再去 CC0 池里捞。
 *
 * ══ 为什么换路子 ══
 *   CC0 池里根本没有化妆品工厂的照片。实测:搜 "factory production line"
 *   抓回来的是**汽车厂和鸡蛋厂**,搜 "laboratory" 里混着一张飞机。
 *   模型判「这是工厂生产线」没错,错在那个池子里就没有我们要的东西 ——
 *   在没有的地方反复筛,再精的筛子也筛不出来。
 *
 *   而出图模型 agnes-image-2.1-flash **早就配在你们自己的网关里**(/api/design 用的就是它)。
 *   实测:1248×832、无水印、视觉模型判「制药/生物技术车间」、质量 4/5。
 *   我先前说"出图会带水印",是拿智谱免费档的结论套到了 Agnes 头上,没实测就下了结论。
 *
 * ══ 生成图的两条纪律 ══
 *   ① **统一视觉**:20 张图要看起来像同一个厂,不是二十张随机图库照片。
 *      所以每条提示词后面都缀同一段风格描述(光线、白平衡、景深、构图),
 *      这是"一个工厂"和"一堆素材"的区别。
 *   ② **不生成事实性内容**:证书上的编号、客户 logo、专利文号、慈善照片
 *      一律不生成 —— 那不是配图,那是伪造凭证。
 *      这类版块只出"场景"(比如一面证书墙的空间感),内容留空等真材料。
 *
 * 跑法:node tools/factory-gen.mjs [只跑某几个 id]
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { vision } from '../apps/web/src/lib/fleet.ts';

const OUT = 'apps/web/public/media/factory';
mkdirSync(OUT, { recursive: true });
mkdirSync('node_modules/.cache', { recursive: true });
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const d1 = (args) => execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json', ...args],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const q = (sql) => {
  const out = d1(['--command', sql.replace(/\s+/g, ' ').trim()]);
  const j = JSON.parse(out.slice(out.indexOf('[')));
  return j[j.length - 1].results ?? [];
};

const AGNES_KEY = q(`SELECT api_keys FROM providers WHERE id='agnes'`)[0]?.api_keys?.split(',')[0]?.trim();
if (!AGNES_KEY) { console.error('拿不到 Agnes key'); process.exit(1); }

const FLEET = q(`SELECT id,label,base_url,model,api_keys,tier,vision_model FROM providers
                  WHERE enabled=1 AND api_keys<>'' AND can_vision=1 ORDER BY tier,id`)
  .map((r) => ({
    id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
    keys: String(r.api_keys).split(',').map((s) => s.trim()).filter(Boolean),
    vision: true, visionModel: r.vision_model || r.model,
  }));

/**
 * 统一风格后缀 —— 这一段决定了二十张图看起来是不是同一个厂。
 * 明确写 no text / no logos:出图模型写出来的字几乎都是乱码,
 * 而一张带乱码文字的图,比没有图更露怯。
 */
const STYLE = 'photorealistic industrial photography, bright even daylight, '
  + 'cool neutral white balance, clean uncluttered composition, subtle depth of field, '
  + 'modern well-maintained facility, no text, no letters, no logos, no watermark, '
  + 'no brand names, professional corporate photography, 3:2 landscape';

const SHOTS = [
  // ── 生产线 ─────────────────────────────────────────
  { id: 'line-emulsify', zh: '乳化车间',
    p: 'interior of a modern cosmetics manufacturing plant, row of large stainless steel emulsifying tanks with pipework and control valves, polished light grey epoxy floor, two technicians in white coveralls and hairnets checking a panel' },
  { id: 'line-filling', zh: '灌装线',
    p: 'automated cosmetics filling line, clear glass and white plastic bottles moving along a stainless steel conveyor under a filling head, machine guards, clean bright factory hall' },
  { id: 'line-capping', zh: '封口与旋盖',
    p: 'automated capping machine sealing cosmetic bottles on a conveyor, stainless steel rotary capper, bottles in neat rows, bright clean production hall' },
  { id: 'line-labeling', zh: '贴标与包装',
    p: 'labeling and cartoning station in a cosmetics factory, operators in white uniforms placing bottles into cartons, stainless steel worktables, bright clean environment' },
  { id: 'line-powder', zh: '粉体压制',
    p: 'cosmetic powder pressing workshop, compact powder pans on a stainless steel press, technician in white coverall and gloves, clean bright industrial room' },

  // ── 洁净与合规 ─────────────────────────────────────
  { id: 'cleanroom', zh: '洁净车间',
    p: 'pharmaceutical grade cleanroom interior, white wall panels, laminar flow ceiling, air shower entrance, two technicians in full white coveralls with hoods and masks' },
  { id: 'gowning', zh: '更衣与风淋',
    p: 'cleanroom gowning area with stainless steel benches, hanging white coveralls, air shower door, bright clinical lighting' },

  // ── 研发 ───────────────────────────────────────────
  { id: 'lab-formulation', zh: '配方实验室',
    p: 'cosmetics formulation laboratory, white benchtop with glass beakers of cream and serum, pipettes, small overhead stirrer, chemist in white lab coat and gloves working' },
  { id: 'lab-analysis', zh: '分析检测',
    p: 'analytical laboratory with HPLC and spectrophotometer instruments on a white bench, sample vials in a rack, scientist in lab coat reading a screen' },
  { id: 'lab-micro', zh: '微生物检测',
    p: 'microbiology laboratory, petri dishes in a laminar flow hood, incubator cabinet, technician in lab coat and gloves handling a sample plate' },
  { id: 'lab-stability', zh: '稳定性测试',
    p: 'stability testing chamber room, rows of cosmetic jars and bottles inside glass fronted climate cabinets, digital temperature displays, clean bright lab' },

  // ── 原料与包材 ─────────────────────────────────────
  { id: 'material', zh: '原料仓',
    p: 'raw material storage room in a cosmetics factory, labelled stainless steel drums and sealed white sacks on pallet racking, clean bright warehouse' },
  { id: 'packaging', zh: '包材陈列',
    p: 'display wall of empty cosmetic packaging, glass dropper bottles, airless pump bottles, cream jars and squeeze tubes arranged in neat rows on white shelves, studio lighting' },
  { id: 'herb-field', zh: '药材种植',
    p: 'terraced herb cultivation field on a green hillside at golden hour, rows of medicinal plants, distant mountains, soft warm light' },

  // ── 仓储与交付 ─────────────────────────────────────
  { id: 'warehouse', zh: '成品仓',
    p: 'finished goods warehouse, tall pallet racking stacked with sealed brown cartons, forklift in the aisle, bright overhead lighting, polished concrete floor' },
  { id: 'shipping', zh: '发货装柜',
    p: 'loading dock of a factory, cartons on pallets being loaded into a shipping container, warehouse worker with a pallet jack, daylight through the dock door' },

  // ── 团队与场所 ─────────────────────────────────────
  { id: 'team-rnd', zh: '研发团队',
    p: 'group of five research scientists in white lab coats standing together in a bright modern laboratory, confident professional group portrait' },
  { id: 'meeting', zh: '客户洽谈',
    p: 'business meeting in a bright modern conference room, four people around a light wood table with product samples and a laptop, floor to ceiling windows' },
  { id: 'office', zh: '办公区',
    p: 'open plan modern office interior, light wood desks, green plants, large windows with daylight, a few people working' },
  { id: 'exterior', zh: '厂区外观',
    p: 'exterior of a modern white industrial building with large glass frontage, landscaped lawn and trees, clear blue sky, wide architectural photograph' },

  // ── 展示 ───────────────────────────────────────────
  { id: 'showroom', zh: '产品展厅',
    p: 'cosmetics product showroom interior, backlit white display shelves with rows of skincare bottles and jars, warm accent lighting, polished floor' },
  { id: 'expo', zh: '展会展台',
    p: 'trade show exhibition booth for a cosmetics manufacturer, clean white booth with product display counters and bright lighting, visitors walking past in a convention hall' },
  /* 证书墙只出**空间感**,不生成任何证书内容 ——
     生成一张写着编号的假证书,那不是配图,是伪造凭证。 */
  { id: 'cert-wall', zh: '资质墙(空间)',
    p: 'corporate certificate display wall in a company lobby, rows of empty blank picture frames on a dark red backdrop with spotlights, no text or writing of any kind on the frames' },
];

/* 出图 */
async function gen(prompt) {
  const r = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGNES_KEY}` },
    body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt, n: 1, size: '1536x1024' }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`出图 ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const d = await r.json();
  const url = d?.data?.[0]?.url;
  if (!url) throw new Error('出图未返回地址');
  return url;
}

/** 生成完还要验:行业对不对、有没有乱码文字、好不好看 */
async function check(file, want) {
  const b64 = readFileSync(file).toString('base64');
  const r = await vision(process.env, `data:image/png;base64,${b64}`,
    `这张图想表达的是「${want}」。只回 JSON,不要解释:\n`
    + '{"ok": 是否符合(true/false), "text": 画面里是否出现了文字或字母(true/false), '
    + '"industry": "你判断的行业", "score": 1到5的画面质量分, "saw": "20字以内描述"}',
    { fleet: FLEET, json: true, maxTokens: 240 });
  const m = /\{[\s\S]*\}/.exec(r.text);
  return m ? JSON.parse(m[0]) : null;
}

const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const list = SHOTS.filter((s) => !ONLY.length || ONLY.includes(s.id));
console.log(`出图 ${list.length} 张(每张生成后过视觉核对,不合格重试一次)\n`);

const done = [];
for (const shot of list) {
  const dest = `${OUT}/${shot.id}.png`;
  let ok = false;
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    try {
      /* 重试时把"不要文字"的要求加重 —— 出图模型最常见的失败就是写字 */
      const extra = attempt === 2 ? ', absolutely no signage, no printed words anywhere in the frame' : '';
      const url = await gen(`${shot.p}, ${STYLE}${extra}`);
      const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(120_000) })).arrayBuffer());
      writeFileSync(dest, buf);
      const v = await check(dest, shot.zh);
      if (!v) { console.log(`   ? ${shot.zh} 视觉核对无结果,姑且保留`); ok = true; break; }
      if (v.ok && !v.text && (Number(v.score) || 0) >= 3) {
        ok = true;
        done.push({ ...shot, bytes: buf.length, saw: v.saw, score: Number(v.score) || 3 });
        console.log(`   ✓ ${shot.zh.padEnd(12)} ${(buf.length / 1024).toFixed(0)}KB  ${'★'.repeat(Number(v.score) || 3)}  ${v.saw}`);
      } else {
        console.log(`   ↻ ${shot.zh.padEnd(12)} 第 ${attempt} 次不合格(${v.text ? '画面有文字' : ''}${!v.ok ? ' 内容不符' : ''}${(Number(v.score) || 0) < 3 ? ' 质量偏低' : ''})— ${v.saw}`);
      }
    } catch (e) {
      console.log(`   × ${shot.zh.padEnd(12)} ${String(e.message).slice(0, 70)}`);
      break;
    }
  }
}

/* 入媒体库 */
const esc = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const sql = done.map((p) => `INSERT INTO media (r2_key, filename, mime, bytes, width, height, folder, alt_zh, alt_en, driver, url, license, creator)
 VALUES (${esc('static/factory/' + p.id + '.png')}, ${esc(p.id + '.png')}, 'image/png', ${p.bytes}, 1536, 1024, '工厂实力',
 ${esc(p.zh)}, ${esc(p.id)}, 'url', ${esc('/media/factory/' + p.id + '.png')}, 'AI 生成 · agnes-image-2.1-flash', '帛卉')
 ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes, alt_zh=excluded.alt_zh, url=excluded.url;`).join('\n');
if (sql) {
  writeFileSync('node_modules/.cache/factory-gen.sql', sql, 'utf8');
  d1(['--file', 'node_modules/.cache/factory-gen.sql', '-y']);
  const rows = q(`SELECT id, filename, alt_zh FROM media WHERE folder='工厂实力' ORDER BY id`);
  console.log(`\n媒体库「工厂实力」共 ${rows.length} 张:`);
  rows.forEach((r) => console.log(`   /media/${String(r.id).padEnd(4)} ${String(r.filename).padEnd(22)} ${r.alt_zh}`));
}
console.log(`\n✓ 出图 ${done.length}/${list.length} 张,全部通过视觉核对`);
console.log('  统一了光线、白平衡、景深与构图 —— 二十多张看起来像同一个厂,不是一堆图库照片。');
console.log('  证书墙只出空间感,不生成任何证书内容 —— 生成带编号的假证书是伪造凭证,不是配图。');
