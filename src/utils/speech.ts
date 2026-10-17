import { apiFetch, getAiStatus } from '../lib/api';
// Client-side speech utilities for Vigia
// - Attempts server-side TTS via /api/tts and plays returned base64 audio
// - Falls back to browser `speechSynthesis` if server TTS fails
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

// Explicit device reading: complete text, real lifecycle, no provider requests.
export function speakDeviceText(text: string, callbacks: DeviceSpeechCallbacks = {}): DeviceSpeechHandle {
  return startDeviceSpeech(text,callbacks,true);
}

function startDeviceSpeech(text:string,callbacks:DeviceSpeechCallbacks,cancelPrevious:boolean):DeviceSpeechHandle {
  if(cancelPrevious)stopSpeaking();
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
    const queue=(voices:SpeechSynthesisVoice[])=>{
      if(finished||generation!==voiceGeneration||queued)return;queued=true;
      const preferred=voices.find(voice=>voice.localService&&/pt[-_ ]?br|brazil/i.test(voice.lang||voice.name))
        ||voices.find(voice=>/pt[-_ ]?br|brazil/i.test(voice.lang||voice.name)&&/francisca|ant[oô]nio|francisco|neural|premium/i.test(voice.name))
        ||voices.find(voice=>/pt[-_ ]?br|brazil/i.test(voice.lang||voice.name))||voices[0];
      if(preferred)utterance.voice=preferred;
      startTimer=globalThis.setTimeout(fail,10000);timers.add(startTimer);
      try{window.speechSynthesis.speak(utterance);}catch{fail();}
    };
    try{
      const voices=window.speechSynthesis.getVoices();
      if(voices.length){queue(voices);return;}
      const changed=()=>queue(window.speechSynthesis.getVoices());
      window.speechSynthesis.addEventListener('voiceschanged',changed);
      cleanup.add(()=>window.speechSynthesis.removeEventListener('voiceschanged',changed));
      const timer=globalThis.setTimeout(()=>queue(window.speechSynthesis.getVoices()),300);timers.add(timer);
    }catch{fail();}
  };
  next();return handle;
}

// Toggle this to true to re-enable Gemini server TTS in the future.
export const USE_SERVER_TTS = true;

// Server TTS control: when false, client will use browser TTS immediately.
let serverTTSEnabled = false;
let serverTTSDisabledUntil = 0; // epoch ms

export function disableServerTTSFor(ms: number) {
  serverTTSEnabled = false;
  serverTTSDisabledUntil = Date.now() + ms;
  globalThis.setTimeout(() => {
    if (Date.now() >= serverTTSDisabledUntil) {
      serverTTSEnabled = true;
    }
  }, ms + 50);
}

export function setServerTTSEnabled(flag: boolean) {
  serverTTSEnabled = flag;
  if (!flag) serverTTSDisabledUntil = Number.MAX_SAFE_INTEGER;
  else serverTTSDisabledUntil = 0;
}

export function isServerTTSEnabled() {
  if (!serverTTSEnabled && serverTTSDisabledUntil > 0 && Date.now() > serverTTSDisabledUntil) {
    serverTTSEnabled = true;
  }
  return serverTTSEnabled;
}

