/**
 * 按访客地区自动选语言 + 语言码别名跳转。
 *
 * 三条判据,按可信度排序:
 *  ① 访客手动选过语言(cookie)→ 永远尊重,绝不再自动跳。
 *     这一条排第一是有原因的:自动跳最烦人的形态就是「我选了英文,你又给我跳回中文」。
 *  ② 浏览器的 Accept-Language —— 这是访客自己设的,比 IP 准。
 *  ③ Cloudflare 给的国家码(request.cf.country)—— 出国旅行、用代理时会不准,所以垫底。
 *
 * 只在**没有语言前缀**的路径上跳(如 `/`),已经带前缀的一律不动 ——
 * 否则分享出去的链接会在别人那里变成另一种语言,那比不跳更糟。
 * 用 302 不用 301:地区判断是会变的,不该被浏览器永久缓存。
 */
import { defineMiddleware } from 'astro:middleware';
import { openaiIp } from './lib/ai-ip';
/* 打点与租户闸都要读绑定 —— 这一行漏了,AE 的 writeDataPoint 从没执行过,
   而 try/catch 把 ReferenceError 也吞了,表现是「一切正常但没有数据」。 */
import { env as cfEnv } from 'cloudflare:workers';
/* lib/auth 只有 WebCrypto,没有任何组件依赖,中间件可以安全 import(guard.ts 不行,它拉 tenant) */
import { readSession, readCookie, COOKIE } from './lib/auth';
/* lib/quota 只依赖 ai-ip(纯数据),同样可以进中间件 */
import { answerBot } from './lib/quota';
/* lib/fuse:费用熔断保险丝(只依赖 D1,与 quota 同一约束,可进中间件) */
import { fuseCheck, fuseResponse } from './lib/fuse';
/* lib/member 只依赖 auth 与 quota;lib/canon 没有任何依赖(09-24 C1) */
import { memberSigned } from './lib/member';
import { canonical, isPagePath, keyParams, uncacheable } from './lib/canon';
/* 简→繁:只带 cn2t 这一半词典(全量还含繁→简,我们用不到)。
   opencc-js 是纯 JS、无 Node 依赖,可以进 Worker;
   **它不是 @cosmetic/core**,不会把组件模块图拉进中间件。 */
import * as OpenCC from 'opencc-js/cn2t';

/* 域名 → 站点 ID。**这里必须是复制的一份,不能 import @cosmetic/core** ——
   中间件跑在请求最前面,拉进组件包会把整个模块图带进来,
   实测后果是全站 500、robots.txt 404(2026-09-07,上线即挂)。
   文件顶上第 17 行早就写着这条规矩,我还是踩了。
   权威定义在 packages/core/src/content/tenant-map.ts,改那边时记得同步这里。 */
const HOST_SITE_MW: Record<string, string> = {
  'biosphere-ai.com': 'biosphere-ai',
  'beauty2oem.com': 'beauty2oem',
  'skin2oem.com': 'skin2oem',
  'medierba.com': 'medierba',
  'biosphere-oralcare.com': 'biosphere-oralcare',
};
const CONTACT_CACHE = new Map<string, { at: number; v: { whatsapp: string | null; wechat: string | null } }>();
async function siteContactFor(host: string) {
  const id = siteIdForHost(host) ?? 'biosphere-ai';
  const hit = CONTACT_CACHE.get(id);
  if (hit && Date.now() - hit.at < 600_000) return hit.v;
  let v = { whatsapp: null as string | null, wechat: null as string | null };
  try {
    const db = (cfEnv as any)?.DB as D1Database | undefined;
    const r = db ? await db.prepare(`SELECT contact_whatsapp, contact_wechat FROM sites WHERE id=?`).bind(id).first<any>() : null;
    if (r) v = { whatsapp: r.contact_whatsapp || null, wechat: r.contact_wechat || null };
  } catch { /* 列还没加或库抖动:页脚退回占位文案,不影响页面 */ }
  CONTACT_CACHE.set(id, { at: Date.now(), v }); return v;
}
const siteIdForHost = (host: string): string | null => {
  const clean = String(host || '').toLowerCase().replace(/^www\./, '').split(':')[0];
  return HOST_SITE_MW[clean] ?? null;
};

// 与 packages/core/src/i18n 的 LOCALES 一一对应(36 语)。
// 中间件跑在请求最前面,不能 import 组件包 —— 所以这里是复制的一份,
// 由 tools/gen-i18n.mjs 从 tools/locales.json 同步生成,不手抄。
const LOCALES = [
  'en',
  'zh-cn',
  'zh-tw',   // 繁體中文 —— 与 packages/core/src/i18n 的 LOCALES 保持同步
  'jp',
  'kr',
  'fr',
  'de',
  'ru',
  'id',
  'my',
  'th',
  'vn',
  'ph',
  'es',
  'pt',
  'ar',
  'tr',
  'in',
] as const;
type L = (typeof LOCALES)[number];
const DEFAULT: L = 'en'; // 兜底用英文:这是外贸站,判不出来时按海外访客处理

/**
 * 语言码别名 —— 手输错也能到,而不是吃一个 404。
 *
 * /jp/ 是最要紧的一条:日本的**国家**码是 JP,语言码却是 ja。
 * 界面上我们按创始人的要求写 JP,地址栏与 hreflang 必须写 ja(Google 只认语言码,
 * 写成 jp 会让整套 hreflang 失效)。别名把这道缝补上:两边都对,谁也不将就。
 *
 * in→id 是历史包袱:印尼语的旧码是 in,老设备、老 Java 系统至今还在发这个。
 * my→ms 有个前提要说清楚:my 其实是缅甸语的码,但我们不做缅甸语,
 * 而访客眼里 MY 就是马来西亚 —— 在不支持缅甸语的前提下这样映射是安全的;
 * 哪天真上缅甸语,这一行必须先删掉。
 */
