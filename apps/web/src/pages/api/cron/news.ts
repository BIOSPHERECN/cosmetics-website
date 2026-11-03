import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { collectNews } from '../../../lib/news';

export const prerender = false;

/**
 * 资讯采集的定时入口 —— 由本机计划任务(schtasks)每日调用。
 * 用独立 CRON_KEY 而不是管理员会话:定时器不该持有能改站的凭据,
 * 泄漏了也只等于「有人能多触发几次采集」,且有常数时间比较 + 采集端幂等去重兜底。
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const POST: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  const got = request.headers.get('x-cron-key') ?? '';
  if (!key || !timingSafeEqual(got, key)) {
    return new Response(JSON.stringify({ ok: false }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return new Response(JSON.stringify({ ok: false, msg: 'no db' }), { status: 500 });
  /* 历史回填驱动器带 {cap, after, before} 按月推进;
     或直接带 {leads:[{title,link,source,date,topic}...]} —— 抓取在本机做,
     这里只过滤+改写+入库(archive.org 会挡 Worker 出口)。 */
  const b = (await request.json().catch(() => ({}))) as {
    cap?: number; after?: string; before?: string;
    leads?: { title: string; link: string; source: string; date: string; topic: string }[];
  };
  const cap = Math.min(30, Math.max(1, Number(b.cap) || 15));
  const okDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const range = okDate(b.after) && okDate(b.before) ? { after: b.after!, before: b.before! } : undefined;
  const leads = Array.isArray(b.leads)
    ? b.leads.slice(0, 40).map((l) => ({
        title: String(l.title ?? '').slice(0, 300), link: String(l.link ?? '').slice(0, 500),
        source: String(l.source ?? '').slice(0, 80), date: String(l.date ?? '').slice(0, 40),
        snippet: String((l as any).snippet ?? '').slice(0, 400),
        excerpt: String((l as any).excerpt ?? '').slice(0, 3500),
        topic: String(l.topic ?? 'industry').slice(0, 20),
      }))
    : undefined;
  const r = await collectNews(env, db, cap, range, leads as any);
  return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'content-type': 'application/json' } });
};
