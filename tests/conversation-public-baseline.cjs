/*
 * Opt-in baseline of the already published application, never of workspace code.
 * No credentials, browser session, microphone, Firebase writes, model selection,
 * billing changes or generation retries. The normal server guards remain active.
 */
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

const origin = 'https://vigia-app.onrender.com';
const adultAccessVersion = '2026-10-13-18plus-v1';
const timeoutMs = 55000;
const reportPath = path.resolve(__dirname, '../artifacts/conversation-20261123/public-ai-baseline.json');
const round = value => Math.round(value * 10) / 10;
const codePattern = /^[a-z_]{1,80}$/;
function numericServerTiming(value) {
  if (typeof value !== 'string') return null;
  const entries = [...value.matchAll(/\b(prehandler|generation|validation|handler|api)\s*;\s*dur=(\d+(?:\.\d+)?)/g)];
  return entries.filter(entry => Number.isFinite(Number(entry[2]))).map(entry => entry[1] + ';dur=' + Number(entry[2])).join(', ') || null;
}
class ProbeStopped extends Error {
  constructor(stage, code, status) { super('The limited probe stopped at ' + stage + ': ' + code); this.stage = stage; this.code = code; this.status = status; }
}

async function boundedBody(response, maximumBytes = 131072) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maximumBytes) throw new ProbeStopped('http-body', 'response_too_large');
      chunks.push(Buffer.from(result.value));
    }
    return Buffer.concat(chunks, bytes);
  } finally { await reader.cancel().catch(() => {}); }
}

