import { apiFetch } from '../lib/api';
// Client-side speech utilities for Vigia
// - Plays /api/tts PCM as it arrives, with JSON audio support for older servers
// - Conversation reads use the same server voice as live conversation
// - Browser speech is available only for explicitly requested activity reading
// - Ensures previous audio or utterance is cancelled before starting a new one

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let activeUtterances: SpeechSynthesisUtterance[] = [];
let voiceGeneration = 0;
let cancelDeviceSpeech: (() => void) | null = null;
let cancelTextSpeech: (() => void) | null = null;

export interface DeviceSpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}

export interface DeviceSpeechHandle {
  cancel: () => void;
}

export interface DeviceSpeechOptions {
  localOnly?: boolean;
}

function localPortugueseVoice(voices:readonly SpeechSynthesisVoice[]):SpeechSynthesisVoice|undefined {
  const allowed=voices.filter(voice=>voice.localService===true&&/^(?:pt-BR|pt)$/i.test((voice.lang||'').replace(/_/g,'-').trim()));
  return allowed.find(voice=>/^pt-BR$/i.test(voice.lang.replace(/_/g,'-').trim()))||allowed[0];
}

// Capability detection never reads text aloud or sends data to any service.
export function hasLocalPortugueseVoice(voices?:readonly SpeechSynthesisVoice[]):boolean {
  try{
    if(voices===undefined){if(typeof window==='undefined'||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return false;voices=window.speechSynthesis.getVoices();}
    return !!localPortugueseVoice(voices);
  }catch{return false;}
}

export function observeLocalPortugueseVoices(listener:(available:boolean)=>void):()=>void {
  let disposed=false;
  const synthesis=typeof window==='undefined'?undefined:window.speechSynthesis;
  const changed=()=>{if(!disposed)listener(hasLocalPortugueseVoice());};
  changed();
  synthesis?.addEventListener?.('voiceschanged',changed);
  return()=>{if(disposed)return;disposed=true;synthesis?.removeEventListener?.('voiceschanged',changed);};
}

// Explicit device reading: complete text, real lifecycle, no provider requests.
export function speakDeviceText(text: string, callbacks: DeviceSpeechCallbacks = {},options:DeviceSpeechOptions={}): DeviceSpeechHandle {
  return startDeviceSpeech(text,callbacks,true,options);
}

function startDeviceSpeech(text:string,callbacks:DeviceSpeechCallbacks,cancelPrevious:boolean,options:DeviceSpeechOptions={}):DeviceSpeechHandle {
  if(cancelPrevious)stopSpeaking();
  const localOnly=options.localOnly===true;
  const generation=voiceGeneration;
  let finished=false,started=false,index=0;
  const utterances=new Set<SpeechSynthesisUtterance>();
  const timers=new Set<ReturnType<typeof globalThis.setTimeout>>();
  const cleanup=new Set<()=>void>();
  const chunks=text.trim().split(/(?<=[.!?])\s+/u).filter(Boolean).flatMap(sentence=>{
    const parts:string[]=[];
    let remaining=sentence;
    while(remaining.length>220){
      const boundary=remaining.lastIndexOf(' ',220);
      if(boundary<1)break;
      parts.push(remaining.slice(0,boundary));remaining=remaining.slice(boundary+1).trimStart();
    }
    if(remaining)parts.push(remaining);
    return parts;
  });
  const clear=()=>{
    for(const timer of timers)globalThis.clearTimeout(timer);
    timers.clear();for(const fn of cleanup)fn();cleanup.clear();
    for(const utterance of utterances){utterance.onstart=null;utterance.onend=null;utterance.onerror=null;}
    activeUtterances=activeUtterances.filter(utterance=>!utterances.has(utterance));
    utterances.clear();
    if(cancelDeviceSpeech===cancel)cancelDeviceSpeech=null;
  };
  const finish=(result:'end'|'error'|'cancel',message?:string)=>{
    if(finished)return;
    finished=true;clear();
    if(result!=='end'){try{window.speechSynthesis?.cancel();}catch{/* Browser already closed. */}}
    if(result==='end')callbacks.onEnd?.();
    else if(result==='cancel')callbacks.onCancel?.();
    else callbacks.onError?.(message||'A voz do aparelho não conseguiu ler a resposta. Você pode continuar por texto.');
  };
  const cancel=()=>finish('cancel');
  const handle={cancel:()=>{if(finished)return;if(cancelDeviceSpeech===cancel)stopSpeaking();else cancel();}};
  cancelDeviceSpeech=cancel;
  const fail=()=>finish('error');
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance||!chunks.length){fail();return handle;}
  const next=()=>{
    if(finished||generation!==voiceGeneration)return;
    if(index>=chunks.length){finish('end');return;}
    const utterance=new SpeechSynthesisUtterance(chunks[index]);
    utterances.add(utterance);activeUtterances.push(utterance);
    utterance.lang='pt-BR';utterance.rate=1.05;utterance.pitch=1.1;utterance.volume=1;
    let queued=false,startTimer:ReturnType<typeof globalThis.setTimeout>|undefined;
    const stopTimer=()=>{if(startTimer){globalThis.clearTimeout(startTimer);timers.delete(startTimer);startTimer=undefined;}};
    utterance.onstart=()=>{
      if(finished||generation!==voiceGeneration)return;
      stopTimer();
      // A stalled browser must not leave the microphone permanently blocked.
      const timer=globalThis.setTimeout(fail,90000);timers.add(timer);
      if(!started){started=true;callbacks.onStart?.();}
    };
    utterance.onend=()=>{
      if(finished||generation!==voiceGeneration)return;
      for(const timer of timers)globalThis.clearTimeout(timer);timers.clear();
      activeUtterances=activeUtterances.filter(active=>active!==utterance);
      utterances.delete(utterance);utterance.onstart=null;utterance.onend=null;utterance.onerror=null;
      index++;next();
    };
    utterance.onerror=()=>{if(!finished&&generation===voiceGeneration)fail();};
    const queue=(voices:SpeechSynthesisVoice[]):boolean=>{
      if(finished||generation!==voiceGeneration||queued)return true;
      const preferred=localOnly?localPortugueseVoice(voices):voices.find(voice=>voice.localService&&/pt[-_ ]?br|brazil/i.test(voice.lang||voice.name))
        ||voices.find(voice=>/pt[-_ ]?br|brazil/i.test(voice.lang||voice.name)&&/francisca|ant[oô]nio|francisco|neural|premium/i.test(voice.name))
        ||voices.find(voice=>/pt[-_ ]?br|brazil/i.test(voice.lang||voice.name))||voices[0];
      // A local-only request never delegates to a remote or default voice,
      // even when the browser's list starts empty or only has remote entries.
      if(localOnly&&!preferred)return false;
      queued=true;
      if(preferred)utterance.voice=preferred;
      startTimer=globalThis.setTimeout(fail,10000);timers.add(startTimer);
      try{window.speechSynthesis.speak(utterance);}catch{fail();}
      return true;
    };
    try{
      const voices=window.speechSynthesis.getVoices();
      if(voices.length&&queue(voices))return;
      const changed=()=>{try{queue(window.speechSynthesis.getVoices());}catch{fail();}};
      window.speechSynthesis.addEventListener('voiceschanged',changed);
      cleanup.add(()=>window.speechSynthesis.removeEventListener('voiceschanged',changed));
      const timer=globalThis.setTimeout(()=>{
        try{if(!queue(window.speechSynthesis.getVoices()))finish('error','Não há uma voz local em português disponível neste aparelho. Você pode continuar por texto.');}catch{fail();}
      },300);timers.add(timer);
    }catch{fail();}
  };
  next();return handle;
}

