/**
 * 把创始人给的实拍/渲染图入库并摆到对应版块。
 *
 * 摆放不是随便找个位置塞 —— 每张图配的是**它画面里真正拍到的东西**:
 *   称料间那张有精密天平    → 工序②称量配料
 *   乳化车间那张有不锈钢罐  → 工序③真空乳化、网格「乳化车间」
 *   智能生产区那张有灌装线  → 工序⑤灌装旋盖、网格「灌装线」
 * 之前吃过"货不对板"的亏(拿蘑菇图配面霜),所以这一步宁可少摆也不乱配。
 *
 * 「录音转写 (2)」不用:画面里的厂名被渲染成了「帛荠」,(9) 是同一条走廊
 * 的另一个角度且写对了「帛卉」—— 用对的那张。
 */
import { copyFileSync, mkdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const SRC = 'F:/0cosmetic/biosphere-ai-site/images/web';
const DST = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/bohui';
mkdirSync(DST, { recursive: true });

/** [源文件名(不含尺寸后缀), 站内文件名, 中文说明] */
const PICS = [
  ['录音转写-30', 'weighing-room',    '称料间:精密天平、配方核对与误差预警'],
  ['录音转写-31', 'emulsify-hall',    '乳化车间:不锈钢乳化罐与过程监控'],
  ['录音转写-11', 'filling-line',     '智能生产区:灌装线与在线质量记录'],
  ['录音转写-29', 'rnd-office',       '技术部办公室:研发协同与配方优化'],
  ['录音转写-9',  'workshop-corridor','车间分区导视:原料预处理到冷链仓储六个车间'],
  ['录音转写-7',  'culture-corridor', 'AI 智造走廊:从草本原料到智能护肤方案'],
  ['录音转写-5',  'meeting-room',     '战略会议室:客户洽谈与方案评审'],
  ['录音转写-12', 'bohui-scene-12',   '帛卉厂区场景'],
  ['平台总览_可修改版4_8000x3298', 'platform-map', '帛卉集团平台总览架构图'],
];

const rows = [];
for (const [src, name, alt] of PICS) {
  for (const w of [1600, 720]) {
    const from = `${SRC}/${src}-w${w}.webp`;
    if (!existsSync(from)) continue;
    const file = `${name}-w${w}.webp`;
    copyFileSync(from, `${DST}/${file}`);
    rows.push({ file, name, w, alt, bytes: statSync(from).size });
  }
}

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const sql = rows.map((r) =>
  `INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url)
   VALUES (${lit('static/bohui/' + r.file)},${lit(r.file)},'image/webp',${r.bytes},'帛卉实拍',
           ${lit(r.alt + (r.w === 720 ? '(小图)' : ''))},'url',${lit('/media/bohui/' + r.file)})
   ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes,alt_zh=excluded.alt_zh,url=excluded.url;`);
const OUT = 'F:/0cosmetic/cosmetic-sites/node_modules/.cache/media.sql';
writeFileSync(OUT, sql.join('\n'), 'utf8');
d1(OUT, { file: true });

const got = d1(`SELECT id, filename FROM media WHERE folder='帛卉实拍' ORDER BY id`);
console.log(`入库 ${got.length} 条:`);
for (const g of got) console.log(`  /media/${String(g.id).padEnd(5)}${g.filename}`);
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/bohui-media.json', JSON.stringify(got), 'utf8');
