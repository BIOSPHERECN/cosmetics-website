/**
 * robots.txt —— 之前用的是 Cloudflare 托管的默认版本,里面既没有我们的
 * sitemap 地址,也没有对 AI 爬虫表态。
 *
 * 关于 AI 爬虫,这里做的是**明确放行**,而不是常见的一律封禁:
 *
 *   这是一个做外贸代工的 B2B 站。海外采购越来越多是先问 ChatGPT / Perplexity
 *   「中国有哪些做草本护肤的 OEM 工厂」,再去联系名单上的几家。
 *   封掉 AI 爬虫,等于在这个新的入口上直接消失 —— 而我们没有需要保护的
 *   独家内容:产能、认证、可做品类,本来就是希望被人知道的东西。
 *
 *   封禁只对后台与接口:那些既没有 SEO 价值,又不该出现在任何索引里。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSiteByHost, getSiteById, DEFAULT_LANG } from '../lib/db';

export const GET: APIRoute = async ({ url }) => {
  const db = (env as any).DB as D1Database | undefined;
  const override = url.searchParams.get('site');
  /* D1 取不到也要出得来。2026-09-07 日读额度耗尽时这里 500 了 ——
     而搜索引擎拿到 500 的 robots.txt 会**暂停整站抓取**,
     一次数据层抖动因此变成几天的收录停滞。这是最不该 500 的一个路由。 */
  const site = db
    ? (await getSiteByHost(db, url.hostname, DEFAULT_LANG).catch(() => null))
      ?? (override ? await getSiteById(db, override, DEFAULT_LANG).catch(() => null) : null)
    : null;

  const base = `https://${site?.domain ?? url.hostname}`;
  /* 取不到站点记录时按「已上线」处理:线上域名本来就是上线的,
     而误判成未上线会输出整站禁抓 —— 那个后果比多放行几页严重得多。 */
  const live = site ? site.is_live === 1 : true;

  /* 三组共用的底线规则。RFC 9309:爬虫命中专属组后**忽略 * 组** —— 所以这段必须出现在每一组里,
     用同一个常量拼进去,免得哪组漏改(2026-09-01 踩过)。
     筛选组合不给爬(2026-09-07:17 语种 × 62 页 × 四维组合上万个 URL,半小时烧光 D1 日读额度);
     /chain/A+B+C/ 组合页不给爬(2026-09-10:GPTBot 一周打了 107,791 次)。 */
  const BASE = `Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=no
Disallow: /bohui/
Disallow: /api/
Disallow: /_astro/
Disallow: /*?g=
Disallow: /*?t=
Disallow: /*?a=
Disallow: /*?f=
Disallow: /*&g=
Disallow: /*&t=
Disallow: /*&a=
Disallow: /*&f=
Disallow: /*/chain/*+*`;
  /* Content-Signal 放在 Allow 之后:后台 SEO 页的解析正则要求 UA 行后紧跟 Allow/Disallow。 */

  // 未上线的站一律整站禁抓 —— 半成品被索引,清理起来比重做还麻烦
  const body = live
    ? `# ${site?.name ?? 'BIOSPHERE'} — ${base}
# 化妆品 OEM / ODM 代工制造。产能、认证与可做品类均为公开信息,欢迎索引与引用。
#
# Content signals (Cloudflare Content Signals Policy, https://contentsignals.org/):
#   search=yes    building a search index and showing links / short excerpts
#   ai-input=yes  using pages as real-time input for AI answers (RAG / grounding)
#   ai-train=no   training or fine-tuning AI models
# Restrictions expressed via content signals are express reservations of rights
# under Article 4 of EU Directive 2019/790 (text and data mining).

User-agent: *
${BASE}

# ── AI 回答 / 搜索型:全站可看,含详情页 —— 它们回答时带链接回来,是获客渠道
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: MistralAI-User
User-agent: DuckAssistBot
${BASE}

# ── AI 训练型:首页、列表、营销页可看;详情页(解读 / 成分 / 配方)不给 ——
#    详情数据是收费产品,进了训练集,以后别人问 AI 就能白拿。
#    列表页靠 Allow ...$ / Allow ...? 放行(RFC 9309:最长匹配胜出,同长 Allow 胜)。
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Claude-Web
User-agent: anthropic-ai
User-agent: CCBot
User-agent: Google-Extended
User-agent: GoogleOther
User-agent: Google-CloudVertexBot
User-agent: Applebot-Extended
User-agent: Amazonbot
User-agent: meta-externalagent
User-agent: cohere-ai
User-agent: Bytespider
${BASE}
Disallow: /*/decoder/
Allow: /*/decoder/$
Allow: /*/decoder/?
Disallow: /*/ingredients/
Allow: /*/ingredients/$
Allow: /*/ingredients/?
Disallow: /*/formula/

Sitemap: ${base}/sitemap.xml

# 给 AI 引擎的站点摘要(llms.txt 约定)
# ${base}/llms.txt
`
    : `# 未上线,整站禁止抓取
User-agent: *
Disallow: /
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
