export async function onRequest(context) {
  try {
    const token = (context.env && context.env.GITHUB_TOKEN) || '';
    const res = await fetch('https://api.github.com/repos/BIOSPHERECN/cosmetics-website/contents/content/site.yaml', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.v3+json' },
    });
    const body = await res.text();
    return new Response(JSON.stringify({ status: res.status, bodyLen: body.length, bodyPreview: body.slice(0,200), tokenLen: token.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stack: String(e && e.stack || '') }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
