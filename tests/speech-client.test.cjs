const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');

// Browser speech and recording are simulated: no microphone, provider or network.
const source=readFileSync('src/utils/speech.ts','utf8').replace("import { apiFetch, getAiStatus } from '../lib/api';",'const apiFetch=async()=>{throw Error("Network forbidden in isolated test");};const getAiStatus=async()=>null;');
const bundle=transform(source,{loader:'ts',format:'cjs',define:{'import.meta.env.MODE':'"test"'}});
async function harness({voices=[{lang:'pt-BR',name:'Voz local',localService:true}],recordingSupported=true}={}){
  const spoken=[],recorders=[],recognitions=[],listeners=new Set(),events=[];
  class Utterance{constructor(text){this.text=text;}}
  const speechSynthesis={cancel(){},speak(utterance){spoken.push(utterance);},getVoices:()=>voices,addEventListener(_event,listener){listeners.add(listener);},removeEventListener(_event,listener){listeners.delete(listener);}};
  class Recorder{
    static isTypeSupported(type){return type==='audio/mp4';}
    constructor(_stream,options){this.state='inactive';this.mimeType=options?.mimeType||'audio/webm;codecs=opus';recorders.push(this);}
    start(){this.state='recording';}
    stop(){this.state='inactive';}
    data(text){this.ondataavailable?.({data:new Blob([text])});}
    end(){this.onstop?.();}
  }
  class Recognition{constructor(){recognitions.push(this);this.started=0;}start(){this.started++;}stop(){this.stopped=true;}}
  const window={speechSynthesis,SpeechSynthesisUtterance:Utterance,SpeechRecognition:Recognition,dispatchEvent:event=>events.push(event)};
  const module={exports:{}};
  new Function('window','SpeechSynthesisUtterance','MediaRecorder','CustomEvent','module','exports',(await bundle).code)(window,Utterance,recordingSupported?Recorder:undefined,class{constructor(type,init){this.type=type;this.detail=init.detail;}},module,module.exports);
  return {...module.exports,spoken,recorders,recognitions,listeners,events,setVoices(next){voices=next;for(const listener of [...listeners])listener();}};
}

test('local Portuguese capability requires an actual local pt-BR or pt voice, never a name or remote voice',async()=>{
  const h=await harness();
  assert.equal(h.hasLocalPortugueseVoice(),true);
  for(const voices of [[],[{lang:'pt-BR',name:'Voz remota',localService:false}],[{lang:'en-US',name:'Brazilian local',localService:true}],[{lang:'pt-PT',name:'Voz local de Portugal',localService:true}]])assert.equal(h.hasLocalPortugueseVoice(voices),false);
  assert.equal(h.hasLocalPortugueseVoice([{lang:'pt',name:'Português local',localService:true}]),true);
  assert.equal(h.hasLocalPortugueseVoice([{lang:'pt_br',name:'Português local',localService:true}]),true);
});

test('local-only reading selects local Brazilian Portuguese even when a remote voice is the default',async()=>{
  const remote={lang:'pt-BR',name:'Premium remota',localService:false,default:true},local={lang:'pt-BR',name:'Voz local',localService:true},h=await harness({voices:[remote,{lang:'pt',name:'Português local',localService:true},local]});
  let started=0,ended=0;h.speakDeviceText('Confira as pilhas.',{onStart:()=>started++,onEnd:()=>ended++},{localOnly:true});
  assert.equal(h.spoken.length,1);assert.equal(h.spoken[0].voice,local);h.spoken[0].onstart();h.spoken[0].onend();assert.equal(started,1);assert.equal(ended,1);assert.equal(h.events.length,0);
});

