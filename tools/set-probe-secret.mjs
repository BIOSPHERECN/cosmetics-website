// 09-25 把本机 .env 的 PROBE_SECRET 设成 bohui-web 的 Worker secret(冒烟探针,middleware 认 x-bohui-probe)。
// 只由 ship_ops.sh prod 在审核通过后执行;值只经 stdin 传给 wrangler,不进命令行、不打印。
// 09-25 审核员:脚本自己锁死 Worker 名(--name bohui-web)和公司账号(从同一份 .env 取 ACCOUNT_ID / API_TOKEN),
// 不依赖调用方的目录、环境变量或 OAuth 登录,绕开闸门单独跑也打不到别的账号或别的 Worker。
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const env = readFileSync('F:/0cosmetic/cosmetic-sites/.env', 'utf8');
const pick = (k) => env.match(new RegExp(`^[ \\t]*${k}[ \\t]*=[ \\t]*"?([^"\\r\\n]+)"?`, 'm'))?.[1].trim() ?? '';
const secret = pick('PROBE_SECRET'), account = pick('CLOUDFLARE_ACCOUNT_ID'), token = pick('CLOUDFLARE_API_TOKEN');
if (!secret || !account || !token) { console.error('本机 .env 缺 PROBE_SECRET / CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN'); process.exit(2); }
const child = { ...process.env, CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token };
const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'PROBE_SECRET', '--name', 'bohui-web'],
  { input: secret, stdio: ['pipe', 'inherit', 'inherit'], shell: true, env: child, cwd: 'F:/0cosmetic/cosmetic-sites/apps/web' });
process.exit(r.status ?? 1);