const ALIAS: Record<string, L> = {
  /* 路径码用国家缩写,语言码留给 hreflang。
     下拉里写 JP / KR / MY / VN / PH / IN,点进去却是 /ja/ /ko/ /ms/ ——
     角标和地址栏对不上。改成路径走国家码,hreflang 仍走语言码:
     jp 不是合法的 BCP-47 语言标签,写进 hreflang 谷歌会直接忽略;
     而路径长什么样搜索引擎并不管 —— 两者本来就该分开。
     老的语言码路径全部留在这里做 302,不让任何旧链接 404。 */
  ja: 'jp', ko: 'kr', ms: 'my', vi: 'vn', tl: 'ph', hi: 'in',

  /* 港澳走繁体。2026-09-07 外部诊断:/zh-hk/ 当时是 404。
     港澳与台湾的用词有差异,但不足以单独维护一套内容 ——
     多一份译文就多一份会漂移的东西,而漂移不报错。 */
  'zh-hk': 'zh-tw', 'zh-mo': 'zh-tw', 'zh-hant': 'zh-tw',

  /* 常见误写 */
  zh: 'zh-cn', cn: 'zh-cn', 'zh-hans': 'zh-cn',
  'en-us': 'en', 'en-gb': 'en', 'fr-fr': 'fr',
  br: 'pt', 'pt-br': 'pt', mx: 'es', 'es-mx': 'es', 'es-419': 'es',
  fil: 'ph',

  /* 这里**故意没有** in: 'id'。
     in 是 Java/Android 沿用的印尼语旧码,浏览器 Accept-Language 里确实会发它,
     但地址栏里的 /in/ 现在是印度。两者是两套命名空间:
     头部的 in 到印尼留在下面的 PREFIX 表,路径的 /in/ 到印度走 LOCALES。
     若在这里写 in: 'id',印度访客点自己的语言会被送去印尼语版。 */

  /* 已退役的 29 门语种。删掉不等于让老链接 404 ——
     搜索引擎、外链、书签里都可能还有 /pt-br/ /bn/ /sv/。 */
  bn: 'en', ur: 'en',
  pa: 'in', te: 'in', ta: 'in', mr: 'in', gu: 'in',
  jv: 'id',
  kk: 'ru', uz: 'ru',
  it: 'en', nl: 'en', pl: 'en', sv: 'en', da: 'en',
  fi: 'en', no: 'en', nb: 'en', nn: 'en', cs: 'en',
  sk: 'en', el: 'en', hu: 'en', ro: 'en', uk: 'en',
  fa: 'en', he: 'en', iw: 'en',
  sw: 'en', ha: 'en', am: 'en',
};

/** 国家 → 语言。只列判得准、且我们真有这门语言的;
 *  判不准的(比利时/瑞士/加拿大)交给 Accept-Language。
 *  值等于 en 的一律不写 —— 兜底本来就是 en,写了是噪音。 */
const BY_COUNTRY: Record<string, L> = {
  AE: 'ar', BH: 'ar', DZ: 'ar', EG: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar',
  LB: 'ar', LY: 'ar', MA: 'ar', MR: 'ar', OM: 'ar', PS: 'ar', QA: 'ar',
  SA: 'ar', SD: 'ar', SY: 'ar', TN: 'ar', YE: 'ar',
  AR: 'es', BO: 'es', CL: 'es', CO: 'es', CR: 'es', CU: 'es', DO: 'es',
  EC: 'es', ES: 'es', GT: 'es', HN: 'es', MX: 'es', NI: 'es', PA: 'es',
  PE: 'es', PY: 'es', SV: 'es', UY: 'es', VE: 'es',
  AO: 'pt', BR: 'pt', CV: 'pt', MZ: 'pt', PT: 'pt',
  BF: 'fr', BJ: 'fr', CD: 'fr', CG: 'fr', CI: 'fr', CM: 'fr', DJ: 'fr',
  FR: 'fr', GA: 'fr', GN: 'fr', MC: 'fr', MG: 'fr', ML: 'fr', NE: 'fr',
  SN: 'fr', TD: 'fr', TG: 'fr',
  ID: 'id', MY: 'my', BN: 'my', TH: 'th', VN: 'vn', PH: 'ph',
  CN: 'zh-cn', SG: 'zh-cn',
  /* 2026-09-08 繁体正文上线之后,台港澳必须落繁体。
     在此之前这三个地区被按 zh-cn 送 —— 台港读者第一眼看到的就是简体,
     外部诊断说的「信任归零」就是这一行造成的,不是内容不够。 */
  TW: 'zh-tw', HK: 'zh-tw', MO: 'zh-tw',
  JP: 'jp', KR: 'kr', KP: 'kr',
  AT: 'de', DE: 'de', RU: 'ru', BY: 'ru', KZ: 'ru', UZ: 'ru',
  IN: 'in', TR: 'tr',
};

/**
 * Accept-Language 里挑第一个我们支持的。
 * 前缀表按长度倒序匹配 —— pt-BR 必须压过 pt,否则巴西访客会被送去葡萄牙版;
 * 同理 es-MX 压过 es。这一条在只有三种语言时不存在,语种一多就必须显式处理。
 */
/* Accept-Language 发的是**语言码**(ja/ko/ms/vi/tl/hi),
   我们的路径是**国家码**(jp/kr/my/vn/ph/in)—— 这张表就是两者之间的桥。
   注意 ['in','id']:那是安卓发的印尼语旧码,和路径 /in/(印度)毫无关系。 */
const PREFIX: [string, L][] = [
  ['zh-hant', 'zh-tw'], ['zh-hans', 'zh-cn'], ['es-419', 'es'],
  ['pt-br', 'pt'], ['es-mx', 'es'], ['fil', 'ph'],
  ['zh', 'zh-cn'], ['ja', 'jp'], ['ko', 'kr'],
  ['id', 'id'], ['in', 'id'], ['ms', 'my'], ['th', 'th'], ['vi', 'vn'],
  ['tl', 'ph'], ['hi', 'in'],
  ['pt', 'pt'], ['es', 'es'], ['fr', 'fr'], ['de', 'de'], ['ru', 'ru'],
  ['ar', 'ar'], ['tr', 'tr'],
  ['en', 'en'],
];

function fromHeader(h: string | null): L | null {
  if (!h) return null;
  const tags = h.split(',').map((p) => {
    const [tag, q] = p.trim().split(';q=');
    return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
  }).sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    for (const [pre, loc] of PREFIX) if (tag === pre || tag.startsWith(pre + '-')) return loc;
  }
  return null;
}

/* 路由本体。外面套一层 harden() 统一补安全响应头 —— 见文件末尾。 */
/* ── BEAUTY2OEM(2026-09-23 A7,见 助手交付/beauty2oem/架构v1-20260923.md)────────────
   帛卉面向国内跨境卖家的「产品机会预判与共创」站:只出简体中文 5 页 + 共用登录页。
   其余页面 301 到工厂站同路径 —— 配方 / 包材 / 法规 / 解读只在 biosphere-ai.com 留一份,不做两份重复内容;
   sitemap 只列这 5 页(共用的 sitemap 会把配方、资讯全挂到本域名下,而那些地址这里都是 301)。 */
