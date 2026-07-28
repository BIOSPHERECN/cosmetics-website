const SECRET_KEY = 'bohui-secret-2026';
const ADMIN_USER = 'bohuiadmin';
const GITHUB_REPO = 'BIOSPHERECN/cosmetics-website';
const GITHUB_BRANCH = 'main';

async function verifyAuth(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/bohui_session=([^;]+)/);
  if (!match) return false;
  try {
    const token = match[1];
    const parts = token.split('.');
    const payloadStr = atob(parts[0]);
    const sigStr = atob(parts[1]);
    const sig = Uint8Array.from(sigStr, c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr)));
    if (sig.length !== expected.length) return false;
    for (let i = 0; i < sig.length; i++) { if (sig[i] !== expected[i]) return false; }
    const data = JSON.parse(payloadStr);
    return data.user === ADMIN_USER && data.exp > Date.now();
  } catch { return false; }
}

const GH_HEADERS = {
  'User-Agent': 'CosmoCare-Admin/1.0',
  'Accept': 'application/vnd.github.v3+json',
};

export async function onRequest(context) {
  try {
    if (!await verifyAuth(context.request)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const url = new URL(context.request.url);
    const action = url.searchParams.get('action');
    const token = (context.env && context.env.GITHUB_TOKEN) || '';

    if (!token) {
      return new Response(JSON.stringify({ error: 'GitHub token not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const authHeaders = { Authorization: 'Bearer ' + token, ...GH_HEADERS };

    if (context.request.method === 'GET' && action === 'load') {
      return loadContent(authHeaders);
    }

    if (context.request.method === 'POST' && action === 'save') {
      return saveContent(context, authHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stack: String(e && e.stack || '') }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function loadContent(headers) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml?ref=${GITHUB_BRANCH}`, { headers });
  if (!res.ok) {
    const errText = await res.text();
    return new Response(JSON.stringify({ error: 'GitHub API error: ' + res.status, detail: errText }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const data = await res.json();
  const content = atob(data.content.replace(/\n/g, ''));
  return new Response(content, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function saveContent(context, headers) {
  const body = await context.request.json();
  const { content } = body;

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml?ref=${GITHUB_BRANCH}`, { headers });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to get file info' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  const fileData = await res.json();

  const updateRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Update site content via admin panel',
      content: btoa(content),
      sha: fileData.sha,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return new Response(JSON.stringify({ error: 'Save failed', detail: err }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
