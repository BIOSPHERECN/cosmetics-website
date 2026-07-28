const SECRET_KEY = 'bohui-secret-2026';
const ADMIN_USER = 'bohuiadmin';
const GITHUB_REPO = 'BIOSPHERECN/cosmetics-website';
const GITHUB_BRANCH = 'main';
// GitHub token is provided via Cloudflare Pages environment variable GITHUB_TOKEN

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

export async function onRequest(context) {
  try {
    if (!await verifyAuth(context.request)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const url = new URL(context.request.url);
    const action = url.searchParams.get('action');

    const token = context.env && context.env.GITHUB_TOKEN;
    const GITHUB_TOKEN = token || '';

    if (!GITHUB_TOKEN) {
      return new Response(JSON.stringify({ error: 'GitHub token not configured', hasEnv: !!context.env, tokenType: typeof token }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (context.request.method === 'GET' && action === 'load') {
      return loadContent(GITHUB_TOKEN);
    }

    if (context.request.method === 'POST' && action === 'save') {
      return saveContent(context, GITHUB_TOKEN);
    }

    if (context.request.method === 'POST' && action === 'edit') {
      return editContent(context, GITHUB_TOKEN);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Internal error: ' + e.message, stack: e && e.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function loadContent(GITHUB_TOKEN) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml?ref=${GITHUB_BRANCH}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    const errText = await res.text();
    return new Response(JSON.stringify({ error: 'GitHub API error: ' + res.status, detail: errText }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const data = await res.json();
  if (!data.content) return new Response(JSON.stringify({ error: 'GitHub response missing content', data: JSON.stringify(data).slice(0,200) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  try {
    const content = atob(data.content.replace(/\n/g, ''));
    return new Response(content, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Base64 decode failed', msg: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function saveContent(context, GITHUB_TOKEN) {
  const body = await context.request.json();
  const { content } = body;

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml?ref=${GITHUB_BRANCH}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to get file info' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  const fileData = await res.json();

  const updateRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
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

async function editContent(context, GITHUB_TOKEN) {
  const { locale, updates } = await context.request.json();

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml?ref=${GITHUB_BRANCH}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to load content' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  const fileData = await res.json();
  let yaml = atob(fileData.content.replace(/\n/g, ''));

  for (const [key, val] of Object.entries(updates)) {
    const parts = key.split('.');
    if (parts.length >= 2) {
      const section = parts[0];
      const fieldKey = parts.slice(1).join('.');
      const regex = new RegExp(`(${section}:\\n(?:[ ]{2}\\w+:\\n)*(?:[ ]{4}${locale}:\\n)(?:[ ]{6}\\w+: [^\\n]*\\n)*[ ]{6}${fieldKey}: ).*`, 'm');
      yaml = yaml.replace(regex, '$1' + val);
    }
  }

  const updateRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Visual edit via admin panel',
      content: btoa(yaml),
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
