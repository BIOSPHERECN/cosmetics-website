/**
 * 把公司介绍 PPT 里的三面「墙」换进站点:供应商 logo 墙、客户品牌墙、IP 授权行。
 *
 * 创始人的原话:「合作品牌可以直接抓取 PPT 的图片啊,而不是你现在一堆的文字表达」。
 * 他说得对 —— 30 个品牌 logo 排成一面墙,和 30 个名字排成一段文字,
 * 可信度完全不是一回事:logo 是别人的设计资产,冒用要担责,所以一面 logo 墙
 * 本身就是「真的合作过」的证据;文字清单谁都能打出来。
 *
 * 图从 PPT 原件抽取(PyMuPDF 抽嵌入图 + 区域渲染),不是截屏:
 * 供应商墙 920×447、客户墙 887×408,都是 PPT 里的原始分辨率。
 * 已补白边到 4:3,适配网格卡的 cover 裁切,logo 一个不丢。
 */
import { statSync, writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const J = (o) => lit(JSON.stringify(o));
const D = 'F:/0cosmetic/cosmetic-sites/apps/web/public/media/shots';

/* ── ① 入库 ─────────────────────────────────────────── */
const WALLS = [
  ['wall-suppliers-43', '战略供应商 logo 墙:巴斯夫 / 天赐 / 赢创 / 陶氏 / 科莱恩 / 奇华顿 / 德之馨 / 亚什兰 等(来自公司介绍)'],
  ['wall-clients-43', '客户品牌墙:已服务的 30 个品牌 logo(来自公司介绍)'],
  ['wall-ip-43', '国际 IP 授权:驯龙高手 / 蓝精灵 / 迪士尼(来自公司介绍)'],
];
const sql = [];
for (const [f, alt] of WALLS) {
  const bytes = statSync(`${D}/${f}.webp`).size;
  sql.push(`INSERT INTO media (r2_key,filename,mime,bytes,folder,alt_zh,driver,url,creator)
    VALUES (${lit('static/shots/' + f + '.webp')},${lit(f + '.webp')},'image/webp',${bytes},
            '合作品牌',${lit(alt)},'url',${lit('/media/shots/' + f + '.webp')},'公司介绍 PPT 抽取')
    ON CONFLICT(r2_key) DO UPDATE SET bytes=excluded.bytes, alt_zh=excluded.alt_zh;`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/walls1.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/walls1.sql', { file: true });

const M = Object.fromEntries(d1(`SELECT id, filename FROM media WHERE folder='合作品牌'`)
  .map((r) => [r.filename.replace(/\.webp$/, ''), '/media/' + r.id]));
console.log('入库:', Object.entries(M).map(([k, v]) => `${k}→${v}`).join('  '));

/* ── ② biosphere-ai 首页:图墙替换文字清单 ─────────────── */
const sql2 = [];
const home = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug='' LIMIT 1`)[0].id;

// 「合作品牌与国际 IP」网格换成三面真墙
const grid = d1(`SELECT b.id FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                  WHERE b.page_id=${home} AND b.type='procgrid' AND b.is_visible=1
                    AND i.data_json LIKE '%合作品牌与国际 IP%' LIMIT 1`)[0];
if (grid) {
  const data = {
    eyebrow: 'PARTNERS', tone: 'sand', cols: 3,
    title: '合作品牌与战略供应商',
    intro: '已服务 30+ 国内外品牌,覆盖美妆个护、口腔护理、母婴等多品类;上游与 300+ 家全球战略供应商深度合作,并承接迪士尼、驯龙高手、蓝精灵等国际 IP 授权产品。',
    items: [
      { image: M['wall-clients-43'], label: '已服务品牌', note: 'ACNAWAY / BUHOTEI / BIOAQUA / SUNISA 等 30+' },
      { image: M['wall-suppliers-43'], label: '战略原料与包材供应商', note: '巴斯夫 / 赢创 / 陶氏 / 奇华顿 / 德之馨 等 300+' },
      { image: M['wall-ip-43'], label: '国际 IP 授权', note: '迪士尼 / 驯龙高手 / 蓝精灵' },
    ],
  };
  sql2.push(`UPDATE block_i18n SET data_json=${J(data)}, mt=0 WHERE block_id=${grid.id} AND lang='zh-cn';`);
  sql2.push(`DELETE FROM block_i18n WHERE block_id=${grid.id} AND lang<>'zh-cn';`);
  console.log(`首页图墙网格 #${grid.id} 已换成 PPT 真墙`);
}

// 两个文字清单版块(合作品牌 / 战略原料供应商)收掉 —— 内容已由图墙表达
const textWalls = d1(`SELECT b.id FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                       WHERE b.page_id=${home} AND b.type='certs' AND b.is_visible=1
                         AND (i.data_json LIKE '%"title":"合作品牌"%' OR i.data_json LIKE '%战略原料供应商%')`);
for (const t of textWalls) {
  sql2.push(`UPDATE blocks SET is_visible=0 WHERE id=${t.id};`);
  console.log(`文字清单 #${t.id} 已隐藏(不删,内容留底)`);
}

/* ── ③ beauty2oem 首页同样换成图墙 ────────────────────── */
const b2Home = d1(`SELECT id FROM pages WHERE site_id='beauty2oem' AND slug='' LIMIT 1`)[0].id;
const b2Wall = d1(`SELECT b.id FROM blocks b JOIN block_i18n i ON i.block_id=b.id AND i.lang='zh-cn'
                    WHERE b.page_id=${b2Home} AND b.type='certs' AND b.is_visible=1
                      AND i.data_json LIKE '%已服务的品牌%' LIMIT 1`)[0];
if (b2Wall) {
  const data = {
    eyebrow: 'CLIENTS', tone: 'paper', cols: 3,
    title: '已服务的品牌',
    intro: '覆盖美妆个护、口腔护理、母婴等多品类;并承接迪士尼、驯龙高手、蓝精灵等国际 IP 授权产品。',
    items: [
      { image: M['wall-clients-43'], label: '客户品牌墙', note: '30+ 国内外品牌' },
      { image: M['wall-ip-43'], label: '国际 IP 授权', note: '迪士尼 / 驯龙高手 / 蓝精灵' },
      { image: M['wall-suppliers-43'], label: '上游战略供应商', note: '300+ 家,原料不用你自己找' },
    ],
  };
  sql2.push(`UPDATE blocks SET type='procgrid' WHERE id=${b2Wall.id};`);
  sql2.push(`UPDATE block_i18n SET data_json=${J(data)}, mt=0 WHERE block_id=${b2Wall.id} AND lang='zh-cn';`);
  sql2.push(`DELETE FROM block_i18n WHERE block_id=${b2Wall.id} AND lang<>'zh-cn';`);
  console.log(`beauty2oem 品牌清单 #${b2Wall.id} 已换成图墙`);
}

writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/walls2.sql', sql2.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/walls2.sql', { file: true });
console.log('完成');