// The default path never changes voice when the network, provider or playback
// fails. Device reading is retained only as an explicit request by other areas.
class StreamedTextPlayback {
  private context:AudioContext;
  private reader:ReadableStreamDefaultReader<Uint8Array>|null=null;
  private sources=new Set<AudioBufferSourceNode>();
  private nextPlayTime=0;
  private chunks=0;
  private bytesReceived=0;
  private started=false;
  private done=false;
  private cancelled=false;
  private resumeTimer:ReturnType<typeof globalThis.setTimeout>|undefined;
  private releaseResume:()=>void=()=>{};
  private ready:Promise<Error|null>;

  constructor(AudioCtx:typeof AudioContext,private current:()=>boolean,private onStart:()=>void,private onEnd:()=>void){
    this.context=new AudioCtx({sampleRate:24000});
    // Called in the user's interaction, before waiting for authorization/TTS.
    // A failed resume is reported only if the server actually returns PCM.
    const cancelled=new Promise<void>(resolve=>{this.releaseResume=resolve;});
    let resume:Promise<void>;
    try{resume=this.context.state==='running'?Promise.resolve():this.context.resume();}catch(error){resume=Promise.reject(error);}
    this.ready=Promise.race([
      resume,cancelled,
      new Promise<never>((_,reject)=>{this.resumeTimer=globalThis.setTimeout(()=>reject(Error('O navegador não ativou o som. Tente ouvir novamente.')),3000);}),
    ]).then(()=>this.cancelled||this.context.state==='running'?null:Error('O navegador não ativou o som. Tente ouvir novamente.'),()=>Error('O navegador não ativou o som. Tente ouvir novamente.'))
      .finally(()=>{globalThis.clearTimeout(this.resumeTimer);this.resumeTimer=undefined;});
  }

