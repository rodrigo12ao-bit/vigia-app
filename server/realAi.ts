import fs from 'node:fs';
import path from 'node:path';
import {LocalAi} from './localAi';
import {GeminiAi,GEMINI_ADULT_CONSENT,verifiedFreeGemini} from './geminiAi';

export const AI_CONSENT_VERSION = '2026-10-12-openai-adult-synthetic-v1';
export const LOCAL_AI_CONSENT_VERSION='2026-10-12-local-free-synthetic-v1';
export interface AiEngine {
  provider?: string;
  models:{generateContent:(request:any,signal?:AbortSignal)=>Promise<{text:string}>};
  transcribe:(audio:string,mime:string,signal?:AbortSignal)=>Promise<{text:string;status:string;provider:string}>;
  speech:(text:string,signal?:AbortSignal)=>Promise<{pcm:Buffer;sampleRate:number}>;
  speechStream?:(text:string,signal?:AbortSignal)=>AsyncGenerator<Buffer>;
}
export class AiUnavailable extends Error {
  constructor(public code: string, message: string, public status = 503) { super(message); }
}

// This release enables local evaluation by adults with fictional data only.
// It deliberately does not claim that child privacy/retention approval exists.
export function realAiConfig(env: NodeJS.ProcessEnv = process.env) {
  if(env.AI_PROVIDER==='gemini'){
    let blocked:string|null=null;
    if(env.AI_AUDIENCE!=='18plus')blocked='O Gemini exige um aplicativo exclusivo para pessoas de 18 anos ou mais.';
    else if(!['local-real','adult-live'].includes(env.VIGIA_MODE||'')||env.ENABLE_REAL_AI!=='true')blocked='A integração Gemini real está desativada.';
    else if(!env.GEMINI_API_KEY)blocked='A chave Gemini não está configurada.';
    else if(!verifiedFreeGemini(env))blocked='O plano gratuito desta chave ainda não foi verificado. Chamadas bloqueadas para evitar cobrança.';
    return {enabled:!blocked,provider:'gemini' as const,scope:'adult-gemini' as const,blocked,models:{text:'gemini-3.5-flash-lite',transcription:'gemini-3.5-flash-lite',speech:'gemini-3.8-flash-lite-tts'},budget:0,consentVersion:GEMINI_ADULT_CONSENT};
  }
  if(env.AI_PROVIDER==='local'){
    const safe=env.VIGIA_MODE==='local-real'&&env.ENABLE_REAL_AI==='true'&&env.RENDER!=='true'&&['127.0.0.1','localhost'].includes(env.HOST||'127.0.0.1')&&env.FIREBASE_AUTH_EMULATOR_HOST==='127.0.0.1:9099'&&env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080'&&env.AI_TEST_SCOPE==='local-synthetic';
    const blocked=!safe?'A IA gratuita desta versão está restrita ao computador local e a dados fictícios.':!env.LOCAL_AI_TOKEN?'O componente gratuito local ainda não foi iniciado.':null;
    return {enabled:!blocked,provider:'local' as const,scope:'local-synthetic' as const,blocked,models:{text:'Qwen3.5-0.8B-Q4_K_M',transcription:'whisper-base-q5_1',speech:'Windows-pt-BR-offline'},budget:0,consentVersion:LOCAL_AI_CONSENT_VERSION};
  }
  const models = { text: env.OPENAI_TEXT_MODEL || 'gpt-6.1-sol', transcription: 'gpt-transcribe', speech: 'gpt-4o-mini-tts' };
  let blocked: string | null = null;
  if (env.AI_PROVIDER === 'gemini' || env.AI_PROVIDER === 'vertex') blocked = 'Este serviço não permite o público de 6 a 14 anos do Vigia.';
  else if (env.VIGIA_MODE !== 'local-real' || env.ENABLE_REAL_AI !== 'true') blocked = 'A integração real está desativada.';
  else if (env.RENDER === 'true' || !['127.0.0.1', 'localhost'].includes(env.HOST || '127.0.0.1') || env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') blocked = 'A avaliação real está restrita ao ambiente local e às contas fictícias.';
  else if (env.AI_PROVIDER !== 'openai') blocked = 'Escolha um serviço de IA compatível antes de continuar.';
  else if (env.AI_TEST_SCOPE !== 'adult-synthetic') blocked = 'O uso com crianças ainda não foi liberado.';
  else if (env.AI_COST_AUTHORIZED !== 'true') blocked = 'Os testes reais aguardam sua autorização de custo.';
  else if (!env.OPENAI_API_KEY?.trim()) blocked = 'A chave privada da API OpenAI ainda não foi configurada.';
  else if (!env.AI_TEST_UIDS?.trim()) blocked = 'Nenhuma conta adulta fictícia foi autorizada para os testes.';
  const budget = Number(env.AI_TEST_BUDGET_USD || 3);
  if (!Number.isFinite(budget) || budget <= 0 || budget > 3) blocked = 'O orçamento local deve ser maior que zero e no máximo US$ 3.';
  // Pinned prices and maximum output limits are part of the spend guard.
  if (models.text !== 'gpt-6.1-sol') blocked = 'Este modelo exige revisão de preço antes de ser usado.';
  return { enabled: !blocked, provider: 'openai' as const, scope: 'adult-synthetic' as const, blocked, models, budget, consentVersion: AI_CONSENT_VERSION };
}

export function canUseRealAi(uid: string, firebaseUser: boolean, role?: string, email?: string, env: NodeJS.ProcessEnv = process.env) {
  if(env.AI_PROVIDER==='gemini')return env.AI_AUDIENCE==='18plus'; // Server checks a separate, scoped adult declaration; no role escalation.
  if(env.AI_PROVIDER==='local')return env.AI_TEST_SCOPE==='local-synthetic'&&(!firebaseUser?uid.startsWith('guest:'):!!email?.endsWith('@example.invalid'));
  return firebaseUser && (env.AI_TEST_UIDS || '').split(',').map(s => s.trim()).includes(uid)
    && ['responsavel', 'educador'].includes(role || '') && !!email?.endsWith('@example.invalid');
}

function jsonSchema(schema: any, optional = false): any {
  const type = String(schema.type || 'string').toLowerCase();
  const result: any = { type: optional ? [type, 'null'] : type };
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = optional ? [...schema.enum, null] : schema.enum;
  if (type === 'array') result.items = jsonSchema(schema.items || { type: 'string' });
  if (type === 'object') {
    const required = new Set(schema.required || []);
    result.properties = Object.fromEntries(Object.entries(schema.properties || {}).map(([key, value]) => [key, jsonSchema(value, !required.has(key))]));
    result.required = Object.keys(result.properties);
    result.additionalProperties = false;
  }
  return result;
}

function withoutNulls(value: any): any {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== null).map(([k,v]) => [k, withoutNulls(v)]));
  return value;
}

