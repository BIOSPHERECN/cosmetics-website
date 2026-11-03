// 自检:node apps/web/src/lib/hcgate.test.ts(Node ≥23 直接跑 TS)。两站同一份;不过就抛错退出非 0。
// 覆盖点选码接入点的判定:走哪条(回滚开关、没配密钥、beauty2oem 强制)、有无通行证、账号异常只认 10 分钟内、探测只回 204 / 428、可疑会员。
import assert from 'node:assert/strict';
import { passCookie } from './captcha.ts';
import { humanMode, capFail, isProbe, probeResp, suspect } from './hcgate.ts';

const S = 'test-secret-不上线';
const IP = '203.0.113.9', UA = 'Mozilla/5.0 Test';
const req = (cookie = '', h: Record<string, string> = {}, cf?: object) => {
  const r = new Request('https://x.test/api/member/login', { method: 'POST', headers: { 'cf-connecting-ip': IP, 'user-agent': UA, cookie, ...h } });
  if (cf) Object.defineProperty(r, 'cf', { value: cf });
  return r;
};
const ck = (now = Date.now()) => passCookie(S, IP, UA, now).then((c) => c.split(';')[0]);

// 走哪条
assert.equal(humanMode({}), 'turnstile');                                          // 没配密钥:先上代码也不开口子
assert.equal(humanMode({ CAP_SECRET: S }), 'cap');
assert.equal(humanMode({ CAP_SECRET: S, HUMAN_GATE: 'turnstile' }), 'turnstile');  // 回滚开关
assert.equal(humanMode({ HUMAN_GATE: 'cap' }), 'cap');
assert.equal(humanMode({ HUMAN_GATE: 'turnstile' }, true), 'cap');                 // beauty2oem 只走点选码

// 通行证
const env = { CAP_SECRET: S };
assert.equal(await capFail(req(), {}), 'human-off');                               // 没配密钥一律拒
assert.equal(await capFail(req(), env), 'cap');
assert.equal(await capFail(req(await ck()), env), null);
assert.equal(await capFail(req(await ck()), { CAP_SECRET: 'other' }), 'cap');      // 别的密钥签的不认
assert.equal(await capFail(req(await ck(Date.now() - 20 * 60_000)), env), null);    // 20 分钟前的,平时认
assert.equal(await capFail(req(await ck(Date.now() - 20 * 60_000)), env, true), 'cap-fresh');   // 账号异常不认
assert.equal(await capFail(req(await ck()), env, true), null);

// 探测
assert.ok(isProbe(req('', { 'x-hc': 'probe' })) && !isProbe(req()));
assert.equal(probeResp('cap').status, 428);
assert.equal(probeResp('cap-fresh').status, 428);
assert.equal(probeResp(null).status, 204);
assert.equal(probeResp('human-off').status, 204);   // 没配密钥交给正式提交报人话,不弹一个出不了题的框

// 可疑会员
assert.equal(suspect(req('', {}, { asn: 16509 })), true);    // AWS
assert.equal(suspect(req('', {}, { asn: 4134 })), false);    // 电信
assert.equal(suspect(req('', { 'user-agent': 'Mozilla/5.0 HeadlessChrome/120' })), true);
assert.equal(suspect(req()), false);

console.log('hcgate 自检通过');