  cancel():void{
    if(this.cancelled)return;
    this.cancelled=true;this.releaseResume();globalThis.clearTimeout(this.resumeTimer);
    const reader=this.reader;this.reader=null;
    if(reader)void reader.cancel().catch(()=>{});
    for(const source of this.sources){source.onended=null;try{source.stop();source.disconnect();}catch{/* Already ended. */}}
    this.sources.clear();
    if(this.context.state!=='closed')void this.context.close().catch(()=>{});
  }

  private finishWhenPlayed():void{
    if(this.cancelled||!this.current()||!this.done||this.sources.size)return;
    this.cancel();this.onEnd();
  }

  private async accept(value:unknown):Promise<void>{
    if(this.cancelled||!this.current())return;
    if(!value||typeof value!=='object')throw Error('O áudio recebido está incompleto. Tente ouvir novamente.');
    const message=value as Record<string,unknown>;
    if(message.type==='error')throw Error(typeof message.message==='string'&&message.message.trim()?message.message.slice(0,500):'A geração da voz foi interrompida. Tente ouvir novamente.');
    if(message.type==='start'){
      if(this.started||message.sampleRate!==24000||message.encoding!=='pcm_s16le')throw Error('O formato de áudio recebido não é compatível.');
      this.started=true;return;
    }
    if(!this.started)throw Error('O áudio chegou sem informação de reprodução.');
    if(message.type==='done'){
      if(!this.chunks)throw Error('A resposta chegou sem áudio. Você pode tentar ouvir novamente.');
      this.done=true;this.finishWhenPlayed();return;
    }
    if(message.type!=='audio'||typeof message.pcmBase64!=='string'||!message.pcmBase64.length||message.pcmBase64.length>32000)throw Error('O áudio recebido está incompleto. Tente ouvir novamente.');
    let binary:string;
    try{binary=atob(message.pcmBase64);}catch{throw Error('O áudio recebido está incompleto. Tente ouvir novamente.');}
    if(!binary.length||binary.length%2||binary.length>24000)throw Error('O áudio recebido está incompleto. Tente ouvir novamente.');
    if(this.bytesReceived+binary.length>2400000)throw Error('O áudio excedeu o limite de reprodução. A resposta continua por texto.');
    this.bytesReceived+=binary.length;
    const bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
    const samples=new Float32Array(bytes.length/2),view=new DataView(bytes.buffer);
    for(let index=0;index<samples.length;index++){
      const value=view.getInt16(index*2,true);samples[index]=value/(value<0?32768:32767);
    }
    const resumeError=await this.ready;
    if(this.cancelled||!this.current())return;
    if(resumeError)throw resumeError;
    const buffer=this.context.createBuffer(1,samples.length,24000);buffer.getChannelData(0).set(samples);
    const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);
    source.onended=()=>{source.disconnect();this.sources.delete(source);this.finishWhenPlayed();};
    const now=this.context.currentTime,startAt=this.chunks===0?now+0.08:Math.max(now+0.008,this.nextPlayTime);
    this.sources.add(source);source.start(startAt);this.nextPlayTime=startAt+buffer.duration;
    this.chunks++;if(this.chunks===1)this.onStart();
  }

  async consume(response:Response):Promise<void>{
    if(!response.body)throw Error('O áudio recebido está incompleto. Tente ouvir novamente.');
    const reader=response.body.getReader();this.reader=reader;
    const decoder=new TextDecoder('utf-8',{fatal:true});let pending='';
    const line=async(raw:string)=>{
      if(raw.length>40000)throw Error('O áudio recebido está incompleto. Tente ouvir novamente.');
      if(raw.trim()){
        let value:unknown;
        try{value=JSON.parse(raw);}catch{throw Error('O áudio recebido está incompleto. Tente ouvir novamente.');}
        await this.accept(value);
      }
    };
    try{
      while(!this.cancelled&&this.current()&&!this.done){
        let readTimer:ReturnType<typeof globalThis.setTimeout>|undefined;
        const result=await Promise.race([
          reader.read(),
          new Promise<never>((_,reject)=>{readTimer=globalThis.setTimeout(()=>reject(Error('A transmissão de áudio demorou demais. Tente ouvir novamente.')),30000);}),
        ]).finally(()=>globalThis.clearTimeout(readTimer));
        if(this.cancelled||!this.current())return;
        pending+=decoder.decode(result.value,{stream:!result.done});
        let boundary:number;
        while(!this.done&&(boundary=pending.indexOf('\n'))!==-1){
          const raw=pending.slice(0,boundary);pending=pending.slice(boundary+1);await line(raw);
          if(this.cancelled||!this.current())return;
        }
        if(pending.length>40000)throw Error('O áudio recebido está incompleto. Tente ouvir novamente.');
        if(result.done){if(!this.done&&pending.trim())await line(pending);break;}
      }
      if(!this.cancelled&&this.current()&&!this.done)throw Error('A transmissão de áudio foi interrompida. Tente ouvir novamente.');
    }finally{
      if(this.reader===reader)this.reader=null;
      void reader.cancel().catch(()=>{});
    }
  }
}

