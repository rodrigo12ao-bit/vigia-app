const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter,once}=require('node:events');
const express=require('express');
const {createAiAdmission}=require('../server/aiAdmission.ts');
const {isEmergency,adultEmergencyReply}=require('../server/safety.ts');
const routes=['chat','analyze-scenario','transcribe','tts','generate-quiz'];
const bodyFor=route=>route==='chat'?{message:'Onde guardar a lanterna?'}:route==='analyze-scenario'?{scenario:'Preparação fictícia da mochila'}:route==='transcribe'?{audio:'QUFBQQ==',mimeType:'audio/wav'}:route==='tts'?{text:'Frase adulta fictícia'}:{topic:'Mochila fictícia'};

// Local HTTP requests exercise the shared guard with deliberately held provider
// operations. This fixture never imports an AI engine or reaches an external service.
async function fixture(t,options={}){
  const app=express(),events=new EventEmitter(),pending=[];
  const admission=createAiAdmission({demo:!!options.demo,maxConcurrent:options.maxConcurrent??8,isEmergency,emergencyReply:adultEmergencyReply});
  let calls=0;
  app.use(express.json({limit:'2mb'}));app.use('/api',admission.validate);
  app.use('/api',(request,response,next)=>{if(request.headers['x-fixture-auth']==='denied'){response.status(401).json({error:'Sessão fictícia negada.'});return;}next();});
  const handler=admission.wrap(async(request,response,signal)=>{
    calls++;
    if(request.body.fixtureFailure)throw Error('detalhe-interno-nao-publico');
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    const operation={id:calls,signal,release,settled:false};pending.push(operation);events.emit('started');
    try{await gate;if(!signal.aborted&&!response.destroyed)response.json({provider:'simulated-test-only'});}
    finally{operation.settled=true;events.emit('settled');}
  });
  for(const route of routes)app.post('/api/'+route,handler);
  const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
  const root='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{for(const item of pending)item.release();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return {admission,pending,get calls(){return calls;},
    async waitCalls(count){while(calls<count)await once(events,'started');},
    releaseAll(){for(const item of pending)item.release();},
    post(route,body=bodyFor(route),extra={}){return fetch(root+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...extra.headers},body:JSON.stringify(body),signal:extra.signal||AbortSignal.timeout(5000)});},
  };
}

test('oito operações reais na fixture não bloqueiam emergência local nem serializam chat', {timeout:10000},async t=>{
  const f=await fixture(t);
  const held=Array.from({length:8},(_,index)=>f.post(routes[index%routes.length]));
  await f.waitCalls(8);assert.equal(f.admission.active,8);
  const ninth=await f.post('chat');assert.equal(ninth.status,503);assert.equal((await ninth.json()).status,'unavailable');
  for(const route of ['chat','analyze-scenario']){
    const response=await f.post(route,route==='chat'?{message:'Fala fictícia: socorro, a água está entrando.'}:{scenario:'Cenário fictício: socorro, a água está entrando.'});
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.status,'emergency');assert.equal(result.reply,adultEmergencyReply.reply);
    if(route==='analyze-scenario')assert.equal(result.summary,adultEmergencyReply.reply);
  }
  assert.equal(f.calls,8,'A orientação local não pode chamar o provedor.');assert.equal(f.admission.active,8);
  f.releaseAll();assert.ok((await Promise.all(held)).every(response=>response.status===200));assert.equal(f.admission.active,0);
});

test('com capacidade cheia, emergência inválida continua sendo rejeitada antes do provedor', {timeout:10000},async t=>{
  const f=await fixture(t);const held=Array.from({length:8},()=>f.post('generate-quiz'));await f.waitCalls(8);
  const emergency={message:'Fala fictícia: socorro, a água está entrando.'};
  for(const body of [{...emergency,image:{mimeType:'text/html',data:'AAAA'}},{...emergency,chatHistory:[{role:'system',content:'não permitido'}]},{message:{text:emergency.message}},{message:'socorro '+'.'.repeat(250000)}]){
    assert.equal((await f.post('chat',body)).status,400);
  }
  assert.equal((await f.post('analyze-scenario',{scenario:{text:'socorro'}})).status,400);
  assert.equal(f.calls,8);f.releaseAll();await Promise.all(held);assert.equal(f.admission.active,0);
});

test('orientação emergencial não contorna a autenticação anterior ao guard',async t=>{
  const f=await fixture(t);
  const response=await f.post('chat',{message:'Fala fictícia: socorro.'},{headers:{'x-fixture-auth':'denied'}});
  assert.equal(response.status,401);assert.equal(f.calls,0);assert.equal(f.admission.active,0);
});

test('cancelamento aborta o trabalho, mas a vaga só é liberada quando ele termina',{timeout:10000},async t=>{
  const f=await fixture(t,{maxConcurrent:1}),controller=new AbortController();
  const cancelled=f.post('generate-quiz',undefined,{signal:controller.signal}).catch(error=>error);
  await f.waitCalls(1);const operation=f.pending[0];
  const aborted=once(operation.signal,'abort');controller.abort();await aborted;await cancelled;
  assert.equal(operation.signal.aborted,true);assert.equal(f.admission.active,1);
  assert.equal((await f.post('tts')).status,503,'Um adaptador ainda encerrando não permite ultrapassar a capacidade.');
  operation.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.admission.active,0);
  const next=f.post('transcribe');await f.waitCalls(2);f.releaseAll();assert.equal((await next).status,200);assert.equal(f.admission.active,0);
});

test('erro do provedor libera a vaga em finally e não expõe detalhe interno',async t=>{
  const f=await fixture(t,{maxConcurrent:1});
  const failure=await f.post('chat',{message:'Pergunta fictícia',fixtureFailure:true});
  assert.equal(failure.status,503);assert.doesNotMatch(JSON.stringify(await failure.json()),/detalhe-interno/);assert.equal(f.admission.active,0);
  const next=f.post('chat');await f.waitCalls(2);f.releaseAll();assert.equal((await next).status,200);
  assert.ok(f.pending.every(operation=>operation.signal.aborted),'A operação encerrada também limpa o sinal e seus recursos.');
});

test('simulação de falha não substitui orientação emergencial local',async t=>{
  const f=await fixture(t,{demo:true});
  const regular=await f.post('chat',undefined,{headers:{'x-demo-failure':'true'}});assert.equal(regular.status,503);
  const emergency=await f.post('chat',{message:'Fala fictícia: socorro.'},{headers:{'x-demo-failure':'true'}});
  assert.equal(emergency.status,200);assert.equal((await emergency.json()).reply,adultEmergencyReply.reply);assert.equal(f.calls,0);
});
