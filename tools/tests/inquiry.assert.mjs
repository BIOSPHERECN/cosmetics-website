import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../apps/web/src/pages/api/inquiry.ts', import.meta.url), 'utf8');
const block = source.match(/\/\/ SELF_TEST_BEGIN\s*([\s\S]*?)\s*\/\/ SELF_TEST_END/);
assert.ok(block, '找不到 inquiry.ts 中的自测解析器');
const runnable = block[1]
  .replace('export function questionAnswers(message: string): Record<number, string>', 'function questionAnswers(message)')
  .replace('const answers: Record<number, string> = {}', 'const answers = {}')
  .replace('buffer: string[]', 'buffer');
const questionAnswers = Function(`${runnable}\nreturn questionAnswers;`)();

const marks = [...'①②③④⑤⑥⑦⑧⑨'];
const zh = marks.flatMap((mark, i) => [`${mark} 第${i + 1}题`, `答:中文答案${i + 1}`, '']).join('\n');
const all = questionAnswers(zh);
assert.equal(Object.keys(all).length, 9, '应解析全部 9 题');
assert.equal(all[3], '中文答案3');
assert.equal(all[8], '中文答案8');

const en = questionAnswers(`1. Brand\nA:Northstar / Amazon\n2. Markets\nA:\n3. Product\nA:Vitamin C serum\n8. Volume\nA:Trial order, then monthly replenishment\n9. Budget\nA:`);
assert.deepEqual(en, { 1: 'Northstar / Amazon', 3: 'Vitamin C serum', 8: 'Trial order, then monthly replenishment' }, '英文空答不能吞掉下一题');
assert.equal(en[3], 'Vitamin C serum', 'category 应取第 3 题');
assert.equal(en[8], 'Trial order, then monthly replenishment', 'volume 应取第 8 题');
assert.deepEqual(questionAnswers('③ Product\nA:\n1. serum\n2. cream\n\n⑧ Volume\nA:5000'), { 3: '1. serum\n2. cream', 8: '5000' }, '答案里的编号清单不能被当成新题');
assert.match(source, /category = \(answers\[3\]/);
assert.match(source, /volume = \(answers\[8\]/);

console.log('inquiry.assert.mjs: 全部断言通过');