export async function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  deviceOnly = false,
  options:DeviceSpeechOptions={}
) {
  stopSpeaking();
  const generation=voiceGeneration;
  const request=new AbortController();
  let streamed:StreamedTextPlayback|null=null;
  let requestTimer:ReturnType<typeof globalThis.setTimeout>|undefined;
  let completed=false;
  const finish=(cancelled=false)=>{
    if(completed||(!cancelled&&generation!==voiceGeneration))return;
    completed=true;
    globalThis.clearTimeout(requestTimer);
    if(cancelTextSpeech===cancel)cancelTextSpeech=null;
    onEnd?.();
  };
  const cancel=()=>{request.abort();streamed?.cancel();finish(true);};
  const fail=(message:string)=>{
    if(completed||generation!==voiceGeneration)return;
    request.abort();streamed?.cancel();cleanupAudio();finish();
    window.dispatchEvent(new CustomEvent('vigia-error',{detail:message}));
  };
  cancelTextSpeech=cancel;
  if(!text.trim()){finish();return;}
  if(deviceOnly||options.localOnly){onErrorFallback(text,onStart,()=>finish(),generation,options);return;}
  // Includes connection/authorization time. The network timer ends when done
  // arrives; a complete 50-second audio buffer is still allowed to finish.
  requestTimer=globalThis.setTimeout(()=>fail('A voz demorou demais para chegar. Tente ouvir novamente ou continue por texto.'),75000);
  try{
    const AudioCtx=window.AudioContext||(window as any).webkitAudioContext;
    if(AudioCtx){
      try{streamed=new StreamedTextPlayback(AudioCtx,()=>!completed&&generation===voiceGeneration,()=>onStart?.(),()=>finish());}catch{/* JSON audio remains available when Web Audio cannot be created. */}
    }
    // /api/tts authorizes the current account/adult access and selects the same
    // voice as live audio. A separate status probe is not needed before it.
    const response=await apiFetch('/api/tts',{
      method:'POST',headers:{'Content-Type':'application/json',Accept:streamed?'application/x-ndjson':'application/json'},
      body:JSON.stringify({text}),signal:request.signal,
    });
    if(completed||generation!==voiceGeneration)return;
    if(response.ok&&response.headers?.get('Content-Type')?.split(';')[0].trim().toLowerCase()==='application/x-ndjson'){
      if(!streamed)throw Error('Este navegador não conseguiu preparar o áudio. Você pode continuar por texto.');
      await streamed.consume(response);return;
    }
    streamed?.cancel();streamed=null;
    const result=await response.json();
    if(completed||generation!==voiceGeneration)return;
    if(!response.ok)throw Error(result?.error||'A voz está indisponível. A resposta continua por texto.');
    if(typeof result?.audio!=='string'||!result.audio.length)throw Error('A resposta chegou sem áudio. Você pode tentar ouvir novamente.');
    const bytes=Uint8Array.from(atob(result.audio),(character:string)=>character.charCodeAt(0));
    if(!bytes.length)throw Error('A resposta chegou sem áudio. Você pode tentar ouvir novamente.');
    const mimeType=typeof result.mimeType==='string'&&/^audio\/[a-z0-9.+-]+$/i.test(result.mimeType)?result.mimeType:'audio/wav';
    currentAudioUrl=URL.createObjectURL(new Blob([bytes],{type:mimeType}));
    const audio=new Audio(currentAudioUrl);
    currentAudio=audio;
    const current=()=>!completed&&generation===voiceGeneration&&currentAudio===audio;
    audio.onplay=()=>{if(current())onStart?.();};
    audio.onended=()=>{if(current()){cleanupAudio();finish();}};
    audio.onerror=()=>{if(current())fail('Não foi possível reproduzir a voz. A resposta continua por texto.');};
    await audio.play();
  }catch(error){
    if(generation!==voiceGeneration)return;
    fail(error instanceof Error?error.message:'A voz está indisponível. A resposta continua por texto.');
  }finally{
    globalThis.clearTimeout(requestTimer);
  }
}

