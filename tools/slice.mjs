// 把整页长图切成 1400px 高的片,供逐段审核。用法: node tools/slice.mjs <full.png> <outPrefix>
import sharp from 'sharp';
const [src, prefix] = process.argv.slice(2);
const meta = await sharp(src).metadata();
const tileH = 1400;
const n = Math.ceil(meta.height / tileH);
for (let i = 0; i < n; i++) {
  const top = i * tileH;
  const h = Math.min(tileH, meta.height - top);
  await sharp(src).extract({ left: 0, top, width: meta.width, height: h })
    .toFile(`${prefix}-${String(i + 1).padStart(2, '0')}.png`);
}
console.log(JSON.stringify({ W: meta.width, H: meta.height, tiles: n }));
