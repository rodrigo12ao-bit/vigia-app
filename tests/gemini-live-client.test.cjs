const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');

// The browser audio graph and transport are simulated. No browser, network or AI.
const voiceOriginSource=readFileSync('src/lib/voiceOrigin.ts','utf8').replace(/^export /gm,'');
const isolatedSource=readFileSync('src/utils/geminiLive.ts','utf8').replace("import { apiFetch } from '../lib/api';",'const apiFetch=(...args)=>ticketRequest(...args);').replace("import {buildVoiceSocketUrl} from '../lib/voiceOrigin';",voiceOriginSource);
const bundle=transform(isolatedSource,{loader:'ts',format:'cjs',define:{'import.meta.env.DEV':'false','import.meta.env.VITE_VOICE_ORIGIN':'undefined'}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const pcm=Buffer.alloc(4800).toString('base64');

async function harness({started=true,capturePromise,ticketRequest=async()=>({ok:true,json:async()=>({ticket:'isolated-test-ticket'})})}={}){
  const contexts=[],sockets=[],events={states:[],stages:[],replies:[],turns:0,capture:[],speechErrors:[],errors:[],closed:0,captureRequests:0};
  class Context{
    constructor(){this.currentTime=10;this.state='running';this.destination={};this.sources=[];contexts.push(this);}
    createGain(){return {gain:{value:1,setValueAtTime(){}},connect(){},disconnect(){}};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createScriptProcessor(){return {connect(){},disconnect(){}};}
    createBuffer(channels,length,rate){if(this.failBuffer)throw Error('simulated_buffer_error');return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){const source={buffer:null,onended:null,stopped:false,connect(){},disconnect(){},start(at){this.startAt=at;},stop(){this.stopped=true;}};this.sources.push(source);return source;}
    resume(){if(this.resumeError)return Promise.reject(Error('simulated_resume_error'));if(this.pendingResume)return this.pendingResume;this.state='running';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
  }
  class Socket{
    static OPEN=1;
    constructor(){this.readyState=1;this.bufferedAmount=0;this.sent=[];sockets.push(this);}
    send(data){this.sent.push(JSON.parse(data));}
    close(){this.readyState=3;this.onclose?.();}
    emit(payload){this.onmessage?.({data:JSON.stringify(payload)});}
  }
  const track={enabled:true,readyState:'live',stop(){this.readyState='ended';this.enabled=false;}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  const window={location:{protocol:'http:',host:'localhost:isolated'},AudioContext:Context};
  const navigator={mediaDevices:{getUserMedia:()=>{events.captureRequests++;return capturePromise||Promise.resolve(stream);}}};
  const module={exports:{}};
  const result=await bundle;
  new Function('window','WebSocket','navigator','ticketRequest','module','exports',result.code)(window,Socket,navigator,ticketRequest,module,module.exports);
  const session=new module.exports.GeminiLiveSession({onStateChange:state=>events.states.push(state),onMicrophoneActivityChange:active=>events.capture.push(active),
    onProcessingStageChange:stage=>events.stages.push(stage),onOutputTranscription:text=>events.replies.push(text),onTurnComplete:()=>events.turns++,
    onSpeechUnavailable:message=>events.speechErrors.push(message),onError:message=>events.errors.push(message),onClose:()=>events.closed++});
  let context,socket;
  if(started){
    context=new Context();socket=new Socket();
    Object.assign(session,{outputAudioCtx:context,ws:socket,mediaStream:stream,streamedSpeech:true,nativeAudio:true,cleanupDone:false,lastCaptureActive:true});
  }
  const emit=payload=>session.handleServerPayload(payload);
  return {session,context,socket,contexts,sockets,track,stream,events,emit,telemetry:window.VigiaTelemetry};
}

test('cloud pauses capture throughout generation and queued playback, then resumes the same stream',async()=>{
  const h=await harness();
  try{
    h.emit({type:'processing'});assert.equal(h.track.enabled,false);
    h.session.processInputPCM(new Float32Array(1024).fill(0.5));
    assert.equal(h.socket.sent.filter(message=>message.type==='realtime_audio').length,0);
    h.emit({type:'audio_chunk',pcmBase64:pcm});
    h.emit({type:'turn_complete'});
    assert.equal(h.track.enabled,false,'An asynchronous decode must not release capture before scheduling.');
    await flush();assert.equal(h.context.sources.length,1);assert.equal(h.track.enabled,false);
    assert.ok(Math.abs(h.context.sources[0].startAt-10.08)<0.000001,'The first PCM receives an 80 ms scheduling margin.');
    h.context.currentTime=10.18;h.context.sources[0].onended();
    assert.equal(h.track.enabled,true);assert.equal(h.events.states.at(-1),'listening');
    h.session.processInputPCM(new Float32Array(1024).fill(0.5));
    assert.equal(h.socket.sent.filter(message=>message.type==='realtime_audio').length,1);
  }finally{h.session.stop();await flush();}
});

test('remote close returns to idle and the same session can reconnect',async()=>{
  const h=await harness({started:false});
  await h.session.start();h.sockets[0].close();await flush();
  assert.equal(h.events.states.at(-1),'idle');
  await h.session.start();assert.equal(h.sockets.length,2);
  assert.equal(h.contexts[0].state,'closed');assert.equal(h.contexts[1].state,'running');
  h.session.stop();await flush();
});

test('duplicate open and a pause during permission waiting keep one paused capture',async()=>{
  let grantCapture;const capturePromise=new Promise(resolve=>grantCapture=resolve);
  const h=await harness({started:false,capturePromise});
  await h.session.start();const socket=h.sockets[0];
  socket.emit({type:'open',mode:'streamed-speech'});socket.emit({type:'open',mode:'streamed-speech'});
  h.session.pauseMicrophone(true);assert.equal(h.events.captureRequests,1);
  grantCapture(h.stream);await flush();
  assert.equal(h.track.enabled,false);assert.equal(h.events.states.at(-1),'idle');
  assert.equal(h.contexts.length,2);
  h.session.stop();await flush();
});

test('missing backend open times out and releases the socket and output context',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness({started:false});await h.session.start();
  t.mock.timers.tick(20000);await flush();
  assert.equal(h.events.errors.length,1);assert.equal(h.events.closed,1);
  assert.equal(h.sockets[0].readyState,3);assert.equal(h.contexts[0].state,'closed');
});

test('a previous session audio resume cannot be reused or clear the new resume promise',async()=>{
  const h=await harness();let oldResolve;
  h.context.state='suspended';h.context.pendingResume=new Promise(resolve=>oldResolve=resolve);
  const old=h.session.resumeOutputContext().catch(()=>undefined);
  h.session.stop();await flush();assert.equal(h.session.outputResumePromise,null);
  await h.session.start();const nextContext=h.contexts.at(-1);let newResolve;
  nextContext.state='suspended';nextContext.pendingResume=new Promise(resolve=>newResolve=resolve);
  const next=h.session.resumeOutputContext();
  oldResolve();await old;assert.equal(h.session.outputResumePromise,next);
  nextContext.state='running';newResolve();await next;
  assert.equal(h.session.outputResumePromise,null);h.session.stop();await flush();
});

for(const rate of [44100,48000])test(`resampling ${rate} Hz worklet frames preserves duration and sample continuity`,async()=>{
  const h=await harness();
  try{
    const frameSize=128,total=rate*2,input=Float32Array.from({length:total},(_,index)=>Math.sin(index/150));
    const samples=[];
    for(let offset=0;offset<input.length;offset+=frameSize)samples.push(...h.session.resampleLinear(input.subarray(offset,offset+frameSize),rate,16000));
    assert.ok(Math.abs(samples.length-32000)<=1,`${samples.length} samples must represent two seconds.`);
    for(let index=0;index<samples.length;index++)assert.ok(Math.abs(samples[index]-Math.sin(index*rate/16000/150))<0.00002,'Interpolation must keep the phase across frame boundaries.');
  }finally{h.session.stop();await flush();}
});

test('manual pause during cloud playback remains paused after the real playback end',async()=>{
  const h=await harness();
  try{
    h.emit({type:'processing'});h.emit({type:'audio_chunk',pcmBase64:pcm});await flush();
    h.session.pauseMicrophone(true);h.emit({type:'turn_complete'});h.context.sources[0].onended();
    assert.equal(h.track.enabled,false);assert.equal(h.events.states.at(-1),'idle');
    h.session.pauseMicrophone(false);assert.equal(h.track.enabled,true);
    assert.ok(h.socket.sent.some(message=>message.type==='resume_input'));
  }finally{h.session.stop();await flush();}
});

test('legacy preference callers can only request cloud and cannot enable device speech',async()=>{
  const h=await harness();
  try{
    assert.equal(h.session.setSpeechOutput('device'),true);assert.deepEqual(h.socket.sent.at(-1),{type:'speech_output',mode:'cloud'});
    h.emit({type:'speech_output',mode:'device'});assert.deepEqual(h.socket.sent.at(-1),{type:'speech_output',mode:'cloud'});
    h.emit({type:'processing'});assert.equal(h.track.enabled,false);
    h.emit({type:'audio_chunk',pcmBase64:pcm});await flush();assert.equal(h.context.sources.length,1);
  }finally{h.session.stop();await flush();}
});

test('an obsolete device response preserves the checked text and closes capture without local playback',async()=>{
  const h=await harness();
  h.emit({type:'output_transcription',text:'Resposta completa verificada.'});h.emit({type:'reply_ready'});
  h.emit({type:'speech_on_device',text:'Resposta completa verificada.'});await flush();
  assert.deepEqual(h.events.replies,['Resposta completa verificada.']);assert.equal(h.events.turns,1);
  assert.equal(h.events.speechErrors.length,1);assert.equal(h.events.closed,1);assert.equal(h.track.readyState,'ended');assert.equal(h.context.sources.length,0);
});

test('progress follows actual server phases and clears when playback starts or the turn is interrupted',async()=>{
  const h=await harness();
  try{
    for(const stage of ['transcribing','thinking','synthesizing'])h.emit({type:'processing',stage,turn:1});
    assert.deepEqual(h.events.stages,['transcribing','thinking','synthesizing']);
    h.emit({type:'audio_chunk',pcmBase64:pcm});await flush();assert.equal(h.events.stages.at(-1),null);
    h.session.interruptPlayback();const length=h.events.stages.length;
    h.emit({type:'processing',stage:'synthesizing',turn:1});assert.equal(h.events.stages.length,length);
    h.emit({type:'interrupted'});h.emit({type:'processing',stage:'unknown text supplied by server'});assert.equal(h.events.stages.at(-1),'thinking');
  }finally{h.session.stop();await flush();}
});

test('server timing diagnostics accept only schema fields without copying answer content',async()=>{
  const h=await harness();
  try{
    const timing={type:'voice_timing',turn:1,pipeline:'multimodal',stage:'first_audio',durationMs:1500,elapsedMs:4000};
    h.emit({...timing,text:'private transcript'});
    const measured=h.telemetry.logs.filter(entry=>entry.event==='SERVER_VOICE_STAGE');assert.equal(measured.length,1);
    assert.deepEqual(measured[0].meta,{turn:1,pipeline:'multimodal',stage:'first_audio',durationMs:1500,elapsedMs:4000});
    for(const patch of [{turn:0},{pipeline:'unknown'},{stage:'audible'},{durationMs:NaN},{elapsedMs:-1}])h.emit({...timing,...patch});
    h.session.interruptPlayback();h.emit(timing);assert.equal(h.telemetry.logs.filter(entry=>entry.event==='SERVER_VOICE_STAGE').length,1);
  }finally{h.session.stop();await flush();}
});

test('microphone permission is not requested before the mandatory live ticket is approved',async()=>{
  let reply;const h=await harness({started:false,ticketRequest:()=>new Promise(resolve=>reply=resolve)});
  const pending=h.session.start();await flush();assert.equal(h.events.captureRequests,0);assert.equal(h.sockets.length,0);
  reply({ok:false,json:async()=>({error:'Acesso adulto necessário.'})});await pending;await flush();
  assert.equal(h.events.captureRequests,0);assert.equal(h.sockets.length,0);assert.match(h.events.errors[0],/Acesso adulto/);assert.equal(h.contexts[0].state,'closed');
});

test('manual interruption discards old PCM and old turn events until the server acknowledgement',async()=>{
  const h=await harness();
  try{
    h.emit({type:'processing'});h.emit({type:'audio_chunk',pcmBase64:pcm});await flush();
    h.session.interruptPlayback();assert.equal(h.track.enabled,true);assert.equal(h.context.sources[0].stopped,true);
    h.emit({type:'processing'});h.emit({type:'audio_chunk',pcmBase64:pcm});h.emit({type:'turn_complete'});await flush();
    assert.equal(h.context.sources.length,1,'An old packet cannot restart cancelled speech.');assert.equal(h.track.enabled,true);
    h.emit({type:'interrupted'});
    h.emit({type:'processing'});h.emit({type:'audio_chunk',pcmBase64:pcm});await flush();
    assert.equal(h.context.sources.length,2);assert.equal(h.track.enabled,false);
  }finally{h.session.stop();await flush();}
});

test('successive PCM packets are scheduled contiguously without waiting for the complete sentence',async()=>{
  const h=await harness();
  try{
    h.emit({type:'processing'});h.emit({type:'audio_chunk',pcmBase64:pcm});await flush();
    assert.equal(h.context.sources.length,1,'The first packet is scheduled before turn_complete.');
    h.emit({type:'audio_chunk',pcmBase64:pcm});await flush();
    assert.equal(h.context.sources[1].startAt,h.context.sources[0].startAt+0.1);
  }finally{h.session.stop();await flush();}
});

test('mute updates an idle audio graph immediately and persists when the next PCM is scheduled',async()=>{
  const h=await harness();const events=[];
  const gain={value:1,cancelScheduledValues:time=>events.push(['cancel',time]),setValueAtTime:(value,time)=>events.push(['schedule',value,time])};
  h.session.outputGain={gain,connect(){},disconnect(){}};
  try{
    h.session.setMuted(true);assert.equal(gain.value,0);assert.equal(h.track.enabled,true,'Mute never starts or stops microphone capture.');
    h.emit({type:'processing'});h.emit({type:'audio_chunk',pcmBase64:pcm});await flush();assert.equal(gain.value,0);
    h.session.setMuted(false);assert.equal(gain.value,1);assert.equal(events.at(-1)[1],1);
    assert.equal(h.context.sources.length,1);
  }finally{h.session.stop();await flush();}
});

for(const failure of ['decode','createBuffer','resume'])test(`real ${failure} failure is recoverable and never resumes capture without the user`,async()=>{
  const h=await harness();
  try{
    if(failure==='createBuffer')h.context.failBuffer=true;
    if(failure==='resume'){h.context.state='suspended';h.context.resumeError=true;}
    h.emit({type:'processing'});h.emit({type:'audio_chunk',pcmBase64:failure==='decode'?'YQ==':pcm});await flush();
    assert.equal(h.events.speechErrors.length,1);assert.equal(h.track.enabled,false);assert.equal(h.context.sources.length,0);
    h.emit({type:'interrupted'});await flush();assert.equal(h.track.enabled,false);
    assert.notEqual(h.events.states.at(-1),'assistantSpeaking');
    h.session.pauseMicrophone(false);assert.equal(h.track.enabled,true);
  }finally{h.session.stop();await flush();}
});

test('socket close invalidates a PCM decode waiting for AudioContext resume',async()=>{
  const h=await harness({started:false});
  await h.session.start();
  const socket=h.sockets[0],context=h.contexts[0];
  Object.assign(h.session,{mediaStream:h.stream,streamedSpeech:true,nativeAudio:true,lastCaptureActive:true});
  let resolveResume;context.state='suspended';context.pendingResume=new Promise(resolve=>resolveResume=resolve);
  h.emit({type:'processing'});h.emit({type:'audio_chunk',pcmBase64:pcm});
  socket.close();resolveResume();await flush();
  assert.equal(context.sources.length,0);assert.equal(h.track.readyState,'ended');assert.equal(h.events.closed,1);
});

test('socket close invalidates a pending microphone permission result',async()=>{
  let grantCapture;
  const capturePromise=new Promise(resolve=>grantCapture=resolve);
  const h=await harness({started:false,capturePromise});
  await h.session.start();const socket=h.sockets[0];socket.emit({type:'open',mode:'streamed-speech'});
  socket.close();grantCapture(h.stream);await flush();
  assert.equal(h.track.readyState,'ended');assert.equal(h.contexts.length,1,'A late capture cannot open a new input context.');
  assert.equal(h.events.states.includes('listening'),false);
});

test('missing interruption acknowledgement has a bounded failure and releases all capture',async()=>{
  const h=await harness();
  h.session.interruptPlayback();
  await new Promise(resolve=>setTimeout(resolve,3050));await flush();
  assert.equal(h.events.errors.length,1);assert.equal(h.events.closed,1);assert.equal(h.track.readyState,'ended');
  assert.equal(h.socket.readyState,3);assert.equal(h.session.awaitingInterruptAck,false);
});
