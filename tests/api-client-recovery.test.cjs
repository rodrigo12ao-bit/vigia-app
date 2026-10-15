const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');

// Exercise the real client orchestration with isolated identity, fetch and
// storage. No Firebase SDK, network, browser, API key or AI service is used.
const source=readFileSync('src/lib/api.ts','utf8')
  .replace("import { auth } from './firebaseAuth';",'const {auth}=testEnv;')
  .replace("import {isEmergency} from '../../server/safety';",'const isEmergency=()=>false;')
  .replace("import {adultAccessVersion,adultAudience} from './audience';",'const adultAccessVersion="isolated-adult-version",adultAudience=true;');
const compiled=transform(source,{loader:'ts',format:'cjs',define:{'import.meta.env.MODE':'"publication"'}});
const expired='Entre novamente ou inicie uma sessão de visitante.';
const status={demo:false,realAI:true,audience:'18plus',ai:{mode:'adult-gemini',provider:'gemini',blocked:null,consentVersion:'isolated-consent',voice:true}};
const response=(code=200,body={ok:true})=>new Response(JSON.stringify(body),{status:code,headers:{'Content-Type':'application/json'}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const user=uid=>({uid,getIdToken:async()=>`synthetic-token-${uid}`});

async function harness(t,{handler,currentUser=null,consent=true}={}){
  const auth={currentUser},calls=[],prompts=[],local=new Map(),session=new Map([['vigia_adult_access','isolated-adult-version']]),timers=new Set();
  let now=0;
  if(consent)local.set('vigia_ai_consent:'+(currentUser?.uid||'guest'),'isolated-consent');
  const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)});
  const fetch=async(path,options={})=>{
    const call={path,options,index:calls.length};calls.push(call);
    const result=await handler?.(call);
    if(result!==undefined)return result;
    if(path==='/api/status')return response(200,status);
    if(path==='/api/session')return response(200,{expiresIn:3600});
    return response();
  };
  const timer=(callback,delay)=>{const value=setTimeout(callback,delay);value.unref?.();timers.add(value);return value;};
  const clear=value=>{clearTimeout(value);timers.delete(value);};
  t.after(()=>{for(const value of timers)clearTimeout(value);});
  const module={exports:{}};
  const script=await compiled;
  new Function('testEnv','module','exports','fetch','window','localStorage','sessionStorage','Date','setTimeout','clearTimeout',script.code)
    ({auth},module,module.exports,fetch,{confirm:message=>{prompts.push(message);return true;}},storage(local),storage(session),{now:()=>now},timer,clear);
  return {...module.exports,auth,calls,prompts,local,session,advance:ms=>{now+=ms;},count:path=>calls.filter(call=>call.path===path).length};
}

test('status shares the pending request and starts its 3 s cache only after the response',async t=>{
  const pending=deferred();let request=0;
  const h=await harness(t,{handler:({path})=>path==='/api/status'&&++request===1?pending.promise:undefined});
  const first=h.getAiStatus();h.advance(50000);
  assert.equal(h.getAiStatus(),first);assert.equal(h.count('/api/status'),1);
  pending.resolve(response(200,status));await first;
  h.advance(2000);assert.equal(h.getAiStatus(),first);
  h.advance(1001);await h.getAiStatus();assert.equal(h.count('/api/status'),2);
});

test('a failed status request can be requested again',async t=>{
  let request=0;
  const h=await harness(t,{handler:({path})=>path==='/api/status'&&++request===1?response(503,{error:'synthetic outage'}):undefined});
  await assert.rejects(h.getAiStatus(),/verificar/);await h.getAiStatus();assert.equal(h.count('/api/status'),2);
});

test('cancelling a slow status releases the caller without consent, session or final request',async t=>{
  const pending=deferred(),controller=new AbortController();
  const h=await harness(t,{consent:false,handler:({path})=>path==='/api/status'?pending.promise:undefined});
  const sending=h.apiFetch('/api/chat',{method:'POST',body:'{"message":"fictícia"}',signal:controller.signal});
  controller.abort();await assert.rejects(sending,error=>error.name==='AbortError');
  pending.resolve(response(200,status));await flush();
  assert.equal(h.prompts.length,0);assert.deepEqual(h.calls.map(call=>call.path),['/api/status']);
  assert.deepEqual(await h.getAiStatus(),status,'Shared status remains usable by other screens.');
});

test('a request already cancelled does not start even the preflight',async t=>{
  const h=await harness(t),controller=new AbortController();controller.abort();
  await assert.rejects(h.apiFetch('/api/chat',{signal:controller.signal}),error=>error.name==='AbortError');
  assert.equal(h.calls.length,0);
});

test('account changes during status cannot request consent or use the old token',async t=>{
  const pending=deferred();let tokenCalls=0;
  const old=user('a');old.getIdToken=async()=>{tokenCalls++;return 'synthetic-token-a';};
  const h=await harness(t,{currentUser:old,consent:false,handler:({path})=>path==='/api/status'?pending.promise:undefined});
  const sending=h.apiFetch('/api/chat',{method:'POST'});
  h.auth.currentUser=user('b');pending.resolve(response(200,status));
  await assert.rejects(sending,/conta mudou/);assert.equal(tokenCalls,0);assert.equal(h.prompts.length,0);assert.equal(h.count('/api/chat'),0);
});

test('account changes during token retrieval cannot confirm adulthood or send the request',async t=>{
  const token=deferred(),old=user('a');old.getIdToken=()=>token.promise;
  const h=await harness(t,{currentUser:old});
  const sending=h.apiFetch('/api/chat',{method:'POST'});await flush();
  h.auth.currentUser=user('b');token.resolve('synthetic-old-token');
  await assert.rejects(sending,/conta mudou/);assert.equal(h.count('/api/adult-access'),0);assert.equal(h.count('/api/chat'),0);
});

