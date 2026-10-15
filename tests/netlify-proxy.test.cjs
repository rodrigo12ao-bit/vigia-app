const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
let createApiProxy, config, UPSTREAM_ORIGIN;
before(async () => ({ createApiProxy, config, UPSTREAM_ORIGIN } = await import(pathToFileURL(path.resolve('netlify/functions/api-proxy.mjs')))));
const origin = 'https://vigia-fixture.netlify.app';
function privateResponse(response) {
  for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Netlify-CDN-Cache-Control']) assert.equal(response.headers.get(header), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
}
async function fixture(run, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const local = `http://127.0.0.1:${server.address().port}`;
  const calls = [];
  const transport = (url, init) => {
    const target = new URL(url);
    assert.equal(target.origin, UPSTREAM_ORIGIN);
    calls.push({ target, init });
    return fetch(local + target.pathname + target.search, init);
  };
  try { await run(transport, calls); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('proxy nativo mantém corpo, credenciais e cookies Strict; remove spoof de roteamento e cache', async () => {
  assert.deepEqual(config.path, ['/api', '/api/*']);
  await fixture(async (transport, calls) => {
    const proxy = createApiProxy(transport);
    const response = await proxy(new Request(origin + '/api/chat?url=https://attacker.invalid/', {
      method: 'POST', headers: { Origin: origin, Cookie: 'vigia_session=fictitious', Authorization: 'Bearer adult-fixture', 'X-Vigia-AI-Consent': 'fixture-version', 'Content-Type': 'application/json', Host: 'attacker.invalid', Forwarded: 'for=attacker', 'X-Forwarded-For': 'attacker', 'X-Forwarded-Host': 'attacker.invalid', 'X-Upstream': 'https://attacker.invalid/' }, body: '{"message":"Adulto fictício"}'
    }));
    assert.equal(response.status, 200); privateResponse(response);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls.length, 1); assert.equal(calls[0].target.pathname, '/api/chat');
    assert.equal(calls[0].target.searchParams.get('url'), 'https://attacker.invalid/');
    assert.deepEqual(response.headers.getSetCookie(), [
      'vigia_session=fictitious; HttpOnly; Secure; SameSite=Strict; Path=/api',
      'second=fictitious; HttpOnly; Secure; SameSite=Strict; Path=/api; Expires=Wed, 21 Oct 2030 07:28:00 GMT'
    ]);
  }, async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(body, '{"message":"Adulto fictício"}');
    assert.equal(req.headers.origin, origin); assert.equal(req.headers.cookie, 'vigia_session=fictitious');
    assert.equal(req.headers.authorization, 'Bearer adult-fixture'); assert.equal(req.headers['x-vigia-ai-consent'], 'fixture-version');
    assert.match(req.headers.host, /^127\.0\.0\.1:/);
    for (const name of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-upstream']) assert.equal(req.headers[name], undefined);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public,max-age=3600', 'Set-Cookie': ['vigia_session=fictitious; HttpOnly; Secure; SameSite=Strict; Path=/api', 'second=fictitious; HttpOnly; Secure; SameSite=Strict; Path=/api; Expires=Wed, 21 Oct 2030 07:28:00 GMT'] });
    res.end('{"ok":true}');
  });
});

test('rejeita caminhos fora da API, traversal codificado, métodos e upgrade sem chamar upstream', async () => {
  let calls = 0; const proxy = createApiProxy(async () => { calls++; throw new Error('never'); });
  for (const route of ['/private', '/api-other', '/api/%252e%252e/private', '/api/%2f..%2fprivate', '/api/%5cprivate', '/api/%ZZ']) {
    const response = await proxy(new Request(origin + route));
    assert.ok([400, 404].includes(response.status), route); privateResponse(response);
  }
  for (const request of [new Request(origin + '/api/chat', { method: 'CUSTOM' }), new Request(origin + '/api/live-ws?ticket=fictitious'), new Request(origin + '/api/status', { headers: { Upgrade: 'websocket' } })]) {
    const response = await proxy(request); assert.ok([405, 426].includes(response.status)); privateResponse(response);
  }
  const oversized = await proxy(new Request(origin + '/api/chat', { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024 + 1) }));
  assert.equal(oversized.status, 413); privateResponse(oversized); assert.equal(calls, 0);
});

