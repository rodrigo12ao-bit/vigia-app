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
  const auth={currentUser},calls=[],prompts=[],local=new Map(),session=new Map([['vigia_adult_access','isolated-adult-version']]),timers=new Set(),listeners=new Map();
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
    ({auth},module,module.exports,fetch,{confirm:message=>{prompts.push(message);return true;},addEventListener:(type,listener)=>listeners.set(type,listener)},storage(local),storage(session),{now:()=>now},timer,clear);
  return {...module.exports,auth,calls,prompts,local,session,emit:type=>listeners.get(type)?.(),advance:ms=>{now+=ms;},count:path=>calls.filter(call=>call.path===path).length};
}

test('status shares the pending request and starts its 30 s cache only after the response',async t=>{
  const pending=deferred();let request=0;
  const h=await harness(t,{handler:({path})=>path==='/api/status'&&++request===1?pending.promise:undefined});
  const first=h.getAiStatus();h.advance(50000);
  assert.equal(h.getAiStatus(),first);assert.equal(h.count('/api/status'),1);
  pending.resolve(response(200,status));await first;
  h.advance(29000);assert.equal(h.getAiStatus(),first);
  h.advance(1001);await h.getAiStatus();assert.equal(h.count('/api/status'),2);
});

test('a stale status refresh runs in parallel without holding the next text POST',async t=>{
  const pending=deferred();let request=0;
  const h=await harness(t,{handler:({path})=>path==='/api/status'&&++request===2?pending.promise:undefined});
  await h.getAiStatus();h.advance(31000);
  assert.equal((await h.apiFetch('/api/chat',{method:'POST',body:'{}'})).status,200);
  assert.equal(h.count('/api/status'),2);assert.equal(h.count('/api/chat'),1);
  const changed={...status,ai:{...status.ai,blocked:'Synthetic disabled configuration'}};
  pending.resolve(response(200,changed));await flush();
  await assert.rejects(h.apiFetch('/api/chat',{method:'POST',body:'{}'}),/disabled configuration/);
  assert.equal(h.count('/api/chat'),1);
});

test('status hints older than 60 s wait for refresh and never remain indefinitely stale',async t=>{
  const pending=deferred();let request=0;
  const h=await harness(t,{handler:({path})=>path==='/api/status'&&++request===2?pending.promise:undefined});
  await h.getAiStatus();h.advance(61000);
  const sending=h.apiFetch('/api/chat',{method:'POST',body:'{}'});await flush();assert.equal(h.count('/api/chat'),0);
  pending.resolve(response(200,status));assert.equal((await sending).status,200);
});

test('online invalidates a recent status and a failed background refresh can be retried',async t=>{
  let request=0;
  const h=await harness(t,{handler:({path})=>path==='/api/status'&&++request===2?response(503,{error:'Synthetic status outage'}):undefined});
  await h.getAiStatus();h.advance(31000);
  assert.deepEqual(await h.getAiStatus(),status);await flush();
  h.emit('online');await h.getAiStatus();assert.equal(h.count('/api/status'),3);
});

test('cached status cannot bypass a changed consent: 428 is returned once and the next action asks again',async t=>{
  let changed=false,handled=0;
  const changedStatus={...status,ai:{...status.ai,consentVersion:'isolated-consent-v2'}};
  const h=await harness(t,{handler:({path,options})=>{
    if(path==='/api/status')return response(200,changed?changedStatus:status);
    if(path==='/api/chat'){
      if(options.headers.get('X-Vigia-AI-Consent')!==(changed?'isolated-consent-v2':'isolated-consent'))return response(428,{code:'consent_required',error:'Synthetic consent required'});
      handled++;return response();
    }
  }});
  await h.getAiStatus();changed=true;
  assert.equal((await h.apiFetch('/api/chat',{method:'POST',body:'{}'})).status,428);
  assert.equal(handled,0);assert.equal(h.count('/api/chat'),1);assert.equal(h.prompts.length,0);
  assert.equal((await h.apiFetch('/api/chat',{method:'POST',body:'{}'})).status,200);
  assert.equal(handled,1);assert.equal(h.count('/api/status'),2);assert.equal(h.prompts.length,1);
  assert.equal(h.local.get('vigia_ai_consent:guest'),'isolated-consent-v2');
});

test('a cached configuration never replaces fresh authorization of the text POST',async t=>{
  const h=await harness(t,{handler:({path})=>path==='/api/chat'?response(403,{code:'audience_blocked',error:'Synthetic adulthood revoked'}):undefined});
  await h.getAiStatus();assert.equal((await h.apiFetch('/api/chat',{method:'POST',body:'{}'})).status,403);
  assert.equal(h.count('/api/chat'),1);await h.getAiStatus();assert.equal(h.count('/api/status'),2);
});

