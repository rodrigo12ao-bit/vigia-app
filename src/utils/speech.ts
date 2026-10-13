import { apiFetch, getAiStatus } from '../lib/api';
// Client-side speech utilities for Vigia
// - Attempts server-side TTS via /api/tts and plays returned base64 audio
// - Falls back to browser `speechSynthesis` if server TTS fails
// - Ensures previous audio or utterance is cancelled before starting a new one

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let pendingSpeechTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
let activeUtterances: SpeechSynthesisUtterance[] = [];
let voiceGeneration = 0;
const voiceCleanup = new Set<() => void>();

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
              currentAudio.onplay = () => onStart && onStart();
              currentAudio.onended = () => {
                onEnd && onEnd();
                cleanupAudio();
              };
              currentAudio.onerror = () => {
                cleanupAudio();
                // fallback to browser TTS
                onErrorFallback(text, onStart, onEnd, generation);
              };
              await currentAudio.play().catch(() => {
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
  try {
    clearPendingSpeechTimeout();
    if (!('speechSynthesis' in window)) {
      onStart && onStart();
      pendingSpeechTimeout = globalThis.setTimeout(() => {
        onEnd && onEnd();
        pendingSpeechTimeout = null;
      }, 500);
      return;
    }

    window.speechSynthesis.cancel();
    activeUtterances = [];

    // Chunk text by sentences to avoid Chrome TTS 15-second bug
    const chunks = text.match(/[^.!?]+[.!?]*/g)?.map(c => c.trim()).filter(c => c.length > 0) || [text];
    let currentChunk = 0;
    let hasStarted = false;

    const speakNextChunk = () => {
      if (generation !== voiceGeneration) return;
      if (currentChunk >= chunks.length) {
        onEnd && onEnd();
        return;
      }

      const utter = new SpeechSynthesisUtterance(chunks[currentChunk]);
      activeUtterances.push(utter); // prevent garbage collection
      
      utter.lang = 'pt-BR';
      utter.rate = 1.05;
      utter.pitch = 1.1;
      utter.volume = 1;

      utter.onstart = () => {
        if (generation !== voiceGeneration) return;
        if (!hasStarted) {
          hasStarted = true;
          onStart && onStart();
        }
      };

      utter.onend = () => {
        if (generation !== voiceGeneration) return;
        const index = activeUtterances.indexOf(utter);
        if (index > -1) activeUtterances.splice(index, 1);
        currentChunk++;
        speakNextChunk();
      };

      utter.onerror = (e) => {
        if (generation !== voiceGeneration) return;
        console.warn('TTS Chunk error:', e);
        const index = activeUtterances.indexOf(utter);
        if (index > -1) activeUtterances.splice(index, 1);
        // Continue to next chunk on minor errors, or abort if fatal
        currentChunk++;
        speakNextChunk();
      };

      let queued=false;
      const pickVoiceAndSpeak = (voices: SpeechSynthesisVoice[]) => {
        if (generation !== voiceGeneration || queued) return;
        queued=true;
        const preferredNames = [/francisca/i, /antonio/i, /antônio/i, /francisco/i];
        let candidate = voices.find((v) => {
          const isPt = /pt[-_ ]?br|brazil/i.test(v.lang || v.name);
          const isNeural = /(neural|premium|highly|wave|saudio|synth)/i.test(v.name || '');
          const hasPreferredName = preferredNames.some((r) => r.test(v.name || ''));
          return isPt && (isNeural || hasPreferredName);
        });
        if (!candidate) {
          candidate = voices.find((v) => /pt[-_ ]?br|brazil/i.test(v.lang || v.name));
        }
        if (!candidate && voices.length > 0) candidate = voices[0];
        if (candidate) utter.voice = candidate;
        
        window.speechSynthesis.speak(utter);
      };

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        pickVoiceAndSpeak(voices);
      } else {
        const handler = () => {
          try {
            const vs = window.speechSynthesis.getVoices();
            pickVoiceAndSpeak(vs);
          } finally {
            window.speechSynthesis.removeEventListener('voiceschanged', handler as any);
          }
        };
        window.speechSynthesis.addEventListener('voiceschanged', handler as any);
        voiceCleanup.add(() => window.speechSynthesis.removeEventListener('voiceschanged', handler as any));
        
        // Timeout to just speak anyway if voices list doesn't load quickly
        const voiceTimer = globalThis.setTimeout(() => {
          if (generation !== voiceGeneration) return;
          if (!hasStarted) {
             const vs = window.speechSynthesis.getVoices();
             if (vs.length > 0) pickVoiceAndSpeak(vs);
             else pickVoiceAndSpeak([]);
          }
        }, 300);
        voiceCleanup.add(() => globalThis.clearTimeout(voiceTimer));
      }
    };

    speakNextChunk();

  } catch (err) {
    console.error('Browser TTS fallback error:', err);
    onEnd && onEnd();
  }
}

