// 会员每日限额的一致性检查(2026-09-23):node tools/quota-parity.mjs
//  ① 两站 lib/quota.ts 必须字节一致(工厂站 cosmetic-sites 与平台站 skin2oem,「两站别写两套逻辑」);
//  ② 纯函数断言:限额档位、北京日界、爬虫分档(回答型放行、训练型与冒充按未登录);
//  ③ 把 gate() 的两句 SQL 跑在真 SQLite(node:sqlite)上:第 21 条被拒、同一条重复看不扣、付费 100 条。
// 退出码只给真失败。
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const A = 'F:/0cosmetic/cosmetic-sites/apps/web/src/lib/quota.ts';
const B = 'F:/0cosmetic/skin2oem/apps/web/src/lib/quota.ts';
let b = null;
try { b = readFileSync(B); } catch { /* 平台那份还没拷过去 */ }
if (b === null) console.log('① 平台站还没有 quota.ts:', B);
else { assert.ok(readFileSync(A).equals(b), `① 两站 quota.ts 不一致:\n  ${A}\n  ${B}`); console.log('① 两站 quota.ts 字节一致'); }

const q = await import('file:///' + A);
assert.equal(q.limitFor(null), 20); assert.equal(q.limitFor('free'), 20);
assert.equal(q.limitFor('pro'), 100); assert.equal(q.limitFor('starter'), 100);
const t = (s) => Date.parse(s);
assert.equal(q.bjDay(t('2026-09-22T15:59:59Z')), '2026-09-22');
assert.equal(q.bjDay(t('2026-09-22T16:00:00Z')), '2026-09-23');   // 北京 0 点翻日
assert.equal(q.secsToReset(t('2026-09-22T15:59:59Z')), 1);
assert.equal(q.secsToReset(t('2026-09-22T16:00:00Z')), 86400);
const openai = (() => { const n = 1758509248; return [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.'); })();   // ai-ip.ts 段表第一段
const UA = {
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bing: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  chatgpt: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  claudebot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  claudeuser: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  ccbot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
  bytespider: 'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};
assert.equal(q.answerBot(UA.google, '1.2.3.4'), true);
assert.equal(q.answerBot(UA.bing, '1.2.3.4'), true);
assert.equal(q.answerBot(UA.claudeuser, '1.2.3.4'), true);
assert.equal(q.answerBot(UA.chatgpt, openai), true);
assert.equal(q.answerBot(UA.chatgpt, '1.2.3.4'), false);   // 冒充 ChatGPT-User
for (const k of ['gptbot', 'claudebot', 'ccbot', 'bytespider', 'chrome']) assert.equal(q.answerBot(UA[k], openai), false, k);
console.log('② 限额档位 / 北京日界 / 爬虫分档 全部通过');

// ③ 真 SQLite 跑 gate():D1 的 prepare/bind/batch 用最薄的一层垫片
const db = new DatabaseSync(':memory:');
db.exec(readFileSync('F:/0cosmetic/cosmetic-sites/db/migrations/0104_members.sql', 'utf8'));
const d1 = {
  prepare(sql) { return { sql, args: [], bind(...a) { this.args = a; return this; } }; },
  async batch(stmts) {
    return stmts.map((s) => (/^\s*select/i.test(s.sql) ? { results: db.prepare(s.sql).all(...s.args) } : (db.prepare(s.sql).run(...s.args), { results: [] })));
  },
};
const free = { id: 1, plan_id: 'free' }, pro = { id: 2, plan_id: 'pro' };
assert.equal((await q.gate({ db: d1, bot: true, member: null, item: 'dec:1' })).state, 'bot');
assert.equal((await q.gate({ db: d1, bot: false, member: null, item: 'dec:1' })).state, 'login');
for (let i = 1; i <= 20; i++) assert.equal((await q.gate({ db: d1, bot: false, member: free, item: `dec:${i}` })).state, 'full', `第 ${i} 条`);
const g21 = await q.gate({ db: d1, bot: false, member: free, item: 'dec:21' });
assert.deepEqual([g21.state, g21.used, g21.limit], ['over', 20, 20]);
const again = await q.gate({ db: d1, bot: false, member: free, item: 'dec:7' });
assert.deepEqual([again.state, again.used], ['full', 20]);   // 今天看过的仍可看,不再扣
for (let i = 1; i <= 100; i++) assert.equal((await q.gate({ db: d1, bot: false, member: pro, item: `q:${i}` })).state, 'full');
assert.equal((await q.gate({ db: d1, bot: false, member: pro, item: 'q:101' })).state, 'over');
assert.equal(db.prepare('SELECT COUNT(*) n FROM mb_views WHERE member_id = 1').get().n, 20);
console.log('③ SQLite 实跑:免费第 21 条 over、重复看不扣、付费 100 条封顶 —— 通过');