const B2O_PAGES = ['', 'opportunities/', 'brief/', 'predictions/', 'delivery/', 'privacy/', 'insights/'];   // 09-24 W6 加洞察页(src/pages/[lang]/insights.astro)
function b2oSitemap(host: string): Response {
  const urls = B2O_PAGES.map((p) => `<url><loc>https://${host}/zh-cn/${p}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
/* llms.txt:共用那份写的是工厂站事实与工厂站路径,这里只说本站是什么、五页在哪,工厂事实指回工厂站那份 */
function b2oLlms(host: string): Response {
  const b = `https://${host}/zh-cn/`;
  const t = `# BEAUTY2OEM — 帛卉化妆品 · 跨境卖家的产品机会预判与共创

> 在市场告诉你答案之前,我们先和你把下一款产品准备好。
> 面向国内跨境电商卖家(Shopee、TikTok Shop、Amazon、美客多、Temu、Lazada):卖家负责流量、内容与运营,帛卉负责市场机会、选品、产品定义、配方、包材、打样与生产。
> 方法:早发现 · 深判断 · 共验证 · 快落地。叫「产品机会预判」,不是爆款预测。

## 页面
- [首页](${b})
- [产品机会预判](${b}opportunities/):公开层只放趋势、阶段、信号、判断过程与反证条件
- [提交店铺,拿机会简报](${b}brief/):24 小时内交付 1–2 页《客户产品机会简报》
- [预判记录](${b}predictions/):对的错的都公开,30 / 60 / 90 天回填
- [帛卉交付能力](${b}delivery/)
- [跨境美妆卖家选品与供应链洞察(2026 秋)](${b}insights/):出口与平台数据、选品选厂逻辑、17 个市场准入要点、六条基于榜单快照与法规原文的独家洞察,数字均带出处脚注

## 工厂事实
- 帛卉工厂站与已核实的工厂数字:https://biosphere-ai.com/llms.txt
`;
  return new Response(t, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
/** 页面路径的去向;null = 本站页面,放行 */
function b2oPage(pathname: string, search: string): Response | null {
  const segs = pathname.split('/').filter(Boolean);
  const first = (segs[0] ?? '').toLowerCase();
  const hasLang = (LOCALES as readonly string[]).includes(first) || !!ALIAS[first];
  const slug = (hasLang ? segs.slice(1) : segs).join('/');
  const tail = slug ? `${slug}/` : '';
  const ours = B2O_PAGES.includes(tail) || tail === 'login/';
  if (ours && first === 'zh-cn') return null;
  /* 共用页头的「立即询盘」指向 /contact/:本站的线索入口是简报表单,不外送到工厂站 */
  if (tail === 'contact/') return new Response(null, { status: 302, headers: { Location: '/zh-cn/brief/' } });
  const to = ours ? `/zh-cn/${tail}${search}` : `https://biosphere-ai.com${pathname}${search}`;
  return new Response(null, { status: ours ? 302 : 301, headers: { Location: to } });
}

const route = async (ctx: Parameters<Parameters<typeof defineMiddleware>[0]>[0], next: any) => {
  const { pathname, search } = ctx.url;
  const b2o = siteIdForHost(ctx.url.hostname) === 'beauty2oem';
  if (b2o && pathname === '/sitemap.xml') return b2oSitemap(ctx.url.hostname);
  if (b2o && /^\/(?:[\w-]+\/)?llms(?:-full)?\.txt$/.test(pathname)) return b2oLlms(ctx.url.hostname);

  /* ── 老站 URL 的去处 ────────────────────────────────────────
   * biosphere-ai.com 此前由另一个 Worker(m-biosphere-ai-v2)服务的是一套
   * 手写静态站,15 个 .html 页面。域名切到本 Worker 之后,
   * 那些地址在这里不存在 —— 不映射的话,搜索结果、别人站上的外链、
   * 客户存的书签当天全部变 404。
   *
   * 上一次冒失切换就是这么出的 9 个 404,所以这次先把映射写死再切。
   * 用 301 而不是 302:这是永久搬迁,要让搜索引擎把权重转过来。
   * 目标一律不带语言前缀,交给后面的地区路由去分配 —— 
   * 写死 /zh-cn/ 会把英语访客也按中文送。
   */
  const LEGACY: Record<string, string> = {
    '/index.html': '/',
    '/company.html': '/about/',
    '/brand-story.html': '/about/',          // 创始人已把「品牌故事」改名为「公司介绍」
    '/ai-center.html': '/skin/',             // AI 交互中心 → 肌肤检测
    '/all-products.html': '/portfolio/',
    '/membership.html': '/contact/',         // 会员体系尚未在新站实现,先落到联系
    '/news.html': '/news/',                  // 资讯中心已重建(自动采集+AI改写)
    '/heritage/': '/rnd/',                   // 古方传承 → 研发页里的古方研究版块
    '/heritage/index.html': '/rnd/',
    '/origin-aloe.html': '/origin/aloe/',
    '/origin-centella.html': '/origin/centella/',
    '/origin-ginseng.html': '/origin/ginseng/',
    '/origin-green-tea.html': '/origin/green-tea/',
    '/origin-rose.html': '/origin/rose/',
    '/bhbohui.html': '/bohui/',              // 老后台 → 新后台
    '/bhbohui-login.html': '/bohui/',
  };
  const legacy = LEGACY[pathname.toLowerCase()];
  if (legacy) return ctx.redirect(legacy + search, 301);

  /* /{lang}/products/{slug}/ → /{lang}/product/{slug}/(2026-11-02)。
     详情页路由是单数(见 [lang]/product/[pslug].astro 的注释:复数会被根级 [...path] 吃掉),
     而首页版块的链接是**库里写的**,当时手成了复数 —— 8 条产品链接当场 404。
     改库要抽样核影响面并备份,而且以后后台再手写复数还会犯;
     这条 301 在咽喉处一次覆盖存量与增量,顺带把已外发出去的复数链接也接住。
     只动「单段 slug」形态,列表页 /products/ 仍按原逻辑 301 到 /portfolio/。 */
  const pluralProduct = /^\/([a-z][\w-]*)\/products\/([\w-]+)\/?$/.exec(pathname);
  if (pluralProduct && (LOCALES as readonly string[]).includes(pluralProduct[1]))
    return ctx.redirect(`/${pluralProduct[1]}/product/${pluralProduct[2]}/${search}`, 301);

  // 只管页面路径;接口、图片、后台、构建产物一律放过
  /* /bohui 不带斜杠必须显式规整。
     只写 startsWith('/bohui/') 挡不住裸的 '/bohui' ——
     它会被当成前台页面走语言跳转,变成 /jp/bohui 然后 404。
     创始人手输后台网址(没人会带尾斜杠)就是这么被甩回首页的。 */
  if (pathname === '/bohui') return ctx.redirect('/bohui/', 301);

  const isPage = !pathname.startsWith('/api/')
    && !pathname.startsWith('/media/')
    /* 包材图册的图走 /pack/{编码},是资源不是页面 ——
       漏了这一条会被当成"缺语言前缀的页面"甩到 /zh-cn/pack/...,整片图裂掉 */
    && !pathname.startsWith('/pack/')
    && !pathname.startsWith('/bohui/')
    && !pathname.startsWith('/_')
    && !/\.\w{2,5}$/.test(pathname);
  if (!isPage) {
    /* 后台与管理接口的安全响应头(创始人:「架构需要考虑安全问题」):
       - frame 拒绝:后台永远不该被别的页面 iframe 起来做点击劫持;
       - nosniff:接口回的 JSON 不许被当脚本嗅探执行;
       - referrer 收紧:后台地址不随外链请求外泄。
       加在中间件而不是各页面 —— 17 页逐页写一定会漏,这里是唯一咽喉。 */
    if (pathname.startsWith('/bohui') || pathname.startsWith('/api/admin/')) {
      /* 2026-09-17 按部门隔离(创始人:「后台登录按部门,展示的内容也相对应」):
         实验室账号(role='lab')手输任何后台页都甩回配方实验室。只拦页面,不拦 /api/admin/*
         —— 接口那边 roleAllows 早就 403 了,这里再拦是重复。sales / editor 今晚只过滤侧栏不跳转。 */
      if (pathname.startsWith('/bohui/') && !pathname.startsWith('/bohui/login/')
          && !pathname.startsWith('/bohui/logout/') && !pathname.startsWith('/bohui/formula-lab')) {
        const sess = await readSession(readCookie(ctx.request.headers.get('cookie'), COOKIE), (cfEnv as any)?.AUTH_SECRET ?? '')
          .catch(() => null);
        if (sess?.role === 'lab') {
          const r = ctx.redirect('/bohui/formula-lab/', 302);
          r.headers.set('Cache-Control', 'no-store');   // 这条 302 不经下面那四行安全头;其余三头对重定向无意义,只补不缓存
          return r;
        }
      }
      const res = await next();
      res.headers.set('X-Frame-Options', 'DENY');
      res.headers.set('X-Content-Type-Options', 'nosniff');
      res.headers.set('Referrer-Policy', 'same-origin');
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
    return next();
  }

  /* 09-24 红队:页面只收 GET / HEAD。Astro 页面对任何方法都会整页渲染,而边缘缓存只对 GET 生效 ——
     POST 一个页面地址 = 每次现渲染、读库;边缘 S2 又放过 POST,云机房出口不用过质询就能刷。站内没有任何表单提交到页面地址(都走 /api/)。 */
  if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD')
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
  if (b2o) { const r = b2oPage(pathname, search); if (r) return r; }

  const segs = pathname.split('/').filter(Boolean);
  const first = (segs[0] ?? '').toLowerCase();

  // 已经是正规语言前缀 → 原样放行,一个字节都不动
  if ((LOCALES as readonly string[]).includes(first)) {
    /* 09-24 红队:/ZH-CN/、/Zh-cn/ 也走到这里 —— 页面拿原样的 lang 渲染(判不出中文、canonical 写成大写),
       每种大小写又各占一份边缘缓存,换大小写就能把未命中放大十几倍。一律 301 到小写(用 segs 重拼,不会拼出 // 开头的外跳地址)。 */
    if (segs[0] !== first) return ctx.redirect(`/${[first, ...segs.slice(1)].join('/')}${pathname.endsWith('/') ? '/' : ''}${search}`, 301);
    return next();
  }

  // 别名前缀(/jp/、/zh/、/in/…)→ 换成正规码,后面的路径原样带过去
  if (ALIAS[first]) {
    const rest = segs.slice(1).join('/');
    return ctx.redirect(`/${ALIAS[first]}/${rest ? rest + '/' : ''}${search}`, 302);
  }

  // ① 手动选过就永远尊重
  const cookie = ctx.request.headers.get('cookie') ?? '';
  const saved = /(?:^|;\s*)bohui_lang=([\w-]+)/.exec(cookie)?.[1]?.toLowerCase();
  const savedL: L | null = saved
    ? ((LOCALES as readonly string[]).includes(saved) ? (saved as L) : (ALIAS[saved] ?? null))
    : null;

  // ② 浏览器语言 → ③ 国家码 → 兜底
  const country = (ctx.request as any).cf?.country as string | undefined;
  const lang: L = savedL
    ?? fromHeader(ctx.request.headers.get('accept-language'))
    ?? (country ? BY_COUNTRY[country] : undefined)
    ?? DEFAULT;

  const rest = pathname === '/' ? '' : pathname.replace(/^\//, '');
  return ctx.redirect(`/${lang}/${rest}${search}`, 302);
};

/**
 * 安全响应头 —— 交付体检(2026-09-01)实测发现的缺口。
 *
 * public/_headers 里那四条只装饰**静态资产**(/_astro/、/media/ 这些真实文件),
 * 而前台每一个页面都是 Worker 现场渲染出来的响应,压根不经过那套规则 ——
 * 于是首页、各语种页一条安全头都没有,而 CSS 文件反倒四条俱全。
 * 这种缺口不会报错、不影响任何功能,只有拿 curl 看响应头才现形。
 *
 * 补在中间件出口:所有响应(含重定向)只经过这一个咽喉,漏不掉。
 * 已自带更严值的后台响应(X-Frame-Options: DENY)不覆盖 —— 只补没有的。
 */
const SEC: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/* ── 繁體中文兜底:把 zh-tw 页面里漏网的简体就地转成繁体 ───────────
   为什么放在这里而不是逐页写一份繁体文案:
   站上有十五个页面把中文文案硬写成 `zh ? {…} : {…}`,而 zh 对 zh-cn 与
   zh-tw 同时为真 —— 台港读者点进包材库,看到的标题是简体。
   逐页再写一份等于往后每加一句文案都要记得写两遍,迟早漏。
   数据库里已经译好的繁体正文经过这里是**原样不动**(简→繁只认简体字),
   所以这一层只补漏,不覆盖。

   词表用 'tw'(台湾标准字)而不是 'twp'(台湾惯用词):
   twp 会把「类型」转成「型别」—— 那是 IT 术语,包材筛选面上说的是「類型」。
   少数确实该换说法的词,在 TW_WORDS 里手工列,列完再做字形转换。

   任何一步出错都返回原响应 —— 繁体没转成,页面还在;
   中间件抛异常,则是全站 500。 */
const TW_WORDS: [RegExp, string][] = [
  [/软件/g, '軟體'], [/网络/g, '網路'], [/信息/g, '資訊'],
  [/数据/g, '資料'], [/打印/g, '列印'], [/视频/g, '影片'],
  [/默认/g, '預設'], [/服务器/g, '伺服器'], [/质量/g, '品質'],
];
/* 转完之后再修的几处。字形表按教育部标准把「台」一律转成「臺」,
   但台港网站上写的是「平台」不是「平臺」——「臺」在这里显得像公文。
   这一类只在转换之后才出现,所以必须放在后面这一遍。 */
const TW_FIX: [RegExp, string][] = [
  [/平臺/g, '平台'], [/舞臺/g, '舞台'], [/櫃臺/g, '櫃台'],
];
let _conv: ((s: string) => string) | null = null;
const toTW = (t: string): string => {
  if (!_conv) _conv = (OpenCC as any).Converter({ from: 'cn', to: 'tw' });
  let x = t;
  for (const [re, w] of TW_WORDS) x = x.replace(re, w);
  x = _conv!(x);
  for (const [re, w] of TW_FIX) x = x.replace(re, w);
  return x;
};
async function twOut(res: Response, pathname: string): Promise<Response> {
  try {
    if (!/^\/zh-tw(\/|$)/.test(pathname)) return res;
    if (!(res instanceof Response) || res.status !== 200) return res;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return res;
    const html = await res.text();
    const h = new Headers(res.headers);
    h.delete('content-length');   // 转换后长度会变,留着旧值会把页面截断
    return new Response(toTW(html), { status: res.status, statusText: res.statusText, headers: h });
  } catch {
    return res;
  }
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  /* ① 明文 HTTP 一律升到 HTTPS。
     本该由 Cloudflare 的「Always Use HTTPS」在边缘做,但那个开关当前是关的
     (2026-09-04 实测 http:// 进来后一路都是 http),而域名设置需要面板权限。
     在这里做等效的事:301 到同路径的 https —— 301 让浏览器与搜索引擎都记住,
     不会每次都来一趟明文。判据用 CF 给的 x-forwarded-proto,它比 url.protocol 可靠。 */
  const proto = ctx.request.headers.get('x-forwarded-proto');
  if (proto === 'http') {
    const u = new URL(ctx.request.url);
    u.protocol = 'https:';
    return new Response(null, { status: 301, headers: { Location: u.toString() } });
  }

  /* ② 只认自家域名(09-24 暴露面自查 H1)。workers.dev 与带版本号的预览地址不在 zone 之内,
     边缘的 WAF 规则与限速对它们全不起作用,却连着生产库 —— 后台已关、wrangler.toml 也钉死了 false,这里再兜一层:
     域名不在 HOST_SITE_MW(含 www.)里一律 404。本地开发(localhost)与创始人账号副本(COPY_OF,跑在它自己的 workers.dev 上)放行。 */
  const host = new URL(ctx.request.url).hostname;
  const dev = host === 'localhost' || host === '127.0.0.1' || !!(cfEnv as any)?.COPY_OF;
  if (!dev && !siteIdForHost(host)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  /* ③ 边缘缓存:同一个页面重复被访问时不再碰 D1。
     起因(2026-09-04):免费档 D1 的每日行读被打满 —— 每个 SSR 页面都要读版块、
     产品、情报若干行,爬虫扫一遍 3,655 条 URL 就是几十万行。页面内容按小时计变化,
     没必要每次现查。所以:公开页的 GET 走 Cache API,命中直接返回,
     未命中才渲染并回填。后台、接口、带会话 cookie 的请求一律不缓存。 */
  const req = ctx.request;
  const url0 = new URL(req.url);
  /* 后台会话、会员会话先验签再认(09-24 C1 / 代码审计 P0-4):以前只看 cookie 在不在,
     带一个假 bh_mem(或 bh_sess)就能让任何页面每次都绕过缓存现渲染。验签是纯 WebCrypto,不碰 D1。 */
  const ck = req.headers.get('cookie') || '';
  const staff = ck.includes(`${COOKIE}=`)
    && !!(await readSession(readCookie(ck, COOKIE), String((cfEnv as any)?.AUTH_SECRET ?? '')).catch(() => null));
  const member = !staff && /(?:^|;\s*)bh_mem=/.test(ck) && await memberSigned(ck, cfEnv);
  /* 规范化(09-24 安全架构 C1,参数登记表在 lib/canon.ts):页面路径补尾斜杠、只留登记过的参数、取值夹到范围内,
     不一致就 301 一次。301 落在 WAF 之后,跳过去的请求会再过一遍边缘规则(S1 / R2 的通配都带尾斜杠)。
     后台已登录的人不跳(草稿预览等参数只给他们用),本地与副本不跳。 */
  /* Post-deploy smoke probe: a request carrying the shared secret header skips canonical redirects and the edge cache.
     Without the configured secret nobody matches. */
  const probeSecret = String((cfEnv as any)?.PROBE_SECRET ?? '');
  const probeHdr = req.headers.get('x-bohui-probe') ?? '';
  let probeDiff = probeSecret.length === 0 || probeHdr.length !== probeSecret.length ? 1 : 0;
  for (let i = 0; i < probeHdr.length && i < probeSecret.length; i++) probeDiff |= probeHdr.charCodeAt(i) ^ probeSecret.charCodeAt(i);
  const probe = probeDiff === 0;
  if ((req.method === 'GET' || req.method === 'HEAD') && !staff && !dev && !probe && isPagePath(url0.pathname)) {
    const to = canonical(url0.pathname, url0.search);
    if (to) return new Response(null, { status: 301, headers: { Location: to } });
  }
  /* ④ 成品站总览页退役(创始人 2026-10-23:「/products/ 爆款产品是不是没必要了」):
     /products/ 职责由 /portfolio/ 产品画廊全部承接,301 永久迁移 ——
     旧书签、外链、已收录的 URL 全部平滑落地,不再是死链也不抢流量。 */
  if (req.method === 'GET' || req.method === 'HEAD') {
    const pm = url0.pathname.match(/^\/([^/]+)\/products\/?$/);
    if (pm && ((LOCALES as readonly string[]).includes(pm[1]) || (ALIAS as Record<string, string>)[pm[1]])) {
      const lang = (ALIAS as Record<string, L>)[pm[1]] ?? pm[1];
      /* 旧货架的 ?cat= 品类筛选链接原样带过去,portfolio 侧已登记同名参数 */
      const cat = url0.searchParams.get('cat');
      const qs = cat ? `?cat=${encodeURIComponent(cat)}` : '';
      return new Response(null, { status: 301, headers: { Location: `/${lang}/portfolio/${qs}` } });
    }
    if (url0.pathname === '/products' || url0.pathname === '/products/') {
      return new Response(null, { status: 301, headers: { Location: '/portfolio/' } });
    }
  }
  /* 哪些路径允许**带参数**进缓存,以及这个路径上哪些参数真的影响渲染。
     2026-09-07 实测:边缘缓存命中率只有 0.22%,而全站 24 小时 6.5 万次请求 ——
     原因就是上一版这里写了 !url0.search:**任何带 ? 的 URL 一律不缓存**。
     货架的 62 页分页、四个维度的筛选、外链带的 utm 参数,全都落在这一条上,
     每一次都真渲染。爬虫走的恰恰就是这批 URL。

     没列在这张表里的路径,带 ? 仍然一律不缓存 —— 比如站内搜索:
     q 决定结果,把它从缓存键里抹掉会让所有人拿到同一份搜索结果,那是错的答案。
     宁可不缓存,也不能缓存错。 */
  /* 09-24 C1:哪些参数进缓存键、哪些让整页不缓存,统一由 lib/canon.ts 的登记表决定(原 CACHE_PARAMS / JUNK 两张表挪过去了,
     还补了上一版漏登记的:包材 c、原料 q、解读 mk/cat/p、古方 t/p、图谱 n/t、目录 p、sitemap part/p 等)。
     广告与调试参数(utm_、?z= 之类)照旧只从缓存键里剔掉。 */
  const noCache = uncacheable(url0.pathname, url0.searchParams);

  /* 会员查看限额(2026-09-23,lib/quota.ts):详情页对认证爬虫出全文、对未登录真人出预览、对会员出全文并计数。
     爬虫判定只在这里算一次,页面读 locals.goodBot —— 缓存键与页面用的必须是同一个判定,
     否则谁先来谁定版本:Googlebot 拿到预览(SEO 塌),或真人拿到全文(限额形同虚设)。
     会员请求整站不进缓存(和后台会话同理),未登录那份预览与爬虫那份全文分两个键。 */
  /* 09-24 C6(代码审计 P0-6):边缘注入的 x-bh-vbot / x-bh-vcat(F3 的 Transform Rule 由 cf.client.bot 与
     cf.verified_bot_category 写入)。
     09-24 红队:这两个头**只能否决、不能放行**。F3 还没上线,客户端自己带 `x-bh-vbot: true` + `x-bh-vcat: Search Engine Crawler`
     就能冒充认证爬虫拿全文、不计额度(边缘 R1 只看 UA,拦不住头);F3 上了若规则只在 cf.client.bot 为真时才写头,客户端的同名头照样透传。
     所以先过 answerBot(UA + OpenAI 网段),头在时再要求它确认;头不在时与旧判定相同,GEO 不塌。
     要删 answerBot 这一支,须先确认 F3 对**每个请求**都覆盖写这两个头(自带 x-bh-vbot: true 请求详情页,x-bh-gate 仍是 login)。 */
  const vbot = req.headers.get('x-bh-vbot');
  const goodBot = answerBot(req.headers.get('user-agent') || '', req.headers.get('cf-connecting-ip') || '')
    && (vbot === null || (vbot === 'true' && /^(search engine crawler|ai search|ai assistant)$/i.test(req.headers.get('x-bh-vcat') || '')));
  (ctx.locals as any).goodBot = goodBot;
  const gateKey = /^\/[\w-]+\/(decoder|ingredients|formula)\/[^/]+\/?$/.test(url0.pathname) ? (goodBot ? 'bot' : 'anon') : '';
  /* 09-24 红队:HEAD 也走缓存(键仍按 GET 建)。Astro 页面对 HEAD 照样整页渲染、正文完整(只有接口才去掉正文),
     以前 HEAD 一律不查缓存,同一个已缓存的地址用 HEAD 刷就是无限次现渲染读库;回给 HEAD 的正文由运行时丢弃。 */
  const cacheable =
    (req.method === 'GET' || req.method === 'HEAD') &&
    !url0.pathname.startsWith('/api/') &&
    !url0.pathname.startsWith('/bohui/') &&
    !noCache && !staff && !member && !probe;
  const cache = (caches as any).default as Cache | undefined;
  /* 缓存键带版本号。2026-09-07:D1 日读额度耗尽期间,「数据源未就绪」那一页是以
     HTTP 200 渲染的,于是被原样缓存了一小时 —— 我用 ?cb= 验证时绕过了缓存,
     看到的是正常页面,而创始人打开的是缓存里的错误页,两边看到的不是同一个站。
     出过这种事之后,必须有一个「一键让所有旧缓存失效」的开关:改这个数字即可。 */
  /* v3(2026-09-07 上午):D1 额度耗尽期间,边缘把一批 404 与 503 缓存住了 ——
     修好之后访客拿到的仍是坏副本。推版本号是清掉它们唯一干净的办法。 */
  /* v4(2026-09-07 晚):sitemap 拆分、繁中上线、跨站兜底重写 —— 清掉全部旧副本 */
  const CACHE_V = 'v115';   // 2026-10-30:清掉短缓存生效前的旧条目(zh-cn/pack 等);此后工具页 120s 自动更新,不再 bump
  const keyFor = (r: Request) => {
    const u = new URL(r.url);
    /* 归一化:只保留这个路径上真正影响渲染的参数,并按名字排序。
       ?p=2&t=jar 与 ?t=jar&p=2 是同一个页面,不该占两份缓存;
       ?z=随机数 更不该每次都是新键。 */
    const keep = keyParams(u.pathname, u.searchParams);   // 已按名字排序、值已规整(lib/canon.ts)
    u.search = '';
    for (const [k, v] of keep) u.searchParams.append(k, v);
    if (gateKey) u.searchParams.set('__gate', gateKey);   // 必须在 u.search = '' 之后(平台 09-22 踩过:放前面被清掉,Googlebot 命中真人那份)
    u.searchParams.set('__cv', CACHE_V);
    return new Request(u.toString(), { method: 'GET', headers: r.headers });
  };
  /* 备份副本:每次成功渲染都另存一份,存七天,只在渲染失败时才拿出来用。
     它和上面那个新鲜副本是两回事 —— 新鲜副本十分钟就过期,过期之后
     数据层要是正好不可用,访客拿到的就是 503。

     2026-09-07:D1 免费档的日读额度耗尽,首页与产品页直接 503,
     而额度要等 UTC 零点才恢复 —— 整整一天,站点对访客等于关门。
     跑在免费档上,数据层不可用是常态不是意外:与其让访客看 503,
     不如端出昨天那份完整的页面,并在响应头上标明它是陈的。
     陈一天的公司简介,好过一个 503。 */
  const staleKeyFor = (r: Request) => {
    const u = new URL(r.url);
    if (gateKey) u.searchParams.set('__gate', gateKey);   // 陈旧备份也分开:5xx 兜底时不能把爬虫那份全文端给未登录的人
    u.searchParams.set('__cv', CACHE_V);
    u.searchParams.set('__stale', '1');
    return new Request(u.toString(), { method: 'GET', headers: r.headers });
  };
  /* ── 访问打点 ────────────────────────────────────────────────────
     一条请求一个数据点,给后台的分析罗盘用。
     重点是**分清来访者是谁**:这个站的价值在于被搜索引擎与 AI 答案引擎引用,
     所以「AI 爬虫来了几次、抓了哪些页」比「有多少人访问」更要紧 ——
     而这恰恰是 JS 信标类统计(含 Cloudflare Web Analytics)看不到的,
     因为爬虫不执行 JS。

     位置很关键:必须在**查缓存之前**打点。放在渲染之后的话,
     边缘缓存命中的请求会直接 return,根本走不到那里 ——
     而命中恰恰是多数流量,统计出来的数字会系统性偏低。

     blobs 放维度(路径/语种/来访者类别/国家),doubles 放度量。
     不记 UA 全文、不记 IP —— 只记类别,够用且不留个人信息。 */
  const ae = (cfEnv as any)?.PULSE as { writeDataPoint: (d: unknown) => void } | undefined;
  if (ae) {
    try {
      const ua = (req.headers.get('user-agent') || '').toLowerCase();
      /* 2026-09-11 创始人转来 GEO 打法「盯住被引频率」:ChatGPT-User / Perplexity-User / Claude-User 是
         AI 在回答某个用户时实时来取这一页 —— 这就是「被引用」的直接信号,单独记成 cite:*,不再混进抓取量里。 */
      /* 2026-09-15:扫 /.env 的攻击器也顶着 ChatGPT-User 的 UA 来,把「被引」数灌水。OpenAI 公布了各爬虫的出口 IP 段
         (openai.com/chatgpt-user.json 等),不在段里的一律记 bot:spoof。段表在 lib/ai-ip.ts,每月刷一次。 */
      const ip = req.headers.get('cf-connecting-ip') || '';
      const spoof = /chatgpt-user|gptbot|oai-searchbot/.test(ua) && !openaiIp(ip);
      const who =
        spoof ? 'bot:spoof'
        : /chatgpt-user/.test(ua) ? 'cite:openai'
        : /perplexity-user/.test(ua) ? 'cite:perplexity'
        : /claude-user/.test(ua) ? 'cite:anthropic'
        : /gptbot|oai-searchbot/.test(ua) ? 'ai:openai'
        : /claudebot|anthropic-ai|claude-web|claude-searchbot/.test(ua) ? 'ai:anthropic'
        : /perplexitybot/.test(ua) ? 'ai:perplexity'
        : /google-extended|googleother/.test(ua) ? 'ai:google'
        : /bytespider|amazonbot|meta-externalagent|applebot-extended|ccbot|mistralai/.test(ua) ? 'ai:other'
        : /googlebot/.test(ua) ? 'se:google'
        : /bingbot|adidxbot/.test(ua) ? 'se:bing'
        : /baiduspider|yisouspider|sogou|360spider/.test(ua) ? 'se:cn'
        : /bot|crawler|spider|slurp|curl|wget|python-|scrapy/.test(ua) ? 'bot:other'
        /* 伪装成浏览器的无头抓取器:UA 是 Chrome,却不带 accept-language。
           2026-09-10 实测这类请求把 18 个语种的 /news/ 各打 ~100 次,把「真人」灌水一倍。
           真实浏览器一定带 accept-language;这一条比 sec-fetch-* 兼容(老 Safari 不发 sec-fetch)。 */
        : !(req.headers.get('accept-language') || '').trim() ? 'bot:headless'
        : 'human';
      const seg = url0.pathname.split('/').filter(Boolean);
      const lang = /^[a-z]{2}(-[a-z]{2})?$/.test(seg[0] ?? '') ? seg[0] : '-';
      const section = seg[1] ?? (seg[0] ? 'home' : 'home');
      /* 来路:AI 答案里的链接被真人点进来 —— 这是 GEO 真正要的「被引带来的流量」。只记平台名,不记完整来路。 */
      const refh = (() => { try { return new URL(req.headers.get('referer') || '').hostname; } catch { return ''; } })();
      const ref =
        /chatgpt\.com|openai\.com/.test(refh) ? 'ref:chatgpt'
        : /perplexity\.ai/.test(refh) ? 'ref:perplexity'
        : /claude\.ai/.test(refh) ? 'ref:claude'
        : /gemini\.google|bard\.google/.test(refh) ? 'ref:gemini'
        : /copilot\.microsoft|bing\.com/.test(refh) ? 'ref:bing'
        : /google\./.test(refh) ? 'ref:google'
        : /baidu\.com/.test(refh) ? 'ref:baidu'
        : refh && !refh.endsWith(url0.hostname) ? 'ref:other' : '-';
      ae.writeDataPoint({
        blobs: [who, lang, section, url0.pathname.slice(0, 96),
                (req as any).cf?.country ?? '-', ref],
        doubles: [1],
        indexes: [who],
      });
    } catch { /* 打点失败绝不能影响出页 */ }
  }

  if (cacheable && cache) {
    const hit = await cache.match(keyFor(req));
    if (hit) {
      const r = new Response(hit.body, hit);
      r.headers.set('x-bh-cache', 'hit');
      return r;
    }
  }

  /* 费用熔断保险丝(2026-10-22,lib/fuse.ts):只有「缓存 miss → 渲染」才花钱,所以熔断只在这里查 ——
     命中缓存的请求直接返回,不查 D1、不计数、不受影响。
     当日渲染量触顶(fuse_daily.fired=1)后,非会员 / 非后台 / 非探针请求一律 429,不再渲染、不再花钱;
     会员与后台照常(付费主与运营不能误伤)。熔断按北京时间日界,次日零点自动解除。
     阈值 env.FUSE_RENDER_CAP,默认 30 万渲染/天 ≈ 3000 万行读/天,仅为免费额度(250 亿/月)的 3.6%。 */
  /* 2026-10-23 豁免廉价静态文件:robots.txt / llms.txt / sitemap*.xml / favicon。
     robots.txt 是本项目里明说「不查 D1」的纯静态输出,却被 AI 爬虫整天轮询 ——
     它们既不花钱也不该被 429:爬虫拿不到 robots.txt 会重试得更凶(实测熔断日
     AI 爬虫把渲染计数器刷到 30 万天花板,其中大量是这几个文件)。
     豁免之后:熔断日爬虫也能拿到准信,页面流量该拦照拦。 */
  const cheapStatic =
    /^\/(?:robots\.txt|llms(?:-full)?\.txt|favicon\.ico)$/.test(url0.pathname)
    || /^\/[\w-]+\/(?:robots\.txt|llms(?:-full)?\.txt)$/.test(url0.pathname)
    || /\/sitemap(?:-[^/]*)?\.xml$/.test(url0.pathname);
  if (cacheable && !staff && !member && !probe && !cheapStatic) {
    const fuseCap = Number((cfEnv as any)?.FUSE_RENDER_CAP ?? 0);
    const fuse = await fuseCheck({ db: (cfEnv as any)?.DB as D1Database | undefined, cap: fuseCap || undefined });
    if (fuse.fired) {
      /* 熔断事件打点进分析罗盘(who='fuse:on'),方便追溯是哪天哪个尖峰触发的 */
      try {
        const ae = (cfEnv as any)?.PULSE as { writeDataPoint: (d: unknown) => void } | undefined;
        ae?.writeDataPoint({ blobs: ['fuse:on', '-', '-', '-', '-', '-'], doubles: [fuse.renders], indexes: ['fuse:on'] });
      } catch { /* 打点失败不影响拦截 */ }
      return fuseResponse();
    }
  }

  /* 站点联络方式(WhatsApp / 微信)注入 locals:页脚与 Organization schema 从这里读,46 处 SiteFooter 不用各传一遍。
     10 分钟内存缓存;缓存未命中才查 sites 一行。后台改了号码,最迟 10 分钟 + 边缘缓存 10 分钟生效。 */
  (ctx.locals as any).contact = await siteContactFor(url0.hostname);
  const res = await twOut(await route(ctx, next), url0.pathname);
  /* ── 跨站防回归闸 ────────────────────────────────────────────────
     2026-09-07:加了一个语种,biosphere-ai.com/zh-tw/ 的标题就变成了
     另一家公司的名字。根因是仓库里散着十七处 `?? 'beauty2oem'` 兜底 ——
     站点查询因为任何原因返回 null,页面就挂上别家的招牌,
     而且页面照常 200、日志干干净净,可能几个月没人发现。

     那十七处已经全部按域名重写。但"改对了"和"以后不会再错"是两件事:
     这道闸比对**页面实际渲染出的品牌**和**域名应有的品牌**,
     不一致就打上响应头并拒绝进缓存 —— 让下一次犯错在第一时间可见,
     而不是等采购发现"你们网站上写的是别家名字"。 */
  if (res instanceof Response && cacheable) {
    const want = siteIdForHost(url0.hostname);
    const got = res.headers.get('x-bh-site');
    if (want && got && got !== want) {
      res.headers.set('x-bh-tenant-mismatch', `${got}!=${want}`);
      res.headers.set('Cache-Control', 'no-store');
      console.error(`[租户串站] ${url0.pathname} 渲染成 ${got},域名应为 ${want}`);
    }
  }

  if (res instanceof Response) {
    for (const [k, v] of Object.entries(SEC)) if (!res.headers.has(k)) res.headers.set(k, v);
    /* 降级/错误内容一律不进缓存。上一版只看 status===200,而错误页恰恰是 200 —— 
       结果一次十分钟的数据层抖动,被缓存放大成一个多小时的「整站坏掉」。
       页面在降级时会带上 x-bh-degraded,这里据此拒绝缓存。 */
    const degraded = res.headers.get('x-bh-degraded') === '1';
    if (cacheable && cache && res.status === 200 && !degraded && !res.headers.has('Set-Cookie')) {
      /* 6 小时新鲜边缘缓存:内容更新最迟 6 小时后生效(或改 CACHE_V 立即生效)。
         2026-10-21:从 1 小时提至 6 小时 ——
         1182 产品页 × 爬虫复访间隔 < 1 小时 = 每天数万次 D1 查询(爬虫猛攻 2 天 $80 事故)。
         6 小时后爬虫才回源一次,命中缓存 0 D1 查询。
         路由自己声明了 Cache-Control 就不覆盖(见上方注释)。 */
      /* 边缘缓存 TTL:21600 = 6 小时 —— D1 省钱第一(10-21 爬虫猛攻 $80 事故的教训)。
         整改后想让新内容立刻全球可见:部署后在 CF 后台手动「清空缓存」即可,
         绝不靠降低 TTL —— TTL 缩短 = AI 爬虫回源频率翻几十倍 = D1 烧钱。 */
      if (!res.headers.has('Cache-Control')) {
        /* 2026-10-30:工具页单独短缓存 —— 它们高频迭代、URL 只有 8 个、爬虫访问量极小，
           6 小时缓存会让每次改动都要靠 bump CACHE_V 才能看见。
           全站其余页面继续 21600（D1 省钱第一），只有这三个前缀例外。 */
        const pth = url0.pathname;   /* 2026-10-30 修正:本作用域无 request,只有 url0/req —— 写错导致全站 500 */
        const isTool = /^\/[a-z]{2}(-[a-z]{2})?\/(pack|design|tools)(\/|$)/.test(pth);
        res.headers.set('Cache-Control', isTool
          ? 'public, max-age=0, s-maxage=120'
          : 'public, max-age=0, s-maxage=21600');
      }
      res.headers.set('x-bh-cache', 'miss');
      /* 本想用 waitUntil 后台写入,但这个适配器里取不到 runtime.ctx,
         try/catch 会把失败悄悄吞掉 —— 表现就是每次都 miss(2026-09-04 实测)。
         直接 await 写入:多几毫秒,但确实能缓存,这比"看起来有缓存"重要。 */
      try { await cache.put(keyFor(req), res.clone()); }
      catch { /* 写缓存失败不影响出页 */ }
      /* 同一份内容再存一份长效备份,专供数据层挂掉时救急 */
      try {
        const backup = res.clone();
        const h = new Headers(backup.headers);
        h.set('Cache-Control', 'public, s-maxage=604800');
        await cache.put(staleKeyFor(req), new Response(backup.body, { ...backup, headers: h }));
      } catch { /* 备份失败不影响出页 */ }
    } else if (degraded) {
      res.headers.set('Cache-Control', 'no-store');
    }

    /* 渲染失败(多半是数据层不可用)时,端出七天内最后一份好副本。
       宁可给一份标明「内容可能不是最新」的完整页面,也不要给 503 ——
       503 对访客是关门,对搜索引擎是「这个站不稳」。 */
    if (res.status >= 500 && cacheable && cache) {
      const back = await cache.match(staleKeyFor(req)).catch(() => null);
      if (back) {
        const r = new Response(back.body, back);
        r.headers.set('x-bh-stale', '1');
        r.headers.set('Cache-Control', 'no-store');
        return r;
      }
    }
    /* ② HSTS:告诉浏览器往后这个域名只走 HTTPS,连第一次的明文请求都省掉。
       一年、含子域;先不加 preload —— preload 提交后很难撤,等 www 与各子域都齐了再说。 */
    if (!res.headers.has('Strict-Transport-Security')) {
      res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  }
  return res;
});
