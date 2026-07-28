const SECRET_KEY = 'bohui-secret-2026';
const ADMIN_USER = 'bohuiadmin';

export async function onRequest(context) {
  const cookie = context.request.headers.get('Cookie') || '';
  const match = cookie.match(/bohui_session=([^;]+)/);
  if (!match) {
    return new Response(JSON.stringify({ valid: false }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const token = match[1];
    const parts = token.split('.');
    if (parts.length !== 2) throw new Error();
    const payloadStr = atob(parts[0]);
    const sigStr = atob(parts[1]);
    const sig = Uint8Array.from(sigStr, c => c.charCodeAt(0));

    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));
    const expectedArr = new Uint8Array(expected);
    if (sig.length !== expectedArr.length) throw new Error();
    for (let i = 0; i < sig.length; i++) {
      if (sig[i] !== expectedArr[i]) throw new Error();
    }
    const data = JSON.parse(payloadStr);
    if (data.exp < Date.now()) throw new Error();
    if (data.user !== ADMIN_USER) throw new Error();

    return new Response(JSON.stringify({ valid: true, user: ADMIN_USER }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
}
