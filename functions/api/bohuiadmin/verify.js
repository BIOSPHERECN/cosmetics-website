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
    const sigB64 = parts[1];
    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));

    const keyData = new TextEncoder().encode(SECRET_KEY);
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr)));
    if (sig.length !== expected.length) throw new Error('Length mismatch');
    for (let i = 0; i < sig.length; i++) {
      if (sig[i] !== expected[i]) throw new Error('Sig mismatch at byte ' + i);
    }

    const data = JSON.parse(payloadStr);
    if (data.exp < Date.now()) throw new Error('Expired');
    if (data.user !== ADMIN_USER) throw new Error('Wrong user');

    return new Response(JSON.stringify({ valid: true, user: ADMIN_USER }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: e.message }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
}