function onErrorFallback(text: string, onStart?: () => void, onEnd?: () => void, generation = voiceGeneration,options:DeviceSpeechOptions={}) {
  if (generation !== voiceGeneration) return;
  startDeviceSpeech(text, {
    onStart,
    onEnd,
    onError: message => {
      onEnd?.();
      window.dispatchEvent(new CustomEvent('vigia-error', { detail: message }));
    },
  },false,options);
}

function cleanupAudio() {
  if (currentAudio) {
    try {
      currentAudio.onplay=null;currentAudio.onended=null;currentAudio.onerror=null;
      currentAudio.pause();
      currentAudio.src = '';
    } catch (e) {}
    currentAudio = null;
  }
  if (currentAudioUrl) {
    try {
      URL.revokeObjectURL(currentAudioUrl);
    } catch (e) {}
    currentAudioUrl = null;
  }
}

export function stopSpeaking() {
  ++voiceGeneration;
  const cancelText=cancelTextSpeech;cancelTextSpeech=null;
  const cancel=cancelDeviceSpeech;cancelDeviceSpeech=null;cancel?.();
  cancelText?.();
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      activeUtterances = [];
    }
    cleanupAudio();
  } catch (e) {
    console.error('stopSpeaking error:', e);
  }
}

export const isSpeechRecognitionSupported = () => {
  const Win: any = window as any;
  return !!Win.SpeechRecognition || !!Win.webkitSpeechRecognition;
};

