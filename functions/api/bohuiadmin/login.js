const SECRET_KEY = 'bohui-secret-2026';
const ADMIN_USER = 'bohuiadmin';
const ADMIN_PASS = 'Bohui@2026@';

export async function onRequest(context) {
  const { env } = context;
  const username = ADMIN_USER;
  const password = env.ADMIN_PASSWORD || ADMIN_PASS;

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const { username: u, password: p } = await context.request.json();
    if (u !== username || p !== password) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    const payload = JSON.stringify({ user: ADMIN_USER, exp: Date.now() + 86400000 });
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const sigStr = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const token = btoa(payload) + '.' + sigStr;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `bohui_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
}
