// 三展同期短卡：档期、深链、禁词、挂在既有 Cosmopack 模块上。node tools/fair-trio.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const {
  FAIR_SOURCE_ASEAN, FAIR_SOURCE_ASIA, FAIR_SOURCE_DUBAI,
  fairRfqPath, fairTrioCopy, fairTrioPlain,
} = await import(new URL('../apps/web/src/lib/fair-trio.ts', import.meta.url));

const BANNED = [
  /Halal certified/i,
  /JAKIM certified/i,
  /Halal approved/i,
  /(?<!not )guaranteed approval/i,
  /包过审/,
  /已获证/,
  /已拿奖/,
  /FDA approved/i,
  /EU approved/i,
  /NPRA approved/i,
  /BPOM approved/i,
  /死价/,
  /普草/,
  /参展/,
  /展台/,
  /展位/,
  /\bbooth\b/i,
  /join us at/i,
  /exhibiting/i,
  /we are at the show/i,
];

for (const lang of ['en', 'zh-cn', 'zh-tw', 'jp']) {
  const copy = fairTrioCopy(lang);
  const blob = fairTrioPlain(copy).join('\n');
  assert.equal(copy.cards.length, 3, lang);
  assert.deepEqual(copy.cards.map((c) => c.id), ['asean', 'dubai', 'asia']);
  assert.match(copy.cards[0].when, /6\/24/);
  assert.match(copy.cards[0].when, /Bangkok/);
  assert.match(copy.cards[0].when, /QSNCC/);
  assert.match(copy.cards[0].name, /Cosmoprof CBE ASEAN 2026/);
  assert.match(copy.cards[1].when, /10\/6/);
  assert.match(copy.cards[1].when, /DWTC/);
  assert.match(copy.cards[1].name, /Beautyworld Dubai 2026/);
  assert.match(copy.cards[2].when, /11\/10/);
  assert.match(copy.cards[2].when, /AsiaWorld-Expo/);
  assert.match(copy.cards[2].name, /Cosmopack Asia 2026/);
  assert.equal(copy.cards[0].source, FAIR_SOURCE_ASEAN);
  assert.equal(copy.cards[1].source, FAIR_SOURCE_DUBAI);
  assert.equal(copy.cards[2].source, FAIR_SOURCE_ASIA);
  for (const card of copy.cards) {
    const href = fairRfqPath(lang, card.about);
    const u = new URL(href, 'https://biosphere-ai.com');
    assert.equal(u.pathname, `/${lang.startsWith('zh') ? lang.toLowerCase() : (lang === 'jp' ? 'jp' : 'en')}/rfq/`);
    assert.equal(u.searchParams.get('about'), card.about);
    assert.deepEqual([...u.searchParams.keys()], ['about']);
    for (const key of ['target_market', 'halal_ready', 'halal_scope_note', 'notification_assist_country', 'first_order_band']) {
      assert.equal(u.searchParams.get(key), null, key);
    }
  }
  for (const re of BANNED) assert.doesNotMatch(blob, re, `${lang} ${re}`);
  if (lang.startsWith('zh')) {
    assert.match(copy.cards[0].line, /SEA 美妆 B2B/);
    assert.match(copy.cards[0].line, /包材供应链/);
    assert.match(copy.cards[0].line, /Cosmopack/);
    assert.match(copy.cards[1].line, /Beautyworld ME/);
    assert.match(copy.cards[1].line, /GCC 渠道/);
    assert.match(copy.cards[2].line, /私牌供应链/);
    assert.match(blob, /不是我方展商身份/);
  } else {
    assert.match(copy.cards[0].line, /SEA beauty B2B/i);
    assert.match(copy.cards[0].line, /packaging supply chain/i);
    assert.match(copy.cards[1].line, /Beautyworld ME/);
    assert.match(copy.cards[1].line, /GCC channel/i);
    assert.match(copy.cards[2].line, /private-label supply chain/i);
    assert.match(blob, /do not identify us as an exhibitor/i);
  }
}

assert.equal(fairRfqPath('en', 'Cosmopack Asia 2026'), '/en/rfq/?about=Cosmopack+Asia+2026');
assert.equal(fairRfqPath('zh-cn', 'Beautyworld Dubai 2026'), '/zh-cn/rfq/?about=Beautyworld+Dubai+2026');
assert.equal(fairRfqPath('ZH-CN', 'Cosmoprof CBE ASEAN 2026'), '/zh-cn/rfq/?about=Cosmoprof+CBE+ASEAN+2026');

const sources = [
  'apps/web/src/lib/fair-trio.ts',
  'apps/web/src/components/FairTrio.astro',
  'apps/web/src/components/CosmopackInquiry.astro',
].map(read).join('\n');
for (const re of BANNED) assert.doesNotMatch(sources, re, String(re));
assert.match(read('apps/web/src/components/CosmopackInquiry.astro'), /<FairTrio/);
assert.match(sources, /cosmoprof\.com\/en\/media-room\/news\/cosmoprof-cbe-asean-2026/);
assert.match(sources, /beautyworld-dubai\.ae\.messefrankfurt\.com/);
assert.match(sources, /stylespeak\.com\/cosmoprof-asia-2026/);

for (const file of [
  'apps/web/src/pages/[lang]/oem/index.astro',
  'apps/web/src/pages/[lang]/services/factory-quality.astro',
  'apps/web/src/pages/[lang]/services/index.astro',
]) {
  assert.match(read(file), /<CosmopackInquiry/, file);
}

assert.match(read('apps/web/src/middleware.ts'), /const CACHE_V = 'v139'/);
assert.doesNotMatch(read('apps/web/src/lib/rfq-fields.ts'), /Cosmoprof CBE ASEAN/);

console.log('fair-trio.test.mjs:全部通过');
