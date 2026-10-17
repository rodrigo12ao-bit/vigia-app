import { apiFetch } from '../lib/api';
import {buildVoiceSocketUrl} from '../lib/voiceOrigin';
import { AvatarState } from '../types';

type LiveState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'userSpeaking'
  | 'processing'
  | 'assistantSpeaking'
  | 'stopping'
  | 'error';

type ResourceType = 'streams' | 'inputContexts' | 'outputContexts' | 'websockets';

const telemetryRoot = window as typeof window & {
  VigiaTelemetry?: {
    logs: Array<{ t: number; event: string; meta: Record<string, unknown> }>;
    resources: Record<ResourceType, { activeNow: number; createdTotal: number }>;
    currentInteraction: Record<string, number>;
    log: (event: string, meta?: Record<string, unknown>) => void;
    resetInteraction: () => void;
    record: (key: string, label: string, extraMeta?: Record<string, unknown>) => void;
    trackResource: (type: ResourceType, delta: 1 | -1) => void;
    dump: () => void;
  };
};

telemetryRoot.VigiaTelemetry ??= {
  logs: [],
  resources: {
    streams: { activeNow: 0, createdTotal: 0 },
    inputContexts: { activeNow: 0, createdTotal: 0 },
    outputContexts: { activeNow: 0, createdTotal: 0 },
    websockets: { activeNow: 0, createdTotal: 0 },
  },
  currentInteraction: {},
  log(event, meta = {}) {
    const t = performance.now();
    this.logs.push({ t, event, meta });
    if(this.logs.length>200)this.logs.shift();
    if(import.meta.env.DEV)console.log(`[TELEMETRIA] ${Math.round(t)}ms - ${event}`, meta);
  },
  resetInteraction() {
    this.currentInteraction = { start: performance.now() };
    this.log('T0: Atividade de entrada observada localmente');
  },
  record(key, label, extraMeta = {}) {
    if (this.currentInteraction[key]) return;
    this.currentInteraction[key] = performance.now();
    const start = this.currentInteraction.start || this.currentInteraction[key];
    this.log(`${key}: ${label}`, {
      msSinceStart: Math.round(this.currentInteraction[key] - start),
      ...extraMeta,
    });
  },
  trackResource(type, delta) {
    const resource = this.resources[type];
    if (delta === 1) {
      resource.activeNow += 1;
      resource.createdTotal += 1;
    } else {
      resource.activeNow = Math.max(0, resource.activeNow - 1);
    }
    this.log(`Recurso [${type}]: ${delta === 1 ? 'Criado' : 'Liberado'}`, {
      activeNow: resource.activeNow,
      createdTotal: resource.createdTotal,
    });
  },
  dump() {
    console.table(this.logs);
  },
};

const Telemetry = telemetryRoot.VigiaTelemetry;

export interface GeminiLiveCallbacks {
  context?: string;
  onAvatarStateChange?: (state: AvatarState) => void;
  onStateChange?: (state: LiveState) => void;
  onInputTranscription?: (text: string) => void;
  onOutputTranscription?: (text: string) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onInputLevel?: (rms: number) => void;
  onMicrophoneActivityChange?: (active: boolean) => void;
  onError?: (errorMsg: string) => void;
  onSpeechUnavailable?: (message: string, retryAfterMs?: number) => void;
  onDeviceSpeech?: (text: string) => void;
  onClose?: () => void;
}

interface ActiveSource {
  source: AudioBufferSourceNode;
  generation: number;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processorNode: AudioNode | null = null;
  private mediaSourceNode: MediaStreamAudioSourceNode | null = null;
  private callbacks: GeminiLiveCallbacks;

  private state: LiveState = 'idle';
  private startPromise: Promise<void> | null = null;
  private sessionToken = 0;
  private stopped = false;
  private cleanupDone = true;
  private websocketTracked = false;
  private inputContextTracked = false;
  private outputContextTracked = false;
  private streamTracked = false;

