export async function onRequest(context) {
  return new Response(JSON.stringify({ status: 'ok', method: context.request.method, url: context.request.url, hasEnv: !!context.env }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
