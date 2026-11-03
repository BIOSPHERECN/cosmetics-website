/**
 * 工厂实力图 —— 阿里工厂店铺那一套版块需要的素材。
 *
 * ══ 为什么不从阿里店铺上抓 ══
 *   那些图属于各家工厂自己,抓来放我们站上是两个问题叠在一起:
 *     ① 版权:是别人拍的照片
 *     ② 更要命的是**失实** —— 把别人的车间当成帛卉的车间展示给客户看。
 *        这不是配图好不好看的问题,是对自己产能的虚假陈述。
 *        采购来验厂那天对不上,丢的是整个单子和信誉。
 *   所以走 CC0 / 公有领域池,并且每一张都标明「占位,待替换为自有实拍」。
 *
 * ══ 为什么每张都要过视觉模型 ══
 *   上一轮的教训:按主题抓一批再按顺序发下去,结果面霜配了张多孔菌。
 *   工厂图更容易出这种错 —— 搜 "production line" 会出来汽车厂、面包厂、印刷厂,
 *   放到化妆品站上就是"货不对板"的升级版。所以搜出来先让模型看一眼。
 *
 * 跑法:node tools/factory-shots.mjs [只跑某几类]
 */
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
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

const FLEET = q(`SELECT id,label,base_url,model,api_keys,tier,vision_model FROM providers
                  WHERE enabled=1 AND api_keys<>'' AND can_vision=1 ORDER BY tier,id`)
  .map((r) => ({
    id: r.id, label: r.label, tier: r.tier, base: String(r.base_url).replace(/\/+$/, ''), model: r.model,
    keys: String(r.api_keys).split(',').map((s) => s.trim()).filter(Boolean),
    vision: true, visionModel: r.vision_model || r.model,
  }));
console.log(`可读图的模型 ${FLEET.length} 家:${FLEET.map((p) => p.id).join(' ')}`);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const curlText = (url) => { try { return execFileSync('curl', ['-sL', '--max-time', '25', '-A', UA, url], { encoding: 'utf8', maxBuffer: 32e6 }); } catch { return ''; } };
const curlBin = (url, dest) => { try { execFileSync('curl', ['-sL', '--max-time', '40', '-A', UA, '-o', dest, url], { maxBuffer: 1024 }); return existsSync(dest); } catch { return false; } };

/**
 * 按创始人列的版块清单来分类,不是按"好看的工厂图"泛泛地抓。
 * 每一类的 qs 是检索词阶梯(Openverse 是 AND 检索,词越长命中越少,所以先窄后宽),
 * want 是交给视觉模型的判据 —— 写得越具体,淘汰得越准。
 */
const NEEDS = [
  /* 分类直接对应创始人列的版块清单,不是泛泛地"找些工厂图"。
     每一类的 qs 是检索词阶梯 —— Openverse 是 AND 检索,词越长命中越少,
     所以先窄后宽:窄词捞精准的,宽词保证有量可挑。 */
  { id: 'line',      n: 4, want: '化妆品或制药车间的生产线:不锈钢罐体、管道、灌装设备、穿工服的操作人员',
    qs: ['factory production line', 'assembly line', 'industrial machinery factory', 'manufacturing plant', 'factory interior'] },
  { id: 'cleanroom', n: 3, want: '洁净车间或无尘室:白色洁净环境、穿连体防护服的人员、风淋室',
    qs: ['clean room', 'cleanroom technology', 'sterile laboratory', 'pharmaceutical facility'] },
  { id: 'lab',       n: 4, want: '化学或化妆品实验室:玻璃烧杯烧瓶、试剂瓶、移液器、实验台',
    qs: ['laboratory glassware', 'chemistry laboratory', 'research laboratory', 'science lab'] },
  { id: 'equip',     n: 3, want: '实验室或制药级检测仪器:分析仪、离心机、精密仪表盘',
    qs: ['laboratory equipment', 'analytical instrument', 'scientific instrument', 'control panel industrial'] },
  { id: 'qc',        n: 3, want: '实验室质检场景:有人在操作检测仪器、看显微镜或记录化验数据',
    qs: ['quality control', 'laboratory testing', 'scientist working laboratory'] },
  { id: 'filling',   n: 3, want: '液体灌装或瓶装产线:瓶子在传送带上、灌装头、旋盖机',
    qs: ['bottling line', 'bottling plant', 'packaging line factory', 'conveyor bottles'] },
  { id: 'warehouse', n: 3, want: '成品仓库:货架、托盘、纸箱、叉车',
    qs: ['warehouse interior', 'logistics warehouse', 'warehouse racking', 'distribution center'] },
  { id: 'team',      n: 3, want: '职场团队或研发人员在工作场合,像技术团队、白领会议',
    qs: ['business team meeting', 'engineers team', 'office teamwork', 'scientists team'] },
  { id: 'expo',      n: 3, want: '展会现场或展台:展位、易拉宝、参观者',
    qs: ['trade fair', 'exhibition stand', 'convention center booth', 'trade show'] },
  { id: 'showroom',  n: 2, want: '产品展厅或陈列空间:货架上整齐陈列着瓶瓶罐罐',
    qs: ['showroom interior', 'product display shelf', 'retail display'] },
  { id: 'packaging', n: 3, want: '化妆品包材:空的玻璃瓶、罐、软管、泵头',
    qs: ['cosmetic packaging', 'glass bottles', 'cosmetic containers', 'bottles collection'] },
  { id: 'cert',      n: 2, want: '证书、奖状或正式文件',
    qs: ['certificate document', 'official document seal', 'diploma certificate'] },
  { id: 'herb',      n: 3, want: '草本植物或药材:田间植株、成排作物、干燥草药',
    qs: ['herb field', 'medicinal plants', 'herbal garden', 'botanical field'] },
  { id: 'meeting',   n: 2, want: '商务洽谈:两方在会议桌前交流或握手',
    qs: ['business handshake meeting', 'business negotiation', 'conference room meeting'] },
];

