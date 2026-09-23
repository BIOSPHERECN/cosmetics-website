/* build 前焦土:dist 与 .astro 增量缓存曾两次把改过的共享 lib 绑到旧 chunk
   (cron 采集、客服语言判定都中过招 —— 线上跑旧码,查一小时)。
   从此 build 一律走 `npm run build`,先清后建,不靠记性。 */
import { rmSync } from 'node:fs';
for (const d of ['dist', '.astro']) rmSync(d, { recursive: true, force: true });
console.log('[clean-build] dist/.astro 已清');
