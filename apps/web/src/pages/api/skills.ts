/**
 * GET /api/skills - 返回所有技能的列表（不含 content）
 * 需要登录
 */
import { readSession, COOKIE } from "@cosmetic/core/auth";
import { env } from "cloudflare:workers";

export interface SkillListItem {
  id: string;
  name: string;
  description: string;
  channel: string | null;
}

export interface APIRouteContext {
  env: D1Database;
  cookies: any;
}

export async function GET({ env, cookies }: APIRouteContext) {
  const token = cookies.get(COOKIE)?.value;
  const secret = String((env as any).SESSION_SECRET ?? (env as any).BOHUI_SESSION_SECRET ?? '');
  const session = token ? await readSession(token, secret) : null;
  if (!session) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const { results } = await env.prepare("SELECT id, name, description, channel FROM skills ORDER BY id").all();
  return new Response(JSON.stringify(results ?? []), { headers: { "Content-Type": "application/json" } });
}