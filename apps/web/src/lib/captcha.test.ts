// 自检:node apps/web/src/lib/captcha.test.ts(Node ≥23 直接跑 TS)。两站同一份;不过就抛错退出非 0。
// 覆盖:答对通过、错序、超时、重放(真 SQLite 跑迁移 *_cap_seen.sql 与 CAP_ONCE_SQL)、换 IP 段、换 UA、太快、两击太密、
//       鼠标没移动、isTrusted 假、三击贴字心 ±1px、落在半径外、篡改令牌、别的密钥、没配密钥、库挂了不放行、
//       通行证(同 /16 认、换 /16 不认、8 小时后不认、fresh)、IPv6 段、与 Python 出图器的加密向量互通。
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  CAP, CAP_ONCE_SQL, CAP_SWEEP_SQL, PASS_COOKIE, checkAnswer, ipNet, issueToken, openAnswer, passCookie, sealAnswer, verifyPass,
  type Target,
} from './captcha.ts';

const SECRET = 'unit-test-secret-not-real-0123456789';
const W = 'T2609', IP = '203.0.113.7', UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36';
const T: Target[] = [[100, 80, 36], [250, 120, 36], [400, 60, 36]];

// 答案加解密;换批次、换密钥都解不开
const a = await sealAnswer(SECRET, W, T);
assert.deepEqual(await openAnswer(SECRET, W, a), T);
assert.equal(await openAnswer(SECRET, 'T2610', a), null);
assert.equal(await openAnswer('other-secret', W, a), null);
assert.equal(await openAnswer(SECRET, W, 'not-base64!'), null);
// 与本机出图器(私有自动化仓 local/capbank/gen.py)seal_answer 同一向量(那边 --selftest 断言同一串)
const VEC = 'AAECAwQFBgcICQoLYqjoTXI50uLRkpG0xYAVar2NHWx-nmVb8MB6j7R_0lR4INhK';
assert.deepEqual(await openAnswer('vector-secret', 'V1', VEC), [[1, 2, 3], [40, 50, 36]]);
assert.equal(await sealAnswer('vector-secret', 'V1', [[1, 2, 3], [40, 50, 36]], Uint8Array.from({ length: 12 }, (_, i) => i)), VEC);

// 一次性:真 SQLite 跑迁移 + 交卷接口用的那条 SQL
const dir = new URL('../../../../db/migrations/', import.meta.url);
const mig = readdirSync(dir).find((f) => f.endsWith('_cap_seen.sql'));
assert.ok(mig, '缺迁移 db/migrations/*_cap_seen.sql');
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL(mig, dir), 'utf8'));
const once = async (k: string, exp: number) => Number((db.prepare(CAP_ONCE_SQL).get(k, exp) as { n: number }).n);

const t0 = 1_790_000_000_000;
const tok = async (ip = IP, ua = UA) => (await issueToken(SECRET, { w: W, a }, 'login', ip, ua, t0)) as string;
const good = { c: [[102, 79, 0], [247, 124, 600], [398, 63, 500]], m: [0, 9, 7], pt: 'mouse', tr: true };
const run = async (t: string, body: object, now = t0 + 3000, ip = IP, ua = UA) =>
  checkAnswer({ secret: SECRET, t, body, ip, ua, now, once });

