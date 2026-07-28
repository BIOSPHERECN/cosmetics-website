const SECRET_KEY = 'bohui-secret-2026';
const ADMIN_USER = 'bohuiadmin';
const GITHUB_REPO = 'BIOSPHERECN/cosmetics-website';
const GITHUB_BRANCH = 'main';

function makeHeaders(token) {
  return {
    'User-Agent': 'CosmoCare-Admin/1.0',
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': 'Bearer ' + token,
  };
}

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

    const token = (context.env && context.env.GITHUB_TOKEN) || '';
    if (!token) {
      return new Response(JSON.stringify({ error: 'GitHub token not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const url = new URL(context.request.url);
    const action = url.searchParams.get('action');
    const headers = makeHeaders(token);

    if (context.request.method === 'GET' && action === 'load') {
      return loadContent(headers);
    }
    if (context.request.method === 'POST' && action === 'save') {
      return saveContent(context, headers);
    }
    if (context.request.method === 'POST' && action === 'edit') {
      return editContent(context, headers);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function loadContent(headers) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml?ref=${GITHUB_BRANCH}`, { headers });
  if (!res.ok) {
    const errText = await res.text();
    return new Response(JSON.stringify({ error: 'GitHub API error: ' + res.status, detail: errText.slice(0, 500) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const data = await res.json();
  const content = atob(data.content.replace(/\n/g, ''));
  return new Response(content, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function saveContent(context, headers) {
  const { content } = await context.request.json();
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml?ref=${GITHUB_BRANCH}`, { headers });
  if (!res.ok) return new Response(JSON.stringify({ error: 'Failed to get file info' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  const fileData = await res.json();

  const updateRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Update content via admin', content: btoa(content), sha: fileData.sha, branch: GITHUB_BRANCH }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return new Response(JSON.stringify({ error: 'Save failed', detail: err.slice(0, 500) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function editContent(context, headers) {
  const { locale, updates } = await context.request.json();

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/content/site.yaml?ref=${GITHUB_BRANCH}`, { headers });
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
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Visual edit via admin', content: btoa(yaml), sha: fileData.sha, branch: GITHUB_BRANCH }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return new Response(JSON.stringify({ error: 'Save failed', detail: err.slice(0, 500) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
