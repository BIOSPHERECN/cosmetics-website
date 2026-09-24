// 自检:node apps/web/src/lib/b2o-crm.test.ts(Node ≥23 直接跑 TS)。不过就抛错退出非 0。
import assert from 'node:assert/strict';
import { calcGrade, planTrust, gapHints, piiHit, REF_RE, nextWorkday18, fourDone } from './b2o-crm.ts';

// 分级:初评按 65 折算;brand30 + A20 + 规模 3 项(15)= 65 → 100 → A
assert.deepEqual(calcGrade('brand', { cat: 'A', scale: ['brand', 'multi', 'newsku'] }, false).score, 100);
// 初评 ③ 最多 15:4 项也按 15
assert.equal(calcGrade('brand', { cat: 'A', scale: ['brand', 'multi', 'newsku', 'team'] }, false).score, 100);
// catalog5 + C5 + 0 → 10/65 = 15 → C
assert.equal(calcGrade('catalog', { cat: 'C' }, false).grade, 'C');
// 重评五项:tiktok25 + B10 + 10 + now15 + selection10 = 70 → A
const r = calcGrade('tiktok', { cat: 'B', scale: ['brand', 'multi'], timing: 'now', reach: 'selection' }, true);
assert.equal(r.score, 70); assert.equal(r.grade, 'A');
// 69 → B 边界
assert.equal(calcGrade('tiktok', { cat: 'B', scale: ['brand', 'multi'], timing: '90d', reach: 'boss' }, true).grade, 'B'); // 25+10+10+8+15=68
// 最高 C、X、渠道
assert.equal(calcGrade('brand', { cat: 'A', scale: ['brand', 'multi', 'newsku'], small_only: true }, false).grade, 'C');
assert.equal(calcGrade('brand', { x: 'drug' }, false).grade, 'X');
assert.equal(calcGrade('factory', {}, false).grade, 'X');
assert.equal(calcGrade('channel', {}, false).grade, null);
assert.equal(fourDone({ store_url: 'x', factory_pain: 'y', cats_next: 'z', test_cycle: '2周' }), true);
assert.equal(fourDone({ store_url: 'x', factory_pain: 'y', cats_next: 'z' }), false);

// 认同:L0 给店铺 → L3,补记 L1、L2 两行
let p = planTrust(0, 'active', 'store', false)!;
assert.equal(p.lv, 3); assert.deepEqual(p.rows.map((x) => [x.from, x.to, x.backfill]), [[0, 1, true], [1, 2, true], [2, 3, false]]);
// 已在 L4 再给店铺:不往下掉,不写行
p = planTrust(4, 'active', 'store', false)!; assert.equal(p.lv, 4); assert.equal(p.rows.length, 0);
// 硬信号 L5:落级,不挂 pending
p = planTrust(4, 'active', 'sample-ok', false)!; assert.equal(p.lv, 5); assert.equal(p.rows[0].pending, 0);
// 软信号 L7:非主管 → 待确认不落级;主管 → 直接落
p = planTrust(6, 'active', 'second', false)!; assert.equal(p.lv, 6); assert.equal(p.rows[0].pending, 1);
p = planTrust(6, 'active', 'second', true)!; assert.equal(p.lv, 7);
// 降级待确认;L0 不再降
p = planTrust(5, 'active', 'deny', false)!; assert.equal(p.lv, 5); assert.deepEqual([p.rows[0].to, p.rows[0].pending], [4, 1]);
assert.equal(planTrust(0, 'active', 'deny', true)!.rows.length, 0);
// 勿扰 / 培育恢复
assert.equal(planTrust(3, 'active', 'dnd', false)!.pool, 'dnd');
p = planTrust(2, 'nurture', 'reply', false)!; assert.equal(p.pool, 'active'); assert.equal(p.rows[0].kind, 'revive');
assert.equal(planTrust(0, 'active', 'nope', false), null);

// 六角色
assert.equal(gapHints([]).length, 0);
assert.ok(gapHints([{ sku: 'a', role: '引流' }, { sku: 'b', role: '引流' }, { sku: 'c', role: '利润' }])[0].includes('利润款'));

// 个人信息闸
assert.equal(piiHit('客户说下周定,电话 13812345678'), '手机号');
assert.equal(piiHit('发到 wang@x.com'), '邮箱');
assert.equal(piiHit('微信:wang_abc123'), '微信号');
assert.equal(piiHit('客户说面膜袋想换成铝箔,价格带 39–59'), null);
assert.ok(REF_RE.test('C9001-选品')); assert.ok(!REF_RE.test('王总-老板')); assert.ok(!REF_RE.test('C9001-王总'));

// 简报到期:周五北京 20:00 → 下周一 18:00 北京 = 周一 10:00 UTC
assert.equal(nextWorkday18(new Date('2026-09-25T12:00:00Z')), '2026-09-28 10:00:00');
// 周三北京 09:00 → 周四 18:00
assert.equal(nextWorkday18(new Date('2026-09-23T01:00:00Z')), '2026-09-24 10:00:00');
console.log('b2o-crm 自检全过');
