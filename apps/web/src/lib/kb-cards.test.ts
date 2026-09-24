// 自检:node apps/web/src/lib/kb-cards.test.ts(Node ≥23 直接跑 TS)。不过就抛错退出非 0。
import assert from 'node:assert/strict';
import { terms, rank, cites, oneLine } from './kb-cards.ts';

assert.deepEqual(terms('视黄醇在欧盟能用吗'), ['视黄', '黄醇', '醇在', '在欧', '欧盟', '盟能', '能用', '用吗']);
assert.ok(terms('SPF 50 能写吗').includes('spf'));
assert.deepEqual(terms('你们'), []);

const cards = [
  { slug: 'card-k01', kind: '知识卡片', title: 'K01 成分能不能用', tags: 'XX 成分在欧盟 / 美国 / 东南亚能用吗?', body: '- **一句话回答**:「我们按目标市场查目录。」\n  - 出处:公司库 `inci_catalog`\n  - 原文:https://www.gov.uk/x' },
  { slug: 'card-k04', kind: '知识卡片', title: 'K04 起订量、交期、价格', tags: '起订量多少?多久出样?', body: '- **一句话回答**:「样品通常 5–14 天。」' },
  { slug: 'method-p07', kind: '方法卡', title: 'P07 法规先筛(一票否决)', tags: '客户问这个成分/宣称在 X 国能不能用', body: '- **用在**:任何产品。\n- **吸收自**:会诊裁决顺序。' },
];
const r = rank('这个成分欧盟能不能用?', cards);
assert.equal(r[0].slug, 'card-k01');                       // 说服卡排在方法卡前
assert.ok(r.some((c) => c.slug === 'method-p07'));
assert.equal(rank('起订量多少', cards)[0].slug, 'card-k04');
assert.deepEqual(rank('天气', cards), []);
assert.deepEqual(cites(cards[0].body), ['出处:公司库 `inci_catalog`', '原文:https://www.gov.uk/x']);
assert.deepEqual(cites(cards[2].body), ['吸收自:会诊裁决顺序。']);
assert.equal(oneLine(cards[1].body), '「样品通常 5–14 天。」');
console.log('kb-cards 自检通过');