function clearPendingSpeechTimeout() {
  if (pendingSpeechTimeout !== null) {
    globalThis.clearTimeout(pendingSpeechTimeout);
    pendingSpeechTimeout = null;
  }
}

function cleanupAudio() {
  if (currentAudio) {
    try {
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
  for (const cleanup of voiceCleanup) cleanup();
  voiceCleanup.clear();
  try {
    clearPendingSpeechTimeout();
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

  public isVoiceDetected = false;
  private voiceStartTime: number | null = null;
  private silenceStartTime: number | null = null;

  public onVolumeChange?: (volume: number) => void;
  public onVoiceStart?: () => void;
  public onSilenceDetected?: () => void;

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

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.5;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkAudio = () => {
        if (!this.analyser) return;

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
          if (!this.voiceStartTime) {
            this.voiceStartTime = now;
          } else if (now - this.voiceStartTime >= this.minVoiceDurationMs && !this.isVoiceDetected) {
            this.isVoiceDetected = true;
            if (this.onVoiceStart) this.onVoiceStart();
          }
        } else {
          this.voiceStartTime = null;
          if (this.isVoiceDetected) {
            if (!this.silenceStartTime) {
              this.silenceStartTime = now;
            } else if (now - this.silenceStartTime >= this.silenceDurationMs) {
              this.isVoiceDetected = false;
              this.silenceStartTime = null;
              if (this.onSilenceDetected) this.onSilenceDetected();
            }
          }
        }

        this.animFrameId = requestAnimationFrame(checkAudio);
      };

      checkAudio();
    } catch (err) {
      console.error('Erro ao iniciar VAD Web Audio API:', err);
    }
  }

  public stop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) {}
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
  public mimeType = 'audio/webm';

  public start(stream: MediaStream) {
    this.stop();
    this.audioChunks = [];

    let selectedMime = 'audio/webm';
    if (typeof MediaRecorder !== 'undefined') {
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          selectedMime = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          selectedMime = 'audio/ogg';
        } else {
          selectedMime = '';
        }
      }
    }

    this.mimeType = selectedMime;
    try {
      this.mediaRecorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100);
      console.log('[Transcrição] início da gravação');
    } catch (err) {
      console.error('Erro ao iniciar MediaRecorder:', err);
    }
  }

  public stopAndGetBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        const blob = this.audioChunks.length > 0
          ? new Blob(this.audioChunks, { type: this.mimeType || 'audio/webm' })
          : null;
        resolve(blob);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: this.mimeType || 'audio/webm' });
        this.audioChunks = [];
        this.mediaRecorder = null; // Fix memory leak
        resolve(blob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (e) {
        resolve(null);
      }
    });
  }

  public stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
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

      if (!this.recognition) {
        this.recognition = this.createInstance();
      }

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
    try {
      this.isIntentionalStop = true;
      this.isStarted = false;
      if (this.recognition) {
        this.recognition.stop();
      }
    } catch (e) {
      if (this.onError) this.onError(e);
    }
  }
}