test('local-only reading waits for late local voices without using an initially available remote voice',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const remote={lang:'pt-BR',name:'Remota',localService:false},local={lang:'pt-BR',name:'Local',localService:true},h=await harness({voices:[remote]});
  let ended=0,errors=0;h.speakDeviceText('Confira as pilhas.',{onEnd:()=>ended++,onError:()=>errors++},{localOnly:true});
  assert.equal(h.spoken.length,0);assert.equal(h.listeners.size,1);t.mock.timers.tick(200);h.setVoices([remote,local]);assert.equal(h.spoken.length,1);assert.equal(h.spoken[0].voice,local);
  t.mock.timers.tick(100);h.spoken[0].onstart();h.spoken[0].onend();assert.equal(errors,0);assert.equal(ended,1);assert.equal(h.listeners.size,0);
});

test('missing local voice reports bounded unavailability instead of speaking remotely or using a browser default',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const voices of [[],[{lang:'pt-BR',name:'Remota',localService:false}],[{lang:'en-US',name:'Local',localService:true}]]){
    const h=await harness({voices});let error='',errors=0;h.speakDeviceText('Confira as pilhas.',{onError:message=>{error=message;errors++;}},{localOnly:true});
    t.mock.timers.tick(300);assert.equal(h.spoken.length,0);assert.equal(errors,1);assert.match(error,/voz local em português/);assert.equal(h.listeners.size,0);
    h.setVoices([{lang:'pt-BR',name:'Local posterior',localService:true}]);t.mock.timers.tick(10000);assert.equal(h.spoken.length,0);assert.equal(errors,1);
  }
});

test('cancellation before local voices arrive releases listeners and prevents late playback',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness({voices:[]});let cancelled=0,errors=0;
  const handle=h.speakDeviceText('Confira as pilhas.',{onCancel:()=>cancelled++,onError:()=>errors++},{localOnly:true});const lateChanged=[...h.listeners][0];
  handle.cancel();handle.cancel();h.setVoices([{lang:'pt-BR',name:'Local',localService:true}]);lateChanged();t.mock.timers.tick(10000);
  assert.equal(cancelled,1);assert.equal(errors,0);assert.equal(h.spoken.length,0);assert.equal(h.listeners.size,0);
});

test('stopping local speech for mute ignores queued browser events and cannot resume a later sentence',async()=>{
  const h=await harness();let started=0,ended=0,cancelled=0;
  h.speakDeviceText('Confira as pilhas. Guarde a lanterna.',{onStart:()=>started++,onEnd:()=>ended++,onCancel:()=>cancelled++},{localOnly:true});
  const lateStart=h.spoken[0].onstart,lateEnd=h.spoken[0].onend;h.stopSpeaking();lateStart();lateEnd();
  assert.equal(started,0);assert.equal(ended,0);assert.equal(cancelled,1);assert.equal(h.spoken.length,1);
});

test('voice capability observer reports initial and late availability and stops after cleanup',async()=>{
  const h=await harness({voices:[]}),states=[];const stop=h.observeLocalPortugueseVoices(value=>states.push(value));
  assert.deepEqual(states,[false]);h.setVoices([{lang:'pt-BR',name:'Remota',localService:false}]);h.setVoices([{lang:'pt-BR',name:'Local',localService:true}]);
  assert.deepEqual(states,[false,false,true]);const late=[...h.listeners][0];stop();stop();late();h.setVoices([]);assert.deepEqual(states,[false,false,true]);assert.equal(h.listeners.size,0);
});

test('local-only speakText bypasses status and server TTS instead of fetching before speaking',async()=>{
  const h=await harness();let started=0,ended=0;
  await h.speakText('Confira as pilhas.',()=>started++,()=>ended++,false,{localOnly:true});assert.equal(h.spoken.length,1);assert.equal(h.spoken[0].voice.localService,true);
  h.spoken[0].onstart();h.spoken[0].onend();assert.equal(started,1);assert.equal(ended,1);assert.equal(h.events.length,0);
});

test('a caller cannot mutate a pending local-only request into permission for a remote voice',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness({voices:[{lang:'pt-BR',name:'Remota',localService:false}]}),options={localOnly:true};let errors=0;
  h.speakDeviceText('Confira as pilhas.',{onError:()=>errors++},options);options.localOnly=false;t.mock.timers.tick(300);
  assert.equal(h.spoken.length,0);assert.equal(errors,1);
});