test('an expired guest request renews identity and adult access once before reaching the handler',async t=>{
  let expiredCookie=false,handled=0;
  const h=await harness(t,{handler:({path})=>{
    if(path==='/api/session'){expiredCookie=false;return response();}
    if(path==='/api/chat'){if(expiredCookie)return response(401,{error:expired});handled++;return response(200,{reply:'Fictícia'});}
  }});
  await h.apiFetch('/api/chat',{method:'POST',body:'{}'});expiredCookie=true;
  const result=await h.apiFetch('/api/chat',{method:'POST',body:'{}'});
  assert.equal(result.status,200);assert.equal(h.count('/api/session'),2);assert.equal(h.count('/api/adult-access'),2);
  assert.equal(h.count('/api/chat'),3);assert.equal(handled,2,'Only the authorized request may reach the application handler.');
});

test('a 401 while confirming adulthood renews the stale guest cookie rather than looping forever',async t=>{
  let expiredCookie=false;
  const h=await harness(t,{handler:({path})=>{
    if(path==='/api/session'){expiredCookie=false;return response();}
    if(path==='/api/adult-access'&&expiredCookie)return response(401,{error:expired});
  }});
  await h.apiFetch('/api/status');expiredCookie=true;
  assert.equal((await h.apiFetch('/api/chat',{method:'POST'})).status,200);
  assert.equal(h.count('/api/session'),2);assert.equal(h.count('/api/adult-access'),2);assert.equal(h.count('/api/chat'),1);
});

test('concurrent stale requests share one renewal and one fresh adult confirmation',async t=>{
  const staleA=deferred(),staleB=deferred();let failing=false;
  const h=await harness(t,{handler:({path})=>failing&&path==='/api/a'?staleA.promise:failing&&path==='/api/b'?staleB.promise:undefined});
  await h.apiFetch('/api/warm');failing=true;
  const a=h.apiFetch('/api/a'),b=h.apiFetch('/api/b');await flush();
  failing=false;staleA.resolve(response(401,{error:expired}));staleB.resolve(response(401,{error:expired}));
  assert.equal((await a).status,200);assert.equal((await b).status,200);
  assert.equal(h.count('/api/session'),2);assert.equal(h.count('/api/adult-access'),2);
});

test('a second expired-session response is returned without an unbounded replay',async t=>{
  const h=await harness(t,{handler:({path})=>path==='/api/chat'?response(401,{error:expired}):undefined});
  assert.equal((await h.apiFetch('/api/chat',{method:'POST'})).status,401);
  assert.equal(h.count('/api/session'),2);assert.equal(h.count('/api/chat'),2);
});

test('a second 401 during adult confirmation fails after a single renewal',async t=>{
  const h=await harness(t,{handler:({path})=>path==='/api/adult-access'?response(401,{error:expired}):undefined});
  await assert.rejects(h.apiFetch('/api/chat',{method:'POST'}),/Entre novamente/);
  assert.equal(h.count('/api/session'),2);assert.equal(h.count('/api/adult-access'),2);assert.equal(h.count('/api/chat'),0);
});

for(const failure of ['503','unknown-401','network'])test(`ambiguous ${failure} failure never replays a write`,async t=>{
  const h=await harness(t,{handler:({path})=>{
    if(path!=='/api/chat')return;
    if(failure==='network')return Promise.reject(new TypeError('Synthetic connection lost after send'));
    return response(failure==='503'?503:401,{error:'Synthetic application failure'});
  }});
  if(failure==='network')await assert.rejects(h.apiFetch('/api/chat',{method:'POST',body:'{}'}),/connection lost/);
  else assert.equal((await h.apiFetch('/api/chat',{method:'POST',body:'{}'})).status,Number(failure==='503'?503:401));
  assert.equal(h.count('/api/chat'),1);assert.equal(h.count('/api/session'),1);
});

test('authenticated 401 does not turn into a guest session or replay the write',async t=>{
  const h=await harness(t,{currentUser:user('a'),handler:({path})=>path==='/api/chat'?response(401,{error:expired}):undefined});
  assert.equal((await h.apiFetch('/api/chat',{method:'POST'})).status,401);
  assert.equal(h.count('/api/session'),0);assert.equal(h.count('/api/chat'),1);
});

for(const waitingOn of ['/api/session','/api/adult-access'])test(`cancellation while waiting on ${waitingOn} prevents the final request`,async t=>{
  const pending=deferred(),controller=new AbortController();
  const h=await harness(t,{handler:({path})=>path===waitingOn?pending.promise:undefined});
  const sending=h.apiFetch('/api/chat',{method:'POST',signal:controller.signal});await flush();
  assert.equal(h.count(waitingOn),1);controller.abort();
  await assert.rejects(sending,error=>error.name==='AbortError');pending.resolve(response());await flush();
  assert.equal(h.count('/api/chat'),0);
  if(waitingOn==='/api/session')assert.equal(h.count('/api/adult-access'),0);
});

test('cancelling a pending response prevents even a later expired-session renewal',async t=>{
  const pending=deferred(),controller=new AbortController();
  const h=await harness(t,{handler:({path})=>path==='/api/chat'?pending.promise:undefined});
  const sending=h.apiFetch('/api/chat',{method:'POST',signal:controller.signal});await flush();
  controller.abort();await assert.rejects(sending,error=>error.name==='AbortError');
  pending.resolve(response(401,{error:expired}));await flush();
  assert.equal(h.count('/api/session'),1);assert.equal(h.count('/api/chat'),1);
});