async function runProbe() {
  // Preserve any previous attempt, including a partial attempt, instead of
  // silently spending another three turns when a command is run twice.
  if (fs.existsSync(reportPath)) throw new ProbeStopped('startup', 'existing_report_preserved');
  const report = {
    scope: 'Published application baseline; local changes have NOT been deployed.',
    origin, startedAt: new Date().toISOString(), status: 'running',
    limits: { chatPosts: 2, voiceTextTurns: 1, operationTimeoutMs: timeoutMs, generationRetries: 0 },
    attempted: { chatPosts: 0, voiceTextTurns: 0 },
    preparation: [], chats: [], voice: null,
    limitations: [
      'Only fictional prevention questions and a text-input voice turn. No microphone or personal data.',
      'First PCM means bytes received over WebSocket, not audible playback or voice quality.',
      'Chat totalMs includes transport and server authorization. It is not isolated model-generation time; server timings are recorded only when supplied.',
      'Individual observations of the old public version; not a controlled before/after comparison or a latency percentile.',
      'Any provider retries or free TTS alternatives are governed by the existing published server; this script never retries a generation.',
    ],
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const checkpoint = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  checkpoint();
  let cookie = '', consentVersion = '', stage = 'status';

  async function http(route, { body, needsConsent = false, stageName = route } = {}) {
    const started = performance.now();
    const observation = { stage: stageName, method: body === undefined ? 'GET' : 'POST', path: route };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: 'application/json', Origin: origin };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (cookie) headers.Cookie = cookie;
      if (needsConsent) headers['X-Vigia-AI-Consent'] = consentVersion;
      const response = await fetch(origin + route, {
        method: observation.method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: controller.signal,
      });
      observation.headersMs = round(performance.now() - started);
      observation.httpStatus = response.status;
      observation.serverTiming = numericServerTiming(response.headers.get('server-timing'));
      const raw = await boundedBody(response);
      observation.totalMs = round(performance.now() - started);
      let value;
      try { value = JSON.parse(raw.toString('utf8')); } catch { throw new ProbeStopped(stageName, 'non_json_response', response.status); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProbeStopped(stageName, 'invalid_response', response.status);
      if (!response.ok || value.status === 'unavailable') {
        const code = typeof value.code === 'string' && codePattern.test(value.code) ? value.code : 'http_' + response.status;
        throw new ProbeStopped(stageName, code, response.status);
      }
      if (route === '/api/session') {
        const match = /(?:^|[,\s])vigia_session=([a-f0-9]{64})(?:;|$)/.exec(response.headers.get('set-cookie') || '');
        if (!match) throw new ProbeStopped(stageName, 'guest_session_cookie_missing');
        cookie = 'vigia_session=' + match[1]; // Kept only in memory; never reported.
      }
      return { value, observation };
    } catch (error) {
      observation.totalMs = round(performance.now() - started);
      observation.failure = controller.signal.aborted ? 'timeout' : error instanceof ProbeStopped ? error.code : 'transport_failure';
      if (route === '/api/chat') report.failedChat = observation;
      else report.preparation.push(observation);
      if (error instanceof ProbeStopped) throw error;
      throw new ProbeStopped(stageName, observation.failure);
    } finally { clearTimeout(timer); }
  }

  async function voiceTurn(ticket) {
    const began = performance.now();
    const prompt = 'Em um exemplo fictício, onde devo guardar a lanterna da mochila de emergência?';
    const result = { protocol: 'stream-v1', input: prompt, inputKind: 'text-only', events: [], serverTimingEvents: [], pcmBytes: 0, audioChunks: 0 };
    report.voice = result;
    await new Promise((resolve, reject) => {
      let settled = false, sent = false, turnStarted = 0;
      const socket = new WebSocket(origin.replace('https:', 'wss:') + '/api/live-ws?voiceProtocol=stream-v1&ticket=' + encodeURIComponent(ticket), {
        headers: { Origin: origin }, handshakeTimeout: timeoutMs, maxPayload: 65536, perMessageDeflate: false,
      });
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        result.totalConnectionMs = round(performance.now() - began);
        // No playback follows in this diagnostic. Close the transport immediately
        // on completion/failure; never wait on an additional close timeout.
        socket.terminate();
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => finish(new ProbeStopped('voice', 'timeout')), timeoutMs);
      socket.on('error', error => {
        // Error messages/stacks can contain the ticket-bearing WebSocket URL.
        // Keep only bounded identifier-shaped type/code fields, never messages.
        result.transportError = {
          type: typeof error?.name === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(error.name) ? error.name : 'unknown',
          code: typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : null,
        };
        finish(new ProbeStopped('voice', 'websocket_failure'));
      });
      socket.on('close', () => { if (!settled) finish(new ProbeStopped('voice', 'closed_before_completion')); });
      socket.on('open', () => { result.webSocketHandshakeMs = round(performance.now() - began); });
      socket.on('message', raw => {
        if (settled) return;
        try {
          const value = JSON.parse(raw.toString());
          if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.type !== 'string') throw new ProbeStopped('voice', 'invalid_event');
          if (result.events.length >= 512) throw new ProbeStopped('voice', 'too_many_events');
          const elapsedMs = round(performance.now() - began);
          result.events.push({ type: value.type.slice(0, 60), elapsedMs, ...(sent ? { sinceTurnSentMs: round(performance.now() - turnStarted) } : {}) });
          if (value.type === 'open') {
            if (sent || value.provider !== 'gemini' || !['streamed-speech', 'turn-based'].includes(value.mode)) throw new ProbeStopped('voice', 'unexpected_voice_configuration');
            result.serverReadyMs = elapsedMs; result.mode = value.mode;
            sent = true; turnStarted = performance.now(); report.attempted.voiceTextTurns++;
            checkpoint();
            socket.send(JSON.stringify({ type: 'realtime_text', text: prompt }));
          } else if (value.type === 'input_transcription' || value.type === 'output_transcription') {
            if (typeof value.text !== 'string' || value.text.length > 10000) throw new ProbeStopped('voice', 'invalid_transcription');
            if (value.type === 'input_transcription') result.inputTranscription = value.text;
            else {
              result.reply = (result.reply || '') + value.text;
              if (result.reply.length > 10000) throw new ProbeStopped('voice', 'reply_too_large');
              result.checkedTextMs ??= round(performance.now() - turnStarted);
            }
          } else if (value.type === 'audio_chunk') {
            if (!sent || typeof value.pcmBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.pcmBase64)) throw new ProbeStopped('voice', 'invalid_pcm');
            const pcm = Buffer.from(value.pcmBase64, 'base64');
            if (!pcm.length || pcm.length % 2 || pcm.toString('ascii', 0, 4) === 'RIFF' || result.pcmBytes + pcm.length > 2400000) throw new ProbeStopped('voice', 'invalid_pcm');
            result.firstPcmMs ??= round(performance.now() - turnStarted);
            result.pcmBytes += pcm.length; result.audioChunks++;
          } else if (value.type === 'voice_timing') {
            const { turn, pipeline, stage, durationMs, elapsedMs: serverElapsedMs } = value;
            if (Number.isSafeInteger(turn) && turn > 0 && ['text', 'multimodal', 'legacy'].includes(pipeline)
              && ['input', 'understanding', 'transcription', 'response', 'first_audio', 'complete', 'failed'].includes(stage)
              && Number.isSafeInteger(durationMs) && durationMs >= 0 && Number.isSafeInteger(serverElapsedMs) && serverElapsedMs >= 0) {
              result.serverTimingEvents.push({ turn, pipeline, stage, durationMs, elapsedMs: serverElapsedMs });
            }
          } else if (['error', 'speech_unavailable', 'emergency'].includes(value.type)) {
            const code = typeof value.code === 'string' && codePattern.test(value.code) ? value.code : value.type;
            throw new ProbeStopped('voice', code);
          } else if (value.type === 'turn_complete') {
            result.completionMs = round(performance.now() - turnStarted);
            if (!sent || !result.reply?.trim() || !result.pcmBytes) throw new ProbeStopped('voice', 'completed_without_reply_or_audio');
            finish();
          }
        } catch (error) { finish(error instanceof ProbeStopped ? error : new ProbeStopped('voice', 'invalid_event')); }
      });
    });
    return result;
  }

  try {
    const initial = await http('/api/status', { stageName: 'status' });
    report.preparation.push(initial.observation);
    const status = initial.value;
    report.runtime = { realAI: status.realAI, demo: status.demo, audience: status.audience, provider: status.ai?.provider, mode: status.ai?.mode, voice: status.ai?.voice, blocked: status.ai?.blocked !== null };
    if (status.realAI !== true || status.demo !== false || status.audience !== '18plus' || status.ai?.provider !== 'gemini'
      || status.ai?.mode !== 'adult-gemini' || status.ai?.blocked !== null || status.ai?.voice !== true) throw new ProbeStopped('status', 'configuration_guard');
    if (typeof status.ai.consentVersion !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(status.ai.consentVersion)) throw new ProbeStopped('status', 'consent_version_missing');
    consentVersion = status.ai.consentVersion;
    report.acceptedConsentVersion = consentVersion;
    checkpoint();
    stage = 'guest-session';
    report.preparation.push((await http('/api/session', { body: {}, stageName: stage })).observation);
    stage = 'adult-declaration';
    const adult = await http('/api/adult-access', { body: { confirmed: true, version: adultAccessVersion }, stageName: stage });
    report.preparation.push(adult.observation);
    if (adult.value.allowed !== true) throw new ProbeStopped(stage, 'adult_declaration_not_confirmed');
    checkpoint();
    const questions = [
      'Em um exemplo fictício, o que devo colocar em uma mochila de emergência? Responda em até três frases.',
      'Continuando esse exemplo: como devo guardar os documentos para protegê-los?',
    ];
    const history = [];
    for (const [index, question] of questions.entries()) {
      stage = 'chat-' + (index + 1); report.attempted.chatPosts++; checkpoint();
      const answer = await http('/api/chat', { body: { message: question, chatHistory: history, readingLevel: 'standard', avatarGender: 'female' }, needsConsent: true, stageName: stage });
      const value = answer.value;
      if (typeof value.reply !== 'string' || !value.reply.trim() || value.reply.length > 10000 || (value.provider !== undefined && value.provider !== 'gemini')) throw new ProbeStopped(stage, 'unexpected_chat_response');
      report.chats.push({ question, historyMessagesSent: history.length, ...answer.observation, reply: value.reply, provider: value.provider || null, model: typeof value.model === 'string' ? value.model.slice(0, 120) : null });
      history.push({ role: 'user', content: question }, { role: 'assistant', content: value.reply });
      checkpoint();
    }
    stage = 'voice-ticket';
    const ticket = await http('/api/live-ticket', { body: {}, needsConsent: true, stageName: stage });
    report.preparation.push(ticket.observation);
    if (typeof ticket.value.ticket !== 'string' || !/^[a-f0-9]{64}$/.test(ticket.value.ticket)) throw new ProbeStopped(stage, 'invalid_ticket');
    stage = 'voice'; checkpoint();
    await voiceTurn(ticket.value.ticket);
    report.status = 'completed';
  } catch (error) {
    report.status = 'stopped';
    report.stopReason = { stage: error instanceof ProbeStopped ? error.stage : stage, code: error instanceof ProbeStopped ? error.code : 'unexpected_failure', ...(error.status ? { httpStatus: error.status } : {}) };
    process.exitCode = 1;
  } finally {
    cookie = ''; consentVersion = '';
    report.finishedAt = new Date().toISOString(); checkpoint();
    console.log(JSON.stringify(report, null, 2));
  }
}

async function main(arguments_) {
  if (arguments_.length === 0 || (arguments_.length === 1 && arguments_[0] === '--help')) {
    console.log('Offline by default. Authorized live probe: node tests/conversation-public-baseline.cjs --live-free-probe');
    return;
  }
  if (arguments_.length !== 1 || arguments_[0] !== '--live-free-probe') throw new ProbeStopped('startup', 'unsupported_arguments');
  await runProbe();
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error instanceof ProbeStopped ? error.message : 'The diagnostic could not start.'); process.exitCode = 1; });
module.exports = { main };