test('general disclosed device reading retains its existing remote fallback when local-only was not requested',async()=>{
  const voice={lang:'pt-BR',name:'Remota divulgada',localService:false},h=await harness({voices:[voice]});
  h.speakDeviceText('Confira as pilhas.');assert.equal(h.spoken[0].voice,voice);h.spoken[0].onstart();h.spoken[0].onend();
});

test('device speech reads successive sentences even when the browser voice list stays empty',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness({voices:[]});let started=0,ended=0;
  h.speakDeviceText('Guarde a lanterna. Confira as pilhas.',{onStart:()=>started++,onEnd:()=>ended++});
  t.mock.timers.tick(300);assert.equal(h.spoken[0].text,'Guarde a lanterna.');
  h.spoken[0].onstart();h.spoken[0].onend();t.mock.timers.tick(300);
  assert.equal(h.spoken[1].text,'Confira as pilhas.');h.spoken[1].onstart();h.spoken[1].onend();
  assert.equal(started,1);assert.equal(ended,1);assert.equal(h.listeners.size,0);
});

test('legacy device-only reading uses the bounded lifecycle and reports a stalled browser',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness();let started=0,ended=0;
  await h.speakText('Confira as pilhas.',()=>started++,()=>ended++,true);
  t.mock.timers.tick(10000);
  assert.equal(started,0);assert.equal(ended,1);assert.equal(h.events.length,1);
  assert.equal(h.events[0].type,'vigia-error');
});

test('stopping legacy reading reports its real end exactly once so the speaking indicator clears',async()=>{
  const h=await harness();let started=0,ended=0;
  await h.speakText('Confira as pilhas.',()=>started++,()=>ended++,true);
  h.spoken[0].onstart();const lateEnd=h.spoken[0].onend;
  h.stopSpeaking();h.stopSpeaking();lateEnd();
  assert.equal(started,1);assert.equal(ended,1);
});

test('cancelling a device reading ignores late browser events and reports cancellation once',async()=>{
  const h=await harness();let cancelled=0,ended=0;
  const handle=h.speakDeviceText('Confira as pilhas.',{onEnd:()=>ended++,onCancel:()=>cancelled++});
  const lateEnd=h.spoken[0].onend;handle.cancel();handle.cancel();lateEnd();
  assert.equal(cancelled,1);assert.equal(ended,0);
});

test('long device speech chunks preserve the entire answer while staying below 220 characters',async()=>{
  const h=await harness(),text=('Guarde a lanterna e confira as pilhas ').repeat(20).trim()+'.';
  let ended=0;h.speakDeviceText(text,{onEnd:()=>ended++});
  for(let index=0;index<h.spoken.length;index++){h.spoken[index].onstart();h.spoken[index].onend();}
  assert.ok(h.spoken.length>1);assert.ok(h.spoken.every(utterance=>utterance.text.length<=220));
  assert.equal(h.spoken.map(utterance=>utterance.text).join(' '),text);assert.equal(ended,1);
});

test('recording restart ignores stale data and uses the browser selected MIME type',async()=>{
  const h=await harness(),recorder=new h.AudioRecorder();recorder.start({});
  const stale=h.recorders[0].ondataavailable;recorder.start({});stale({data:new Blob(['OLD'])});
  h.recorders[1].data('NEW');const result=recorder.stopAndGetBlob();h.recorders[1].end();
  const blob=await result;assert.equal(await blob.text(),'NEW');assert.equal(blob.type,'audio/mp4');
});

test('concurrent recording stops share the final blob including the last data event',async()=>{
  const h=await harness(),recorder=new h.AudioRecorder();recorder.start({});
  h.recorders[0].data('FIRST');const first=recorder.stopAndGetBlob(),second=recorder.stopAndGetBlob();
  assert.equal(first,second);h.recorders[0].data('LAST');h.recorders[0].end();
  assert.equal(await (await first).text(),'FIRSTLAST');assert.equal(await recorder.stopAndGetBlob(),null);
});

