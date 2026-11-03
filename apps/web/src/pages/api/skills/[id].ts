/**
 * GET /api/skills/[id] - 返回单个技能的完整内容
 * 需要登录
 */
import { readSession, COOKIE } from "@cosmetic/core/auth";
import { env } from "cloudflare:workers";

export interface APIRouteContext {
  env: D1Database;
  cookies: any;
  params: { id: string };
}

export async function GET({ env, cookies, params }: APIRouteContext) {
  const token = cookies.get(COOKIE)?.value;
  const secret = String((env as any).SESSION_SECRET ?? (env as any).BOHUI_SESSION_SECRET ?? '');
  const session = token ? await readSession(token, secret) : null;
  if (!session) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const { results } = await env.prepare("SELECT id, name, description, channel, content FROM skills WHERE id = ?").bind(params.id).all();
  const skill = results?.[0];
  if (!skill) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });

  return new Response(JSON.stringify(skill), { headers: { "Content-Type": "application/json" } });
}