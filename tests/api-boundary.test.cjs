const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {rateLimit}=require('express-rate-limit');
const {installApiBoundary,publicRequestError}=require('../server/apiBoundary.ts');

// A real isolated HTTP server, with no accounts, database, AI or external requests.
async function fixture(t,limit=10){
  const app=express(),message={reply:'Muitas requisições. Aguarde um momento e tente novamente.',avatarState:'serious',interactiveOptions:['Tentar novamente em instantes'],suggestedFollowUps:[]};
  installApiBoundary(app,rateLimit({windowMs:60000,limit,standardHeaders:true,legacyHeaders:false,message}));
  app.post('/api/echo',(_request,response)=>response.json({ok:true}));
  app.use(publicRequestError);
  const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return {message,post:body=>fetch('http://127.0.0.1:'+server.address().port+'/api/echo',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(5000)})};
}
function assertHeaders(response){assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-type'),/application\/json/);}

test('JSON inválido recebe 400 JSON público e headers antes de qualquer rota',async t=>{
  const f=await fixture(t),response=await f.post('{"privado":"nao-ecoar",');
  assert.equal(response.status,400);assertHeaders(response);
  assert.deepEqual(await response.json(),{status:'unavailable',error:'Não foi possível processar a solicitação.'});
});
test('429 mantém contrato JSON e precede o parser de JSON inválido',async t=>{
  const f=await fixture(t,1),first=await f.post('{}');assert.equal(first.status,200);assertHeaders(first);
  const response=await f.post('{');
  assert.equal(response.status,429,'Se o parser viesse antes do limiter, esta requisição retornaria 400.');assertHeaders(response);
  assert.deepEqual(await response.json(),f.message);
});
test('JSON acima de 2 MB mantém 413 JSON sem expor o corpo',async t=>{
  const f=await fixture(t),response=await f.post(JSON.stringify({content:'x'.repeat(2*1024*1024)}));
  assert.equal(response.status,413);assertHeaders(response);
  assert.deepEqual(await response.json(),{status:'unavailable',error:'Conteúdo grande demais.'});
});
