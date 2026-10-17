const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');
const express=require('express');

// Real security orchestration, isolated Admin SDK and provider configuration.
// No Firebase emulator, account, key, provider or external request is required.
const source=readFileSync('server/security.ts','utf8')
  .replace("import { initializeApp, getApps } from 'firebase-admin/app';",'const initializeApp=()=>({}),getApps=()=>[{}];')
  .replace("import { getAuth } from 'firebase-admin/auth';",'const getAuth=()=>testEnv.auth;')
  .replace("import { getFirestore } from 'firebase-admin/firestore';",'const getFirestore=()=>testEnv.db;')
  .replace("import {runtimeConfig} from './runtime';",'const runtimeConfig=()=>testEnv.runtime;')
  .replace("import {canUseRealAi,realAiConfig} from './realAi';",'const realAiConfig=()=>testEnv.config,canUseRealAi=()=>false;')
  .replace("import {apiResponseHeaders} from './apiBoundary';",'const apiResponseHeaders=(_req,_res,next)=>next();')
  .replace("import {isEmergency} from './safety';",'const isEmergency=text=>text.includes("tem fogo");');
const compiled=transform(source,{loader:'ts',format:'cjs'});
async function fixture(t){
  const reads=[],verified=[],declarations=new Map([['adult','2026-10-13-18plus-v1']]),guardians=new Map(),tombstones=new Set();
  const runtime={demo:false,localFirebase:true,adultAudience:true,localReal:true,adultLive:false,origins:['http://fixture.local']};
  const config={provider:'gemini',enabled:true,scope:'adult-gemini',consentVersion:'fixture-consent',blocked:null};
  const db={doc:path=>({get:async()=>{reads.push(path);const [kind,uid]=path.split('/');return{exists:kind==='account_tombstones'&&tombstones.has(uid),data:()=>kind==='adult_access'?{version:declarations.get(uid)}:kind==='sala_authorities'?{guardianUid:guardians.get(uid)}:{}};},set:async()=>{throw Error('No writes in this fixture');}})};
  const auth={verifyIdToken:async token=>{verified.push(token);return{uid:token,auth_time:1};}};
  const module={exports:{}};
  new Function('testEnv','require','module','exports',(await compiled).code)({runtime,config,db,auth},require,module,module.exports);
  const api=module.exports,app=express();app.use(express.json());api.installSecurity(app);
  let reached=0;
  app.post('/api/chat',(_req,res)=>{reached++;res.json({reached:true});});
  app.post('/api/identity-test',async(req,res)=>{
    const same=await api.realAiAccess('adult',true,req);res.locals.uid='other';
    const other=await api.realAiAccess('other',true,req);res.json({same,other});
  });
  const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const root='http://127.0.0.1:'+server.address().port;
  const call=(path='/chat',{uid='adult',consent='fixture-consent',method='POST',headers={},message='Mochila'}={})=>fetch(root+'/api'+path,{method,headers:{Origin:'http://fixture.local',Authorization:'Bearer '+uid,'Content-Type':'application/json',...(consent?{'X-Vigia-AI-Consent':consent}:{}),...headers},...(method==='POST'?{body:JSON.stringify({message})}:{})});
  return{...api,reads,verified,declarations,guardians,tombstones,call,reached:()=>reached};
}

test('um POST verifica adulto uma vez e o próximo POST consulta novamente',async t=>{
  const f=await fixture(t);assert.equal((await f.call()).status,200);
  assert.deepEqual(f.reads,['account_tombstones/adult','adult_access/adult','sala_authorities/adult']);
  assert.equal((await f.call()).status,200);assert.equal(f.reads.length,6);assert.equal(f.verified.length,2);assert.equal(f.reached(),2);
});
test('GET de acesso reutiliza a declaração da requisição sem cache de decisão entre GETs',async t=>{
  const f=await fixture(t);assert.equal((await f.call('/ai-access',{method:'GET'})).status,200);assert.equal(f.reads.length,3);
  f.guardians.set('adult','prior-child');assert.equal((await f.call('/ai-access',{method:'GET'})).status,403);assert.equal(f.reads.length,6);
});
test('revogação, tombstone e cabeçalhos forjados não conservam autorização',async t=>{
  const f=await fixture(t);assert.equal((await f.call()).status,200);
  f.declarations.delete('adult');assert.equal((await f.call('/chat',{headers:{'X-Vigia-Adult-Verified':'true','X-Adult-Access':'true'}})).status,403);
  assert.equal(f.reached(),1);f.tombstones.add('adult');assert.equal((await f.call()).status,401);assert.equal(f.reads.at(-1),'account_tombstones/adult');
});
test('consentimento continua obrigatório e emergência local continua disponível',async t=>{
  const f=await fixture(t);assert.equal((await f.call('/chat',{consent:'obsolete'})).status,428);assert.equal(f.reached(),0);assert.equal(f.reads.length,3);
  assert.equal((await f.call('/chat',{consent:null,message:'tem fogo na minha casa'})).status,200);assert.equal(f.reached(),1);
});
test('WebSocket sem requisição e uma identidade alterada fazem verificações novas',async t=>{
  const f=await fixture(t);assert.equal(await f.realAiAccess('adult',true),true);assert.equal(f.reads.length,2);
  f.guardians.set('adult','prior-child');assert.equal(await f.realAiAccess('adult',true),false);assert.equal(f.reads.length,4);
  f.guardians.delete('adult');const result=await (await f.call('/identity-test')).json();assert.deepEqual(result,{same:true,other:false});
  assert.deepEqual(f.reads.slice(-5),['account_tombstones/adult','adult_access/adult','sala_authorities/adult','adult_access/other','sala_authorities/other']);
});