// Configurable VAD options
export interface VADOptions {
  minVoiceDurationMs?: number; // Início válido da fala: 300-500ms
  silenceDurationMs?: number;  // Término após silêncio: ~1500ms
  minVolumeThreshold?: number; // Limiar de volume mínimo para considerar fala
}

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animFrameId: number | null = null;
  private stream: MediaStream | null = null;
  private runId=0;

  public isVoiceDetected = false;
  private voiceStartTime: number | null = null;
  private silenceStartTime: number | null = null;

  public onVolumeChange?: (volume: number) => void;
  public onVoiceStart?: () => void;
  public onSilenceDetected?: () => void;
  public onError?: (error: Error) => void;

  private minVoiceDurationMs: number;
  private silenceDurationMs: number;
  private minVolumeThreshold: number;

  constructor(options?: VADOptions) {
    this.minVoiceDurationMs = options?.minVoiceDurationMs ?? 350;
    this.silenceDurationMs = options?.silenceDurationMs ?? 1500;
    this.minVolumeThreshold = options?.minVolumeThreshold ?? 0.02;
  }

  public start(stream: MediaStream) {
    this.stop();
    this.stream = stream;
    const runId=this.runId;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) throw new Error('Este navegador não consegue detectar a fala. Use texto.');

      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.5;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      const context=this.audioContext;
      void context.resume().catch(error=>{
        if(runId!==this.runId)return;
        this.stop();this.onError?.(error instanceof Error?error:new Error('Não foi possível ativar o microfone. Use texto.'));
      });

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkAudio = () => {
        if (!this.analyser||runId!==this.runId) return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalizedVolume = Math.min(1, average / 128);

        if (this.onVolumeChange) {
          this.onVolumeChange(normalizedVolume);
        }

        const now = performance.now();

        if (normalizedVolume > this.minVolumeThreshold) {
          this.silenceStartTime = null;
          if (this.voiceStartTime===null) {
            this.voiceStartTime = now;
          } else if (now - this.voiceStartTime >= this.minVoiceDurationMs && !this.isVoiceDetected) {
            this.isVoiceDetected = true;
            if (this.onVoiceStart) this.onVoiceStart();
          }
        } else {
          this.voiceStartTime = null;
          if (this.isVoiceDetected) {
            if (this.silenceStartTime===null) {
              this.silenceStartTime = now;
            } else if (now - this.silenceStartTime >= this.silenceDurationMs) {
              this.isVoiceDetected = false;
              this.silenceStartTime = null;
              if (this.onSilenceDetected) this.onSilenceDetected();
            }
          }
        }

        if(runId===this.runId&&this.analyser)this.animFrameId = requestAnimationFrame(checkAudio);
      };

      checkAudio();
    } catch (err) {
      console.error('Erro ao iniciar VAD Web Audio API:', err);
      this.stop();
      throw err;
    }
  }

  public stop() {
    this.runId++;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    if (this.audioContext) {
      try { void this.audioContext.close().catch(()=>undefined); } catch (e) {}
      this.audioContext = null;
    }
    this.analyser = null;
    this.stream = null;
    this.isVoiceDetected = false;
    this.voiceStartTime = null;
    this.silenceStartTime = null;
  }
}

export interface SpeechRecognitionResultData {
  interim: string;
  final: string;
  full: string;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private pendingStop: { recorder: MediaRecorder; promise: Promise<Blob | null>; finish: (blob: Blob | null) => void } | null = null;
  public mimeType = 'audio/webm';

