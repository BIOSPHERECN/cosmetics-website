/**
 * 网关的模型清单 —— OpenAI 形状的 /v1/models。
 *
 * 很多客户端(Dify、n8n、各种 IDE 插件)开机第一件事就是拉这个表来填下拉框。
 * 没有它,那些工具会认为网关不可用,连试都不试。
 *
 * 只列**当前真的配了 key 且启用**的家:列出配不出去的模型,
 * 等于让用户在下拉框里选一个必定失败的选项。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet } from '../../../../lib/fleet';
import { authKey, gwError } from '../../../../lib/gateway';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return gwError('gateway not configured', 503, 'api_error');

  const auth = await authKey(db, request.headers.get('authorization'));
  if ('error' in auth) return gwError(auth.error, auth.status, 'authentication_error');

  const fleet = await loadFleet(db, env as any);
  const now = Math.floor(Date.now() / 1000);

  // auto 排第一:多数客户端默认选第一项,而自动挡正是我们希望的默认行为
  const data = [
    { id: 'auto', object: 'model', created: now, owned_by: 'bohui', description: '自动挡:按实测排名逐家降级' },
    ...fleet.map((p) => ({
      id: p.id, object: 'model', created: now, owned_by: 'bohui',
      description: `${p.label} · ${p.model}${p.free ? ' · 免费额度' : ''}`,
    })),
  ];
  return new Response(JSON.stringify({ object: 'list', data }), {
    headers: { 'content-type': 'application/json' },
  });
};
