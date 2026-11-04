// 自检:node apps/web/src/lib/human.test.ts
// RFQ E2E 旁路默认关闭。未设 RFQ_E2E_BYPASS_TOKEN 时,假/缺 Turnstile 仍 400。
// 只有请求头与 secret 常数时间全等才跳过 siteverify。不覆盖登录,也不读 body。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { humanGate, humanGateUnlessE2e, rfqE2eBypass } from './human.ts';

const TS = 'turnstile-secret-不上线';
const E2E = 'e2e-bypass-token-不上线';
const envTurnstile = { TURNSTILE_SECRET: TS };

const realFetch = globalThis.fetch;
async function withFetch(mock: typeof fetch, fn: () => Promise<unknown>) {
  globalThis.fetch = mock;
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
}

const deny = async (url: string) => new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } });

async function gate(env: Record<string, string>, token: string, header: string | null) {
  let calls = 0;
  const res = await withFetch(async (url) => { calls += 1; return deny(String(url)); }, () =>
    humanGateUnlessE2e(env, token, header, false)) as Response | null;
  return { res, calls };
}

// 未设 E2E secret:假令牌、缺令牌都仍是 400,错头也没用
{
  const missing = await gate(envTurnstile, '', null);
  assert.equal(missing.res?.status, 400);
  assert.equal(missing.calls, 0);
  assert.equal((await missing.res!.json()).ok, false);

  const fake = await gate(envTurnstile, 'fake-turnstile', null);
  assert.equal(fake.res?.status, 400);
  assert.equal(fake.calls, 1);

  const headerOnly = await gate(envTurnstile, '', E2E);
  assert.equal(headerOnly.res?.status, 400);
  assert.equal(rfqE2eBypass(envTurnstile, E2E), false);
  assert.equal(rfqE2eBypass({ RFQ_E2E_BYPASS_TOKEN: '' }, E2E), false);
  assert.equal(rfqE2eBypass({ RFQ_E2E_BYPASS_TOKEN: '   ' }, '   '), false);
  assert.equal(rfqE2eBypass(null, E2E), false);
  assert.equal(rfqE2eBypass({ RFQ_E2E_BYPASS_TOKEN: E2E }, ''), false);
  assert.equal(rfqE2eBypass({ RFQ_E2E_BYPASS_TOKEN: E2E }, null), false);
}

// 设了 secret:只有全等的请求头跳过;不打 siteverify。错头 / 空头 / 前缀仍 400
{
  const env = { ...envTurnstile, RFQ_E2E_BYPASS_TOKEN: E2E };
  const ok = await gate(env, '', E2E);
  assert.equal(ok.res, null);
  assert.equal(ok.calls, 0);
  assert.equal(rfqE2eBypass(env, `  ${E2E}  `), true);

  const fakeStillSkipped = await gate(env, 'fake-turnstile', E2E);
  assert.equal(fakeStillSkipped.res, null);
  assert.equal(fakeStillSkipped.calls, 0);

  const wrong = await gate(env, '', 'e2e-bypass-token-不上网');
  assert.equal(wrong.res?.status, 400);
  const prefix = await gate(env, 'fake-turnstile', E2E.slice(0, -1));
  assert.equal(prefix.res?.status, 400);
  assert.equal(prefix.calls, 1);
  const longer = await gate(env, '', E2E + 'x');
  assert.equal(longer.res?.status, 400);
  assert.equal(rfqE2eBypass(env, E2E.toUpperCase()), false);
}

// 没配 TURNSTILE_SECRET 时人机闸本身放行(现网旧行为);E2E 未设不得把这条改成默认拒
{
  const open = await humanGate({}, '', false);
  assert.equal(open, null);
  const stillOpen = await humanGateUnlessE2e({}, 'fake-turnstile', E2E, false);
  assert.equal(stillOpen, null);
}

// 接线:旁路只在询盘接口,只读请求头;登录 / 简报 / 会员登录不认这把钥匙
const root = new URL('../../../../', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), 'utf8');
const inquiry = read('apps/web/src/pages/api/inquiry.ts');
assert.match(inquiry, /humanGateUnlessE2e\(env,/);
assert.match(inquiry, /request\.headers\.get\('x-bohui-e2e-token'\)/);
assert.match(inquiry, /overQuota\(db, 'inquiry'/);
assert.match(inquiry, /ticket_id: newId/);
assert.match(inquiry, /RFQ requires market, category and volume/);
assert.doesNotMatch(inquiry, /RFQ_E2E_BYPASS_TOKEN\s*[:=]\s*['"][^'"]+['"]/);
assert.equal(inquiry.includes("f['x-bohui-e2e-token']") || inquiry.includes('f["x-bohui-e2e-token"]'), false);

for (const rel of [
  'apps/web/src/pages/api/admin/login.ts',
  'apps/web/src/pages/api/member/login.ts',
  'apps/web/src/pages/api/b2o/brief.ts',
  'apps/web/src/lib/member.ts',
]) {
  const src = read(rel);
  assert.equal(src.includes('rfqE2eBypass') || src.includes('humanGateUnlessE2e') || src.includes('RFQ_E2E_BYPASS_TOKEN'), false, rel);
}

const humanSrc = read('apps/web/src/lib/human.ts');
assert.match(humanSrc, /if \(!secret \|\| !got\) return false/);
assert.doesNotMatch(humanSrc, /RFQ_E2E_BYPASS_TOKEN\s*=\s*['"][^'"]+['"]/);

console.log('human 自检通过');
