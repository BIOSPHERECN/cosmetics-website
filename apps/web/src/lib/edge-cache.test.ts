// 自检:node --experimental-strip-types apps/web/src/lib/edge-cache.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheKeyRequest, cachePutResponse, restoreBrowserCacheControl } from './edge-cache.ts';

test('缓存键只有 URL,不带条件请求头', () => {
  const key = cacheKeyRequest('https://biosphere-ai.com/en/?__cv=v138');
  assert.equal(key.method, 'GET');
  assert.equal(key.url, 'https://biosphere-ai.com/en/?__cv=v138');
  assert.equal([...key.headers.keys()].length, 0);
});

test('max-age=0 + s-maxage 的副本抬高 max-age,命中后改回浏览器口径', async () => {
  const src = new Response('<html>ok</html>', {
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=21600', 'x-bh-cache': 'miss' },
  });
  const stored = cachePutResponse(src);
  assert.equal(src.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=21600');
  assert.equal(stored.headers.get('Cache-Control'), 'public, max-age=21600, s-maxage=21600');
  assert.equal(stored.headers.get('x-bh-cc-browser'), 'max-age=0');
  assert.equal(await stored.text(), '<html>ok</html>');
  assert.equal(await src.text(), '<html>ok</html>');

  const hit = new Headers(stored.headers);
  restoreBrowserCacheControl(hit);
  assert.equal(hit.get('Cache-Control'), 'public, max-age=0, s-maxage=21600');
  assert.equal(hit.get('x-bh-cc-browser'), null);
  assert.equal(hit.get('x-bh-cache'), 'miss');
});

test('工具页短 s-maxage 同样往返', () => {
  const stored = cachePutResponse(new Response('t', {
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=120' },
  }));
  assert.equal(stored.headers.get('Cache-Control'), 'public, max-age=120, s-maxage=120');
  const hit = new Headers(stored.headers);
  restoreBrowserCacheControl(hit);
  assert.equal(hit.get('Cache-Control'), 'public, max-age=0, s-maxage=120');
});

test('路由自己的长缓存和 no-store 不改写', () => {
  const immutable = cachePutResponse(new Response('img', {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  }));
  assert.equal(immutable.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(immutable.headers.get('x-bh-cc-browser'), null);

  const nostore = cachePutResponse(new Response('x', { headers: { 'Cache-Control': 'no-store' } }));
  assert.equal(nostore.headers.get('Cache-Control'), 'no-store');
  assert.equal(nostore.headers.get('x-bh-cc-browser'), null);

  const headers = new Headers(immutable.headers);
  restoreBrowserCacheControl(headers);
  assert.equal(headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
});