function search(qs, n = 12) {
  const api = new URL('https://api.openverse.org/v1/images/');
  api.searchParams.set('q', qs);
  api.searchParams.set('license', 'cc0,pdm');
  api.searchParams.set('page_size', String(n));
  api.searchParams.set('mature', 'false');
  api.searchParams.set('size', 'large');
  try {
    return (JSON.parse(curlText(api.toString())).results ?? [])
      /* 尺寸门槛按**实际用途**定,不是越大越好。
         看了参照店铺的真实版式:工厂图是 3×2 排的**带标题条小方图**,
         显示尺寸约 380×250,不是 1920 通栏 —— 我一开始按通栏去卡 1200px 宽 + 1.4 横宽比,
         把大量合用的图误杀了。这是"没先看清楚要用在哪儿就先定标准"的典型错误。
         现在:800px 宽足够(小图 2 倍图),长宽比放到 1.0–2.2(方图到宽图都收)。 */
      .filter((r) => {
        const w = r.width ?? 0, h = r.height ?? 1, ar = w / h;
        return r.url && w >= 800 && ar >= 1.0 && ar <= 2.2;
      })
      .map((r) => ({ url: r.url, thumb: r.thumbnail || r.url, by: r.creator ?? '', page: r.foreign_landing_url ?? '', alt: r.title ?? '', w: r.width, h: r.height }));
  } catch { return []; }
}