  private nextPlayTime = 0;
  private activeSources: ActiveSource[] = [];
  private generation = 0;
  private hasReceivedFirstAudioChunk = false;
  private serverTurnComplete = false;
  private pcmBuffer: number[] = [];
  private nativeAudio=false;
  private streamedSpeech=false;
  private microphonePaused=false;
  private muted=false;
  private outputGain:GainNode|null=null;
  private lastInputLevelEmit = 0;
  private speechOutput:'cloud'|'device'='cloud';
  private devicePlaybackPending=false;
  private inputSuppressed=false;
  private lastCaptureActive=false;
  private awaitingInterruptAck=false;
  private playbackFailure=false;
  private playbackChunkCount=0;
  private pendingAudioChunks=0;
  private outputResumePromise:Promise<void>|null=null;
  private interruptAckTimer:ReturnType<typeof globalThis.setTimeout>|null=null;
  private connectionTimer:ReturnType<typeof globalThis.setTimeout>|null=null;
  private microphoneCaptureToken:number|null=null;
  private resampleTail:number|null=null;
  private resamplePosition=0;
  private resampleSourceRate=0;

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
  }

  public start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.state !== 'idle' && this.state !== 'error') return Promise.resolve();

    const token = ++this.sessionToken;
    this.stopped = false;
    this.cleanupDone = false;
    this.microphonePaused=false;
    this.playbackFailure=false;
    this.nativeAudio=this.streamedSpeech=false;
    this.speechOutput='cloud';
    this.setState('connecting');
    this.connectionTimer=globalThis.setTimeout(()=>{
      if(!this.isCurrent(token)||this.state!=='connecting')return;
      this.callbacks.onError?.('A conexão de voz demorou demais. Tente novamente ou continue por texto.');
      this.stop();this.callbacks.onClose?.();
    },20000);

    this.startPromise = this.startInternal(token).finally(() => {
      if (this.sessionToken === token) this.startPromise = null;
    });

    return this.startPromise;
  }

  private async startInternal(token: number): Promise<void> {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) throw new Error('AudioContext não é suportado neste navegador.');

      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      if (!this.isCurrent(token)) {
        await outputCtx.close().catch(() => undefined);
        return;
      }
      this.outputAudioCtx = outputCtx;
      this.outputGain=outputCtx.createGain();
      this.outputGain.gain.value=this.muted?0:1;
      this.outputGain.connect(outputCtx.destination);
      this.outputContextTracked = true;
      Telemetry.trackResource('outputContexts', 1);
      this.nextPlayTime = outputCtx.currentTime;
      await this.resumeOutputContext();
      if(!this.isCurrent(token))return;

      const response=await apiFetch('/api/live-ticket',{method:'POST'});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'Voz indisponível.');
      const {ticket}=body;
      if(!this.isCurrent(token))return;
      const wsUrl=buildVoiceSocketUrl(window.location,ticket,this.callbacks.context,import.meta.env.VITE_VOICE_ORIGIN);
      const socket = new WebSocket(wsUrl);

      if (!this.isCurrent(token)) {
        socket.close();
        return;
      }

      this.ws = socket;
      this.websocketTracked = true;
      Telemetry.trackResource('websockets', 1);

      socket.onopen = () => {
        if (!this.isCurrent(token) || socket !== this.ws) return;
        console.log('[GeminiLive] WebSocket proxy conectado');
      };

      socket.onmessage = (event) => {
        if (!this.isCurrent(token) || socket !== this.ws) return;
        try {
          this.handleServerPayload(JSON.parse(event.data));
        } catch (error) {
          console.error('[GeminiLive] Mensagem inválida do proxy:', error);
        }
      };

      socket.onerror = () => {
        if (!this.isCurrent(token) || socket !== this.ws || this.stopped) return;
        this.setState('error');
        this.callbacks.onAvatarStateChange?.('serious');
        this.callbacks.onError?.('Ocorreu um erro na conexão ao vivo.');
        this.stop();
        this.callbacks.onClose?.();
      };

      socket.onclose = () => {
        if (socket !== this.ws) return;
        console.log('[GeminiLive] WebSocket proxy fechado');
        const notify=!this.stopped;
        this.stopped=true;++this.sessionToken;++this.generation;
        this.pendingAudioChunks=0;this.clearInterruptAck();this.synchronizeCapture();
        this.ws = null;
        this.releaseWebSocketTelemetry();
        this.startPromise=null;
        this.setState('stopping');
        const closedToken=this.sessionToken;
        void this.cleanupResources().finally(()=>{
          if(this.sessionToken!==closedToken)return;
          this.setState('idle');this.callbacks.onAvatarStateChange?.('idle');
        });
        if (notify) this.callbacks.onClose?.();
      };
    } catch (error) {
      if (!this.isCurrent(token)) return;
      console.error('[GeminiLive] Erro ao iniciar sessão:', error);
      this.setState('error');
      this.callbacks.onAvatarStateChange?.('serious');
      this.callbacks.onError?.(error instanceof Error?error.message:'Não foi possível conectar ao modo ao vivo.');
      this.stop();this.callbacks.onClose?.();
    }
  }

  private isCurrent(token: number): boolean {
    return !this.stopped && token === this.sessionToken;
  }

  private setState(state: LiveState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private handleServerPayload(payload: any): void {
    if(this.awaitingInterruptAck&&['processing','input_transcription','output_transcription','audio_chunk','reply_ready','turn_complete','speech_unavailable','speech_on_device'].includes(payload.type))return;
    switch (payload.type) {
      case 'open':
        if(this.connectionTimer)globalThis.clearTimeout(this.connectionTimer);
        this.connectionTimer=null;
        this.streamedSpeech=payload.mode==='streamed-speech';
        this.nativeAudio=payload.mode==='native-audio'||this.streamedSpeech;
        console.log('[GeminiLive] Sessão Gemini Live confirmada pelo backend');
        void this.startMicrophoneCapture(this.sessionToken);
        return;

      case 'input_transcription':
        if (payload.text) {
          this.playbackFailure=false;
          this.callbacks.onInputTranscription?.(payload.text);
          if (this.state !== 'assistantSpeaking') {
            if(this.streamedSpeech&&this.speechOutput==='cloud')this.setInputSuppressed(true);
            this.setState('processing');
            this.callbacks.onAvatarStateChange?.('thinking');
          }
        }
        return;

      case 'processing':
        this.playbackFailure=false;
        if(this.streamedSpeech&&this.speechOutput==='cloud')this.setInputSuppressed(true);
        this.setState('processing');
        this.callbacks.onAvatarStateChange?.('thinking');
        return;

      case 'output_transcription':
        if (payload.text) this.callbacks.onOutputTranscription?.(payload.text);
        return;

      case 'interrupted':
        this.clearInterruptAck();
        this.handleServerInterruption();
        this.callbacks.onInterrupted?.();
        return;

      case 'audio_chunk':
        if (payload.pcmBase64) this.handleAudioChunk(payload.pcmBase64);
        return;

      case 'turn_complete':
        this.callbacks.onTurnComplete?.();
        Telemetry.record('TTURN', 'Gemini informou turnComplete');
        this.serverTurnComplete = true;
        this.finishTurnWhenPlaybackEnds();
        return;
      case 'reply_ready':
        this.callbacks.onTurnComplete?.();
        return;

      case 'speech_unavailable': {
        this.generation += 1;
        this.stopAudioPlayback();
        this.hasReceivedFirstAudioChunk = false;
        this.serverTurnComplete = false;
        this.pendingAudioChunks=0;
        this.pauseMicrophone(true);
        this.setInputSuppressed(false);
        this.setState('idle');
        this.callbacks.onAvatarStateChange?.('serious');
        const retryAfterMs=typeof payload.retryAfterMs==='number'&&Number.isFinite(payload.retryAfterMs)
          ? Math.max(0,Math.min(payload.retryAfterMs,24*60*60*1000)):undefined;
        this.callbacks.onSpeechUnavailable?.(payload.message||'A resposta está disponível por texto, mas a voz está indisponível.',retryAfterMs);
        return;
      }
      case 'speech_output':
        if(payload.mode==='cloud'||payload.mode==='device')this.speechOutput=payload.mode;
        return;
      case 'speech_on_device':
        if(this.speechOutput==='device'&&typeof payload.text==='string'&&payload.text.trim()){
          this.beginDevicePlayback();
          this.callbacks.onDeviceSpeech?.(payload.text);
        }
        return;

      case 'emergency':
        this.callbacks.onOutputTranscription?.(payload.text);
        this.callbacks.onTurnComplete?.();
        this.callbacks.onAvatarStateChange?.('alert');
        this.stop();
        this.callbacks.onClose?.();
        return;
      case 'close':
        this.stop();
        this.callbacks.onClose?.();
        return;

      case 'error':
        this.setState('error');
        this.callbacks.onAvatarStateChange?.('serious');
        this.callbacks.onError?.(payload.message || 'Erro na sessão ao vivo.');
        this.stop();
        this.callbacks.onClose?.();
        return;
    }
  }

  private async startMicrophoneCapture(token: number): Promise<void> {
    if (this.mediaStream || this.microphoneCaptureToken===token || !this.isCurrent(token)) return;
    this.microphoneCaptureToken=token;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!this.isCurrent(token)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.mediaStream = stream;
      this.synchronizeCapture();
      stream.getAudioTracks().forEach(track=>{track.onended=()=>{if(!this.isCurrent(token))return;this.callbacks.onError?.('O microfone foi desconectado. Verifique o aparelho e tente novamente.');this.stop();this.callbacks.onClose?.();};});
      this.streamTracked = true;
      Telemetry.trackResource('streams', 1);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      if (!this.isCurrent(token)) {
        await inputCtx.close().catch(() => undefined);
        return;
      }

      this.inputAudioCtx = inputCtx;
      this.inputContextTracked = true;
      Telemetry.trackResource('inputContexts', 1);
      this.mediaSourceNode = inputCtx.createMediaStreamSource(stream);

      let usedWorklet = false;
      try {
        const workletCode = `
          class PCMProcessor extends AudioWorkletProcessor {
            process(inputs) {
              const input = inputs[0];
              if (input && input[0]) this.port.postMessage(input[0]);
              return true;
            }
          }
          registerProcessor('vigia-pcm-processor', PCMProcessor);
        `;
        const url = URL.createObjectURL(new Blob([workletCode], { type: 'application/javascript' }));
        try {
          await inputCtx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }

        if (!this.isCurrent(token)) return;
        const worklet = new AudioWorkletNode(inputCtx, 'vigia-pcm-processor');
        worklet.port.onmessage = (event) => {if(this.isCurrent(token))this.processInputPCM(event.data);};
        this.mediaSourceNode.connect(worklet);
        this.processorNode = worklet;
        usedWorklet = true;
      } catch (error) {
        console.warn('[GeminiLive] AudioWorklet indisponível; usando fallback:', error);
      }

      if (!usedWorklet) {
        const scriptNode = inputCtx.createScriptProcessor(2048, 1, 1);
        scriptNode.onaudioprocess = (event) => {
          if(this.isCurrent(token))this.processInputPCM(event.inputBuffer.getChannelData(0));
        };
        this.mediaSourceNode.connect(scriptNode);
        scriptNode.connect(inputCtx.destination);
        this.processorNode = scriptNode;
      }

      console.log('[GeminiLive] Captura de áudio iniciada');
      await inputCtx.resume();
      await this.resumeOutputContext();
      if(this.isCurrent(token)&&this.state==='connecting'){this.setState(this.microphonePaused?'idle':'listening');this.callbacks.onAvatarStateChange?.(this.microphonePaused?'idle':'listening');}
    } catch (error) {
      if (!this.isCurrent(token)) return;
      console.error('[GeminiLive] Falha ao acessar microfone:', error);
      this.setState('error');
      this.callbacks.onAvatarStateChange?.('serious');
      this.callbacks.onError?.('Permissão de microfone negada ou microfone indisponível.');
      this.stop();
      this.callbacks.onClose?.();
    } finally {
      if(this.microphoneCaptureToken===token)this.microphoneCaptureToken=null;
    }
  }

  private processInputPCM(float32Array: Float32Array): void {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.stopped || this.microphonePaused || this.inputSuppressed || (!this.nativeAudio&&(this.state==='processing' || this.state==='assistantSpeaking'))) return;
    if(socket.bufferedAmount>128000){this.callbacks.onError?.('A conexão ficou lenta. Tente iniciar a voz novamente.');this.stop();this.callbacks.onClose?.();return;}

    Telemetry.record('T1', 'Primeiro frame processado localmente');

    let energy = 0;
    for (let index = 0; index < float32Array.length; index += 1) {
      energy += float32Array[index] * float32Array[index];
    }
    const rms = Math.sqrt(energy / Math.max(1, float32Array.length));

    const now = performance.now();
    if (now - this.lastInputLevelEmit > 50) {
      this.lastInputLevelEmit = now;
      this.callbacks.onInputLevel?.(rms);
    }

    // O RMS é somente telemetria/visualização. Ele não encerra turnos nem interrompe a resposta.
    if (rms > 0.02 && !Telemetry.currentInteraction.start) {
      Telemetry.resetInteraction();
      Telemetry.record('T2', 'Atividade sonora local observada', { rms });
    }

    const targetRate = 16000;
    const originalRate = this.inputAudioCtx?.sampleRate || targetRate;
    const resampled = originalRate === targetRate
      ? float32Array
      : this.resampleLinear(float32Array, originalRate, targetRate);

    for (let index = 0; index < resampled.length; index += 1) {
      this.pcmBuffer.push(resampled[index]);
    }

    // 1024 amostras = ~64 ms em 16 kHz. Mantém boa cadência sem tempestade de mensagens.
    while (this.pcmBuffer.length >= 1024) {
      const chunk = this.pcmBuffer.splice(0, 1024);
      const base64PCM = this.float32ToBase64Pcm16(chunk);
      try {
        socket.send(JSON.stringify({ type: 'realtime_audio', pcmBase64: base64PCM }));
        Telemetry.record('T3', 'Primeiro buffer enviado ao backend');
      } catch (error) {
        console.error('[GeminiLive] Falha ao enviar áudio:', error);
        return;
      }
    }
  }

  private resampleLinear(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
    if(!input.length)return new Float32Array();
    if(this.resampleSourceRate!==sourceRate){this.resetResampler();this.resampleSourceRate=sourceRate;}
    const ratio = sourceRate / targetRate;
    const prefix=this.resampleTail===null?0:1;
    const samples=new Float32Array(input.length+prefix);
    if(prefix)samples[0]=this.resampleTail!;
    samples.set(input,prefix);
    const output:number[]=[];
    // Keep the fractional phase and the final sample across worklet frames.
    // Rounding each 128-sample frame independently shortens 44.1/48 kHz input.
    while(this.resamplePosition<samples.length-1){
      const left=Math.floor(this.resamplePosition),fraction=this.resamplePosition-left;
      output.push(samples[left]*(1-fraction)+samples[left+1]*fraction);
      this.resamplePosition+=ratio;
    }
    this.resamplePosition-=samples.length-1;
    this.resampleTail=samples[samples.length-1];
    return Float32Array.from(output);
  }

  private resetResampler():void{
    this.resampleTail=null;this.resamplePosition=0;this.resampleSourceRate=0;
  }

  private float32ToBase64Pcm16(samples: number[]): string {
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      const intValue = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(index * 2, intValue, true);
    }

    let binary = '';
    const step = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += step) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + step));
    }
    return btoa(binary);
  }

  private handleAudioChunk(base64Data: string): void {
    if(this.playbackFailure)return;
    Telemetry.record('T4', 'Primeiro audio_chunk recebido');
    if (!this.hasReceivedFirstAudioChunk) {
      this.hasReceivedFirstAudioChunk = true;
      this.serverTurnComplete = false;
      this.generation += 1;
      this.playbackChunkCount=0;
      if(this.streamedSpeech&&this.speechOutput==='cloud')this.setInputSuppressed(true);
      this.setState('assistantSpeaking');
      this.callbacks.onAvatarStateChange?.('speaking');
    }
    const generation=this.generation;
    this.pendingAudioChunks++;
    void this.playPCMChunk(base64Data,generation).finally(()=>{
      if(generation!==this.generation)return;
      this.pendingAudioChunks=Math.max(0,this.pendingAudioChunks-1);
      this.finishTurnWhenPlaybackEnds();
    });
  }

  private async playPCMChunk(base64Data: string, generation: number): Promise<void> {
    const context = this.outputAudioCtx;
    if (!context || context.state === 'closed' || generation !== this.generation) return;

    try {
      if(typeof base64Data!=='string'||!base64Data.length||base64Data.length>3200000)throw new Error('invalid_pcm');
      const binary = atob(base64Data);
      if(!binary.length||binary.length%2)throw new Error('invalid_pcm');
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const sampleCount = Math.floor(bytes.byteLength / 2);
      const float32 = new Float32Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        const sample = view.getInt16(index * 2, true);
        float32[index] = sample / (sample < 0 ? 32768 : 32767);
      }
      await this.resumeOutputContext();
      if(context!==this.outputAudioCtx||this.stopped||generation!==this.generation)return;

      const audioBuffer = context.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputGain||context.destination);

      const now=context.currentTime;
      const lead=this.playbackChunkCount===0?0.08:0.008;
      if(this.playbackChunkCount>0&&this.nextPlayTime<now)Telemetry.log('AUDIO_BUFFER_UNDERRUN',{gapMs:Math.round((now-this.nextPlayTime)*1000)});
      const startAt = this.playbackChunkCount===0?now+lead:Math.max(now+lead,this.nextPlayTime);
      source.start(startAt);
      this.nextPlayTime = startAt + audioBuffer.duration;
      this.playbackChunkCount++;
      Telemetry.record('T5', 'Primeiro áudio agendado para reprodução');

      const entry: ActiveSource = { source, generation };
      this.activeSources.push(entry);
      source.onended = () => {
        source.disconnect();
        this.activeSources = this.activeSources.filter((item) => item !== entry);
        this.finishTurnWhenPlaybackEnds();
      };
    } catch (error) {
      console.error('[GeminiLive] Erro ao reproduzir PCM:', error);
      if(!this.stopped&&generation===this.generation)this.reportPlaybackUnavailable();
    }
  }

  private resumeOutputContext():Promise<void>{
    const context=this.outputAudioCtx;
    if(!context||context.state==='closed')return Promise.reject(new Error('O som está indisponível. Toque em voz novamente ou continue por texto.'));
    if(context.state==='running')return Promise.resolve();
    if(this.outputResumePromise)return this.outputResumePromise;
    let timer:ReturnType<typeof globalThis.setTimeout>;
    const resumePromise=Promise.race([
      context.resume(),
      new Promise<never>((_,reject)=>{timer=globalThis.setTimeout(()=>reject(new Error('O navegador não ativou o som. Toque em voz novamente ou continue por texto.')),3000);}),
    ]).then(()=>{if(context!==this.outputAudioCtx||context.state!=='running')throw new Error('O navegador não ativou o som. Toque em voz novamente ou continue por texto.');})
      .finally(()=>{globalThis.clearTimeout(timer);if(this.outputResumePromise===resumePromise)this.outputResumePromise=null;});
    this.outputResumePromise=resumePromise;
    return resumePromise;
  }

  private reportPlaybackUnavailable():void{
    if(this.playbackFailure)return;
    this.playbackFailure=true;
    this.pauseMicrophone(true);
    if(this.streamedSpeech)this.interruptPlayback();
    else {this.generation++;this.stopAudioPlayback();this.hasReceivedFirstAudioChunk=false;this.serverTurnComplete=false;this.setInputSuppressed(false);this.setState('idle');}
    this.callbacks.onSpeechUnavailable?.('Não foi possível reproduzir o áudio. A resposta continua disponível por texto.');
  }

  private synchronizeCapture():void{
    const active=!!this.mediaStream&&!this.stopped&&!this.microphonePaused&&!this.inputSuppressed;
    for(const track of this.mediaStream?.getAudioTracks()||[])track.enabled=active;
    if(this.lastCaptureActive!==active){this.lastCaptureActive=active;this.callbacks.onMicrophoneActivityChange?.(active);}
    if(!active)this.callbacks.onInputLevel?.(0);
  }

  private setInputSuppressed(suppressed:boolean):void{
    this.inputSuppressed=suppressed;
    if(suppressed){this.pcmBuffer=[];this.resetResampler();}
    this.synchronizeCapture();
  }

  private handleServerInterruption(): void {
    console.log('[GeminiLive] Interrupção confirmada pelo Gemini');
    Telemetry.log('INTERRUPTED_BY_GEMINI');
    this.generation += 1;
    this.stopAudioPlayback();
    this.hasReceivedFirstAudioChunk = false;
    this.serverTurnComplete = false;
    this.pendingAudioChunks=0;
    this.setInputSuppressed(false);
    this.setState(this.microphonePaused?'idle':'userSpeaking');
    this.callbacks.onAvatarStateChange?.(this.microphonePaused?'idle':'listening');
  }

  private finishTurnWhenPlaybackEnds(): void {
    if (this.stopped || !this.serverTurnComplete || this.activeSources.length > 0 || this.pendingAudioChunks>0 || this.devicePlaybackPending) return;

    console.log('[GeminiLive] Geração e reprodução concluídas');
    if(this.streamedSpeech&&this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'playback_ended'}));
    Telemetry.record('T6', 'Resposta completamente reproduzida');
    this.hasReceivedFirstAudioChunk = false;
    this.serverTurnComplete = false;
    this.setInputSuppressed(false);
    Telemetry.currentInteraction = {};
    if (!this.stopped) {
      this.setState(this.microphonePaused?'idle':'listening');
      this.callbacks.onAvatarStateChange?.(this.microphonePaused?'idle':'listening');
    }
  }

  private stopAudioPlayback(): void {
    for (const { source } of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // Fonte já encerrada.
      }
    }
    this.activeSources = [];
    if (this.outputAudioCtx && this.outputAudioCtx.state !== 'closed') {
      this.nextPlayTime = this.outputAudioCtx.currentTime;
    }
  }

  public sendTextMessage(text: string): void {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN || !text.trim()) return;
    socket.send(JSON.stringify({ type: 'realtime_text', text: text.trim() }));
  }

  public setMuted(muted:boolean):void{
    this.muted=muted;
    if(this.outputGain&&this.outputAudioCtx){
      const gain=this.outputGain.gain,value=muted?0:1,now=this.outputAudioCtx.currentTime;
      // A quiet audio graph may defer evaluating automation. Update the intrinsic
      // value too, so mute applies immediately and survives the next PCM packet.
      gain.cancelScheduledValues?.(now);gain.value=value;gain.setValueAtTime(value,now);
    }
  }

  public pauseMicrophone(paused:boolean):void{
    if(this.stopped)return;
    const wasCapturing=!this.microphonePaused&&!this.inputSuppressed;
    if(!paused&&this.microphonePaused&&this.streamedSpeech&&this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'resume_input'}));
    this.microphonePaused=paused;this.pcmBuffer=[];this.resetResampler();
    this.synchronizeCapture();
    if(paused&&wasCapturing&&this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'audio_stream_end'}));
    if(this.mediaStream&&this.state!=='assistantSpeaking'&&this.state!=='processing')this.setState(paused?'idle':'listening');
  }

  public setSpeechOutput(mode:'device'|'cloud'):boolean{
    if(!this.streamedSpeech||this.stopped||this.ws?.readyState!==WebSocket.OPEN)return false;
    try{this.ws.send(JSON.stringify({type:'speech_output',mode}));}catch{return false;}
    this.speechOutput=mode;
    return true;
  }

  public beginDevicePlayback():void{
    this.devicePlaybackPending=true;
    this.pauseMicrophone(true);
  }

  public finishDevicePlayback(resumeInput:boolean):void{
    this.devicePlaybackPending=false;
    this.pendingAudioChunks=0;
    this.serverTurnComplete=false;
    if(this.stopped)return;
    if(resumeInput){this.pauseMicrophone(false);this.setState('listening');}
    else this.setState('idle');
    this.callbacks.onAvatarStateChange?.(resumeInput?'listening':'idle');
  }

  public interruptPlayback():void{
    if(this.streamedSpeech&&this.ws?.readyState===WebSocket.OPEN){
      this.clearInterruptAck();this.awaitingInterruptAck=true;
      this.ws.send(JSON.stringify({type:'interrupt'}));
      this.interruptAckTimer=globalThis.setTimeout(()=>{
        if(this.stopped||!this.awaitingInterruptAck)return;
        this.callbacks.onError?.('A conexão não confirmou a interrupção. Você pode continuar por texto ou iniciar a voz novamente.');
        this.stop();this.callbacks.onClose?.();
      },3000);
    }
    this.handleServerInterruption();
    this.setState(this.microphonePaused?'idle':'listening');
  }

  private clearInterruptAck():void{
    if(this.interruptAckTimer)globalThis.clearTimeout(this.interruptAckTimer);
    this.interruptAckTimer=null;this.awaitingInterruptAck=false;
  }

  public sendContextUpdate(contextText: string): void {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN || !contextText.trim()) return;
    socket.send(JSON.stringify({ type: 'realtime_text', text: `[CONTEXTO_DO_APP]: ${contextText.trim()}` }));
  }

  public stop(): void {
    if (this.stopped && this.cleanupDone) return;
    console.log('[GeminiLive] Parando sessão Live');
    this.stopped = true;
    this.clearInterruptAck();
    this.synchronizeCapture();
    this.sessionToken += 1;
    this.startPromise=null;
    const stoppedToken=this.sessionToken;
    this.setState('stopping');

    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'audio_stream_end' }));
        }
        socket.close(1000, 'client_stop');
      } catch {
        // Socket já indisponível.
      }
      this.releaseWebSocketTelemetry();
    }

    void this.cleanupResources().finally(() => {
      if(this.sessionToken!==stoppedToken)return;
      this.setState('idle');
      this.callbacks.onAvatarStateChange?.('idle');
    });
  }

  private releaseWebSocketTelemetry(): void {
    if (!this.websocketTracked) return;
    this.websocketTracked = false;
    Telemetry.trackResource('websockets', -1);
  }

  private async cleanupResources(): Promise<void> {
    if (this.cleanupDone) return;
    this.cleanupDone = true;
    this.outputResumePromise=null;
    if(this.connectionTimer)globalThis.clearTimeout(this.connectionTimer);
    this.connectionTimer=null;
    this.clearInterruptAck();
    this.devicePlaybackPending=false;
    this.pendingAudioChunks=0;
    this.inputSuppressed=false;
    this.awaitingInterruptAck=false;
    this.stopAudioPlayback();
    this.pcmBuffer = [];
    this.resetResampler();

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // Já desconectado.
      }
      this.processorNode = null;
    }

    if (this.mediaSourceNode) {
      try {
        this.mediaSourceNode.disconnect();
      } catch {
        // Já desconectado.
      }
      this.mediaSourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
      if (this.streamTracked) {
        this.streamTracked = false;
        Telemetry.trackResource('streams', -1);
      }
    }

    const inputCtx = this.inputAudioCtx;
    this.inputAudioCtx = null;
    if (inputCtx && inputCtx.state !== 'closed') await inputCtx.close().catch(() => undefined);
    if (this.inputContextTracked) {
      this.inputContextTracked = false;
      Telemetry.trackResource('inputContexts', -1);
    }

    const outputCtx = this.outputAudioCtx;
    this.outputGain?.disconnect();this.outputGain=null;
    this.outputAudioCtx = null;
    if (outputCtx && outputCtx.state !== 'closed') await outputCtx.close().catch(() => undefined);
    if (this.outputContextTracked) {
      this.outputContextTracked = false;
      Telemetry.trackResource('outputContexts', -1);
    }

    this.releaseWebSocketTelemetry();
    this.hasReceivedFirstAudioChunk = false;
    this.serverTurnComplete = false;
  }
}
