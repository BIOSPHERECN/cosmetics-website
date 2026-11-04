// 自检:node apps/web/src/lib/page-create-site.test.ts
// 绑定站账号不能靠省略或伪造 site_id 把页面建到别的站;非字符串(数组会被 RegExp.test 强转)直接 400。
import assert from 'node:assert/strict';
import { parseParentId, resolveCreateSite } from './page-create-site.ts';

const bound = { siteId: 'skin2oem', isGroup: false, options: [{ id: 'skin2oem' }] };
const group = {
  siteId: 'biosphere-ai',
  isGroup: true,
  options: [{ id: 'biosphere-ai' }, { id: 'skin2oem' }],
};

assert.deepEqual(resolveCreateSite(bound, undefined), { ok: true, siteId: 'skin2oem' });
assert.deepEqual(resolveCreateSite(bound, null), { ok: true, siteId: 'skin2oem' });
assert.deepEqual(resolveCreateSite(bound, ''), { ok: true, siteId: 'skin2oem' });
assert.deepEqual(resolveCreateSite(bound, 'skin2oem'), { ok: true, siteId: 'skin2oem' });

const forged = resolveCreateSite(bound, 'biosphere-ai');
assert.equal(forged.ok, false);
if (!forged.ok) assert.equal(forged.status, 403);

// 数组会被 /^...$/.test 转成 "biosphere-ai" / "skin2oem"。必须当坏请求,不能落库。
for (const raw of [['biosphere-ai'], ['skin2oem'], { toString: () => 'biosphere-ai' }]) {
  const d = resolveCreateSite(bound, raw);
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.status, 400);
}

// 绑定账号即使 options 被误放宽,也不能写别人的站。
const widened = resolveCreateSite(
  { siteId: 'skin2oem', isGroup: false, options: [{ id: 'skin2oem' }, { id: 'biosphere-ai' }] },
  'biosphere-ai',
);
assert.equal(widened.ok, false);
if (!widened.ok) assert.equal(widened.status, 403);

assert.deepEqual(resolveCreateSite(group, undefined), { ok: true, siteId: 'biosphere-ai' });
assert.deepEqual(resolveCreateSite(group, 'skin2oem'), { ok: true, siteId: 'skin2oem' });
const unknown = resolveCreateSite(group, 'not-a-site');
assert.equal(unknown.ok, false);
if (!unknown.ok) assert.equal(unknown.status, 403);

const noSite = resolveCreateSite({ siteId: '', isGroup: false, options: [] }, 'skin2oem');
assert.equal(noSite.ok, false);
if (!noSite.ok) assert.equal(noSite.status, 403);

assert.deepEqual(parseParentId(undefined), { ok: true, id: null });
assert.deepEqual(parseParentId(null), { ok: true, id: null });
assert.deepEqual(parseParentId(12), { ok: true, id: 12 });
assert.equal(parseParentId('12').ok, false);
assert.equal(parseParentId(1.5).ok, false);
assert.equal(parseParentId(0).ok, false);
assert.equal(parseParentId(-3).ok, false);

console.log('page-create-site 自检通过');
