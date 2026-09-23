/**
 * AnySearch —— 实时搜索 + 整页抽取(创始人 2026-09-02 提供 key)。
 *
 * 走它的直连 REST 接口(/v1/search、/v1/extract,返回干净 JSON),
 * 不走 MCP/JSON-RPC 那层封装 —— 创始人转来的说明写明 CLI 也是直接打 HTTP 端点。
 *
 * 对采集线各解决一个老大难:
 *   · extract:拿**全文**。此前升级线只拿 RSS 摘要(四五百字)喂模型改写,
 *     改出来的稿子是"摘要的摘要"。实测聚美丽 / Cosmetics Business 4/4 抽到 2.6K–11.6K 字。
 *   · search:中文源发现。Google News 对国内垂媒覆盖薄,这里能直接搜到青眼、聚美丽的稿。
 *
 * 已知边界(实测):青眼系(iqingyan.cn / iqyqb.com)整站防抽取,extract 会失败;
 * 这类源只能靠 search 拿标题+摘要。别在这上面反复重试烧额度。
 *
 * 配额:文档只说默认 key rate_limit 100(周期未说明)。所以每次调用都要有明确目的,
 * 采集线里用 Budget 计数封顶,一轮最多几十次,不做"顺手多搜一次"。
 */
export interface SearchHit { title: string; url: string; snippet: string }

const BASE = 'https://api.anysearch.com/v1';

/** 一轮采集的调用预算 —— 传同一个对象进各函数,用完即静默跳过 */
export interface Budget { left: number }
export const budget = (n: number): Budget => ({ left: n });

async function post<T>(env: Record<string, unknown>, path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const key = String(env.ANYSEARCH_KEY ?? '');
  if (!key) return null;
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { code?: number; data?: T };
    return d?.code === 0 && d.data ? d.data : null;
  } catch { return null; }
}

/** 整页正文。抽不到(防爬/动态页)返回 null,由调用方走原有路径,不打断采集。 */
export async function extractPage(env: Record<string, unknown>, url: string, b?: Budget): Promise<string | null> {
  if (b && b.left <= 0) return null;
  if (b) b.left -= 1;
  const d = await post<{ url: string; title: string; content: string }>(env, '/extract', { url }, 60_000);
  const t = (d?.content ?? '').replace(/﻿/g, '').trim();
  /* 太短多半是拦截页/导航壳,不当正文用 */
  return t.length > 400 ? t : null;
}

/** 通用搜索。失败/超预算返回空数组,不抛错。 */
export async function searchWeb(env: Record<string, unknown>, query: string, max = 8, b?: Budget): Promise<SearchHit[]> {
  if (b && b.left <= 0) return [];
  if (b) b.left -= 1;
  const d = await post<{ results: { title?: string; url?: string; snippet?: string }[] }>(
    env, '/search', { query, max_results: Math.min(10, Math.max(1, max)) }, 45_000,
  );
  return (d?.results ?? [])
    .filter((x) => x.title && x.url)
    .map((x) => ({ title: String(x.title), url: String(x.url), snippet: String(x.snippet ?? '').trim() }));
}

/** 从 URL 取媒体名做 source:聚合源没给媒体名时用主域名兜底 */
export function hostName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
