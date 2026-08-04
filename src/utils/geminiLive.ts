import { AvatarState } from '../types';

(window as any).VigiaTelemetry = (window as any).VigiaTelemetry || {
  logs: [],
  resources: {
    streams: { activeNow: 0, createdTotal: 0 },
    contexts: { activeNow: 0, createdTotal: 0 },
    websockets: { activeNow: 0, createdTotal: 0 }
  },
  currentInteraction: {},
  log: function(event: string, meta: any = {}) {
    const t = performance.now();
    this.logs.push({ t, event, meta });
    console.log(`[TELEMETRIA] ${Math.round(t)}ms - ${event}`, meta);
  },
  resetInteraction: function() {
    this.currentInteraction = { start: performance.now() };
    this.log('T0: Usuário começou a falar (nova interação iniciada)');
  },
  record: function(key: string, label: string, extraMeta: any = {}) {
    if (!this.currentInteraction[key]) {
      this.currentInteraction[key] = performance.now();
      const diff = Math.round(this.currentInteraction[key] - (this.currentInteraction['start'] || 0));
      this.log(`${key}: ${label}`, { msSinceStart: diff, ...extraMeta });
    }
  },
  trackResource: function(type: 'streams' | 'contexts' | 'websockets', isCreated: boolean) {
    if (isCreated) {
      this.resources[type].activeNow++;
      this.resources[type].createdTotal++;
    } else {
      this.resources[type].activeNow--;
    }
    this.log(`Recurso [${type}]: ${isCreated ? 'Criado' : 'Liberado'}`, { 
      activeNow: this.resources[type].activeNow, 
      createdTotal: this.resources[type].createdTotal 
    });
  },
  dump: function() {
    console.table(this.logs);
  }
};
const Telemetry = (window as any).VigiaTelemetry;

export interface GeminiLiveCallbacks {
  context?: string;
  onAvatarStateChange?: (state: AvatarState) => void;
  onInputTranscription?: (text: string) => void;
  onOutputTranscription?: (text: string) => void;
  onError?: (errorMsg: string) => void;
  onClose?: () => void;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processorNode: AudioNode | null = null;
  private callbacks: GeminiLiveCallbacks;

  private isConnected = false;
  private isVigiaSpeaking = false;
  private hasReceivedFirstAudioChunk = false;

  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isProcessingAudioEnd = false;
  private interruptionFrames = 0;
  private pcmBuffer: number[] = [];

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(): Promise<void> {
    if (this.isConnected) {
      console.warn('Sessão Live já está ativa.');
      return;
    }

    try {
      this.callbacks.onAvatarStateChange?.('listening');

      // 1. AudioContext de saída (24kHz PCM mono)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.outputAudioCtx = new AudioCtx({ sampleRate: 24000 });
      Telemetry.trackResource('contexts', true);
      this.nextPlayTime = this.outputAudioCtx.currentTime;

      // 2. Conectar ao proxy WebSocket no backend
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ctxParam = this.callbacks.context ? `?context=${encodeURIComponent(this.callbacks.context)}` : '';
      const wsUrl = `${protocol}//${window.location.host}/api/live-ws${ctxParam}`;

      this.ws = new WebSocket(wsUrl);
      Telemetry.trackResource('websockets', true);

      this.ws.onopen = () => {
        console.log('[GeminiLive] WebSocket proxy conectado');
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleServerPayload(payload);
        } catch (e) {
          console.error('[GeminiLive] Erro ao decodificar mensagem do proxy:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[GeminiLive] Erro no WebSocket proxy:', err);
        this.callbacks.onAvatarStateChange?.('serious');
        this.callbacks.onError?.('Ocorreu um erro na conexão ao vivo.');
      };

      this.ws.onclose = () => {
        console.log('[GeminiLive] WebSocket proxy fechado');
        this.cleanup();
        this.callbacks.onClose?.();
      };
    } catch (err: any) {
      console.error('[GeminiLive] Erro ao iniciar GeminiLiveSession:', err);
      this.callbacks.onAvatarStateChange?.('serious');
      this.callbacks.onError?.('Não foi possível conectar ao modo ao vivo.');
      this.cleanup();
    }
  }

  private handleServerPayload(payload: any): void {
    if (payload.type === 'open') {
      console.log('[GeminiLive] Sessão Gemini Live confirmada pelo backend');
      this.isConnected = true;
      this.startMicrophoneCapture();
      return;
    }

    if (payload.type === 'input_transcription' && payload.text) {
      this.callbacks.onInputTranscription?.(payload.text);
      if (!this.isVigiaSpeaking) {
        this.callbacks.onAvatarStateChange?.('thinking');
      }
      return;
    }

    if (payload.type === 'output_transcription' && payload.text) {
      this.callbacks.onOutputTranscription?.(payload.text);
      return;
    }

    if (payload.type === 'interrupted') {
      this.handleInterruption();
      return;
    }

    if (payload.type === 'audio_chunk' && payload.pcmBase64) {
      Telemetry.record('T4', 'Primeira resposta (audio_chunk) recebida do Gemini');
      if (!this.hasReceivedFirstAudioChunk) {
        this.hasReceivedFirstAudioChunk = true;
        this.isVigiaSpeaking = true;
        this.callbacks.onAvatarStateChange?.('speaking');
      }
      this.playPCMChunk(payload.pcmBase64);
      return;
    }

    if (payload.type === 'turn_complete') {
      Telemetry.record('TTURN', 'Backend confirmou o fim do turno pelo Gemini');
      this.checkAndFinishTurn();
      return;
    }

    if (payload.type === 'error') {
      this.callbacks.onAvatarStateChange?.('serious');
      this.callbacks.onError?.(payload.message || 'Erro na sessão ao vivo.');
      return;
    }
  }

