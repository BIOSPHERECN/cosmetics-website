import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 审核部 v2.1 第一关(tools-review/audit_v2/设计-v2.1.md §1.2):每次 astro build 之前跑 gate1,不过就构建失败。
 * audit_v2/ENABLED 不在 = 观察模式:照跑、只提示、不拦、不注入。
 * 构建完给产物 wrangler.json 注入 build.command(§2.8 ③):有人进产物目录直接 wrangler deploy,wrangler 会先跑审核单校验。
 * 破窗只认 ship.sh --breakglass 导出的 BOHUI_BREAKGLASS(去空白 ≥6 字),gate1 退出码 3(硬规则)破窗也不放。
 */
const AV2 = 'F:/0cosmetic/tools-review/audit_v2';
const GATE = `${AV2}/cache/gate_approved/audit_v2`;
const WORKER = 'bohui-web';
let appRoot = null;
let serverDir = null;
const bohuiGate1 = {
  name: 'bohui-gate1',
  hooks: {
    'astro:config:done': ({ config }) => {
      appRoot = fileURLToPath(config.root);
      serverDir = fileURLToPath(config.build.server);
    },
    'astro:build:start': () => {
      const on = existsSync(`${AV2}/ENABLED`);
      const repo = resolve(appRoot, '../..');
      const r = spawnSync('F:/0cosmetic/_venv/review/Scripts/python.exe', [on ? `${GATE}/gate1.py` : `${AV2}/gate1.py`, '--repo', repo, '--mode', 'build'],
        { stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
      if (r.status === 0) return;
      if (!on) { console.warn(`[第一关] 观察模式(${AV2}/ENABLED 不在):exit ${r.status ?? r.error},不拦`); return; }
      const bg = process.env.BOHUI_BREAKGLASS || '';
      if ([...bg.replace(/\s/g, '')].length >= 6 && r.status !== 3) {
        appendFileSync(`${AV2}/ledger/breakglass.jsonl`, JSON.stringify({ ts: new Date().toISOString(), layer: 'astro', repo, gate1_exit: r.status, reason: bg.slice(0, 300) }) + '\n');
        console.warn('[第一关] 破窗放行,已记账,24 小时内追审');
        return;
      }
      throw new Error(`第一关未过(exit ${r.status ?? r.error}),构建中止。拦截项见上;线上出事见 ${AV2}/设计-v2.1.md §3`);
    },
    'astro:build:done': () => {
      const f = serverDir && `${serverDir}/wrangler.json`;
      if (!existsSync(`${AV2}/ENABLED`) || !f || !existsSync(f)) return;
      const c = JSON.parse(readFileSync(f, 'utf-8'));
      c.build = { command: `${GATE}/verify_or_bg.cmd ${WORKER}` };
      writeFileSync(f, JSON.stringify(c));
    },
  },
};

/**
 * 帛卉多站 SSR 应用 —— 一个部署按域名服务 5 个品牌站 + /admin 后台。
 * 服务端渲染而非静态:内容改完即时生效,同时 HTML 由服务端产出,SEO 不丢。
 */
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [bohuiGate1],
  // 不能用 'always':它会把 /media/x.jpg 也重定向成 /media/x.jpg/,
  // 静态资源随之 404。SSR 下页面路径由 [...path] 自己规整,不依赖这个开关。
  trailingSlash: 'ignore',

  /**
   * 收录总闸的默认值。
   *
   * BaseLayout 里 allowIndex = indexable && import.meta.env.PUBLIC_LIVE === '1',
   * 不等于 1 时全站输出 noindex。这个变量原本只能靠部署时手敲 ——
   * 而实测栽过:连着几次构建忘了带,已经上线的 biosphere-ai.com 静默变回 noindex,
   * 构建和部署都不报错,一直到上线终检才发现。
   *
   * 写进 .env 也不行:仓库的 .gitignore 忽略 `.env` 和 `.env.*`,
   * 换台机器 clone 下来闸门又是关的 —— 防呆措施自己被忽略掉了。
   * 所以放在这个**会进版本库**的文件里,本地仍可用环境变量覆盖来关掉。
   *
   * 这只是总闸:单个站还要 sites.is_live=1 才会被收录,
   * 所以打开它不会把另外四个未完成的站一起放出去。
   */
  vite: {
    define: {
      'import.meta.env.PUBLIC_LIVE': JSON.stringify(process.env.PUBLIC_LIVE ?? '1'),
    },
  },
});
