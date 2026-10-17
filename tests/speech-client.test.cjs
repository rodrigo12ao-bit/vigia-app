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
  return {...module.exports,spoken,recorders,recognitions,listeners,events};
}

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
