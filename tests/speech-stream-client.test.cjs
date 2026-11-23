const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');

// Browser playback and the HTTP body are simulated. No provider, network or mic.
const source=readFileSync('src/utils/speech.ts','utf8').replace("import { apiFetch } from '../lib/api';",'const apiFetch=(...args)=>request(...args);');
const bundle=transform(source,{loader:'ts',format:'cjs'});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const start={type:'start',sampleRate:24000,encoding:'pcm_s16le'};
const pcm=Buffer.alloc(4800).toString('base64');
const audio={type:'audio',pcmBase64:pcm};

function stream(){
  let controller,cancelled=0;
  const body=new ReadableStream({start(value){controller=value;},cancel(){cancelled++;}});
  return {response:new Response(body,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8'}}),cancelled:()=>cancelled,
    raw(text){controller.enqueue(new TextEncoder().encode(text));},send(value){this.raw(JSON.stringify(value)+'\n');},close(){controller.close();},fail(){controller.error(Error('connection lost'));}};
}

async function harness({webAudio=true,resume,htmlPlayError=false}={}){
  const requests=[],contexts=[],htmlAudio=[],spoken=[],errors=[],blobs=[],revoked=[];
  class Context{
    constructor(){this.state=resume?'suspended':'running';this.currentTime=10;this.destination={};this.sources=[];contexts.push(this);}
    resume(){return resume?.promise||Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createBuffer(channels,length,rate){const samples=new Float32Array(length);return {duration:length/rate,getChannelData:()=>samples,samples};}
    createBufferSource(){const value={buffer:null,stopped:false,onended:null,connect(){},disconnect(){},start(time){this.startAt=time;},stop(){this.stopped=true;},end(){this.onended?.();}};this.sources.push(value);return value;}
  }
  class HtmlAudio{
    constructor(url){this.src=url;htmlAudio.push(this);}
    async play(){if(htmlPlayError)throw Error('Playback unavailable');this.onplay?.();}
    pause(){this.paused=true;}
  }
  const window={AudioContext:webAudio?Context:undefined,speechSynthesis:{cancel(){},speak:value=>spoken.push(value)},dispatchEvent:event=>errors.push(event.detail)};
  const URL={createObjectURL(blob){blobs.push(blob);return 'blob:simulated-'+blobs.length;},revokeObjectURL:value=>revoked.push(value)};
  const request=(path,options)=>{const pending=deferred();requests.push({path,options,...pending});return pending.promise;};
  const module={exports:{}};
  new Function('window','Audio','URL','CustomEvent','request','module','exports',(await bundle).code)(window,HtmlAudio,URL,class{constructor(type,init){this.type=type;this.detail=init.detail;}},request,module,module.exports);
  return {...module.exports,requests,contexts,htmlAudio,spoken,errors,blobs,revoked};
}

test('replay negotiates streaming directly and schedules its first PCM before response completion',async()=>{
  const h=await harness(),s=stream();let starts=0,ends=0;
  const pending=h.speakText('Resposta completa.',()=>starts++,()=>ends++);
  assert.equal(h.contexts.length,1,'The output context is created in the click, before awaiting the request.');
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].path,'/api/tts');
  assert.equal(h.requests[0].options.headers.Accept,'application/x-ndjson');assert.deepEqual(JSON.parse(h.requests[0].options.body),{text:'Resposta completa.'});
  h.requests[0].resolve(s.response);s.send(start);s.send(audio);await flush();
  const context=h.contexts[0];assert.equal(context.sources.length,1);assert.equal(starts,1);assert.equal(ends,0);
  assert.equal(context.sources[0].startAt,10.08);
  s.send(audio);await flush();assert.equal(context.sources[1].startAt,10.18);
  s.send({type:'done'});await pending;assert.equal(ends,0,'Receiving done is not the audible playback end.');
  context.sources[0].end();assert.equal(ends,0);context.sources[1].end();assert.equal(ends,1);assert.equal(context.state,'closed');assert.equal(h.spoken.length,0);assert.deepEqual(h.errors,[]);
});

test('split NDJSON frames decode signed PCM correctly and never invent missing completion',async()=>{
  const h=await harness(),s=stream();let ended=0;const pending=h.speakText('Confira as pilhas.',undefined,()=>ended++);
  h.requests[0].resolve(s.response);
  const bytes=Buffer.alloc(6);bytes.writeInt16LE(-32768,0);bytes.writeInt16LE(0,2);bytes.writeInt16LE(32767,4);
  const encoded=JSON.stringify(start)+'\n'+JSON.stringify({type:'audio',pcmBase64:bytes.toString('base64')})+'\n';
  s.raw(encoded.slice(0,17));await flush();assert.equal(h.contexts[0].sources.length,0);
  s.raw(encoded.slice(17));await flush();assert.deepEqual([...h.contexts[0].sources[0].buffer.samples],[-1,0,1]);
  h.contexts[0].sources[0].end();assert.equal(ended,0,'Playback alone is not a complete response until the terminal frame.');
  s.close();await pending;assert.equal(ended,1);assert.match(h.errors[0],/transmissão.*interrompida/i);assert.equal(h.spoken.length,0);
});