async function judge(thumbUrl, want) {
  if (!FLEET.length) return null;
  const tmp = `${OUT}/.j.jpg`;
  if (!curlBin(thumbUrl, tmp)) return null;
  const b64 = readFileSync(tmp).toString('base64');
  unlinkSync(tmp);
  try {
    /* 除了「是不是」还要问「好不好看」——
       创始人要的是能直接摆上首页的图,不是「内容对但拍得像监控截图」的那种。
       评分标准写死三条(光线 / 整洁 / 构图),免得模型自由发挥,
       每次跑出来的标准不一样就没法比较了。 */
    /* ★ 行业排除必须排在第一条 ★
       上一轮的教训:搜 "factory production line" 抓回来的是**汽车厂和鸡蛋厂**,
       而模型判「这是工厂生产线」完全正确 —— 错在我给的判据只说了「工厂」,
       没说「哪个行业的工厂」。化妆品站上摆一张汽车车间,采购一眼看穿,比没有图更伤。
       所以把排除项写成「看到这些直接否」,不留解释空间。 */
    const r = await vision(process.env, `data:image/jpeg;base64,${b64}`,
      '按顺序判断三件事,任何一条不过就 match=false:\n'
      + '① 行业排除:画面里若出现汽车/车身/轮胎、食品/鸡蛋/面包/饮料、电子板卡、纺织布料、印刷机、'
      + '农机、建筑工地 —— 一律 match=false。这是化妆品与制药工厂的网站,别的行业的车间不能用。\n'
      + `② 这张图是不是「${want}」?只看主体,背景不算。\n`
      + '③ 作为企业官网的展示图好不好看?按「光线明亮均匀 / 画面整洁专业 / 构图舒展」打 1-5 分。\n'
      + '   1=昏暗杂乱像随手拍   3=能用但平庸   5=可直接上官网\n'
      + '只回 JSON:{"match": true 或 false, "score": 1到5的整数, "saw": "你看到的主体,12 字以内"}',
      { fleet: FLEET, json: true, maxTokens: 260 });
    const m = /\{[\s\S]*\}/.exec(r.text);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const picked = [];

for (const need of NEEDS.filter((x) => !ONLY.length || ONLY.includes(x.id))) {
  const seen = new Set(), cands = [];
  for (const qq of need.qs) {
    for (const c of search(qq, 12)) if (!seen.has(c.url)) { seen.add(c.url); cands.push(c); }
    if (cands.length >= 26) break;
  }
  /* 改成「先全评分,再取前 N」——
     上一版是碰到一个合格的就要,结果先扫到的平庸图占掉了名额,
     后面更好的反而没机会。评分制才能真的挑出好看的。 */
  const scored = [];
  let tried = 0;
  for (const c of cands) {
    if (tried >= 22) break;
    tried++;
    const v = await judge(c.thumb, need.want);
    if (!v?.match) continue;
    const score = Number(v.score) || 3;
    if (score < 3) continue;                       // 平庸以下直接不要
    scored.push({ ...c, score, saw: v.saw });
  }
  scored.sort((a, b) => b.score - a.score || b.w - a.w);

  let got = 0;
  for (const c of scored) {
    if (got >= need.n) break;
    const file = `${need.id}-${String(got + 1).padStart(2, '0')}`;
    const dest = `${OUT}/${file}.jpg`;
    if (!curlBin(c.url, dest) || statSync(dest).size < 60000) { if (existsSync(dest)) unlinkSync(dest); continue; }
    picked.push({ ...need, ...c, file, bytes: statSync(dest).size });
    got++;
    console.log(`   ✓ ${need.id.padEnd(10)} ${file}.jpg  ${c.w}×${c.h}  ${'★'.repeat(c.score)}  ${c.saw}`);
  }
  console.log(`   · ${need.id.padEnd(10)} 评了 ${tried} 张,合格 ${scored.length} 张,取前 ${got} 张`);
}

/* 入媒体库,让运营在后台看得见、换得掉 */
const esc = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const sql = picked.map((p) => `INSERT INTO media (r2_key, filename, mime, bytes, width, height, folder, alt_zh, alt_en, driver, url, source_url, license, creator)
 VALUES (${esc('static/factory/' + p.file + '.jpg')}, ${esc(p.file + '.jpg')}, 'image/jpeg', ${p.bytes}, ${p.w}, ${p.h}, '工厂实力(占位)',
 ${esc(p.want + ' —— 占位素材,待替换为帛卉自有实拍')}, ${esc(p.alt || p.id)}, 'url', ${esc('/media/factory/' + p.file + '.jpg')},
 ${esc(p.page)}, 'CC0 / 公有领域', ${esc(p.by)})
 ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes, width=excluded.width, height=excluded.height, url=excluded.url;`).join('\n');

if (sql) {
  writeFileSync('node_modules/.cache/factory.sql', sql, 'utf8');
  d1(['--file', 'node_modules/.cache/factory.sql', '-y']);
  const rows = q(`SELECT id, filename FROM media WHERE folder='工厂实力(占位)' ORDER BY id`);
  console.log(`\n媒体库「工厂实力(占位)」共 ${rows.length} 张:`);
  rows.forEach((r) => console.log(`   /media/${r.id}  ${r.filename}`));
}
console.log(`\n✓ 本轮入库 ${picked.length} 张,全部通过视觉核对`);
console.log('  这批是**占位**素材(CC0,来源与授权随图存档)。');
console.log('  上线前必须换成帛卉自己的车间实拍 —— 拿别人的厂房当自己的,验厂那天对不上。');
