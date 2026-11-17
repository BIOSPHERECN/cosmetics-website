// 首页五块 KV 开关。node tools/show-home.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const mod = await import(new URL('../apps/web/src/lib/show-home.ts', import.meta.url));

const {
  SHOW_HOME_KEYS, SHOW_HOME_KV_KEY, SHOW_HOME_SEED, SHOW_HOME_DEFAULTS, SHOW_HOME_BLOCKS,
  parseShowHome, serializeShowHome, showHomeEtag, readShowHome, seedShowHome, writeShowHome,
  isLocaleHomePath, resolveHomeFlagsKv, resetHomeFlagsMemory, wranglerPutCommand,
} = mod;

assert.deepEqual([...SHOW_HOME_KEYS], ['TRUST', 'COSMOPACK', 'HOT_SHELF', 'SHOWCASE', 'HERO_CARD']);
assert.equal(SHOW_HOME_KV_KEY, 'show_home:biosphere-ai');
assert.deepEqual(SHOW_HOME_BLOCKS.map((b) => b.component), [
  'BioTrustStrip', 'CosmopackInquiry', 'shelf（爆款产品）', '.showcase-grid', '.bio-hero-shot',
]);

assert.equal(showHomeEtag(SHOW_HOME_DEFAULTS), '11111');
assert.equal(showHomeEtag(SHOW_HOME_SEED), '10001');
assert.equal(SHOW_HOME_SEED.TRUST, true);
assert.equal(SHOW_HOME_SEED.COSMOPACK, false);
assert.equal(SHOW_HOME_SEED.SHOWCASE, false);
assert.equal(serializeShowHome(SHOW_HOME_SEED),
  '{"TRUST":true,"COSMOPACK":false,"HOT_SHELF":false,"SHOWCASE":false,"HERO_CARD":true}');

const partial = parseShowHome('{"TRUST":false}');
assert.equal(partial.TRUST, false);
assert.equal(partial.COSMOPACK, true);
assert.equal(partial.HERO_CARD, true);
assert.deepEqual(parseShowHome(''), SHOW_HOME_DEFAULTS);
assert.deepEqual(parseShowHome('not-json'), SHOW_HOME_DEFAULTS);
assert.equal(parseShowHome('{"TRUST":"false"}').TRUST, true, '字符串 false 不当布尔');

function fakeKv(initial) {
  const m = new Map(initial ? [[SHOW_HOME_KV_KEY, initial]] : []);
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); },
    dump: () => m,
  };
}

const empty = fakeKv();
let puts = 0;
const counting = {
  get: async () => null,
  put: async () => { puts++; },
};
const absent = await readShowHome(counting, { absentAsSeed: true });
assert.equal(puts, 0, '首页读不得写 KV');
assert.equal(absent.etag, '10001');
assert.equal(absent.flags.TRUST, true);
assert.equal(absent.source, 'seed');
assert.equal(absent.flags.SHOWCASE, false);
assert.equal(absent.flags.HERO_CARD, true);
assert.deepEqual((await readShowHome(undefined)).flags, SHOW_HOME_DEFAULTS);

const seeded = await seedShowHome(empty);
assert.equal(seeded.source, 'seed');
assert.equal(empty.dump().get(SHOW_HOME_KV_KEY), serializeShowHome(SHOW_HOME_SEED));
const again = await seedShowHome(empty);
assert.equal(again.source, 'kv');
assert.equal(empty.dump().get(SHOW_HOME_KV_KEY), serializeShowHome(SHOW_HOME_SEED), '种子不覆盖已有值');

const written = await writeShowHome(empty, { TRUST: true, HERO_CARD: false });
assert.equal(written.etag, '10000');
assert.equal(written.flags.COSMOPACK, false);
assert.equal(written.flags.HERO_CARD, false);
assert.equal(written.flags.TRUST, true);

assert.equal(isLocaleHomePath('/en/'), true);
assert.equal(isLocaleHomePath('/zh-cn/'), true);
assert.equal(isLocaleHomePath('/zh-tw/'), true);
assert.equal(isLocaleHomePath('/en'), false);
assert.equal(isLocaleHomePath('/en/about/'), false);
assert.equal(isLocaleHomePath('/bohui/'), false);

resetHomeFlagsMemory();
const mem = resolveHomeFlagsKv(undefined, true);
assert.ok(mem);
await seedShowHome(mem);
assert.equal((await readShowHome(mem, { absentAsSeed: true })).source, 'kv');
assert.equal(resolveHomeFlagsKv(undefined, false), undefined);
assert.equal(resolveHomeFlagsKv({ HOME_FLAGS: empty }, false), empty);

assert.match(wranglerPutCommand('abc'), /kv key put --namespace-id abc --remote "show_home:biosphere-ai"/);

const page = read('apps/web/src/pages/[...path].astro');
const mw = read('apps/web/src/middleware.ts');
const toml = read('apps/web/wrangler.toml');
const api = read('apps/web/src/pages/api/admin/home-flags.ts');
const admin = read('apps/web/src/pages/bohui/home-flags.astro');
const fuse = read('apps/web/src/lib/fuse.ts');

assert.match(page, /readShowHome/);
assert.doesNotMatch(page, /<HomeLead|可来厂核对的化妆品代工|bio-hero/);
assert.match(page, /showHome\.TRUST && site\.id === 'biosphere-ai'/);
assert.match(page, /showHome\.COSMOPACK && site\.id === 'biosphere-ai'/);
assert.match(page, /showHome\.SHOWCASE && showcaseData\.items\.length > 0/);
assert.match(page, /!showHome\.HOT_SHELF/);
assert.match(mw, /const CACHE_V = 'v155'/);
assert.match(mw, /homeFlagEtag = '10001'/);
assert.match(mw, /首页块开关走 __hf/);
assert.match(mw, /u\.searchParams\.set\('__hf', homeFlagEtag\)/);
assert.match(mw, /s-maxage=21600/);
assert.match(toml, /binding = "HOME_FLAGS"/);
assert.match(toml, /id = "7ac736d02e15402d9626ecd491c36cbe"/);
assert.match(toml, /FUSE_RENDER_CAP = "500000"/);
assert.match(api, /apiGuard/);
assert.match(api, /seedShowHome/);
assert.match(admin, /SHOW_HOME_BLOCKS/);
assert.doesNotMatch(fuse, /HOME_FLAGS|show_home/);

console.log('show-home.test.mjs:全部通过');