test('provider failure after partial playback stops queued audio and never changes to a device voice',async()=>{
  const h=await harness(),s=stream();let ends=0;const pending=h.speakText('Uma resposta válida.',undefined,()=>ends++);
  h.requests[0].resolve(s.response);s.send(start);s.send(audio);s.send(audio);await flush();
  const late=h.contexts[0].sources[0].onended;s.send({type:'error',code:'tts_unavailable',message:'A voz está temporariamente indisponível.'});await pending;
  assert.ok(h.contexts[0].sources.every(value=>value.stopped));assert.equal(h.contexts[0].state,'closed');assert.equal(h.requests[0].options.signal.aborted,true);
  assert.equal(ends,1);late();assert.equal(ends,1);assert.deepEqual(h.errors,['A voz está temporariamente indisponível.']);assert.equal(h.spoken.length,0);
});

test('stop aborts a pending body, closes scheduled audio and ignores late completion callbacks',async()=>{
  const h=await harness(),s=stream();let starts=0,ends=0;
  const pending=h.speakText('Uma resposta válida.',()=>starts++,()=>ends++);h.requests[0].resolve(s.response);s.send(start);s.send(audio);await flush();
  const late=h.contexts[0].sources[0].onended;h.stopSpeaking();await pending;late();
  assert.equal(h.requests[0].options.signal.aborted,true);assert.equal(s.cancelled(),1);assert.equal(h.contexts[0].sources[0].stopped,true);assert.equal(starts,1);assert.equal(ends,1);assert.equal(h.errors.length,0);
});

test('changing the answer before a request resolves prevents the old response from creating playback',async()=>{
  const h=await harness();let oldEnds=0,newEnds=0;
  const old=h.speakText('Resposta antiga.',undefined,()=>oldEnds++),oldRequest=h.requests[0];
  const fresh=h.speakText('Resposta atual.',undefined,()=>newEnds++),s=stream();
  oldRequest.resolve(new Response(JSON.stringify({audio:Buffer.from('old').toString('base64'),mimeType:'audio/wav'}),{headers:{'Content-Type':'application/json'}}));await old;
  assert.equal(oldRequest.options.signal.aborted,true);assert.equal(h.htmlAudio.length,0);assert.equal(oldEnds,1);assert.equal(h.contexts[0].state,'closed');
  h.requests[1].resolve(s.response);s.send(start);s.send(audio);s.send({type:'done'});await fresh;
  assert.equal(h.contexts[1].sources.length,1);h.contexts[1].sources[0].end();assert.equal(newEnds,1);assert.equal(h.errors.length,0);
});

test('cancelling while AudioContext resume is pending cannot schedule old PCM after a new answer starts',async()=>{
  const resume=deferred(),h=await harness({resume}),s=stream();let ended=0;
  const pending=h.speakText('Resposta antiga.',undefined,()=>ended++);h.requests[0].resolve(s.response);s.send(start);s.send(audio);await flush();
  h.stopSpeaking();await pending;resume.resolve();await flush();assert.equal(h.contexts[0].sources.length,0);assert.equal(ended,1);assert.equal(h.errors.length,0);
});

test('an older JSON audio response remains compatible and honors its MIME type without another request',async()=>{
  const h=await harness();let started=0,ended=0;const pending=h.speakText('Resposta completa.',()=>started++,()=>ended++);
  h.requests[0].resolve(new Response(JSON.stringify({audio:Buffer.from('mock-wav').toString('base64'),mimeType:'audio/wav'}),{headers:{'Content-Type':'application/json'}}));await pending;
  assert.equal(h.contexts[0].state,'closed');assert.equal(h.requests.length,1);assert.equal(h.blobs[0].type,'audio/wav');assert.equal(started,1);assert.equal(ended,0);
  const late=h.htmlAudio[0].onended;h.htmlAudio[0].onended();late();assert.equal(ended,1);assert.equal(h.revoked.length,1);assert.equal(h.spoken.length,0);
});

test('a browser without Web Audio asks for the same server voice as JSON instead of using speechSynthesis',async()=>{
  const h=await harness({webAudio:false});const pending=h.speakText('Resposta completa.');assert.equal(h.requests[0].options.headers.Accept,'application/json');
  h.requests[0].resolve(new Response(JSON.stringify({audio:Buffer.from('mock-wav').toString('base64'),mimeType:'audio/wav'}),{headers:{'Content-Type':'application/json'}}));await pending;
  assert.equal(h.htmlAudio.length,1);assert.equal(h.spoken.length,0);h.stopSpeaking();
});