  public start(stream: MediaStream) {
    this.stop();
    try {
      if(typeof MediaRecorder==='undefined')throw new Error('Gravação de áudio não suportada.');
      const selectedMime=['audio/webm','audio/mp4','audio/ogg'].find(type=>MediaRecorder.isTypeSupported(type));
      const recorder=selectedMime?new MediaRecorder(stream,{mimeType:selectedMime}):new MediaRecorder(stream);
      this.mediaRecorder=recorder;
      this.mimeType=recorder.mimeType||selectedMime||'audio/webm';
      const chunks:Blob[]=[];this.audioChunks=chunks;
      recorder.ondataavailable=event=>{
        if(this.mediaRecorder===recorder&&event.data?.size>0)chunks.push(event.data);
      };
      recorder.start(100);
    } catch(err) {
      this.stop();
      throw err;
    }
  }

  public stopAndGetBlob(): Promise<Blob | null> {
    const recorder=this.mediaRecorder;
    if(this.pendingStop?.recorder===recorder)return this.pendingStop.promise;
    if(!recorder||recorder.state==='inactive'){
      const blob=this.audioChunks.length?new Blob(this.audioChunks,{type:this.mimeType}):null;
      this.audioChunks=[];this.mediaRecorder=null;
      return Promise.resolve(blob);
    }
    const chunks=this.audioChunks,mimeType=this.mimeType;
    let resolve!:(blob:Blob|null)=>void;
    const promise=new Promise<Blob|null>(settle=>{resolve=settle;});
    let settled=false;
    const finish=(blob:Blob|null)=>{
      if(settled)return;settled=true;
      globalThis.clearTimeout(timer);
      recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;
      if(this.mediaRecorder===recorder){this.mediaRecorder=null;this.audioChunks=[];}
      if(this.pendingStop?.recorder===recorder)this.pendingStop=null;
      resolve(blob);
    };
    const timer=globalThis.setTimeout(()=>finish(null),5000);
    this.pendingStop={recorder,promise,finish};
    recorder.onstop=()=>finish(chunks.length?new Blob(chunks,{type:mimeType}):null);
    recorder.onerror=()=>finish(null);
    try{recorder.stop();}catch{finish(null);}
    return promise;
  }

  public stop() {
    const recorder=this.mediaRecorder;
    this.pendingStop?.finish(null);
    this.mediaRecorder=null;this.audioChunks=[];
    if(!recorder)return;
    recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;
    if(recorder.state!=='inactive')try{recorder.stop();}catch{/* Already ended. */}
  }
}

export class SpeechRecognizer {
  recognition: any = null;
  onResult: ((data: SpeechRecognitionResultData) => void) | null = null;
  onError: ((err: any) => void) | null = null;
  onEnd: (() => void) | null = null;
  onAudioStart: (() => void) | null = null;
  onSoundStart: (() => void) | null = null;
  onSpeechStart: (() => void) | null = null;
  onSpeechEnd: (() => void) | null = null;
  onAudioEnd: (() => void) | null = null;
  isStarted = false;

  private currentInstanceId = 0;
  private isIntentionalStop = false;

  private createInstance() {
    const Win: any = window as any;
    const Rec = Win.SpeechRecognition || Win.webkitSpeechRecognition;
    if (!Rec) return null;
    try {
      const rec = new Rec();
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      return rec;
    } catch (e) {
      console.error('Erro ao instanciar SpeechRecognition:', e);
      return null;
    }
  }

  constructor() {
    this.recognition = this.createInstance();
  }

