/**
 * 给云端自动化(bohui-automation)用的舰队聊天口。
 *
 * 2026-09-22:deep-report 在 GitHub Actions 里直连 Agnes 免费层,09-18 起每天两次 429
 * 「Upgrade to a Token Plan」,每次失败 GitHub 都给创始人发一封邮件。云端仓只有 Agnes 一把 key,
 * 而网站 Worker 上装着整支舰队(商汤 / 智谱 / 硅基…按白名单降级)。与其把所有 key 复制进
 * GitHub Secrets,不如让脚本在 Agnes 429 时回到这里,用 x-cron-key 借舰队一次。
 * 只接 messages / max_tokens / json,不做别的。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { chat, loadFleet } from '../../../lib/fleet';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request }) => {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, msg: 'bad json' }, 400); }
  const messages = Array.isArray(body?.messages) ? body.messages.filter((m: any) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role)) : [];
  if (!messages.length) return json({ ok: false, msg: 'messages required' }, 400);
  const db = (env as any).DB as D1Database | undefined;
  try {
    const fleet = await loadFleet(db, env as any);
    const r = await chat(env as any, messages, { fleet, maxTokens: Math.min(Number(body.max_tokens) || 3000, 8000), json: !!body.json, timeoutMs: 240000 });
    return json({ ok: true, content: r.text ?? '', provider: r.provider, model: r.model });
  } catch (e: any) {
    return json({ ok: false, msg: String(e?.message ?? e).slice(0, 2000) }, 502);
  }
};