for(const status of [403,429,503])test(`HTTP ${status} cannot fall back to the device or leave a replay context open`,async()=>{
  const h=await harness();let ended=0;const pending=h.speakText('Resposta completa.',undefined,()=>ended++);
  h.requests[0].resolve(new Response(JSON.stringify({error:'Voz indisponível; continue por texto.'}),{status,headers:{'Content-Type':'application/json'}}));await pending;
  assert.equal(ended,1);assert.equal(h.contexts[0].state,'closed');assert.equal(h.spoken.length,0);assert.equal(h.htmlAudio.length,0);assert.equal(h.errors.length,1);
});

for(const invalid of [
  [{type:'audio',pcmBase64:pcm}],
  [{...start,sampleRate:16000}],
  [start,start],
  [start,{type:'audio',pcmBase64:'YQ=='}],
  [start,{type:'audio',pcmBase64:'###'}],
  [start,{type:'audio',pcmBase64:Buffer.alloc(24002).toString('base64')}],
  [start,{type:'done'}],
])test(`invalid streaming protocol ${JSON.stringify(invalid).slice(0,100)} fails closed`,async()=>{
  const h=await harness(),s=stream();let ended=0;const pending=h.speakText('Resposta completa.',undefined,()=>ended++);
  h.requests[0].resolve(s.response);for(const event of invalid)s.send(event);await pending;
  assert.equal(ended,1);assert.equal(h.errors.length,1);assert.equal(h.contexts[0].state,'closed');assert.equal(h.spoken.length,0);
});

test('stream replay enforces the complete audio size limit across individual valid packets',async()=>{
  const h=await harness(),s=stream();const pending=h.speakText('Resposta completa.');h.requests[0].resolve(s.response);s.send(start);
  const packet={type:'audio',pcmBase64:Buffer.alloc(24000).toString('base64')};for(let index=0;index<101;index++)s.send(packet);
  await pending;assert.match(h.errors[0],/limite/);assert.equal(h.contexts[0].sources.length,100);assert.ok(h.contexts[0].sources.every(value=>value.stopped));assert.equal(h.spoken.length,0);
});

test('malformed or oversized NDJSON fails without exposing payload contents in the UI',async()=>{
  for(const text of ['{"private broken payload"\n','x'.repeat(40001)]){
    const h=await harness(),s=stream();const pending=h.speakText('Resposta completa.');h.requests[0].resolve(s.response);s.raw(text);await pending;
    assert.equal(h.errors.length,1);assert.doesNotMatch(h.errors[0],/private|xxx/);assert.equal(h.contexts[0].sources.length,0);assert.equal(h.spoken.length,0);
  }
});

test('JSON playback failure reports once and cannot change to local speech',async()=>{
  const h=await harness({htmlPlayError:true});let ended=0;const pending=h.speakText('Resposta completa.',undefined,()=>ended++);
  h.requests[0].resolve(new Response(JSON.stringify({audio:Buffer.from('mock-wav').toString('base64'),mimeType:'audio/wav'}),{headers:{'Content-Type':'application/json'}}));await pending;
  assert.equal(ended,1);assert.equal(h.errors.length,1);assert.equal(h.spoken.length,0);assert.equal(h.revoked.length,1);
});

test('a stalled stream after its first audio has a bounded failure and clears the speaking indicator',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness(),s=stream();let ended=0;const pending=h.speakText('Resposta completa.',undefined,()=>ended++);
  h.requests[0].resolve(s.response);s.send(start);s.send(audio);await flush();h.contexts[0].sources[0].end();assert.equal(ended,0);
  t.mock.timers.tick(30000);await pending;
  assert.equal(ended,1);assert.equal(h.errors.length,1);assert.match(h.errors[0],/demorou/);assert.equal(s.cancelled(),1);assert.equal(h.contexts[0].state,'closed');assert.equal(h.requests[0].options.signal.aborted,true);
});

test('a stalled request before headers has an absolute deadline and ignores its eventual body',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness();let ended=0;const pending=h.speakText('Resposta completa.',undefined,()=>ended++);await flush();
  t.mock.timers.tick(75000);assert.equal(ended,1);assert.equal(h.errors.length,1);assert.equal(h.requests[0].options.signal.aborted,true);assert.equal(h.contexts[0].state,'closed');
  h.requests[0].resolve(new Response(JSON.stringify({audio:Buffer.from('late').toString('base64')}),{headers:{'Content-Type':'application/json'}}));await pending;
  assert.equal(h.htmlAudio.length,0);assert.equal(h.contexts[0].sources.length,0);assert.equal(h.errors.length,1);
});

test('receiving done clears network deadlines while scheduled audio is still playing',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness(),s=stream();let ended=0;const pending=h.speakText('Resposta completa.',undefined,()=>ended++);
  h.requests[0].resolve(s.response);s.send(start);s.send(audio);s.send({type:'done'});await pending;
  t.mock.timers.tick(75000);assert.equal(ended,0);assert.equal(h.errors.length,0);assert.equal(h.contexts[0].sources[0].stopped,false);
  h.contexts[0].sources[0].end();assert.equal(ended,1);
});