test('não segue redirecionamento e preserva erro HTTP/corpo sem repetições', async () => {
  await fixture(async (transport, calls) => {
    const proxy = createApiProxy(transport);
    const redirect = await proxy(new Request(origin + '/api/redirect', { method: 'POST', body: 'fictitious' }));
    assert.equal(redirect.status, 502); assert.equal(redirect.headers.get('location'), null); privateResponse(redirect);
    const invalid = await proxy(new Request(origin + '/api/invalid'));
    assert.equal(invalid.status, 400); assert.deepEqual(await invalid.json(), { error: 'Fixture inválida.' }); privateResponse(invalid);
    const empty = await proxy(new Request(origin + '/api/empty', { method: 'HEAD' }));
    assert.equal(empty.status, 204); assert.equal(await empty.text(), ''); privateResponse(empty);
    assert.equal(calls.length, 3);
  }, (req, res) => {
    if (req.url === '/api/redirect') { res.writeHead(307, { Location: 'https://attacker.invalid/' }); res.end(); }
    else if (req.url === '/api/empty') { res.writeHead(204); res.end(); }
    else { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Fixture inválida."}'); }
  });
});

test('deadline inclui cabeçalhos lentos e corpo interrompido sem retry nem erro privado', async () => {
  await fixture(async (transport, calls) => {
    const headers = await createApiProxy(transport, 180)(new Request(origin + '/api/slow-headers'));
    assert.equal(headers.status, 503); privateResponse(headers);
    assert.doesNotMatch(await headers.text(), /private|stack|ECONN|abort/i);
    const body = await createApiProxy(transport, 180)(new Request(origin + '/api/slow-body'));
    assert.equal(body.status, 200); privateResponse(body);
    await assert.rejects(body.text(), { message: 'Não foi possível concluir a resposta do servidor.' });
    assert.equal(calls.length, 2); assert.ok(calls.every(call => call.init.signal.aborted));
  }, (req, res) => {
    if (req.url === '/api/slow-body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"unfinished":'); }
    // Intentionally leave the isolated fixture pending until the proxy aborts it.
  });
});

test('stream explícito entrega exportação de 8 MB integral e cancela leitura pendente', async () => {
  const exportBytes = Buffer.alloc(8_000_000, 'e');
  await fixture(async (transport, calls) => {
    const response = await createApiProxy(transport)(new Request(origin + '/api/account/export', { method: 'POST', body: '{}' }));
    assert.ok(response.body instanceof ReadableStream); privateResponse(response);
    const received = Buffer.from(await response.arrayBuffer());
    assert.equal(received.length, exportBytes.length); assert.deepEqual(received, exportBytes);
    const controller = new AbortController();
    const pending = await createApiProxy(transport)(new Request(origin + '/api/slow-body', { signal: controller.signal }));
    const reader = pending.body.getReader(); assert.equal((await reader.read()).done, false);
    controller.abort();
    await assert.rejects(reader.read(), { message: 'Não foi possível concluir a resposta do servidor.' });
    const cancel = await createApiProxy(transport)(new Request(origin + '/api/slow-body'));
    await cancel.body.cancel('Fixture consumer cancelled');
    assert.equal(calls.length, 3); assert.equal(calls[1].init.signal.aborted, true); assert.equal(calls[2].init.signal.aborted, true);
  }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    if (req.url === '/api/account/export') res.end(exportBytes);
    else res.write('Pending fixture');
  });
});

test('cancelamento do cliente cancela fetch; sinal já cancelado não abre conexão', async () => {
  await fixture(async (transport, calls) => {
    const controller = new AbortController();
    const pending = createApiProxy(transport)(new Request(origin + '/api/chat', { method: 'POST', body: '{}', signal: controller.signal }));
    await new Promise(resolve => setTimeout(resolve, 50)); controller.abort();
    const response = await pending; assert.equal(response.status, 503); privateResponse(response);
    assert.equal(calls.length, 1); assert.equal(calls[0].init.signal.aborted, true);
    const cancelled = await createApiProxy(transport)(new Request(origin + '/api/status', { signal: controller.signal }));
    assert.equal(cancelled.status, 503); privateResponse(cancelled); assert.equal(calls.length, 1);
  }, (_req, _res) => {});
});
