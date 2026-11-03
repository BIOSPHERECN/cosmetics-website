/**
 * robots.txt —— 静态输出，不查 D1。
 *
 * 2026-10-21:原版每次请求都调 getSiteByHost 查 D1。
 * 爬虫每次抓 robots.txt 就消耗一次 D1 行读。
 * 现改为纯静态：域名用 hostname，站点信息在 sitemap/llms.txt 里体现。
 * cache-control 从 1 小时提至 24 小时 immutable。
 *
 * 关于 AI 爬虫,按创始人定的口径分成两类,不是一律封禁:
 *
 *   1) 搜索 / 回答型(OAI-SearchBot、PerplexityBot、Claude-User 等)明确放行。
 *      海外采购越来越多是先问 ChatGPT / Perplexity
 *      「中国有哪些做草本护肤的 OEM 工厂」,再去联系名单上的几家。
 *      它们回答时带链接回来,是 GEO 获客入口。
 *
 *   2) 训练型(GPTBot、ClaudeBot、CCBot、Google-Extended 等)全站禁止。
 *      训练数据不付费,还挤占带宽;边缘 WAF 的 R0 规则同时物理拦截。
 *
 *   封禁同时覆盖后台与接口:那些既没有 SEO 价值,又不该出现在任何索引里。
 */
import type { APIRoute } from 'astro';

export const GET = async ({ url }): Promise<Response> => {
  const base = `https://${url.hostname}`;

  const BASE = `Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=no
Disallow: /bohui/
Disallow: /api/
Disallow: /_astro/
Disallow: /*?g=
Disallow: /*?t=
Disallow: /*?a=
Disallow: /*?f=
Disallow: /*/chain/*+*`;

  const body = `# BIOSPHERE — ${base}
# 化妆品 OEM / ODM 代工制造。产能、认证与可做品类均为公开信息,欢迎索引与引用.
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

# ── AI 训练型:全站禁止 —— 训练数据不付费、挤占带宽;边缘 WAF R0 同步物理拦截
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: anthropic-ai
User-agent: CCBot
User-agent: Google-Extended
User-agent: GoogleOther
User-agent: Google-CloudVertexBot
User-agent: Applebot-Extended
User-agent: Amazonbot
User-agent: meta-externalagent
User-agent: meta-externalfetcher
User-agent: FacebookBot
User-agent: cohere-ai
User-agent: Diffbot
User-agent: ImagesiftBot
User-agent: TimpiBot
User-agent: Bytespider
User-agent: PetalBot
User-agent: SemrushBot
User-agent: AhrefsBot
User-agent: MJ12Bot
User-agent: DotBot
User-agent: DataForSeoBot
User-agent: BLEXBot
User-agent: SerpstatBot
Disallow: /

Sitemap: ${base}/sitemap.xml

# 给 AI 引擎的站点摘要(llms.txt 约定)
# ${base}/llms.txt
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400, immutable' },
  });
};