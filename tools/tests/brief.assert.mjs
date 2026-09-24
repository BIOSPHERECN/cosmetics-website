import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../apps/web/src/pages/api/b2o/brief.ts', import.meta.url), 'utf8');
const block = source.match(/\/\/ SELF_TEST_BEGIN\s*([\s\S]*?)\s*\/\/ SELF_TEST_END/);
assert.ok(block, '找不到 brief.ts 中的自测解析器');
const runnable = block[1]
  .replace('export function parseBriefAnswers(message: string): Record<number, string>', 'function parseBriefAnswers(message)')
  .replace('const answers: Record<number, string> = {}', 'const answers = {}')
  .replace('buffer: string[]', 'buffer');
const parseBriefAnswers = Function(`${runnable}\nreturn parseBriefAnswers;`)();

const full = ['【你的店】'];
for (let i = 1; i <= 12; i += 1) {
  if (i === 4) full.push('【想做的新品】');
  if (i === 7) full.push('【合规与上市】');
  if (i === 9) full.push('【量和预算】');
  if (i === 11) full.push('【现状】');
  full.push(`${i}. 第${i}题`, `答:答案${i}`, '');
}
const all = parseBriefAnswers(full.join('\n'));
assert.equal(Object.keys(all).length, 12, '应解析全部 12 题');
assert.equal(all[10], '答案10');
assert.equal(all[12], '答案12');

const partial = parseBriefAnswers(`【你的店】\n1. 平台\n答:Amazon 美国\n\n【想做的新品】\n4. 新品\n答:精华 https://example.com/p\n\n【量和预算】\n9. 数量\n答:首单试产，按月补货`);
assert.deepEqual(partial, { 1: 'Amazon 美国', 4: '精华 https://example.com/p', 9: '首单试产，按月补货' });

const empty = parseBriefAnswers(`1. 平台\n答:\n2. 链接\n答:https://shop.example\n3. 品类\n答:\n4. 新品\n答:面霜`);
assert.deepEqual(empty, { 2: 'https://shop.example', 4: '面霜' }, '空答不能吞掉下一题');
assert.ok(!Object.values(all).some((v) => v.includes('【')), '小标题不应进入答案');
assert.deepEqual(parseBriefAnswers('11. 头疼的？\n答:\n1、交期慢\n2、起订量高\n\n12. 还有？\n答:没了'), { 11: '1、交期慢\n2、起订量高', 12: '没了' }, '答案里的编号清单不能被当成新题');
assert.deepEqual(parseBriefAnswers('3. 价格带\n答:主销\n15.9-29.9 美元\n4. 新品\n答:精华'), { 3: '主销\n15.9-29.9 美元', 4: '精华' }, '行首小数不能被当成题号');

const mappedUrls = [empty[2], empty[4]].filter(Boolean).flatMap((text) => text.match(/https?:\/\/[^\s,，。]+/g) ?? []);
assert.deepEqual(mappedUrls, ['https://shop.example'], '链接只从第 2、4 题提取');
assert.match(source, /platforms:[^\n]*ans\[1\]/);
assert.match(source, /decision_time:[^\n]*ans\[8\]/);
assert.match(source, /scale:[^\n]*ans\[9\]/);

console.log('brief.assert.mjs: 全部断言通过');
