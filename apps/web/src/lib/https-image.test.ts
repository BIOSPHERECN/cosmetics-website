// 自检:node apps/web/src/lib/https-image.test.ts
// 电商套图只渲染 https 图片。javascript:、data:、相对地址丢掉;标签里的引号不能进入 src。
import assert from 'node:assert/strict';
import { appendGallery, galleryItem, httpsImageSrc, imageLabel } from './https-image.ts';

assert.equal(httpsImageSrc('https://cdn.example/a.png'), 'https://cdn.example/a.png');
assert.equal(httpsImageSrc('HTTPS://cdn.example/a.png'), 'https://cdn.example/a.png');

for (const bad of [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'java\nscript:alert(1)',
  'java\tscript:alert(1)',
  '\njavascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:image/svg+xml;base64,PHN2Zy8+',
  'data:image/png;base64,aaaa',
  '/media/1.png',
  '//cdn.example/a.png',
  'http://cdn.example/a.png',
  'blob:https://cdn.example/uuid',
  'https://user:pass@cdn.example/a.png',
  ' https://cdn.example/a.png',
  'https://cdn.example/a.png\n',
  'ht\ntps://cdn.example/a.png',
  '',
  12,
  ['https://cdn.example/a.png'],
]) {
  assert.equal(httpsImageSrc(bad), null, `should reject ${JSON.stringify(bad)}`);
}

assert.equal(httpsImageSrc('https://cdn.example/x.png"><img src=x onerror=alert(1)>'), null);

const broken = httpsImageSrc('https://cdn.example/x.png"><img/src=x/onerror=alert(1)>');
assert.equal(broken, 'https://cdn.example/x.png%22%3E%3Cimg/src=x/onerror=alert(1)%3E');
assert.equal(broken?.includes('"'), false);
assert.equal(broken?.includes('<'), false);
assert.equal(broken?.includes('>'), false);

const label = '"><img src=x onerror=alert(1)>';
const item = galleryItem({ url: 'https://cdn.example/a.png', label });
assert.ok(item);
assert.equal(item?.src, 'https://cdn.example/a.png');
assert.equal(item?.label, label);
assert.equal(item?.src.includes(label), false);
assert.equal(item?.src.includes('onerror'), false);
assert.equal(imageLabel(label), label);
assert.equal(galleryItem({ url: 'javascript:alert(1)', label }), null);
assert.equal(galleryItem({ url: '/media/1.png', label: 'hero' }), null);
assert.equal(galleryItem(null), null);

function el(tag) {
  return {
    tag,
    className: '',
    attrs: {},
    text: '',
    kids: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.kids.push(c); return c; },
    get textContent() { return this.text; },
    set textContent(v) { this.text = String(v); },
    set innerHTML(_v) { throw new Error('innerHTML'); },
  };
}
const root = el('div');
const drawn = appendGallery(root, [
  { url: 'https://cdn.example/a.png', label },
  { url: 'javascript:alert(1)', label: 'nope' },
  { url: 'data:text/html,<script>alert(1)</script>', label: 'nope' },
  { url: '/media/1.png', label: 'nope' },
  { url: 'http://cdn.example/a.png', label: 'nope' },
], { createElement: el });
assert.equal(drawn, 1);
assert.equal(root.kids.length, 1);
assert.equal(root.kids[0].className, 'ds-ai-item');
const img = root.kids[0].kids[0];
const cap = root.kids[0].kids[1];
assert.equal(img.tag, 'img');
assert.equal(img.attrs.src, 'https://cdn.example/a.png');
assert.equal(img.attrs.alt, label);
assert.equal(img.attrs.loading, 'lazy');
assert.equal(cap.tag, 'figcaption');
assert.equal(cap.text, label);
assert.equal(String(img.attrs.src).includes('onerror'), false);
assert.equal(String(img.attrs.src).includes('<'), false);

console.log('https-image 自检通过');