test('explicit connection verification refreshes immediately and shares the pending read',async t=>{
  const pending=deferred();let request=0;
  const h=await harness(t,{handler:({path})=>path==='/api/status'&&++request===2?pending.promise:undefined});
  await h.getAiStatus();const refresh=h.getAiStatus({fresh:true});
  assert.equal(h.getAiStatus({fresh:true}),refresh);assert.equal(h.count('/api/status'),2);
  pending.resolve(response(200,status));await refresh;
});

test('a text connection failure invalidates status without replaying the failed write',async t=>{
  let fail=true;
  const h=await harness(t,{handler:({path})=>path==='/api/chat'&&fail?Promise.reject(new TypeError('Synthetic connection lost')):undefined});
  await h.getAiStatus();await assert.rejects(h.apiFetch('/api/chat',{method:'POST',body:'{}'}),/connection lost/);
  assert.equal(h.count('/api/chat'),1);fail=false;
  assert.equal((await h.apiFetch('/api/chat',{method:'POST',body:'{}'})).status,200);assert.equal(h.count('/api/status'),2);
});

test('a failed status request can be requested again',async t=>{
  let request=0;
  const h=await harness(t,{handler:({path})=>path==='/api/status'&&++request===1?response(503,{error:'synthetic outage'}):undefined});
  await assert.rejects(h.getAiStatus(),/verificar/);await h.getAiStatus();assert.equal(h.count('/api/status'),2);
});

test('simultaneous voice access checks share one GET without caching the completed decision',async t=>{
  const pending=deferred();let request=0;
  const allowed={allowed:true,voice:true,blocked:null},denied={allowed:false,voice:false,blocked:'Synthetic access changed'};
  const h=await harness(t,{handler:({path})=>path==='/api/ai-access'?(++request===1?pending.promise:response(200,denied)):undefined});
  const first=h.getAiAccess(),second=h.getAiAccess(),third=h.getAiAccess();await flush();
  assert.equal(h.count('/api/ai-access'),1);assert.equal(h.count('/api/status'),1);
  assert.equal(h.count('/api/session'),1);assert.equal(h.count('/api/adult-access'),1);
  pending.resolve(response(200,allowed));
  assert.deepEqual(await Promise.all([first,second,third]),[allowed,allowed,allowed]);
  assert.deepEqual(await h.getAiAccess(),denied);assert.equal(h.count('/api/ai-access'),2);
});

test('a failed shared access check is evicted so the next action performs a fresh GET',async t=>{
  const pending=deferred();let request=0;
  const allowed={allowed:true,voice:true,blocked:null};
  const h=await harness(t,{handler:({path})=>path==='/api/ai-access'?(++request===1?pending.promise:response(200,allowed)):undefined});
  const first=h.getAiAccess(),second=h.getAiAccess();await flush();assert.equal(h.count('/api/ai-access'),1);
  const failed=Promise.allSettled([first,second]);pending.resolve(response(503,{blocked:'Synthetic access outage'}));
  for(const result of await failed){assert.equal(result.status,'rejected');assert.match(result.reason.message,/Synthetic access outage/);}
  assert.deepEqual(await h.getAiAccess(),allowed);assert.equal(h.count('/api/ai-access'),2);
});

test('access checks never share identities and an old result cannot evict the new pending check',async t=>{
  const a=deferred(),b=deferred();let request=0;
  const h=await harness(t,{currentUser:user('a'),handler:({path})=>path==='/api/ai-access'?(++request===1?a.promise:b.promise):undefined});
  const old=h.getAiAccess();await flush();assert.equal(h.count('/api/ai-access'),1);
  h.auth.currentUser=user('b');const current=h.getAiAccess();await flush();
  assert.equal(h.count('/api/ai-access'),2);
  const oldFailure=assert.rejects(old,/conta mudou/);a.resolve(response(200,{allowed:true,voice:true,blocked:null}));await oldFailure;
  const secondCurrent=h.getAiAccess();await flush();assert.equal(h.count('/api/ai-access'),2);
  const denied={allowed:false,voice:false,blocked:'Synthetic account b access'};
  b.resolve(response(200,denied));assert.deepEqual(await Promise.all([current,secondCurrent]),[denied,denied]);
  assert.deepEqual(h.calls.filter(call=>call.path==='/api/ai-access').map(call=>call.options.headers.get('Authorization')),['Bearer synthetic-token-a','Bearer synthetic-token-b']);
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
