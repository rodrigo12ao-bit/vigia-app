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
    console.log(`[TELEMETRIA] ${Math.round(t)}ms - ${event}`, meta);
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
  onInputLevel?: (rms: number) => void;
  onOutputLevel?: (rms: number) => void;
  onError?: (errorMsg: string) => void;
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

  private readonly MAX_ACTIVE_SOURCES = 300;
  private nextPlayTime = 0;
  private activeSources: ActiveSource[] = [];
  private generation = 0;
  private hasReceivedFirstAudioChunk = false;
  private serverTurnComplete = false;
  private pcmBuffer: number[] = [];
  private lastInputLevelEmit = 0;

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
  }

  public start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.state !== 'idle' && this.state !== 'error') return Promise.resolve();

    const token = ++this.sessionToken;
    this.stopped = false;
    this.cleanupDone = false;
    this.setState('connecting');

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
      this.outputContextTracked = true;
      Telemetry.trackResource('outputContexts', 1);
      this.nextPlayTime = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const contextParam = this.callbacks.context
        ? `?context=${encodeURIComponent(this.callbacks.context)}`
        : '';
      const wsUrl = `${protocol}//${window.location.host}/api/live-ws${contextParam}`;
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
      };

      socket.onclose = () => {
        if (socket !== this.ws) return;
        console.log('[GeminiLive] WebSocket proxy fechado');
        this.ws = null;
        this.releaseWebSocketTelemetry();
        void this.cleanupResources();
        if (!this.stopped) this.callbacks.onClose?.();
      };
    } catch (error) {
      if (!this.isCurrent(token)) return;
      console.error('[GeminiLive] Erro ao iniciar sessão:', error);
      this.setState('error');
      this.callbacks.onAvatarStateChange?.('serious');
      this.callbacks.onError?.('Não foi possível conectar ao modo ao vivo.');
      await this.cleanupResources();
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
    switch (payload.type) {
      case 'open':
        console.log('[GeminiLive] Sessão Gemini Live confirmada pelo backend');
        this.setState('listening');
        this.callbacks.onAvatarStateChange?.('listening');
        void this.startMicrophoneCapture(this.sessionToken);
        return;

      case 'input_transcription':
        if (payload.text) {
          this.callbacks.onInputTranscription?.(payload.text);
          if (this.state !== 'assistantSpeaking') {
            this.setState('processing');
            this.callbacks.onAvatarStateChange?.('thinking');
          }
        }
        return;

      case 'output_transcription':
        if (payload.text) this.callbacks.onOutputTranscription?.(payload.text);
        return;

      case 'interrupted':
        this.handleServerInterruption();
        return;

      case 'audio_chunk':
        if (payload.pcmBase64) this.handleAudioChunk(payload.pcmBase64);
        return;

      case 'turn_complete':
        Telemetry.record('TTURN', 'Gemini informou turnComplete');
        this.serverTurnComplete = true;
        this.finishTurnWhenPlaybackEnds();
        return;

      case 'close':
        this.callbacks.onClose?.();
        return;

      case 'error':
        this.setState('error');
        this.callbacks.onAvatarStateChange?.('serious');
        this.callbacks.onError?.(payload.message || 'Erro na sessão ao vivo.');
        return;
    }
  }

  private async startMicrophoneCapture(token: number): Promise<void> {
    if (this.mediaStream || !this.isCurrent(token)) return;

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
        worklet.port.onmessage = (event) => this.processInputPCM(event.data);
        this.mediaSourceNode.connect(worklet);
        this.processorNode = worklet;
        usedWorklet = true;
      } catch (error) {
        console.warn('[GeminiLive] AudioWorklet indisponível; usando fallback:', error);
      }

      if (!usedWorklet) {
        // RISCO 4: ScriptProcessor está deprecado pelo W3C. Migrar para AudioWorklet universal
        // quando houver suporte garantido nos navegadores alvo.
        console.warn('[GeminiLive] Usando ScriptProcessor (deprecado). Atualize o navegador para suporte completo ao AudioWorklet.');
        const scriptNode = inputCtx.createScriptProcessor(2048, 1, 1);
        scriptNode.onaudioprocess = (event) => {
          this.processInputPCM(event.inputBuffer.getChannelData(0));
        };
        this.mediaSourceNode.connect(scriptNode);
        scriptNode.connect(inputCtx.destination);
        this.processorNode = scriptNode;
      }

      console.log('[GeminiLive] Captura de áudio iniciada');
    } catch (error) {
      if (!this.isCurrent(token)) return;
      console.error('[GeminiLive] Falha ao acessar microfone:', error);
      this.setState('error');
      this.callbacks.onAvatarStateChange?.('serious');
      this.callbacks.onError?.('Permissão de microfone negada ou microfone indisponível.');
    }
  }

  private processInputPCM(float32Array: Float32Array): void {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.stopped) return;

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

  // RISCO 3: Resampling executado no main thread a cada frame de áudio (~64ms).
  // Em dispositivos lentos pode causar jank. Mover para AudioWorklet é a solução ideal.
  private resampleLinear(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
    const ratio = sourceRate / targetRate;
    const length = Math.max(1, Math.floor(input.length / ratio));
    const output = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      const sourceIndex = index * ratio;
      const left = Math.floor(sourceIndex);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = sourceIndex - left;
      output[index] = input[left] * (1 - fraction) + input[right] * fraction;
    }
    return output;
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
    Telemetry.record('T4', 'Primeiro audio_chunk recebido');
    if (!this.hasReceivedFirstAudioChunk) {
      this.hasReceivedFirstAudioChunk = true;
      this.serverTurnComplete = false;
      this.generation += 1;
      this.setState('assistantSpeaking');
      this.callbacks.onAvatarStateChange?.('speaking');
    }
    this.playPCMChunk(base64Data, this.generation);
  }

  private playPCMChunk(base64Data: string, generation: number): void {
    const context = this.outputAudioCtx;
    if (!context || context.state === 'closed' || generation !== this.generation) return;

    try {
      if (context.state === 'suspended') void context.resume();

      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const sampleCount = Math.floor(bytes.byteLength / 2);
      const float32 = new Float32Array(sampleCount);
      let chunkEnergy = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        const sample = view.getInt16(index * 2, true);
        const floatVal = sample / (sample < 0 ? 32768 : 32767);
        float32[index] = floatVal;
        chunkEnergy += floatVal * floatVal;
      }
      const outputRms = Math.sqrt(chunkEnergy / Math.max(1, sampleCount));
      this.callbacks.onOutputLevel?.(outputRms);

      const audioBuffer = context.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);

      const startAt = Math.max(context.currentTime, this.nextPlayTime);
      source.start(startAt);
      this.nextPlayTime = startAt + audioBuffer.duration;
      Telemetry.record('T5', 'Primeiro áudio agendado para reprodução');

      const entry: ActiveSource = { source, generation };
      this.activeSources.push(entry);

      // RISCO 2: Evita crescimento ilimitado em caso de falha de turn_complete.
      if (this.activeSources.length > this.MAX_ACTIVE_SOURCES) {
        const oldest = this.activeSources.shift();
        if (oldest) {
          try { oldest.source.onended = null; oldest.source.stop(); oldest.source.disconnect(); } catch { /* já encerrado */ }
        }
      }

      source.onended = () => {
        this.activeSources = this.activeSources.filter((item) => item !== entry);
        this.finishTurnWhenPlaybackEnds();
      };
    } catch (error) {
      console.error('[GeminiLive] Erro ao reproduzir PCM:', error);
    }
  }

  private handleServerInterruption(): void {
    console.log('[GeminiLive] Interrupção confirmada pelo Gemini');
    Telemetry.log('INTERRUPTED_BY_GEMINI');
    this.generation += 1;
    this.stopAudioPlayback();
    this.hasReceivedFirstAudioChunk = false;
    this.serverTurnComplete = false;
    this.setState('userSpeaking');
    this.callbacks.onAvatarStateChange?.('listening');
  }

  private finishTurnWhenPlaybackEnds(): void {
    if (!this.serverTurnComplete || this.activeSources.length > 0) return;

    console.log('[GeminiLive] Geração e reprodução concluídas');
    Telemetry.record('T6', 'Resposta completamente reproduzida');
    this.hasReceivedFirstAudioChunk = false;
    this.serverTurnComplete = false;
    Telemetry.currentInteraction = {};
    if (!this.stopped) {
      this.setState('listening');
      this.callbacks.onAvatarStateChange?.('listening');
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

  public sendContextUpdate(contextText: string): void {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN || !contextText.trim()) return;
    socket.send(JSON.stringify({ type: 'realtime_text', text: `[CONTEXTO_DO_APP]: ${contextText.trim()}` }));
  }

  /**
   * ARQ 3: Interrompe localmente a reprodução de áudio da Vigia.
   * Usado pelo botão "Interromper" no modo Live. Não cancela a geração no Gemini —
   * apenas para o áudio já enfileirado localmente e aguarda novo turno.
   */
  public interruptPlayback(): void {
    if (this.state !== 'assistantSpeaking') return;
    Telemetry.log('INTERRUPT_PLAYBACK_LOCAL', { generation: this.generation });
    this.generation += 1;
    this.stopAudioPlayback();
    this.hasReceivedFirstAudioChunk = false;
    this.serverTurnComplete = false;
    this.setState('listening');
    this.callbacks.onAvatarStateChange?.('listening');
  }

  public stop(): void {
    if (this.stopped && this.cleanupDone) return;
    console.log('[GeminiLive] Parando sessão Live');
    this.stopped = true;
    this.sessionToken += 1;
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
    this.stopAudioPlayback();
    this.pcmBuffer = [];

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
