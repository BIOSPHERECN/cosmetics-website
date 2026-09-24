// 自家点选码的两站一致性检查(安全架构 v1 L3,2026-09-24):node tools/cap-parity.mjs
//  ① 两站这 5 个文件必须字节一致:lib/captcha.ts、lib/captcha.test.ts、components/ClickCaptcha.astro、pages/api/cap/new.ts、pages/api/cap/pass.ts;
//  ② 两站各有一条 db/migrations/*_cap_seen.sql,内容一致(编号各按各的库);
//  ③ 两站各跑一遍 lib/captcha.test.ts(答对、错序、超时、重放、换 IP 段、太快……见文件头)和 tools/cap-api-e2e.mjs(两个接口端到端);
//  ④ 共用文件里不许出现任何一站的品牌或域名(两站互不关联),组件的内联脚本里不许出现 captcha/verify/slider/track/bg/puzzle。
// 退出码只给真失败。
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const A = 'F:/0cosmetic/cosmetic-sites', B = 'F:/0cosmetic/skin2oem';
const FILES = ['lib/captcha.ts', 'lib/captcha.test.ts', 'components/ClickCaptcha.astro', 'pages/api/cap/new.ts', 'pages/api/cap/pass.ts']
  .map((f) => `apps/web/src/${f}`);

for (const f of FILES) assert.ok(readFileSync(`${A}/${f}`).equals(readFileSync(`${B}/${f}`)), `① 两站不一致:${f}`);
console.log(`① ${FILES.length} 个共用文件字节一致`);

const mig = (root) => {
  const m = readdirSync(`${root}/db/migrations`).filter((f) => f.endsWith('_cap_seen.sql'));
  assert.equal(m.length, 1, `② ${root} 应有且只有一条 *_cap_seen.sql,实有 ${m.length}`);
  return readFileSync(`${root}/db/migrations/${m[0]}`);
};
assert.ok(mig(A).equals(mig(B)), '② 两站 cap_seen 迁移内容不一致');
console.log('② cap_seen 迁移两站内容一致');

for (const root of [A, B]) {
  execFileSync(process.execPath, [`${root}/apps/web/src/lib/captcha.test.ts`], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync(process.execPath, [`${A}/tools/cap-api-e2e.mjs`, root], { stdio: ['ignore', 'ignore', 'inherit'] });
}
console.log('③ 两站 captcha.test.ts 与接口端到端(tools/cap-api-e2e.mjs)全部通过');

const BRAND = /帛卉|bohui|biosphere|beauty2ai|beauty2oem|skin2oem|medierba|b2a_|bh_/i;
for (const f of FILES) assert.ok(!BRAND.test(readFileSync(`${A}/${f}`, 'utf8')), `④ 共用文件出现品牌或域名:${f}`);
const inline = /<script is:inline[^>]*>([\s\S]*?)<\/script>/.exec(readFileSync(`${A}/apps/web/src/components/ClickCaptcha.astro`, 'utf8'))?.[1] ?? '';
assert.ok(inline.length > 1000, '④ 没找到组件的内联脚本');
assert.ok(!/captcha|verify|slider|track|puzzle|\bbg\b|\/\/|\/\*/i.test(inline), '④ 内联脚本里出现了会被通用工具认出的字眼或注释');
console.log('④ 共用文件无品牌/域名;内联脚本无 captcha/verify/slider/track/bg/puzzle 与注释');