test('discarding or restarting a pending recording resolves its promise without corrupting the new capture',async()=>{
  const h=await harness(),recorder=new h.AudioRecorder();recorder.start({});
  const pending=recorder.stopAndGetBlob(),lateEnd=h.recorders[0].onstop;
  recorder.start({});assert.equal(await pending,null);lateEnd();
  h.recorders[1].data('NEW');const next=recorder.stopAndGetBlob();h.recorders[1].end();
  assert.equal(await (await next).text(),'NEW');
});

test('missing recorder stop event has a bounded completion',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=await harness(),recorder=new h.AudioRecorder();recorder.start({});
  const result=recorder.stopAndGetBlob();t.mock.timers.tick(5000);assert.equal(await result,null);
});

test('unsupported recording throws a clear error for the caller to release its microphone',async()=>{
  const h=await harness({recordingSupported:false});
  assert.throws(()=>new h.AudioRecorder().start({}),/não suportada/);
});

async function vadHarness({supported=true,resumeError=false}={}){
  let now=0,volume=128,closed=0,nextId=0;
  const frames=new Map();
  class Context{
    createAnalyser(){return {frequencyBinCount:256,getByteFrequencyData:array=>array.fill(volume)};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    resume(){return resumeError?Promise.reject(new Error('audio_suspended')):Promise.resolve();}
    close(){closed++;return Promise.resolve();}
  }
  const window={AudioContext:supported?Context:undefined},module={exports:{}};
  new Function('window','performance','requestAnimationFrame','cancelAnimationFrame','module','exports',(await bundle).code)(window,{now:()=>now},callback=>{const id=++nextId;frames.set(id,callback);return id;},id=>frames.delete(id),module,module.exports);
  return {detector:new module.exports.VoiceActivityDetector({minVoiceDurationMs:350,silenceDurationMs:900}),frames,closed:()=>closed,frame(time,nextVolume=128){now=time;volume=nextVolume;const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();}};
}

test('voice detection honors a start timestamp of zero and stop inside a callback cannot recreate its animation loop',async()=>{
  const h=await vadHarness();let started=0;
  h.detector.onVoiceStart=()=>{started++;h.detector.stop();};h.detector.start({});
  h.frame(350);assert.equal(started,1);assert.equal(h.frames.size,0);assert.equal(h.closed(),1);
});

test('VAD reports synchronous capability failure and asynchronous audio resume failure',async()=>{
  const missing=await vadHarness({supported:false});assert.throws(()=>missing.detector.start({}),/não consegue/);
  const suspended=await vadHarness({resumeError:true});let errors=0;
  suspended.detector.onError=error=>{assert.match(error.message,/audio_suspended/);errors++;};
  suspended.detector.start({});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(errors,1);assert.equal(suspended.frames.size,0);assert.equal(suspended.closed(),1);
});

test('a stopped recognizer cannot deliver late results or end events to a new capture',async()=>{
  const h=await harness(),recognizer=new h.SpeechRecognizer();let results=0,ends=0;
  recognizer.start({onResult:()=>results++,onEnd:()=>ends++});
  const old=recognizer.recognition,lateResult=old.onresult,lateEnd=old.onend;
  recognizer.stop();recognizer.start({onResult:()=>results++,onEnd:()=>ends++});
  assert.notEqual(recognizer.recognition,old);lateEnd();lateResult({results:[{isFinal:true,0:{transcript:'Texto antigo'}}]});
  assert.equal(recognizer.isStarted,true);assert.equal(ends,0);assert.equal(results,0);
  recognizer.recognition.onresult({results:[{isFinal:true,0:{transcript:'Texto atual'}}]});assert.equal(results,1);recognizer.stop();
});

test('duplicate recognizer start does not restart or replace an active native capture',async()=>{
  const h=await harness(),recognizer=new h.SpeechRecognizer();recognizer.start();const native=recognizer.recognition;
  recognizer.start();assert.equal(recognizer.recognition,native);assert.equal(native.started,1);recognizer.stop();
});