  private async startMicrophoneCapture(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      Telemetry.log('Microfone Config Constraints', { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      Telemetry.trackResource('streams', true);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioCtx = new AudioCtx({ sampleRate: 16000 });
      Telemetry.trackResource('contexts', true);
      const source = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);

      // AudioWorklet com fallback para ScriptProcessor
      let usedWorklet = false;
      try {
        const workletCode = `
          class PCMProcessor extends AudioWorkletProcessor {
            process(inputs, outputs, parameters) {
              const input = inputs[0];
              if (input && input[0]) {
                this.port.postMessage(input[0]);
              }
              return true;
            }
          }
          registerProcessor('pcm-processor', PCMProcessor);
        `;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this.inputAudioCtx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        const workletNode = new AudioWorkletNode(this.inputAudioCtx, 'pcm-processor');
        workletNode.port.onmessage = (e) => {
          this.processInputPCM(e.data);
        };
        source.connect(workletNode);
        this.processorNode = workletNode;
        usedWorklet = true;
      } catch (e) {
        console.warn('AudioWorklet indisponível, usando ScriptProcessor fallback:', e);
      }

      if (!usedWorklet) {
        const scriptNode = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          this.processInputPCM(inputData);
        };
        source.connect(scriptNode);
        scriptNode.connect(this.inputAudioCtx.destination);
        this.processorNode = scriptNode;
      }

      console.log('[GeminiLive] Captura de áudio do microfone iniciada');
    } catch (err: any) {
      console.error('[GeminiLive] Erro ao acessar o microfone para Live API:', err);
      this.callbacks.onError?.('Permissão de microfone negada.');
      this.callbacks.onAvatarStateChange?.('serious');
    }
  }

  private processInputPCM(float32Array: Float32Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) return;

    Telemetry.record('T1', 'Primeiro frame de áudio processado localmente');

    let sum = 0;
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i];
    }
    const rms = Math.sqrt(sum / float32Array.length);

    // Track noise floor roughly
    if (!this.isVigiaSpeaking && !Telemetry.currentInteraction['start']) {
       if (rms > 0.0001 && rms < 0.01) {
          // just an arbitrary log, don't spam too much
          if (Math.random() < 0.01) Telemetry.log('Noise Floor Tracker', { rms });
       }
    }

    // Aumentar sensibilidade do Barge-in: 0.05 é o ideal para voz humana normal em PCM32
    if (rms > 0.05) {
      if (!this.isVigiaSpeaking) {
        // Voice Activity Detection simple trigger (User starts speaking)
        if (!Telemetry.currentInteraction['start']) {
           Telemetry.resetInteraction();
        }
        Telemetry.record('T2', 'Voz detectada no input local (RMS > 0.05)', { rms });
      } else {
        // Barge-in interruption
        this.interruptionFrames++;
        if (this.interruptionFrames > 3) {
           Telemetry.log('BARGE-IN_TRIGGERED', { rms, frames: this.interruptionFrames });
           this.handleInterruption();
        }
      }
    } else {
      if (this.interruptionFrames > 0) {
        Telemetry.log('BARGE-IN_ABORTED', { maxFramesReached: this.interruptionFrames });
      }
      this.interruptionFrames = 0;

      // Se estavamos numa interação ativa, trackear o fim do áudio local se silêncio durar um pouco
      if (!this.isVigiaSpeaking && Telemetry.currentInteraction['start'] && !Telemetry.currentInteraction['TEND_USER']) {
         // Silêncio local
         // A rigor, não estamos contando os frames de silêncio para parar, o Gemini que para. 
         // Mas vamos marcar TEND_USER se o RMS for baixo após ter começado a falar.
         // Vamos ser mais flexíveis: se rms < 0.01
         if (rms < 0.01 && Telemetry.currentInteraction['T3']) {
             // we won't permanently mark TEND_USER if they speak again, so we just log a speculative one
             // Actually, let's mark the *last* silence. We'll update TEND_USER continually during silence
             Telemetry.currentInteraction['TEND_USER'] = performance.now();
         }
      }
    }

    const targetRate = 16000;
    const originalRate = this.inputAudioCtx?.sampleRate || 16000;
    let resampled = float32Array;

    if (originalRate !== targetRate) {
       const ratio = originalRate / targetRate;
       const newLength = Math.floor(float32Array.length / ratio);
       resampled = new Float32Array(newLength);
       for (let i = 0; i < newLength; i++) {
          const index = i * ratio;
          const left = Math.floor(index);
          const right = Math.min(left + 1, float32Array.length - 1);
          const fraction = index - left;
          resampled[i] = float32Array[left] * (1 - fraction) + float32Array[right] * fraction;
       }
    }

    // Acumular áudio em um buffer de envio para não sobrecarregar o WebSocket
    for (let i = 0; i < resampled.length; i++) {
      this.pcmBuffer.push(resampled[i]);
    }

    // Enviar a cada 2048 samples (~128ms em 16kHz)
    if (this.pcmBuffer.length >= 2048) {
      const buffer = new ArrayBuffer(this.pcmBuffer.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < this.pcmBuffer.length; i++) {
        const s = Math.max(-1, Math.min(1, this.pcmBuffer[i]));
        const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(i * 2, val, true);
      }

      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64PCM = btoa(binary);

      try {
        Telemetry.record('T3', 'Áudio (primeiro buffer) enviado ao backend WS');
        if (Telemetry.currentInteraction['start']) {
          Telemetry.currentInteraction['T3b'] = performance.now(); // Último chunk enviado sempre atualizado
        }
        this.ws.send(JSON.stringify({ type: 'realtime_audio', pcmBase64: base64PCM }));
      } catch (e) {}

      this.pcmBuffer = [];
    }
  }

  private playPCMChunk(base64Data: string): void {
    if (!this.outputAudioCtx) return;

    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);

      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 32768 : 32767);
      }

      const audioBuffer = this.outputAudioCtx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioCtx.destination);

      const now = this.outputAudioCtx.currentTime;
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now; // Remove o gap de 50ms que causa gagueira contínua
      }

      source.start(this.nextPlayTime);
      Telemetry.record('T5', 'Primeiro áudio começou a reproduzir');
      this.nextPlayTime += audioBuffer.duration;
      this.activeSources.push(source);

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        if (this.activeSources.length === 0 && this.isProcessingAudioEnd) {
          this.finishVigiaSpeaking();
        }
      };
    } catch (e) {
      console.error('[GeminiLive] Erro ao decodificar/tocar PCM de saída:', e);
    }
  }

  private handleInterruption(): void {
    console.log('[GeminiLive] Fala interrompida');
    this.stopAudioPlayback();
    this.isVigiaSpeaking = false;
    this.hasReceivedFirstAudioChunk = false;
    this.isProcessingAudioEnd = false;
    this.interruptionFrames = 0;
    this.callbacks.onAvatarStateChange?.('listening');
    
    // Avisar o backend (e o modelo) que o turno atual foi encerrado prematuramente
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
       this.ws.send(JSON.stringify({
         clientContent: { turnComplete: true }
       }));
    }
  }

  private checkAndFinishTurn(): void {
    this.isProcessingAudioEnd = true;
    if (this.activeSources.length === 0) {
      this.finishVigiaSpeaking();
    }
  }

  private finishVigiaSpeaking(): void {
    console.log('[GeminiLive] Fala concluída com sucesso');
    Telemetry.record('T6', 'Resposta inteira finalizada e áudios concluídos');
    this.isVigiaSpeaking = false;
    this.hasReceivedFirstAudioChunk = false;
    this.isProcessingAudioEnd = false;
    if (this.isConnected) {
      this.callbacks.onAvatarStateChange?.('listening');
    } else {
      this.callbacks.onAvatarStateChange?.('idle');
    }
  }

  private stopAudioPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.onended = null; // Prevent leaks and callbacks after stopping
        src.stop();
        src.disconnect();
      } catch (e) {}
    }
    this.activeSources = [];
    if (this.outputAudioCtx) {
      this.nextPlayTime = this.outputAudioCtx.currentTime;
    }
  }

  // Sends a text message over the live socket
  sendTextMessage(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[GeminiLive] Não conectado, não é possível enviar texto.');
      return;
    }
    const msg = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      }
    };
    this.ws.send(JSON.stringify(msg));
  }

  // Sends an invisible context update to the model
  sendContextUpdate(contextText: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: `[SYSTEM_UPDATE_DO_NOT_SPEAK]: ${contextText}` }] }],
        turnComplete: true,
      }
    };
    this.ws.send(JSON.stringify(msg));
  }

  public stop(): void {
    console.log('[GeminiLive] Parando sessão Live');
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isConnected = false;
    this.isVigiaSpeaking = false;
    this.hasReceivedFirstAudioChunk = false;
    this.stopAudioPlayback();

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch (e) {}
      this.processorNode = null;
    }

    if (this.inputAudioCtx) {
      try {
        this.inputAudioCtx.close();
        Telemetry.trackResource('contexts', false);
      } catch (e) {}
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx) {
      try {
        this.outputAudioCtx.close();
        Telemetry.trackResource('contexts', false);
      } catch (e) {}
      this.outputAudioCtx = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      Telemetry.trackResource('streams', false);
      this.mediaStream = null;
    }

    if (this.ws) {
      Telemetry.trackResource('websockets', false);
    }
  }
}
