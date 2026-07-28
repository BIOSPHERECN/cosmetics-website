const SECRET_KEY = 'bohui-secret-2026';
const ADMIN_USER = 'bohuiadmin';
const GITHUB_REPO = 'BIOSPHERECN/cosmetics-website';
const GITHUB_BRANCH = 'main';

export async function onRequest(context) {
  try {
    const { env } = context;
    const GITHUB_TOKEN = env.GITHUB_TOKEN || '';
    if (!GITHUB_TOKEN) {
      return new Response(JSON.stringify({ error: 'GitHub token not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const url = new URL(context.request.url);
    const action = url.searchParams.get('action');

    if (context.request.method === 'GET' && action === 'load') {
      return loadContent(GITHUB_TOKEN);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
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
  const content = atob(data.content.replace(/\n/g, ''));
  return new Response(content, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