  start(callbacks?: {
    onResult?: (data: SpeechRecognitionResultData) => void;
    onAudioStart?: () => void;
    onSoundStart?: () => void;
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    onAudioEnd?: () => void;
    onStart?: () => void;
    onError?: (err: any) => void;
    onEnd?: () => void;
  }) {
    if(this.isStarted)return;
    try {
      stopSpeaking();
      this.isIntentionalStop = false;
      this.onResult = callbacks?.onResult || null;
      this.onError = callbacks?.onError || null;
      this.onEnd = callbacks?.onEnd || null;
      this.onAudioStart = callbacks?.onAudioStart || null;
      this.onSoundStart = callbacks?.onSoundStart || null;
      this.onSpeechStart = callbacks?.onSpeechStart || null;
      this.onSpeechEnd = callbacks?.onSpeechEnd || null;
      this.onAudioEnd = callbacks?.onAudioEnd || null;

      // A stopped instance can still emit result/end events. Give each capture
      // its own native object so those events cannot reach a newer listener.
      this.recognition = this.createInstance();

      if (!this.recognition) {
        throw new Error('SpeechRecognition não suportado');
      }

      this.currentInstanceId++;
      const instanceId = this.currentInstanceId;

      this.recognition.onaudiostart = () => {
        if (instanceId !== this.currentInstanceId) return;
        console.log('onaudiostart');
        if (this.onAudioStart) this.onAudioStart();
      };

      this.recognition.onsoundstart = () => {
        if (instanceId !== this.currentInstanceId) return;
        console.log('onsoundstart');
        if (this.onSoundStart) this.onSoundStart();
      };

      this.recognition.onspeechstart = () => {
        if (instanceId !== this.currentInstanceId) return;
        console.log('onspeechstart');
        if (this.onSpeechStart) this.onSpeechStart();
      };

      this.recognition.onresult = (ev: any) => {
        if (instanceId !== this.currentInstanceId) return;
        console.log('onresult');
        let interimText = '';
        let finalText = '';

        for (let i = 0; i < ev.results.length; i++) {
          const res = ev.results[i];
          const transcript = res[0] ? res[0].transcript : '';
          if (res.isFinal) {
            finalText += (finalText ? ' ' : '') + transcript;
          } else {
            interimText += (interimText ? ' ' : '') + transcript;
          }
        }

        const trimmedInterim = interimText.trim();
        const trimmedFinal = finalText.trim();
        const fullText = (trimmedFinal + ' ' + trimmedInterim).trim();

        if (trimmedInterim) {
          console.log('transcrição provisória:', trimmedInterim);
        }
        if (trimmedFinal) {
          console.log('transcrição final:', trimmedFinal);
        }

        if (this.onResult) {
          this.onResult({
            interim: trimmedInterim,
            final: trimmedFinal,
            full: fullText,
          });
        }
      };

      this.recognition.onspeechend = () => {
        if (instanceId !== this.currentInstanceId) return;
        console.log('onspeechend');
        if (this.onSpeechEnd) this.onSpeechEnd();
      };

      this.recognition.onaudioend = () => {
        if (instanceId !== this.currentInstanceId) return;
        console.log('onaudioend');
        if (this.onAudioEnd) this.onAudioEnd();
      };

      this.recognition.onerror = (e: any) => {
        if (instanceId !== this.currentInstanceId) return;
        console.log('onerror:', e.error || e);
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.error('SpeechRecognition internal error:', e.error || e);
        }
        if (this.onError) this.onError(e);
      };

      this.recognition.onend = () => {
        if (instanceId !== this.currentInstanceId) return;
        console.log('onend');
        this.isStarted = false;
        if (!this.isIntentionalStop && this.onEnd) {
          this.onEnd();
        }
      };

      if (!this.isStarted) {
        this.recognition.start();
        this.isStarted = true;
        console.log('reconhecimento iniciado');
      }
      if (callbacks?.onStart) callbacks.onStart();
    } catch (e) {
      this.isStarted = false;
      if (callbacks?.onError) callbacks.onError(e);
      else if (this.onError) this.onError(e);
    }
  }

  stop() {
    this.currentInstanceId++;
    this.isIntentionalStop=true;
    this.isStarted=false;
    const recognition=this.recognition;
    this.recognition=null;
    try {
      if (recognition) {
        recognition.stop();
      }
    } catch (e) {
      if (this.onError) this.onError(e);
    }
  }
}