export function pcmWave(pcm: Buffer, rate = 16000) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function decodeAudio(audio: unknown, mimeType: unknown) {
  if (typeof audio !== 'string' || audio.length > 1400000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio)) throw new AiUnavailable('invalid_audio', 'Áudio inválido ou grande demais.', 400);
  const mime = String(mimeType || '').split(';')[0];
  const extensions: Record<string,string> = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' };
  if (!extensions[mime]) throw new AiUnavailable('invalid_audio', 'Formato de áudio não suportado.', 400);
  const bytes = Buffer.from(audio, 'base64');
  if (bytes.length < 44) throw new AiUnavailable('invalid_audio', 'Áudio vazio ou inválido.', 400);
  return { bytes, mime, extension: extensions[mime] };
}

export class RealAi {
  readonly provider='openai';
  private inFlight = 0;
  private reserved = 0;
  constructor(private env: NodeJS.ProcessEnv = process.env, private transport: typeof fetch = fetch, private ledgerPath = path.join(process.cwd(), '.tools', 'ai-spend', env.AI_CONTRACT_TEST === 'true' ? `contract-tests-${process.pid}.json` : 'adult-synthetic.json')) {}

  private reserve(amount: number) {
    const config = realAiConfig(this.env);
    if (!config.enabled || config.provider!=='openai') throw new AiUnavailable('configuration_blocked', config.blocked||'O serviço pago permanece bloqueado.');
    if (this.inFlight >= 2) throw new AiUnavailable('busy', 'A IA está ocupada. Aguarde a resposta atual.');
    if (this.ledgerPath) {
      try { this.reserved = Math.max(this.reserved, Number(JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8')).reservedUsd)); }
      catch (error: any) { if (error.code !== 'ENOENT') throw new AiUnavailable('budget_unavailable', 'O controle de custo está indisponível.'); }
    }
    if (!Number.isFinite(this.reserved) || this.reserved + amount > config.budget + 1e-8) throw new AiUnavailable('budget_limit', 'O limite autorizado para os testes foi atingido.');
    this.reserved += amount;
    if (this.ledgerPath) {
      try { fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true }); fs.writeFileSync(this.ledgerPath, JSON.stringify({ reservedUsd: this.reserved, budgetUsd: config.budget, updatedAt: new Date().toISOString() }), { mode: 0o600 }); }
      catch { throw new AiUnavailable('budget_unavailable', 'Não foi possível registrar o limite de custo.'); }
    }
    // Reservations are not refunded after failures or restarts. Conservative by design.
    this.inFlight++;
  }

  private async request(route: string, body: object | FormData, reservation: number, binary = false, signal?: AbortSignal) {
    this.reserve(reservation);
    try {
      const headers: Record<string,string> = { Authorization: `Bearer ${this.env.OPENAI_API_KEY}` };
      if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
      const timeout = AbortSignal.timeout(30000);
      const response = await this.transport(`https://api.openai.com/v1/${route}`, { method: 'POST', headers, body: body instanceof FormData ? body : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!response.ok) throw new AiUnavailable(response.status === 429 ? 'quota_unavailable' : 'provider_unavailable', response.status === 429 ? 'A cota de IA está indisponível. Tente mais tarde.' : 'O serviço de IA está indisponível.');
      if (binary) {
        if (!response.headers.get('content-type')?.includes('audio/') && !response.headers.get('content-type')?.includes('octet-stream')) throw new AiUnavailable('invalid_response', 'O serviço não retornou um áudio válido.');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 2 || bytes.length > 2400000 || bytes.length % 2) throw new AiUnavailable('invalid_response', 'Áudio gerado inválido.');
        return bytes;
      }
      return await response.json();
    } catch (error) {
      if (error instanceof AiUnavailable) throw error;
      throw new AiUnavailable('network_unavailable', 'Não foi possível concluir a conexão com a IA.');
    } finally { this.inFlight--; }
  }

  async moderate(input: any, signal?: AbortSignal) {
    const body = await this.request('moderations', { model: 'omni-moderation-latest', input }, 0, false, signal);
    if (!Array.isArray(body.results) || !body.results.length || body.results.some((r:any) => typeof r.flagged !== 'boolean')) throw new AiUnavailable('moderation_unavailable', 'A verificação de segurança está indisponível.');
    if (body.results.some((r:any) => r.flagged)) throw new AiUnavailable('content_blocked', 'Esse conteúdo precisa da ajuda de um adulto. Use os canais de ajuda do Vigia.', 422);
  }

  models = { generateContent: async (request: any, signal?: AbortSignal) => {
    const parts = typeof request.contents === 'string' ? [{ text: request.contents }] : request.contents;
    if (!Array.isArray(parts)) throw new AiUnavailable('invalid_input', 'Conteúdo de IA inválido.', 400);
    const content = parts.map((part:any) => part.inlineData ? { type: 'input_image', image_url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, detail: 'low' } : { type: 'input_text', text: part.text });
    for(const part of parts.filter((p:any)=>p.inlineData)){
      const image=part.inlineData;
      if(!['image/png','image/jpeg','image/webp'].includes(image.mimeType)||typeof image.data!=='string'||image.data.length>250000||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))throw new AiUnavailable('invalid_image','Imagem inválida.',400);
      const data=Buffer.from(image.data,'base64');
      const valid=image.mimeType==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):image.mimeType==='image/jpeg'?data.length>4&&data[0]===255&&data[1]===216&&data[data.length-2]===255&&data[data.length-1]===217:data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
      if(!valid)throw new AiUnavailable('invalid_image','O arquivo não corresponde ao formato da imagem.',400);
    }
    const text = content.filter(p=>p.type==='input_text').map(p=>p.text).join('\n');
    if (Buffer.byteLength(text || '') + Buffer.byteLength(request.config?.systemInstruction || '') > 60000 || content.filter(p=>p.type==='input_image').length > 1) throw new AiUnavailable('invalid_input', 'Conversa grande demais. Abra uma nova conversa.', 400);
    const moderation = content.map(p=>p.type==='input_text' ? { type:'text',text:p.text } : { type:'image_url',image_url:{url:p.image_url} });
    await this.moderate(moderation, signal);
    const response = await this.request('responses', {
      model: realAiConfig(this.env).models.text, store: false, max_output_tokens: 2000,
      reasoning: { effort: 'low' }, instructions: request.config?.systemInstruction || 'Responda em português do Brasil com orientações educativas seguras.',
      input: [{ role: 'user', content }],
      ...(request.config?.responseSchema ? { text: { format: { type: 'json_schema', name: 'vigia_reply', strict: true, schema: jsonSchema(request.config.responseSchema) } } } : {}),
    }, 0.5, false, signal);
    if (response.status !== 'completed' || !Array.isArray(response.output)) throw new AiUnavailable('incomplete_response', 'A IA não concluiu a resposta. Tente novamente.');
    const output = response.output.flatMap((item:any) => item.type === 'message' ? item.content || [] : []);
    if (output.some((part:any)=>part.type==='refusal')) throw new AiUnavailable('content_blocked', 'A IA não pode responder a esse pedido.', 422);
    const answer = output.filter((part:any)=>part.type==='output_text').map((part:any)=>part.text).join('');
    if (!answer || answer.length > 16000) throw new AiUnavailable('invalid_response', 'Resposta de IA inválida.');
    await this.moderate(answer, signal);
    return { text: request.config?.responseSchema ? JSON.stringify(withoutNulls(JSON.parse(answer))) : answer };
  } };

  async transcribe(audio: string, mimeType: string, signal?: AbortSignal) {
    const { bytes, mime, extension } = decodeAudio(audio, mimeType);
    // A fixed PCM container makes duration/cost enforceable without trusting
    // client-supplied durations or compressed files with arbitrarily long silence.
    if (extension!=='wav' || bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,12)!=='WAVE' || bytes.toString('ascii',12,16)!=='fmt ' || bytes.readUInt32LE(16)!==16 || bytes.readUInt16LE(20)!==1 || bytes.readUInt16LE(22)!==1 || bytes.readUInt32LE(24)!==16000 || bytes.readUInt32LE(28)!==32000 || bytes.readUInt16LE(32)!==2 || bytes.readUInt16LE(34)!==16 || bytes.toString('ascii',36,40)!=='data' || bytes.readUInt32LE(40)!==bytes.length-44 || bytes.length>480044) throw new AiUnavailable('invalid_audio','Envie uma gravação de até 15 segundos no formato PCM do Vigia.',400);
    const data = new FormData();
    data.append('model', 'gpt-transcribe'); data.append('language', 'pt'); data.append('response_format', 'json');
    data.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), `fala.${extension}`);
    const response = await this.request('audio/transcriptions', data, 0.02, false, signal);
    if (typeof response.text !== 'string' || response.text.length > 4000) throw new AiUnavailable('invalid_response', 'Transcrição inválida.');
    const text = response.text.trim();
    return { text, status: text ? 'ok' : 'no_speech', provider: 'openai' };
  }

  async speech(text: string, signal?: AbortSignal) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1500) throw new AiUnavailable('invalid_input', 'Texto de voz inválido ou grande demais.', 400);
    await this.moderate(text, signal);
    const pcm = await this.request('audio/speech', { model: 'gpt-4o-mini-tts', voice: 'coral', input: text, instructions: 'Fale em português do Brasil, com clareza, ritmo tranquilo e tom acolhedor. Esta é uma voz gerada por inteligência artificial.', response_format: 'pcm' }, 0.15, true, signal);
    return { pcm: pcm as Buffer, sampleRate: 24000 };
  }
}

let singleton: AiEngine | undefined;
export function realAi() { return singleton ||= process.env.AI_PROVIDER==='gemini'?new GeminiAi():process.env.AI_PROVIDER==='local'?new LocalAi():new RealAi(); }
export function aiErrorResponse(error: unknown) {
  return error instanceof AiUnavailable ? { statusCode:error.status, body:{ status:'unavailable', code:error.code, error:error.message } } : { statusCode:503, body:{status:'unavailable',code:'provider_unavailable',error:'Serviço de IA indisponível.'} };
}
