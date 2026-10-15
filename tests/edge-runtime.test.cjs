const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

// Deliberately isolated tooling: the application's dependencies and lock file
// do not need Miniflare. Every outbound request is intercepted below.
const runtimePath = path.join(__dirname, '../.tools/edge-runtime/node_modules/miniflare');
const artifactPath = path.join(__dirname, '../dist/edge/public/_worker.js');
const pageOrigin = 'https://vigia-runtime-fixture.pages.dev';
const backendOrigin = 'https://vigia-app.onrender.com';

function nextEvent(target, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Evento local ausente: ${type}`)), 4000);
    const receive = event => finish(undefined, event);
    const fail = () => finish(new Error(`Falha no WebSocket local: ${type}`));
    function finish(error, event) {
      clearTimeout(timeout);
      target.removeEventListener(type, receive);
      target.removeEventListener('error', fail);
      if (error) reject(error);
      else resolve(event);
    }
    target.addEventListener(type, receive, {once:true});
    target.addEventListener('error', fail, {once:true});
  });
}

function deniedUpgrade(runtimeOrigin, route) {
  // Node's plain HTTP upgrade request avoids Miniflare's client-side wrapper,
  // which leaves an unconsumed ws client after an expected non-101 response.
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(route, runtimeOrigin), {headers:{
      Origin:pageOrigin, Upgrade:'websocket', Connection:'Upgrade',
      'Sec-WebSocket-Key':'MDEyMzQ1Njc4OWFiY2RlZg==', 'Sec-WebSocket-Version':'13',
    }}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({status:response.statusCode, body:Buffer.concat(chunks).toString()}));
    });
    request.setTimeout(4000, () => request.destroy(new Error('Upgrade local não respondeu.')));
    request.on('error', reject);
    request.on('upgrade', (_response, socket) => {
      socket.destroy();
      reject(new Error('O backend recusou, mas o proxy aceitou o WebSocket.'));
    });
    request.end();
  });
}

test('pacote edge executa em workerd com HTTP e WebSocket locais', {timeout:60000}, async t => {
  assert.ok(fs.existsSync(artifactPath), 'Gere dist/edge/public/_worker.js antes deste teste.');
  assert.ok(fs.existsSync(runtimePath), 'Instale o Miniflare isolado em .tools/edge-runtime antes deste teste.');
  const {Miniflare, Response:RuntimeResponse, WebSocketPair, coupleWebSocket, Log, LogLevel} = require(runtimePath);
  const {WebSocketServer} = require(path.join(runtimePath, '../ws'));
  const calls = [];
  const assetCalls = [];
  const sockets = [];
  let upstream = async () => RuntimeResponse.json({ok:true});
  async function fixtureRequest(incoming) {
    const target = new URL(incoming.url, backendOrigin);
    assert.equal(target.origin, backendOrigin, 'Nenhum acesso fora do backend fixo é permitido.');
    assert.equal(incoming.headers.host, new URL(backendOrigin).host);
    calls.push({path:target.pathname, query:target.search, method:incoming.method});
    const chunks = [];
    if (!['GET','HEAD'].includes(incoming.method)) for await (const chunk of incoming) chunks.push(chunk);
    return new Request(target, {method:incoming.method, headers:incoming.headers,
      body:['GET','HEAD'].includes(incoming.method) ? undefined : Buffer.concat(chunks)});
  }
  const backend = http.createServer(async (request, response) => {
    try {
      const result = await upstream(await fixtureRequest(request));
      const headers = Object.fromEntries(result.headers);
      const cookies = result.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      response.writeHead(result.status, headers);
      response.flushHeaders();
      if (result.body) for await (const chunk of result.body) response.write(chunk);
      response.end();
    } catch {
      // A real transport failure, rather than an HTTP 500 from a JS binding.
      response.destroy();
    }
  });
  const upgrades = new WebSocketServer({noServer:true});
  backend.on('upgrade', async (request, socket, head) => {
    socket.on('error', () => {});
    try {
      const result = await upstream(await fixtureRequest(request));
      if (result.status === 101 && result.webSocket) {
        upgrades.handleUpgrade(request, socket, head, websocket => {
          void coupleWebSocket(websocket, result.webSocket).catch(() => websocket.terminate());
        });
      } else {
        const body = Buffer.from(await result.arrayBuffer());
        socket.end(Buffer.concat([Buffer.from(`HTTP/1.1 ${result.status} Fixture\r\nConnection: close\r\nContent-Length: ${body.length}\r\n\r\n`), body]));
      }
    } catch {
      socket.destroy();
    }
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const runtime = new Miniflare({
    modules:true,
    scriptPath:artifactPath,
    compatibilityDate:'2026-07-30',
    host:'127.0.0.1',
    port:0,
    cf:false,
    log:new Log(LogLevel.ERROR),
    serviceBindings:{ASSETS:async request => {
      assetCalls.push(new URL(request.url).pathname);
      return new RuntimeResponse('static fixture', {headers:{'Content-Type':'text/plain'}});
    }},
    // All global fetches are forced to this loopback-only fixture. No request
    // can reach the fixed production hostname (or any other Internet host).
    outboundService:{external:{address:`127.0.0.1:${backend.address().port}`, http:{}}},
  });
  try {
    const runtimeOrigin = await runtime.ready;

    await t.test('telas independem do backend e não abrem conexão de saída', async () => {
      const before = calls.length;
      upstream = async () => { throw new Error('Backend local indisponível'); };
      for (const route of ['/', '/assets/example.js', '/sw.js', '/apiculture']) {
        const response = await runtime.dispatchFetch(pageOrigin + route);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'static fixture');
      }
      assert.equal(calls.length, before);
      assert.deepEqual(assetCalls, ['/', '/assets/example.js', '/sw.js', '/apiculture']);
    });

    await t.test('HTTP preserva corpo e credenciais fictícias e impede cache', async () => {
      upstream = async request => {
        assert.equal(new URL(request.url).pathname, '/api/sala/message');
        assert.equal(request.method, 'POST');
        assert.equal(await request.text(), '{"text":"Mensagem fictícia"}');
        assert.equal(request.headers.get('Origin'), pageOrigin);
        assert.equal(request.headers.get('Cookie'), 'vigia_session=fixture');
        assert.equal(request.headers.get('Authorization'), 'Bearer fixture');
        assert.equal(request.headers.get('X-Vigia-AI-Consent'), 'fixture-consent');
        for (const header of ['Forwarded', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Forwarded-For']) {
          assert.doesNotMatch(request.headers.get(header) ?? '', /spoofed/);
        }
        assert.doesNotMatch(request.headers.get('Host') ?? '', /spoofed/);
        const headers = new Headers({'Cache-Control':'public, max-age=3600'});
        headers.append('Set-Cookie', 'vigia_session=fixture; HttpOnly; Secure; SameSite=Strict; Path=/api');
        headers.append('Set-Cookie', 'vigia_adult=fixture; HttpOnly; Secure; SameSite=Strict; Path=/api');
        return RuntimeResponse.json({ok:true}, {headers});
      };
      const response = await runtime.dispatchFetch(pageOrigin + '/api/sala/message?fixture=1', {
        method:'POST',
        headers:{Origin:pageOrigin, Cookie:'vigia_session=fixture', Authorization:'Bearer fixture',
          'X-Vigia-AI-Consent':'fixture-consent', 'Content-Type':'application/json',
          Forwarded:'spoofed', 'X-Forwarded-Host':'spoofed', 'X-Forwarded-Proto':'spoofed', 'X-Forwarded-For':'spoofed'},
        body:'{"text":"Mensagem fictícia"}',
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
      assert.deepEqual(response.headers.getSetCookie(), [
        'vigia_session=fixture; HttpOnly; Secure; SameSite=Strict; Path=/api',
        'vigia_adult=fixture; HttpOnly; Secure; SameSite=Strict; Path=/api',
      ]);
      assert.deepEqual(await response.json(), {ok:true});
    });

    await t.test('corpo de resposta transmitido em partes mantém todos os bytes', async () => {
      let tail;
      const firstChunk = new Uint8Array(64 * 1024).fill(65);
      upstream = async () => new RuntimeResponse(new ReadableStream({start(controller) {
        controller.enqueue(firstChunk);
        tail = setTimeout(() => { controller.enqueue(new TextEncoder().encode('último')); controller.close(); }, 30);
      }}), {headers:{'Content-Type':'text/plain'}});
      try {
        const response = await runtime.dispatchFetch(pageOrigin + '/api/stream-fixture');
        const body = new Uint8Array(await response.arrayBuffer());
        assert.deepEqual(body.slice(0, firstChunk.length), firstChunk);
        assert.equal(new TextDecoder().decode(body.slice(firstChunk.length)), 'último');
      } finally { clearTimeout(tail); }
    });

    await t.test('redirect não encaminha credenciais e erro não repete gravação', async () => {
      let before = calls.length;
      upstream = async () => new RuntimeResponse(null, {status:307, headers:{Location:'https://attacker.invalid/'}});
      const redirect = await runtime.dispatchFetch(pageOrigin + '/api/chat?url=https://attacker.invalid/', {
        method:'POST', headers:{Authorization:'Bearer fixture'}, body:'fixture',
      });
      assert.equal(redirect.status, 502);
      assert.equal(redirect.headers.get('Location'), null);
      assert.equal(calls.length, before + 1);
      await redirect.text();
      before = calls.length;
      upstream = async () => { throw new Error('Falha local fictícia'); };
      const unavailable = await runtime.dispatchFetch(pageOrigin + '/api/chat', {method:'POST', body:'fixture'});
      assert.equal(unavailable.status, 503);
      assert.equal(calls.length, before + 1);
      const result = await unavailable.json();
      assert.equal(result.status, 'unavailable');
      assert.equal(result.reply, undefined);
      assert.equal(result.riskScore, undefined);
    });

    await t.test('recusas do backend permanecem recusas', async () => {
      for (const status of [401, 403, 429, 503]) {
        upstream = async () => RuntimeResponse.json({error:'fixture denied'}, {status});
        const response = await deniedUpgrade(runtimeOrigin, '/api/live-ws?ticket=fixture');
        assert.equal(response.status, status);
        assert.deepEqual(JSON.parse(response.body), {error:'fixture denied'});
      }
    });

    await t.test('upgrade real preserva Origin, ticket, quadros e encerramento', async () => {
      upstream = async request => {
        assert.equal(request.headers.get('Origin'), pageOrigin);
        assert.equal(new URL(request.url).pathname, '/api/live-ws');
        assert.equal(new URL(request.url).searchParams.get('ticket'), 'fixture-only');
        assert.equal(request.headers.get('Upgrade'), 'websocket');
        const [client, server] = Object.values(new WebSocketPair());
        sockets.push(client, server);
        server.accept();
        server.addEventListener('message', event => server.send(event.data));
        return new RuntimeResponse(null, {status:101, webSocket:client});
      };
      const response = await runtime.dispatchFetch(pageOrigin + '/api/live-ws?ticket=fixture-only', {
        headers:{Origin:pageOrigin, Upgrade:'websocket'},
      });
      assert.equal(response.status, 101);
      const socket = response.webSocket;
      assert.ok(socket);
      sockets.push(socket);
      socket.accept();
      let received = nextEvent(socket, 'message');
      socket.send('mensagem fictícia');
      assert.equal((await received).data, 'mensagem fictícia');
      received = nextEvent(socket, 'message');
      socket.send(new Uint8Array([0, 17, 255, 63]));
      const bytes = (await received).data;
      assert.deepEqual(Array.from(new Uint8Array(bytes)), [0, 17, 255, 63]);
      const closed = nextEvent(socket, 'close');
      const server = sockets[sockets.length - 2];
      server.close(1000, 'fixture complete');
      const event = await closed;
      assert.equal(event.code, 1000);
      assert.equal(event.reason, 'fixture complete');
    });
  } finally {
    for (const socket of sockets) {
      try { socket.close(1000, 'fixture cleanup'); } catch {}
    }
    await runtime.dispose();
    for (const websocket of upgrades.clients) websocket.terminate();
    upgrades.close();
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
  }
});
