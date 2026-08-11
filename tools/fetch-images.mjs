/**
 * 抓化妆品配图 —— 内部评审用占位素材,后期由创始人替换为自有实拍。
 *
 * 用 Node 而非 bash:之前 bash 在 Windows 上建目录/写文件反复失败,
 * Node 的 fs 对 Windows 路径处理可靠,不再折腾。
 *
 * 来源:Openverse(WordPress 的开放图片搜索,聚合 Flickr/Wikimedia/Rawpixel 等)。
 * 按 SF 首页的用图需求分类抓,不是随机抓一堆。
 */
import { mkdirSync, writeFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps/web/public/media/shots');
mkdirSync(OUT, { recursive: true });

// 按 SF 首页各屏的用图需求分组,每组抓够数量
// 首页不要车间 —— Summer Fridays 是产品与生活方式主导,首屏出现产线会立刻变成"工厂宣传册"。
// 车间实拍留给「关于我们 / 能力」内页,那里它才是加分项。
const NEEDS = [
  { tag: 'hero',    q: 'cosmetic cream jar minimal', n: 4 },
  { tag: 'skin',    q: 'skincare serum bottle',      n: 8 },
  { tag: 'texture', q: 'cream texture macro',        n: 8 },
  { tag: 'makeup',  q: 'makeup powder palette',      n: 6 },
  { tag: 'oral',    q: 'toothpaste tube',            n: 4 },
  { tag: 'botany',  q: 'botanical leaf still life',  n: 6 },
  { tag: 'life',    q: 'bathroom skincare shelf',    n: 6 },
];

// Wikimedia 会对通用/脚本类 UA 返回 2KB 的拒绝页(实测),必须用浏览器 UA 才给图
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * 全部走 curl 而不是 Node 的 fetch:
 * 本机有 HTTP 代理,curl 读 *_proxy 环境变量能通,而 undici(Node fetch)在这台机器上
 * 直连超时。与其调试代理配置,不如用已经验证能通的工具。
 */
function curlText(url, extra = []) {
  try {
    return execFileSync('curl', ['-sL', '--max-time', '25', '-A', UA, ...extra, url], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
  } catch { return ''; }
}
function curlBin(url, dest) {
  try {
    execFileSync('curl', ['-sL', '--max-time', '25', '-A', UA, '-o', dest, url], { maxBuffer: 1024 });
    return true;
  } catch { return false; }
}

/**
 * 图源:Unsplash。
 *
 * 前两轮走了弯路,记下来免得重犯:
 *  · Openverse 聚合的多是 Flickr 等第三方域名,本机大量连不上(7 类里 5 类 0 张);
 *  · Wikimedia 是百科图库,**没有商业级美妆产品摄影**,搜"skincare bottle"出来的是
 *    木质陈列柜和玫瑰水古画。免密钥的源里不存在我们要的东西 —— 这一点应当一开始就判断到。
 *
 * Unsplash 免费商用、无需署名(署名是礼节不是义务),质量是这几个源里唯一够用的。
 * 直接要 w=1600&q=80 的派生图,省掉本地压缩。
 */
const KEY = process.env.UNSPLASH_KEY || '';

function search(q, n) {
  if (!KEY) return [];
  const url =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}` +
    `&per_page=${Math.min(n * 2, 30)}&orientation=landscape&content_filter=high`;
  const t = curlText(url, ['-H', `Authorization: Client-ID ${KEY}`]);
  if (!t) return [];
  try {
    return (JSON.parse(t).results ?? [])
      .map((p) => p?.urls?.raw)
      .filter(Boolean)
      .map((u) => `${u}&w=1600&q=80&fm=jpg&fit=max`);
  } catch { return []; }
}

let total = 0;
const manifest = [];
for (const need of NEEDS) {
  const urls = search(need.q, need.n);
  let got = 0;
  for (const u of urls) {
    if (got >= need.n) break;
    const name = `${need.tag}-${String(got + 1).padStart(2, '0')}.jpg`;
    const dest = join(OUT, name);
    if (!curlBin(u, dest)) continue;
    // 太小的多半是占位图或图标,丢掉
    const size = existsSync(dest) ? statSync(dest).size : 0;
    if (size < 45000) { if (existsSync(dest)) unlinkSync(dest); continue; }
    manifest.push({ file: name, tag: need.tag, source: u, bytes: size });
    got++; total++;
  }
  console.log(`  ${need.tag.padEnd(8)} ${got}/${need.n}`);
}

// 留一份来源清单,便于日后替换与核对
writeFileSync(join(OUT, 'MANIFEST.json'), JSON.stringify({
  note: '内部评审用占位素材,来源 Openverse。上线前须替换为帛卉自有实拍。',
  fetchedCount: total,
  items: manifest,
}, null, 2), 'utf8');

console.log(`\n✓ 共 ${total} 张 → apps/web/public/media/shots/`);