export async function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  deviceOnly = false
) {
  let generation = voiceGeneration;
  try {
    // Always cancel any prior speech/audio
    stopSpeaking();
    generation = voiceGeneration;
    const originalEnd=onEnd;
    let completed=false;
    const finish=(cancelled=false)=>{
      if(completed||(!cancelled&&generation!==voiceGeneration))return;
      completed=true;
      if(cancelTextSpeech===cancel)cancelTextSpeech=null;
      originalEnd?.();
    };
    const cancel=()=>finish(true);
    cancelTextSpeech=cancel;
    onEnd=()=>finish();

    if (!text || !text.trim()) {
      onEnd && onEnd();
      return;
    }
    if(deviceOnly){onErrorFallback(text,onStart,onEnd,generation);return;}
    const aiStatus=await getAiStatus().catch(()=>null);
    if(generation!==voiceGeneration)return;
    if(import.meta.env.MODE==='presentation'||['adult-synthetic','local-synthetic','adult-gemini'].includes(aiStatus?.ai?.mode||'')){
      try{
        const response=await apiFetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
        const result=await response.json();
        if(generation!==voiceGeneration)return;
        if(!response.ok||!result.audio)throw Error(result.error||'Voz indisponível.');
        const bytes=Uint8Array.from(atob(result.audio),(c:string)=>c.charCodeAt(0));
        currentAudioUrl=URL.createObjectURL(new Blob([bytes],{type:result.mimeType||'audio/wav'}));
        currentAudio=new Audio(currentAudioUrl);
        currentAudio.onplay=()=>{if(generation===voiceGeneration)onStart?.();};
        currentAudio.onended=()=>{if(generation===voiceGeneration){cleanupAudio();onEnd?.();}};
        currentAudio.onerror=()=>{if(generation===voiceGeneration){cleanupAudio();onEnd?.();window.dispatchEvent(new CustomEvent('vigia-error',{detail:'Não foi possível reproduzir a voz da IA.'}));}};
        await currentAudio.play();return;
      }catch(error){if(generation===voiceGeneration){cleanupAudio();onEnd?.();window.dispatchEvent(new CustomEvent('vigia-error',{detail:error instanceof Error?error.message:'Voz indisponível.'}));}return;}
    }
    // Reading activities retain their separately disclosed device voice.
    if (!isServerTTSEnabled()) {
      onErrorFallback(text, onStart, onEnd, generation);
      return;
    }

    // Only attempt server-side TTS when the explicit feature flag is enabled.
    if (USE_SERVER_TTS) {
      try {
        const resp = await apiFetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        if(generation!==voiceGeneration)return;
        if (resp.ok) {
          const data = await resp.json();
          if(generation!==voiceGeneration)return;
          if (data && data.audio) {
            const base64 = data.audio as string;
            try {
              const byteString = atob(base64);
              const len = byteString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) bytes[i] = byteString.charCodeAt(i);
              const blob = new Blob([bytes.buffer], { type: 'audio/mpeg' });
              const url = URL.createObjectURL(blob);
              currentAudioUrl = url;
              currentAudio = new Audio(url);
              currentAudio.onplay = () => {if(generation===voiceGeneration)onStart?.();};
              currentAudio.onended = () => {
                if(generation!==voiceGeneration)return;
                cleanupAudio();onEnd?.();
              };
              currentAudio.onerror = () => {
                if(generation!==voiceGeneration)return;
                cleanupAudio();
                // fallback to browser TTS
                onErrorFallback(text, onStart, onEnd, generation);
              };
              await currentAudio.play().catch(() => {
                if(generation!==voiceGeneration)return;
                cleanupAudio();
                onErrorFallback(text, onStart, onEnd, generation);
              });
              return;
            } catch (e) {
              // If anything goes wrong decoding/playing, fall back
            }
          }
        } else {
          // Non-ok response -> if 5xx or 429, disable server TTS for a cooldown
          try {
            const body = await resp.json().catch(() => null);
            const status = resp.status;
            // Determine cooldown: prefer Retry-After header (seconds), else default 60000ms
            let cooldownMs = 60000;
            const ra = resp.headers.get && resp.headers.get('Retry-After');
            if (ra) {
              const parsed = parseFloat(ra);
              if (!isNaN(parsed)) cooldownMs = parsed * 1000;
            }
            // If body contains a suggested retry delay like 'Please retry in Xs', try to parse it
            if (body && typeof body === 'object') {
              const msg = JSON.stringify(body);
              const m = msg.match(/retry in ([0-9]+(?:\.[0-9]+)?)s/i);
              if (m) {
                const s = parseFloat(m[1]);
                if (!isNaN(s)) cooldownMs = Math.max(cooldownMs, Math.round(s * 1000));
              }
            }

            if (status >= 500 || status === 429) {
              disableServerTTSFor(cooldownMs);
              // immediately use browser TTS so user doesn't wait
              onErrorFallback(text, onStart, onEnd, generation);
              return;
            }
          } catch (e) {
            // parsing error: fall through to browser TTS
          }
        }
      } catch (e) {
        // network or server error; disable server TTS briefly and fallback
        disableServerTTSFor(60000);
        onErrorFallback(text, onStart, onEnd, generation);
        return;
      }

      // Browser speechSynthesis fallback if server path didn't return playable audio
      onErrorFallback(text, onStart, onEnd, generation);
      return;
    }

    // Server-side TTS feature is disabled; use browser speech directly.
    onErrorFallback(text, onStart, onEnd, generation);
    return;
  } catch (e) {
    console.error('speakText unexpected error:', e);
    onEnd && onEnd();
  }
}

function onErrorFallback(text: string, onStart?: () => void, onEnd?: () => void, generation = voiceGeneration) {
  if (generation !== voiceGeneration) return;
  startDeviceSpeech(text, {
    onStart,
    onEnd,
    onError: message => {
      onEnd?.();
      window.dispatchEvent(new CustomEvent('vigia-error', { detail: message }));
    },
  },false);
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
