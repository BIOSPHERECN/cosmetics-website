/**
 * 剂型配图 —— 抓图之后**让视觉模型逐张核对是不是这个东西**,再入库。
 *
 * 为什么要多这一道核对:
 *   上一版的配图是按主题抓的(life / botany / texture),然后按顺序发给各个剂型 ——
 *   于是「面膜」配了一张浴室置物架、「精华油」配了一片叶子。
 *   创始人的原话是「货不对板」,这个判断完全正确:
 *   B 端采购看产品目录是在确认「你到底能做什么」,配图不对等于在答非所问。
 *
 *   而「图对不对」这件事,以前只能靠人一张张看。现在舰队里有能读图的模型,
 *   就该让它先看一遍:一张图是不是「装在滴管瓶里的精华液」,模型判得比文件名准。
 *   这不是炫技 —— 是把一件原本只能靠人力抽查的事变成每次都做的检查。
 *
 * 跑法:node tools/product-shots.mjs
 */
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildFleet, vision } from '../apps/web/src/lib/fleet.ts';

const OUT = 'apps/web/public/media/shots';
mkdirSync(OUT, { recursive: true });
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const d1 = (args) => execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'bohui-cms-v2', '--remote', '--json', ...args],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const q = (sql) => JSON.parse(d1(['--command', sql.replace(/\s+/g, ' ').trim()]).slice(d1.i ?? 0).replace(/^[\s\S]*?\[/, '[')).at(-1).results ?? [];

/* 视觉舰队:能读图的那几家。文本模型看不了图,混在一起只会一路失败到底 */
const FLEET = q(`SELECT id,label,base_url,model,api_keys,tier,can_vision,vision_model FROM providers
                  WHERE enabled=1 AND api_keys<>'' AND can_vision=1 ORDER BY tier,id`)
  .map((r) => ({
    id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
    keys: String(r.api_keys).split(',').map((s) => s.trim()).filter(Boolean),
    vision: true, visionModel: r.vision_model || r.model,
  }));
console.log(`可读图的模型 ${FLEET.length} 家:${FLEET.map((p) => p.id).join(' ')}`);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const curlText = (url, extra = []) => {
  try { return execFileSync('curl', ['-sL', '--max-time', '25', '-A', UA, ...extra, url], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
  catch { return ''; }
};
const curlBin = (url, dest) => {
  try { execFileSync('curl', ['-sL', '--max-time', '30', '-A', UA, '-o', dest, url], { maxBuffer: 1024 }); return existsSync(dest); }
  catch { return false; }
};

/**
 * 每个剂型的检索词 + 给视觉模型的核对标准。
 * 检索词写得越具体越好:「serum」会搜出一堆抽象的水波,
 * 「serum dropper bottle skincare」才搜得到装在滴管瓶里的精华。
 */
/*
 * 每个剂型给一串检索词,由具体到宽泛依次试。
 * Openverse 的检索是 AND 语义:「lipstick lip balm tube cosmetic」四个词全要命中,
 * 实测 0 条;「lipstick cosmetic」两个词就有 60 条。
 * 词写得越长越"精准"是直觉,在 AND 检索里恰恰相反 —— 越长越搜不到东西。
 * 所以策略是:先窄后宽,配合下面那道视觉核对来保证精度 ——
 * 精度交给模型判,召回交给宽词捞。
 */
const FORMATS = [
  { id: 'serum',      file: 'fmt-serum',      want: '一瓶精华液,带滴管的玻璃瓶,护肤品',
    qs: ['serum bottle', 'dropper bottle', 'skincare bottle', 'cosmetic bottle'] },
  { id: 'cream',      file: 'fmt-cream',      want: '一罐面霜或膏霜,广口罐装的护肤品',
    qs: ['cream jar', 'face cream', 'cosmetic jar', 'skin cream'] },
  { id: 'mask',       file: 'fmt-mask',       want: '面膜,片状面膜或敷在脸上的面膜',
    qs: ['sheet mask', 'facial mask', 'face mask beauty'] },
  { id: 'cleanser',   file: 'fmt-cleanser',   want: '洁面产品,软管或泵头瓶装的洁面乳、慕斯、洗面奶',
    qs: ['facial cleanser', 'foam cleanser', 'liquid soap bottle'] },
  { id: 'toothpaste', file: 'fmt-toothpaste', want: '牙膏或口腔护理产品,软管包装',
    qs: ['toothpaste', 'oral care', 'toothbrush'] },
  { id: 'powder',     file: 'fmt-powder',     want: '粉体彩妆,粉饼盒、散粉或眼影盘',
    qs: ['makeup palette', 'face powder', 'eyeshadow palette', 'makeup compact'] },
  { id: 'oil',        file: 'fmt-oil',        want: '护肤油或精华油,玻璃瓶装的油',
    qs: ['facial oil', 'essential oil bottle', 'oil bottle'] },
  { id: 'balm',       file: 'fmt-balm',       want: '唇部产品,唇膏管、口红或润唇膏',
    qs: ['lipstick', 'lip balm', 'lipstick cosmetic'] },
];
/*
 * 图源:Openverse 的 CC0 / 公有领域池(与后台「免费图库」同一个源)。
 *
 * 不用 Unsplash:.env 里的 UNSPLASH_KEY 是空的,不能假装它在。
 * 不用生成模型:实测智谱 cogview-3-flash 能出图且免费,但免费档给的图**带水印**
 *   (返回的文件名就是 _watermark.png)。一张带水印的图挂在公司官网上,
 *   比画的示意图更掉价 —— 所以这条路先不走,等创始人愿意配一个出图 key 再说。
 *
 * CC0 池里美妆产品摄影本来就稀薄(实测 toothpaste tube 是 0 条),
 * 所以配了下面那道视觉核对:搜出来的先让模型看一眼,对不上就换下一张,
 * 十张都对不上就退回画的示意图 —— 宁可画一个对的,也不放一张错的。
 */
function search(qs, n = 12) {
  const api = new URL('https://api.openverse.org/v1/images/');
  api.searchParams.set('q', qs);
  api.searchParams.set('license', 'cc0,pdm');
  api.searchParams.set('page_size', String(n));
  api.searchParams.set('mature', 'false');
  api.searchParams.set('size', 'large');
  const t = curlText(api.toString());
  try {
    return (JSON.parse(t).results ?? [])
      .filter((r) => r.url && (r.width ?? 0) >= 900)
      .map((r) => ({ url: r.url, thumb: r.thumbnail || r.url, by: r.creator ?? '', page: r.foreign_landing_url ?? '', alt: r.title ?? '' }));
  } catch { return []; }
}

/** 让视觉模型判一张图是不是这个剂型。判不了就返回 null,由调用方决定要不要放行 */
async function judge(thumbUrl, want) {
  if (!FLEET.length) return null;
  const tmp = `${OUT}/.judge.jpg`;
  if (!curlBin(thumbUrl, tmp)) return null;
  const b64 = readFileSync(tmp).toString('base64');
  unlinkSync(tmp);
  try {
    const r = await vision(process.env, `data:image/jpeg;base64,${b64}`,
      `这张图的主体是不是「${want}」?\n`
      + '只看主体,背景不算。只回一个 JSON:{"match": true 或 false, "saw": "你实际看到的主体,10 个字以内"}',
      { fleet: FLEET, json: true, maxTokens: 200 });
    const m = /\{[\s\S]*\}/.exec(r.text);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const picked = [];
for (const f of FORMATS.filter((x) => !ONLY.length || ONLY.includes(x.id))) {
  const seen = new Set();
  const cands = [];
  for (const qq of f.qs) {
    for (const c of search(qq, 12)) if (!seen.has(c.url)) { seen.add(c.url); cands.push(c); }
    if (cands.length >= 30) break;
  }
  console.log(`${f.id}:候选 ${cands.length} 张`);
  let hit = null;
  for (const c of cands) {
    const v = await judge(c.thumb, f.want);
    if (v?.match) { hit = { ...c, saw: v.saw }; break; }
    process.stdout.write(`   · ${f.id} 淘汰一张(模型看到:${v?.saw ?? '判不了'})\n`);
  }
  if (!hit) { console.log(`   × ${f.id} 候选里没有一张对得上 —— 退回画的示意图,不放错图`); continue; }
  const dest = `${OUT}/${f.file}.jpg`;
  if (!curlBin(hit.url, dest) || statSync(dest).size < 25000) { console.log(`   × ${f.id} 下载失败`); continue; }
  picked.push({ ...f, ...hit, bytes: statSync(dest).size });
  console.log(`   ✓ ${f.id.padEnd(11)} ${f.file}.jpg  ${Math.round(statSync(dest).size / 1024)}KB  模型看到:${hit.saw}`);
}

/* 入媒体库:让运营在后台看得见、换得掉,而不是只能找我改代码 */
const esc = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const sql = picked.map((p) => `INSERT INTO media (r2_key, filename, mime, bytes, width, height, folder, alt_zh, alt_en, driver, url, source_url, license, creator)
 VALUES (${esc('static/shots/' + p.file + '.jpg')}, ${esc(p.file + '.jpg')}, 'image/jpeg', ${p.bytes}, 1600, 1000, '产品剂型',
 ${esc(p.want)}, ${esc(p.alt || p.id)}, 'url', ${esc('/media/shots/' + p.file + '.jpg')}, ${esc(p.page)}, 'Unsplash', ${esc(p.by)})
 ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes, url=excluded.url, source_url=excluded.source_url, creator=excluded.creator;`).join('\n');
if (sql) {
  writeFileSync('node_modules/.cache/shots.sql', sql, 'utf8');
  d1(['--file', 'node_modules/.cache/shots.sql', '-y']);
  const ids = q(`SELECT id, filename FROM media WHERE folder='产品剂型' ORDER BY id`);
  console.log('\n媒体库:');
  ids.forEach((r) => console.log(`   /media/${r.id}  ${r.filename}`));
  writeFileSync('tools/product-shots.json', JSON.stringify(
    picked.map((p) => ({ id: p.id, file: p.file, mediaId: ids.find((r) => r.filename === p.file + '.jpg')?.id, saw: p.saw, by: p.by, page: p.page })),
    null, 1), 'utf8');
}
console.log(`\n✓ ${picked.length}/${FORMATS.length} 个剂型换上了对得上号的图`);