assert.equal((await run(await tok(), good)).ok, true);                                                   // ① 答对通过
assert.equal((await run(await tok(), { ...good, c: [good.c[1], good.c[0], good.c[2]] })).code, 'no');   // ② 错序
assert.equal((await run(await tok(), good, t0 + CAP.tokenMs + 1)).code, 'exp');                         // ③ 超时
const t1 = await tok();                                                                                  // ④ 重放
assert.equal((await run(t1, good)).ok, true);
assert.equal((await run(t1, good)).code, 'no');
assert.equal((await run(await tok(), good, t0 + 3000, '203.0.114.7')).code, 'bad');                     // ⑤ 换 IP 段
assert.equal((await run(await tok(), good, t0 + 3000, '203.0.113.200')).ok, true);                       //    同一 /24 照过
assert.equal((await run(await tok(), good, t0 + 3000, IP, UA + ' x')).code, 'bad');                      //    换 UA
assert.equal((await run(await tok(), good, t0 + CAP.minSolveMs - 1)).code, 'no');                        // ⑥ 太快(< 1.2 秒)
assert.equal((await run(await tok(), { ...good, c: [good.c[0], [247, 124, CAP.minGapMs - 1], good.c[2]] })).code, 'no'); // 两击太密
assert.equal((await run(await tok(), { ...good, m: [0, 2, 7] })).code, 'no');                            // 鼠标两击之间没怎么动
assert.equal((await run(await tok(), { ...good, pt: 'touch', m: [] })).ok, true);                        // 触屏不要求移动
assert.equal((await run(await tok(), { ...good, pt: 'key', m: [] })).ok, true);                          // 键盘(无障碍)
assert.equal((await run(await tok(), { ...good, tr: false })).code, 'no');                               // 合成事件
assert.equal((await run(await tok(), { ...good, pt: 'robot' })).code, 'no');
assert.equal((await run(await tok(), { ...good, c: good.c.slice(0, 2) })).code, 'no');                   // 点数不对
assert.equal((await run(await tok(), { ...good, c: [[100, 80, 0], [250, 121, 600], [401, 60, 500]] })).code, 'no'); // 三击贴字心 ±1px
assert.equal((await run(await tok(), { ...good, c: [[100, 117, 0], good.c[1], good.c[2]] })).code, 'no');           // 半径外
const tt = await tok();                                                                                  // 篡改令牌
assert.equal((await run(tt.slice(0, 20) + (tt[20] === 'A' ? 'B' : 'A') + tt.slice(21), good)).code, 'bad');
assert.equal((await run(tt + 'x', good)).code, 'bad');
assert.equal((await checkAnswer({ secret: 'other-secret', t: await tok(), body: good, ip: IP, ua: UA, now: t0 + 3000, once })).code, 'bad');
assert.equal(await issueToken('', { w: W, a }, 'login', IP, UA), null);                                  // 没配密钥:不发
assert.equal((await checkAnswer({ secret: '', t: await tok(), body: good, ip: IP, ua: UA, now: t0 + 3000, once })).code, 'bad');
await assert.rejects(checkAnswer({ secret: SECRET, t: await tok(), body: good, ip: IP, ua: UA, now: t0 + 3000,
  once: async () => { throw new Error('D1 不可用'); } }));                                               // 库挂了:抛错,接口回 503
db.prepare(CAP_SWEEP_SQL).run(Math.floor(t0 / 1000) + 3600);                                            // 过期行能清掉
assert.equal(db.prepare('SELECT k FROM cap_seen').all().length, 0);

// 通行证
const env = { CAP_SECRET: SECRET };
const ck = await passCookie(SECRET, IP, UA, t0);
assert.match(ck, /^__Host-cap=[\w-]+\.[\w-]+; Path=\/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax$/);
const req = (ip: string, ua = UA, cookie = ck.split(';')[0]) =>
  ({ headers: new Headers({ cookie: `lang=zh; ${cookie}`, 'cf-connecting-ip': ip, 'user-agent': ua }) }) as unknown as Request;
assert.equal(await verifyPass(req('203.0.9.9'), env, { now: t0 + 1000 }), true);                        // 同一 /16(手机换出口)
assert.equal(await verifyPass(req('203.1.113.7'), env, { now: t0 + 1000 }), false);                      // 换 /16
assert.equal(await verifyPass(req(IP, UA + ' x'), env, { now: t0 + 1000 }), false);                      // 换 UA
assert.equal(await verifyPass(req(IP), env, { now: t0 + CAP.passMs + 1 }), false);                       // 8 小时后
assert.equal(await verifyPass(req(IP), env, { now: t0 + 700_000, fresh: 600 }), false);                  // 账号异常:只认 10 分钟内的
assert.equal(await verifyPass(req(IP), env, { now: t0 + 500_000, fresh: 600 }), true);
assert.equal(await verifyPass(req(IP), {}, { now: t0 + 1000 }), false);                                  // 没配密钥
assert.equal(await verifyPass(req(IP, UA, 'x=1'), env, { now: t0 + 1000 }), false);                      // 没 cookie
assert.equal(await verifyPass(req(IP, UA, `${PASS_COOKIE}=${await tok()}`), env, { now: t0 + 1000 }), false); // 出题令牌冒充通行证

// IP 段
assert.equal(ipNet('2001:db8:1:2:3:4:5:6', 24, 64), '2001:db8:1:2::/64');
assert.equal(ipNet('2001:0db8:0001::5', 16, 48), '2001:db8:1::/48');
assert.equal(ipNet('::ffff:198.51.100.9', 24, 64), '198.51.100.0/24');
assert.equal(ipNet('198.51.100.9', 16, 48), '198.51.0.0/16');
for (const bad of ['', 'unknown', '1.2.3.999', '1::2::3', '2001:db8::zz']) assert.equal(ipNet(bad, 24, 64), 'x', bad);

console.log('captcha 自检通过:答对 / 错序 / 超时 / 重放 / 换 IP 段 / 换 UA / 太快 / 两击太密 / 无移动 / 假事件 / 贴字心 / 半径外 / 篡改 / 无密钥 / 库挂 / 通行证 / IPv6 / Python 向量');
