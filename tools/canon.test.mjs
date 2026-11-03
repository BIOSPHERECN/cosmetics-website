// 页面地址规范化与缓存键的断言(09-24 安全架构 C1):node tools/canon.test.mjs
// 覆盖 lib/canon.ts(中间件的 301 规范化、缓存键、整页不缓存的判定)与 lib/auth.ts 的会话验签(假 cookie 按游客)。
// 纯函数,不联网、不碰库;退出码只给真失败。
import assert from 'node:assert/strict';

const lib = new URL('../apps/web/src/lib/', import.meta.url);
const c = await import(new URL('canon.ts', lib));
const a = await import(new URL('auth.ts', lib));

const can = (u) => { const x = new URL(u, 'https://biosphere-ai.com'); return c.canonical(x.pathname, x.search); };

// ① 尾斜杠:页面路径补上;接口、资源、后台、带扩展名的不动
assert.equal(can('/zh-cn/ingredients?q=x'), '/zh-cn/ingredients/?q=x');
assert.equal(can('/zh-cn'), '/zh-cn/');
assert.equal(c.isPagePath('/api/member/login'), false);
assert.equal(c.isPagePath('/media/12'), false);
assert.equal(c.isPagePath('/pack/ABC-1'), false);
assert.equal(c.isPagePath('/zh-cn/pack/'), true);
assert.equal(c.isPagePath('/sitemap.xml'), false);
assert.equal(c.isPagePath('/_astro/x.js'), false);
assert.equal(c.isPagePath('/bohui'), false);
assert.equal(c.isPagePath('/bohui/today/'), false);
assert.equal(c.isPagePath('/zh-cn/decoder/12-abc/'), true);

// ② 编码过的参数名、重复参数、坏编码 → 规整(%71=词 绕 WAF 的 q= 规则)
assert.equal(can('/zh-cn/ingredients/?%71=x'), '/zh-cn/ingredients/?q=x');
assert.equal(can('/zh-cn/decoder/?q=a&q=b'), '/zh-cn/decoder/?q=a');
assert.equal(can('/zh-cn/decoder/?q=%E0%A4'), '/zh-cn/decoder/');
assert.equal(can('/zh-cn/decoder/?&q=a'), '/zh-cn/decoder/?q=a');

// ③ 没登记的参数去掉;JUNK 与前端参数保留、不跳
assert.equal(can('/zh-cn/about/?x=1'), '/zh-cn/about/');
assert.equal(can('/zh-cn/search/?x=123&q=abc'), '/zh-cn/search/?q=abc');
assert.equal(can('/zh-cn/about/?utm_source=a&fbclid=b'), null);
assert.equal(can('/zh-cn/contact/?formula=SR-1101&pack=PK-1&market=EU&claim=x&sent=1&cart=abc'), null);
assert.equal(can('/zh-cn/pack/?brief=想做一款敏感肌精华'), null);          // pack 页的 brief 是前端读的自由文本
assert.equal(can('/zh-cn/brief/?brief=ok'), null);                          // 简报回跳状态:小写短词
assert.equal(can('/zh-cn/brief/?brief=%3Cscript%3E'), '/zh-cn/brief/');     // 其他取值丢掉
assert.equal(can('/zh-cn/login/?next=%2Fzh-cn%2Fdecoder%2F&sent=1&email=a%40b.c'), null);
assert.equal(can('/zh-cn/?draft=1'), '/zh-cn/');                            // 草稿预览只给已登录员工(中间件对员工不跳)
assert.equal(can('/zh-cn/decoder/?constructor=1&toString=2&__proto__=3'), '/zh-cn/decoder/');   // 原型链上的名字不当参数
assert.equal(can('/zh-cn/decoder/'), null);

// ④ 取值夹到范围:列表 20 页、带词 10 页;非数字去掉;顺序不同不跳(缓存键里再排序)
assert.equal(can('/zh-cn/decoder/?p=99'), '/zh-cn/decoder/?p=20');
assert.equal(can('/zh-cn/decoder/?q=a&p=15'), '/zh-cn/decoder/?q=a&p=10');
assert.equal(can('/zh-cn/decoder/?p=abc'), '/zh-cn/decoder/');
assert.equal(can('/zh-cn/decoder/?p=2&mk=jp&cat=x'), null);
assert.equal(can('/zh-cn/inci/eu-cosing/?p=300'), '/zh-cn/inci/eu-cosing/?p=20');
assert.equal(can('/zh-cn/inci/eu-cosing/?q=glycer&p=11'), '/zh-cn/inci/eu-cosing/?q=glycer&p=10');
assert.equal(can('/zh-cn/packaging/?p=62&c=30-50'), null);                  // 货架 62 页照旧能翻
assert.equal(can('/zh-cn/classics/?t=primary&p=3'), null);

