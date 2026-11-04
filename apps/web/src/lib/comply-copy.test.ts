import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogLabel,
  isCertWall,
  partitionCertWall,
  publicMoq,
  publicSample,
  rewriteHeldCertAnswer,
  softenClaims,
} from './comply-copy.ts';

const homeItems = [
  { label: 'GMPC', note: 'Issued by DEKRA', image: '/media/152' },
  { label: 'ISO 22716:2007', note: 'Issued by DEKRA', image: '/media/153' },
  { label: 'Invention Patent', note: 'Core technology' },
  { label: 'EU CPNP', note: 'EU cosmetic product notification' },
  { label: 'U.S. FDA', note: 'Cosmetic facility registration' },
  { label: 'SGS', note: 'Test reports' },
  { label: 'CE', note: 'should drop' },
];

test('home cert wall splits factory certs from filings', () => {
  assert.equal(isCertWall('Patents, certifications and qualification documents', homeItems), true);
  const wall = partitionCertWall(homeItems, false);
  assert.deepEqual(wall.factory.map((i) => i.label), ['GMPC', 'ISO 22716:2007', 'HALAL']);
  assert.deepEqual(wall.filing.map((i) => i.label), ['US FDA', 'EU CPNP']);
  assert.equal(wall.factory.some((i) => /FDA|CPNP|SGS|\bCE\b/i.test(`${i.label} ${i.note}`)), false);
  assert.match(wall.filing[0].note ?? '', /not a factory certification/i);
  assert.match(wall.filing[1].note ?? '', /not a factory certification/i);
  assert.equal(wall.sawSgs, true);
  assert.equal(wall.other.some((i) => /patent/i.test(i.label ?? '')), true);
  assert.equal(wall.other.some((i) => /\bCE\b/.test(i.label ?? '')), false);
  assert.equal(wall.factory.find((i) => i.label === 'GMPC')?.image, '/media/152');
  assert.equal(wall.factory.find((i) => i.label === 'HALAL')?.image, undefined);
});

test('quality export grid still leads with the three held certs', () => {
  const items = [
    { label: 'AHF HALAL', image: '/media/158' },
    { label: 'EU CPNP Registration' },
    { label: 'U.S. FDA Registration' },
  ];
  assert.equal(isCertWall('Export Certifications & Originals', items), true);
  const wall = partitionCertWall(items, false);
  assert.deepEqual(wall.factory.map((i) => i.label), ['GMPC', 'ISO 22716:2007', 'HALAL']);
  assert.equal(wall.factory.find((i) => i.label === 'HALAL')?.image, '/media/158');
});

test('workshop grids are not treated as cert walls', () => {
  assert.equal(isCertWall('Production Capabilities', [
    { label: 'Weighing Room' }, { label: 'Filling Area' },
  ]), false);
});

test('cert answers lead with three factory certs and keep filings in a separate sentence', () => {
  const en = rewriteHeldCertAnswer(
    'GMPC, ISO 22716:2007 (both DEKRA certified), HALAL, FDA facility registration, EU CPNP, SGS, CE. Certificate numbers and validity periods can be verified against the scanned copies.',
    false,
  );
  assert.match(en, /^Factory certifications held: GMPC, ISO 22716:2007 and HALAL only/);
  assert.match(en, /not factory certifications/);
  assert.doesNotMatch(en, /SGS,|\bCE\b|FDA certified/);
  const zh = rewriteHeldCertAnswer(
    'GMPC、ISO 22716:2007、HALAL、FDA 工厂注册、EU CPNP、SGS。证书编号与有效期凭原件提供。',
    true,
  );
  assert.match(zh, /^工厂持有认证仅列：GMPC、ISO 22716:2007、HALAL/);
  assert.match(zh, /不是工厂认证/);
  assert.equal(rewriteHeldCertAnswer(en, false), en);
});

test('product names drop hard-ban claim words or carry a delist note', () => {
  const acne = catalogLabel('5X Acne Clear Cream', false);
  assert.equal(acne.name, '5X Blemish-prone Cream');
  assert.equal(/acne clear/i.test(acne.name), false);

  const treat = catalogLabel('Acne Treatment Gel', false);
  assert.match(treat.name, /delist review/i);
  assert.equal(/treatment/i.test(treat.name), false);

  const white = catalogLabel('7X VC Whitening Face Oil 75g', false);
  assert.equal(white.name, '7X VC Brightening Face Oil 75g');
  assert.equal(/\bwhitening\b/i.test(white.name), false);

  const sun = catalogLabel('Cooling Anti-Itch Repair Sunscreen Spray', false);
  assert.match(sun.name, /Soothing/);
  assert.equal(/anti-itch/i.test(sun.name), false);

  const kid = catalogLabel('Kids Rash Treatment Lotion', false);
  assert.match(kid.name, /delist review/i);
  assert.equal(/\brash\b|\btreatment\b/i.test(kid.name), false);

  const burn = catalogLabel('Breast slim fat-burn gel 100ml', false);
  assert.match(burn.name, /delist review/i);
  assert.equal(/breast|slim|fat-burn/i.test(burn.name), false);

  const plain = catalogLabel('Blue Perfume 100ml', false);
  assert.equal(plain.name, 'Blue Perfume 100ml');
  assert.equal(plain.claim, false);

  assert.equal(softenClaims('祛痘修护霜'), '油痘肌护理修护霜');
  assert.match(catalogLabel('儿童止痒膏', true).name, /下架复核/);
  assert.equal(/止痒/.test(catalogLabel('儿童止痒膏', true).name), false);
});

test('cards never render a dead 3000 MOQ, and 5–14 stays a sample indication', () => {
  for (const line of [publicMoq(false), publicMoq(true)]) {
    assert.equal(/3000|3,000/.test(line), false);
    assert.match(line, /writing|书面/);
  }
  assert.match(publicSample(false), /5–14/);
  assert.match(publicSample(false), /not a production lead time/);
  assert.match(publicSample(true), /非大货交期/);
});
