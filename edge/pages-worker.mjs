// Public assets are served independently of Render. Only the fixed API is
// proxied; no API keys, user data, cache, timers or background pings live here.
export const backendOrigin = 'https://vigia-app.onrender.com';

function unavailable(status = 503) {
  return Response.json({status:'unavailable',error:'Não foi possível conectar ao servidor. Tente novamente em instantes.'}, {
    status,headers:{'Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},
  });
}

export function createVigiaEdge(fetchUpstream = fetch) {
  return {
    async fetch(request, env) {
      const source = new URL(request.url);
      if (source.pathname !== '/api' && !source.pathname.startsWith('/api/')) {
        return env.ASSETS.fetch(request);
      }
      // A URL in a query/header/body can never choose another upstream.
      const target = new URL(backendOrigin);
      target.pathname = source.pathname;
      target.search = source.search;
      const headers = new Headers(request.headers);
      for (const name of ['Host','Forwarded','X-Forwarded-Host','X-Forwarded-Proto','X-Forwarded-For']) headers.delete(name);
      const hasBody = !['GET','HEAD'].includes(request.method);
      const forwarded = new Request(target, {
        method:request.method,headers,body:hasBody?request.body:undefined,
        ...(hasBody?{duplex:'half'}:{}),signal:request.signal,redirect:'manual',
      });
      try {
        const response = await fetchUpstream(forwarded, {cache:'no-store',redirect:'manual'});
        // A WebSocket upgrade is passed through without consuming or replacing
        // its socket, preserving the backend's one-use ticket and Origin checks.
        if(response.status === 101) return response;
        // Never follow an upstream redirect with cookies or Authorization.
        if(response.status >= 300 && response.status < 400) return unavailable(502);
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Cache-Control','no-store');
        responseHeaders.set('CDN-Cache-Control','no-store');
        responseHeaders.set('X-Content-Type-Options','nosniff');
        return new Response(response.body, {status:response.status,statusText:response.statusText,headers:responseHeaders});
      } catch {
        // No automatic retry: a disconnected write might already have run.
        return unavailable();
      }
    },
  };
}

export default createVigiaEdge();
