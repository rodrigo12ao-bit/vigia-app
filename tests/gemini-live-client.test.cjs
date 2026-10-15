const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');

// The browser audio graph and transport are simulated. No browser, network or AI.
const voiceOriginSource=readFileSync('src/lib/voiceOrigin.ts','utf8').replace(/^export /gm,'');
const isolatedSource=readFileSync('src/utils/geminiLive.ts','utf8').replace("import { apiFetch } from '../lib/api';",'const apiFetch=async()=>({ok:true,json:async()=>({ticket:"isolated-test-ticket"})});').replace("import {buildVoiceSocketUrl} from '../lib/voiceOrigin';",voiceOriginSource);
const bundle=transform(isolatedSource,{loader:'ts',format:'cjs',define:{'import.meta.env.DEV':'false','import.meta.env.VITE_VOICE_ORIGIN':'undefined'}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const pcm=Buffer.alloc(4800).toString('base64');

async function harness({started=true,capturePromise}={}){
  const contexts=[],sockets=[],events={states:[],capture:[],speechErrors:[],errors:[],closed:0};
  class Context{
    constructor(){this.currentTime=10;this.state='running';this.destination={};this.sources=[];contexts.push(this);}
    createGain(){return {gain:{value:1,setValueAtTime(){}},connect(){},disconnect(){}};}
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
  const navigator={mediaDevices:{getUserMedia:()=>capturePromise||Promise.resolve(stream)}};
  const module={exports:{}};
  const result=await bundle;
  new Function('window','WebSocket','navigator','module','exports',result.code)(window,Socket,navigator,module,module.exports);
  const session=new module.exports.GeminiLiveSession({onStateChange:state=>events.states.push(state),onMicrophoneActivityChange:active=>events.capture.push(active),
    onSpeechUnavailable:message=>events.speechErrors.push(message),onError:message=>events.errors.push(message),onClose:()=>events.closed++});
  let context,socket;
  if(started){
    context=new Context();socket=new Socket();
    Object.assign(session,{outputAudioCtx:context,ws:socket,mediaStream:stream,streamedSpeech:true,nativeAudio:true,cleanupDone:false,lastCaptureActive:true});
  }
  const emit=payload=>session.handleServerPayload(payload);
  return {session,context,socket,contexts,sockets,track,stream,events,emit};
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