// ⑤ 缓存键:只留 k 类参数,值规整,按名字排序;u 类(搜索词)整页不缓存;前端参数与 JUNK 不影响
const kp = (u) => { const x = new URL(u, 'https://biosphere-ai.com'); return c.keyParams(x.pathname, x.searchParams); };
const unc = (u) => { const x = new URL(u, 'https://biosphere-ai.com'); return c.uncacheable(x.pathname, x.searchParams); };
assert.deepEqual(kp('/zh-cn/packaging/?t=jar&p=2'), [['p', '2'], ['t', 'jar']]);
assert.deepEqual(kp('/zh-cn/packaging/?p=2&t=jar&utm_source=x'), [['p', '2'], ['t', 'jar']]);
assert.equal(unc('/zh-cn/decoder/?q=abc'), true);
assert.equal(unc('/zh-cn/decoder/?mk=jp'), false);
assert.equal(unc('/zh-cn/search/?q=abc'), false);                           // 站内 AI 检索页的 q 只给前端读
assert.equal(unc('/zh-cn/contact/?formula=x'), false);
assert.equal(unc('/zh-cn/login/?next=/zh-cn/'), true);
assert.equal(unc('/media/12?x=1'), true);
assert.equal(unc('/zh-cn/decoder/?constructor=1'), true);
// sitemap:分片名只认名单,p 夹 0–99;非法值与没带参数共用一个键(路由按同一口径解析,内容一致)
assert.deepEqual(kp('/sitemap.xml?part=decoder&p=3'), [['p', '3'], ['part', 'decoder']]);
assert.deepEqual(kp('/sitemap.xml?part=bogus&p=abc'), []);
assert.deepEqual(kp('/sitemap.xml?part=decoder&p=500'), [['p', '99'], ['part', 'decoder']]);
assert.equal(unc('/sitemap.xml?part=decoder&p=1'), false);
assert.equal(unc('/sitemap.xml?site=x'), true);

// ⑥ 会话验签:对的密钥认、假 cookie / 改过的 / 空密钥一律不认(中间件据此决定「会员不走缓存」)
const tok = await a.issueSession({ id: 7, email: 'm@x.com', role: 'member' }, 'S|member', 1);
assert.equal((await a.readSession(tok, 'S|member'))?.uid, 7);
assert.equal(await a.readSession(tok, 'other|member'), null);
assert.equal(await a.readSession('1', 'S|member'), null);
assert.equal(await a.readSession(tok.slice(0, -2) + 'xx', 'S|member'), null);
assert.equal(await a.readSession(await a.issueSession({ id: 1, email: 'x', role: 'member' }, 'k', 1), ''), null);
assert.equal(a.timingSafeEqual('abc', 'abc'), true);
assert.equal(a.timingSafeEqual('abc', 'abd'), false);

// ⑦ RFQ 深链:product_id / category / market / about / intent 留在地址上。
//    前四项写进服务端 HTML,必须进缓存键,不能和空白询盘共用一份边缘缓存。
assert.equal(can('/en/rfq/?product_id=85&category=serum&market=ID&about=Night%20Cream&intent=sample'), null);
assert.equal(can('/en/rfq?product_id=85&category=serum&market=ID&about=Night+Cream&intent=inquiry'), '/en/rfq/?product_id=85&category=serum&market=ID&about=Night+Cream&intent=inquiry');
assert.equal(can('/en/rfq/?product_id=85&evil=1'), '/en/rfq/?product_id=85');
assert.equal(can('/zh-cn/about/?product_id=85'), '/zh-cn/about/');
assert.deepEqual(kp('/en/rfq/?product_id=85&category=serum&market=ID&about=Night%20Cream&intent=sample'), [['about', 'Night Cream'], ['category', 'serum'], ['market', 'ID'], ['product_id', '85']]);
assert.deepEqual(kp('/en/rfq/'), []);
assert.equal(unc('/en/rfq/?product_id=85&intent=sample'), false);

console.log('canon.test.mjs:全部通过');
