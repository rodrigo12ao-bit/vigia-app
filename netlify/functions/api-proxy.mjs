// Fixed-origin HTTP bridge only. Voice connects directly to Render using a one-use ticket.
export const config = { path: ['/api', '/api/*'] };
export const UPSTREAM_ORIGIN = 'https://vigia-app.onrender.com';
const requestHeaders = ['accept', 'content-type', 'cookie', 'authorization', 'origin', 'x-vigia-ai-consent'];
const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'content-encoding'];
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const privateHeaders = { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const failure = (status, error) => Response.json({ error }, { status, headers: privateHeaders });

// The injectable transport/deadline are for isolated tests, never request input or environment.
export function createApiProxy(transport = fetch, deadlineMs = 55000) {
  return async function apiProxy(request) {
    let url, path;
    try { url = new URL(request.url); path = decodeURIComponent(url.pathname); }
    catch { return failure(400, 'Endereço inválido.'); }
    if (!/^\/api(?:\/|$)/.test(path) || /[\\%]/.test(path) || path.includes('//') || path.split('/').some(part => part === '.' || part === '..'))
      return failure(404, 'Endereço não encontrado.');
    if (!methods.has(request.method)) return failure(405, 'Método não permitido.');
    if (path === '/api/live-ws' || request.headers.has('upgrade')) return failure(426, 'Abra a conversa por voz pela conexão segura do aplicativo.');
    const headers = new Headers();
    for (const name of requestHeaders) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    headers.set('accept-encoding', 'identity');
    const controller = new AbortController();
    const cleanup = () => { clearTimeout(timer); request.signal.removeEventListener('abort', abort); };
    const abort = () => { controller.abort(); cleanup(); };
    const timer = setTimeout(abort, deadlineMs);
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    let streaming = false;
    try {
      if (controller.signal.aborted) throw new Error('cancelled');
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
      if (body?.byteLength > 2 * 1024 * 1024) return failure(413, 'O arquivo ou mensagem ultrapassa o limite permitido.');
      if (controller.signal.aborted) throw new Error('cancelled');
      const target = new URL(UPSTREAM_ORIGIN);
      target.pathname = url.pathname;
      target.search = url.search;
      const upstream = await transport(target, { method: request.method, headers, body, redirect: 'manual', signal: controller.signal });
      if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304) {
        await upstream.body?.cancel();
        return failure(502, 'O servidor retornou um redirecionamento inesperado.');
      }
      const responseHeaders = new Headers(upstream.headers);
      // Fetch decodes compressed bodies; never forward stale wire length/encoding.
      for (const name of hopHeaders) responseHeaders.delete(name);
      for (const [name, value] of Object.entries(privateHeaders)) responseHeaders.set(name, value);
      let payload = null;
      if (request.method !== 'HEAD' && ![204, 205, 304].includes(upstream.status) && upstream.body) {
        const reader = upstream.body.getReader();
        // Native Netlify streaming permits the existing account export (up to 8 MB).
        // Keep the same deadline/cancellation until the body finishes, not just its headers.
        payload = new ReadableStream({
          async pull(output) {
            try {
              const { done, value } = await reader.read();
              if (done) { cleanup(); output.close(); } else output.enqueue(value);
            } catch { abort(); output.error(new Error('Não foi possível concluir a resposta do servidor.')); }
          },
          cancel(reason) { abort(); return reader.cancel(reason).catch(() => {}); }
        });
      } else await upstream.body?.cancel();
      const response = new Response(payload, { status: upstream.status, headers: responseHeaders });
      streaming = payload !== null;
      return response;
    } catch {
      return failure(503, 'O servidor está iniciando ou demorou para responder. Tente novamente em instantes.');
    } finally {
      if (!streaming) cleanup();
    }
  };
}

export default createApiProxy();
