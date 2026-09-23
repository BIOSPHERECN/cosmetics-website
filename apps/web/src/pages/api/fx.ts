import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * 汇率 + 访客国家(2026-09-16 创始人:「他们还选择货币,我们也要有自动换货币的」)。
 *
 * 页面本身照常走边缘缓存、只写 USD;换算在浏览器里做(CurrencySwitch),所以这里只管两件事:
 *   · 汇率表(D1 fx_rates,tools/fx_rates.py 每天 06:30 刷)—— 进程内缓存 1 小时,别每个访客都读库
 *   · 按 Cloudflare 给的国家码建议一个币种(访客没手选过时用)
 * 响应 private 缓存 1 小时:国家码是按人的,不能进共享缓存。
 */
const BY_COUNTRY: Record<string, string> = {
  ID: 'IDR', MY: 'MYR', SG: 'SGD', TH: 'THB', VN: 'VND', PH: 'PHP', SA: 'SAR', AE: 'AED', EG: 'EGP', TR: 'TRY', IN: 'INR', PK: 'PKR', NG: 'NGN', ZA: 'ZAR',
  JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD', AU: 'AUD', NZ: 'NZD', CA: 'CAD', BR: 'BRL', MX: 'MXN', GB: 'GBP',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR',
};
let cache: { at: number; rates: Record<string, number>; updated: string } | null = null;

export const GET: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!cache || Date.now() - cache.at > 3600_000) {
    const { results } = db ? await db.prepare('SELECT code, rate, updated_at FROM fx_rates').all<{ code: string; rate: number; updated_at: string }>().catch(() => ({ results: [] as any[] })) : { results: [] as any[] };
    const rates: Record<string, number> = { USD: 1 };
    for (const r of results) rates[r.code] = r.rate;
    cache = { at: Date.now(), rates, updated: results[0]?.updated_at ?? '' };
  }
  const country = ((request as any).cf?.country as string | undefined) ?? '';
  const suggest = BY_COUNTRY[country] && cache.rates[BY_COUNTRY[country]] ? BY_COUNTRY[country] : 'USD';
  return new Response(JSON.stringify({ base: 'USD', country, suggest, rates: cache.rates, updated: cache.updated }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=3600' },
  });
};
