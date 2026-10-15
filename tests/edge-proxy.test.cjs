const {test}=require('node:test');
const assert=require('node:assert/strict');
const worker=import('../edge/pages-worker.mjs');
const pageOrigin='https://vigia-example.pages.dev';

test('telas e arquivos são servidos sem tocar no servidor suspenso',async()=>{
  const {createVigiaEdge}=await worker;let upstream=0,assets=0;
  const edge=createVigiaEdge(async()=>{upstream++;throw Error('Servidor suspenso');});
  const env={ASSETS:{fetch:async request=>{assets++;return new Response(new URL(request.url).pathname);}}};
  for(const path of ['/','/assets/App-test.js','/sw.js','/apiculture'])assert.equal((await edge.fetch(new Request(pageOrigin+path),env)).status,200);
  assert.equal(assets,4);assert.equal(upstream,0);
});
test('proxy preserva método, corpo, Origin, cookie e autorização no destino fixo',async()=>{
  const {createVigiaEdge,backendOrigin}=await worker;let calls=0;
  const edge=createVigiaEdge(async(request,options)=>{
    calls++;assert.equal(new URL(request.url).origin,backendOrigin);assert.equal(new URL(request.url).pathname,'/api/sala/message');
    assert.equal(request.method,'POST');assert.equal(await request.text(),'{"text":"Mensagem fictícia"}');
    assert.equal(request.headers.get('Origin'),pageOrigin);assert.equal(request.headers.get('Cookie'),'vigia_session=fictitious');
    assert.equal(request.headers.get('Authorization'),'Bearer fictitious');assert.equal(request.headers.get('X-Vigia-AI-Consent'),'test-version');
    assert.equal(request.headers.get('X-Forwarded-For'),null);assert.equal(request.headers.get('Host'),null);
    assert.equal(options.cache,'no-store');assert.equal(options.redirect,'manual');
    return Response.json({ok:true},{headers:{'Set-Cookie':'vigia_session=fictitious; HttpOnly; Secure; SameSite=Strict; Path=/api','Cache-Control':'public,max-age=3600'}});
  });
  const result=await edge.fetch(new Request(pageOrigin+'/api/sala/message',{method:'POST',headers:{Origin:pageOrigin,Cookie:'vigia_session=fictitious',Authorization:'Bearer fictitious','X-Vigia-AI-Consent':'test-version','Content-Type':'application/json','X-Forwarded-For':'spoofed',Host:'spoofed'},body:'{"text":"Mensagem fictícia"}'}),{});
  assert.equal(calls,1);assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(result.headers.get('CDN-Cache-Control'),'no-store');
  assert.match(result.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict; Path=\/api/);assert.deepEqual(await result.json(),{ok:true});
});
test('query e headers não tornam o worker um proxy aberto',async()=>{
  const {createVigiaEdge,backendOrigin}=await worker;
  const edge=createVigiaEdge(async request=>{assert.equal(new URL(request.url).origin,backendOrigin);return new Response('fixed');});
  const result=await edge.fetch(new Request(pageOrigin+'/api/status?url=https://attacker.invalid/',{headers:{'X-Upstream':'https://attacker.invalid/'}}),{});
  assert.equal(await result.text(),'fixed');
});
test('falhas não fabricam resposta nem repetem uma gravação ambígua',async()=>{
  const {createVigiaEdge}=await worker;let calls=0;
  const edge=createVigiaEdge(async()=>{calls++;throw Error('timeout');});
  const response=await edge.fetch(new Request(pageOrigin+'/api/chat',{method:'POST',body:'fictitious'}),{});
  assert.equal(calls,1);assert.equal(response.status,503);const body=await response.json();assert.equal(body.status,'unavailable');assert.equal(body.reply,undefined);assert.equal(body.riskScore,undefined);
});
test('redirecionamento da API não encaminha credenciais a outro host',async()=>{
  const {createVigiaEdge}=await worker;let calls=0;
  const edge=createVigiaEdge(async()=>{calls++;return new Response(null,{status:307,headers:{Location:'https://attacker.invalid/'}});});
  const response=await edge.fetch(new Request(pageOrigin+'/api/chat',{method:'POST',body:'fictitious',headers:{Authorization:'Bearer fictitious'}}),{});
  assert.equal(response.status,502);assert.equal(calls,1);assert.equal(response.headers.get('Location'),null);
});
test('respostas e upgrade WebSocket preservam o resultado de autorização do backend',async()=>{
  const {createVigiaEdge}=await worker;let calls=0;const upgrade={status:101,webSocket:{fixture:true}};
  const edge=createVigiaEdge(async request=>{calls++;assert.equal(request.headers.get('Origin'),pageOrigin);assert.match(request.url,/\/api\/live-ws\?ticket=fictitious/);return upgrade;});
  const response=await edge.fetch(new Request(pageOrigin+'/api/live-ws?ticket=fictitious',{headers:{Origin:pageOrigin,Upgrade:'websocket'}}),{});
  assert.equal(response,upgrade);assert.equal(calls,1);
  for(const status of [401,403,429,503]){const denied=createVigiaEdge(async()=>Response.json({error:'denied'},{status}));assert.equal((await denied.fetch(new Request(pageOrigin+'/api/chat'),{})).status,status);}
});
