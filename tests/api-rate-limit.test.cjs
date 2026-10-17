const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createAuthenticatedApiLimiter}=require('../server/apiRateLimit.ts');
const {installApiBoundary,publicRequestError}=require('../server/apiBoundary.ts');

async function fixture(t,changes={}){
  const app=express();app.set('trust proxy',1);let authentications=0;
  installApiBoundary(app,createAuthenticatedApiLimiter({demo:false,publicLimit:2,credentialLimit:20,userLimit:6,aiLimit:2,authenticate:async request=>{
    authentications++;
    if(request.headers.authorization==='Bearer invalid')throw Error('private auth failure');
    const uid=request.headers.authorization==='Bearer rotated-a'?'a':request.headers.authorization?.slice(7)||request.headers.cookie;
    return {uid,firebaseUser:true};
  },...changes}));
  for(const path of ['/chat','/ordinary','/status','/session'])app.all('/api'+path,(request,response)=>response.json({uid:response.locals.uid||null}));
  app.use(publicRequestError);
  const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return {get authentications(){return authentications;},call:(path='/chat',token='a',body='{}')=>fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json','X-Forwarded-For':'203.0.113.1'},body,signal:AbortSignal.timeout(5000)})};
}
test('usuários verificados no mesmo IP de proxy possuem limites independentes',async t=>{
  const f=await fixture(t);
  for(const uid of ['a','b','c']){
    assert.equal((await f.call('/chat',uid)).status,200);
    assert.equal((await f.call('/chat',uid)).status,200);
    const excess=await f.call('/chat',uid,'{');
    assert.equal(excess.status,429);assert.equal(excess.headers.get('cache-control'),'no-store');
    assert.equal((await excess.json()).status,'unavailable');
  }
});
test('leitura comum não consome quota de IA; tokens rotacionados conservam identidade e variações de rota',async t=>{
  const f=await fixture(t);
  for(let i=0;i<3;i++)assert.equal((await f.call('/ordinary')).status,200);
  assert.equal((await f.call('/CHAT/')).status,200);
  assert.equal((await f.call('/chat','rotated-a')).status,200);
  assert.equal((await f.call('/chat')).status,429);
});
test('sessão/status e requisições anônimas mantêm limite por IP antes do parser e não verificam tokens',async t=>{
  const f=await fixture(t);
  assert.equal((await f.call('/session')).status,200);
  assert.equal((await f.call('/status')).status,200);
  assert.equal((await f.call('/session',null,'{')).status,429);
  assert.equal(f.authentications,0);
  // The proxy's public quota cannot deny an existing verified conversation.
  assert.equal((await f.call()).status,200);
});
test('token inválido é limitado antes de novas verificações e não expõe erro privado',async t=>{
  const f=await fixture(t,{credentialLimit:2});
  for(let i=0;i<2;i++){const response=await f.call('/chat','invalid');assert.equal(response.status,401);assert.doesNotMatch(await response.text(),/private/);}
  assert.equal((await f.call('/chat','invalid','{')).status,429);assert.equal(f.authentications,2);
  assert.equal((await f.call('/chat','a')).status,200);
});
test('verificações concorrentes têm teto antes do parser e liberam vagas após falha',async t=>{
  let release;
  const f=await fixture(t,{maxAuthentications:1,authenticate:()=>new Promise((resolve,reject)=>{release=()=>reject(Error('private'));})});
  const pending=f.call('/chat','slow');
  while(!release)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal((await f.call('/chat','other','{')).status,503);
  release();assert.equal((await pending).status,401);
});
