/**
 * 会话校验 —— 供 API 路由鉴权用。
 * 完整实现见 _cb_work/gw/apps/web/src/lib/auth.ts。
 */
const te = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export interface Session {
  uid: number;
  email: string;
  role: string;
  exp: number;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, te.encode(payload)));
}

export async function readSession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token || !secret || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!timingSafeEqual(sig, await sign(body, secret))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64u(body))) as Session;
    return s.exp > Math.floor(Date.now() / 1000) ? s : null;
  } catch {
    return null;
  }
}

export const COOKIE = 'bohui_sess';
