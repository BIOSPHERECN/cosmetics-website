/**
 * 试验版 Worker 的验收 —— 逐条验证「优化后的行为」,而不是「代码看着对」。
 * 每一项都对应原实现的一个具体缺陷;验不过就不该往生产上转移。
 *
 * 跑法:node external/m-biosphere-ai/verify.mjs [基址]
 */
if ((process.env.HTTPS_PROXY || process.env.HTTP_PROXY) && !process.env.NODE_USE_ENV_PROXY) {
  process.env.NODE_USE_ENV_PROXY = '1';
  const { spawnSync } = await import('node:child_process');
  const self = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  process.exit(spawnSync(process.execPath, [self, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env }).status ?? 1);
}
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

/* ── 让这份验收可以反复跑 ──────────────────────────────────
   前两轮踩到两个**测试自己的**坑,记下来:
     ① 第九项会把本机 IP 锁 15 分钟,于是第二轮的登录全部 429,
        然后后面十几项跟着连锁失败 —— 看起来像代码坏了,其实是上一轮的残留。
     ② 伪造令牌硬写 pv:1,可第八项改过两次密码,版本已经推到 3。
        令牌被拒是**正确行为**,是断言写错了。
   所以开跑前先清限速计数、并从库里读当前密码版本。 */
const ENV = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2]]));
const ACC = '894467610b4ed9d79b7bdf1b31e2f2b2';
const NS = readFileSync('node_modules/.cache/v2ns.txt', 'utf8').trim();
const kvApi = (path, init = {}) => fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACC}/storage/kv/namespaces/${NS}${path}`,
  { ...init, headers: { Authorization: `Bearer ${ENV.CLOUDFLARE_API_TOKEN}`, ...(init.headers || {}) } });

async function resetState() {
  const list = await (await kvApi('/keys?prefix=login_fail')).json().catch(() => ({ result: [] }));
  for (const k of list.result || []) await kvApi(`/values/${k.name}`, { method: 'DELETE' });
  const pvRes = await kvApi('/values/bhbohui_password_version');
  const pv = pvRes.ok ? Number(await pvRes.text()) || 1 : 1;
  return { cleared: (list.result || []).length, pv };
}

const B = process.argv[2] || 'https://m-biosphere-ai-v2.huanggw20.workers.dev';
const PWD = readFileSync('node_modules/.cache/v2pwd.txt', 'utf8').trim();
const NEW_SECRET = readFileSync('node_modules/.cache/v2secret.txt', 'utf8').trim();
const OLD_SECRET = 'm-biosphere-ai-bhbohui-secret-2026-bios';   // 原 bundle 里那串,已泄漏

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => {
  ok ? (pass++, console.log('  ✓', name, extra)) : (fail++, console.log('  ✗', name, extra));
  return ok;
};
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });

/** 用给定密钥自签一个令牌 —— 模拟「拿到密钥的攻击者」 */
const forge = (secret, pv) => {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 6e8, sub: 'bhbohui', pv })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
};

const { cleared, pv: PV } = await resetState();
console.log(`验收目标:${B}`);
console.log(`(已清 ${cleared} 条限速计数;当前密码版本 pv=${PV})`);
console.log('');

console.log('一、静态站');
{
  const r = await get('/');
  const html = await r.text();
  t('首页 200', r.status === 200);
  t('注入了国家码', html.includes('__CF_IPCOUNTRY__'));
  t('HTML 缓存没被关掉(原实现被迫 no-store)', !(r.headers.get('cache-control') || '').includes('no-store'),
    `→ ${r.headers.get('cache-control') || '(未设)'}`);
  const img = await get('/images/medierba-prod-1.webp');
  t('静态图片可取', img.status === 200 && Number(img.headers.get('content-length')) > 10000);
}

console.log('\n二、语言跳转(301 → 302)');
{
  const r = await get('/zh-cn/company.html');
  t('用 302 而非 301', r.status === 302, `→ ${r.status}`);
  t('跳到带 lang 参数的目标', (r.headers.get('location') || '').includes('lang=zh'));
}

console.log('\n三、未登录时的门');
{
  t('/bhbohui 未登录跳登录页', (await get('/bhbohui')).status === 302);
  t('/bhbohui/login 可打开', (await get('/bhbohui/login')).status === 200);
  t('session 报未登录', (await (await get('/bhbohui/api/session')).json()).ok === false);
  t('上传接口未登录 401', (await get('/api/upload', { method: 'POST' })).status === 401);
}

console.log('\n四、密钥轮换是否真的生效');
{
  const r1 = await get('/bhbohui/api/session', { headers: { Cookie: `bhbohui_token=${forge(OLD_SECRET, PV)}` } });
  t('★ 用泄漏的旧密钥自签的令牌 —— 被拒', (await r1.json()).ok === false);
  const r2 = await get('/bhbohui/api/session', { headers: { Cookie: `bhbohui_token=${forge(NEW_SECRET, PV)}` } });
  t('用新密钥自签的令牌 —— 通过(说明验签本身是通的)', (await r2.json()).ok === true);
  const good = forge(NEW_SECRET, PV);
  const evil = Buffer.from(JSON.stringify({ exp: Date.now() + 6e8, sub: 'root', pv: PV })).toString('base64url')
    + '.' + good.split('.')[1];
  t('改了 payload、签名照抄 —— 被拒', (await (await get('/bhbohui/api/session', { headers: { Cookie: `bhbohui_token=${evil}` } })).json()).ok === false);
}

console.log('\n五、登录');
let cookie = '';
{
  const bad = await get('/bhbohui/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password' }),
  });
  t('错密码 401', bad.status === 401);
  t('错密码响应不带 CORS 通配(原实现全开)', !bad.headers.get('access-control-allow-origin'));

  const ok = await get('/bhbohui/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PWD }),
  });
  t('对密码 200', ok.status === 200);
  const sc = ok.headers.get('set-cookie') || '';
  cookie = sc.split(';')[0];
  t('cookie 带 HttpOnly', /HttpOnly/i.test(sc));
  t('cookie 带 Secure', /Secure/i.test(sc));
  t('cookie 带 SameSite=Lax', /SameSite=Lax/i.test(sc));
  t('登录后 session 为真', (await (await get('/bhbohui/api/session', { headers: { Cookie: cookie } })).json()).ok === true);
  t('登录后能打开后台页', (await get('/bhbohui', { headers: { Cookie: cookie } })).status === 200);
}

console.log('\n六、上传');
{
  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const post = (obj) => get('/api/upload', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });

  const fake = await post({ type: 'image/png', data: Buffer.from('<html>not an image</html>').toString('base64') });
  t('★ 假冒 image/png 的 HTML —— 被文件头校验挡下(原实现放行)', fake.status === 400,
    `→ ${fake.status} ${(await fake.json()).message || ''}`);

  t('不支持的类型 400', (await post({ type: 'application/pdf', data: PNG_1PX })).status === 400);

  const good = await post({ type: 'image/png', data: PNG_1PX });
  const gd = await good.json();
  t('真 PNG 上传成功', good.status === 200 && !!gd.url, `→ ${gd.url || gd.message}`);
  t('key 用 UUID 不是 6 位随机', /^[0-9a-f-]{36}\.png$/.test(gd.key || ''), `→ ${gd.key}`);
  if (gd.url) {
    const back = await get(gd.url);
    t('取回刚上传的图', back.status === 200 && (back.headers.get('content-type') || '').includes('image/png'));
    t('图片走长缓存', (back.headers.get('cache-control') || '').includes('immutable'));
  }
  const old = await get('/assets/mt6nvqxr-uclkb8.png');
  t('老图(KV 里那批)仍然取得到', old.status === 200 && (old.headers.get('content-type') || '').includes('image'));
}

console.log('\n七、公开接口');
{
  const r = await get('/api/formula?label=' + encodeURIComponent('防晒 修护'));
  const d = await r.json();
  t('配方接口 200', r.status === 200);
  t('有命中结果', d.total > 0, `→ ${d.total} 条:${(d.matched || []).map((x) => x.name).join('、')}`);
  t('公开接口开 CORS', r.headers.get('access-control-allow-origin') === '*');
  t('返回里不含内部 tags 字段', !('tags' in (d.matched?.[0] ?? {})));
}

console.log('\n八、改密码能否把别人踢下线');
{
  const TMP = 'temp-rotate-check-9931';
  const r = await get('/bhbohui/api/change-password', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: PWD, new_password: TMP }),
  });
  const msg = (await r.clone().json()).message;
  t('改密码成功', r.status === 200, `→ ${msg}`);
  const fresh = (r.headers.get('set-cookie') || '').split(';')[0];
  t('★ 旧令牌当场失效(原实现仍然有效)',
    (await (await get('/bhbohui/api/session', { headers: { Cookie: cookie } })).json()).ok === false);
  t('当前会话换发了新令牌,自己没被踢出去',
    (await (await get('/bhbohui/api/session', { headers: { Cookie: fresh } })).json()).ok === true);

  const back = await get('/bhbohui/api/change-password', {
    method: 'POST', headers: { Cookie: fresh, 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: TMP, new_password: PWD }),
  });
  t('改回原密码(不给下一轮验收留脏状态)', back.status === 200);
  cookie = (back.headers.get('set-cookie') || '').split(';')[0];

  const short = await get('/bhbohui/api/change-password', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: PWD, new_password: 'short' }),
  });
  t('太短的新密码被拒(原来只要 6 位)', short.status === 400);
}

console.log('\n九、登录限速(放最后:会把本机 IP 锁 15 分钟)');
{
  let at = 0;
  for (let i = 1; i <= 13; i++) {
    const r = await get('/bhbohui/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'brute-force-' + i }),
    });
    if (r.status === 429) { at = i; break; }
  }
  t('★ 连续错误密码后被锁(原实现可无限试)', at > 0, at ? `→ 第 ${at} 次触发 429` : '→ 13 次都没锁上');
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
