/*
 * Explicit diagnostic modes; importing this file or running it without flags
 * never sends a request. The synthetic mode has no provider, microphone or
 * browser. Public mode makes exactly one GET to / and /api/status on one fixed
 * origin, without cookies, credentials, redirects, retries, POSTs or sockets.
 */
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const repository = path.resolve(__dirname, '..');
const artifactDirectory = path.join(repository, 'artifacts', 'conversation-20261123');
const publicOrigins = new Map([
  ['https://vigia-app.onrender.com', 'render'],
  ['https://vigia-aplicativo-18plus.netlify.app', 'netlify'],
]);
const milliseconds = started => Math.round((performance.now() - started) * 10) / 10;

function saveReport(name, report) {
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const destination = path.join(artifactDirectory, name + '.json');
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: path.relative(repository, destination), ...report }, null, 2));
}

function loadIsolatedTypeScript(relativePath, imports = {}) {
  const { transformSync } = require('esbuild');
  const module = { exports: {} };
  const code = transformSync(fs.readFileSync(path.join(repository, relativePath), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    assert.ok(Object.prototype.hasOwnProperty.call(imports, name), 'Undeclared diagnostic import: ' + name);
    return imports[name];
  });
  return module.exports;
}

function wave(pcm, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function simulate() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('External requests are forbidden in synthetic diagnostics.'); };
  class AiUnavailable extends Error {
    constructor(code, message, status = 503) { super(message); this.code = code; this.status = status; }
  }
  const aiPrimitives = {
    AiUnavailable, pcmWave: wave,
    aiErrorResponse: error => ({ statusCode: error.status || 503, body: { code: error.code || 'synthetic_failure', error: 'Synthetic provider failure.' } }),
  };
  const safety = loadIsolatedTypeScript('server/safety.ts');
  const voiceText = loadIsolatedTypeScript('server/voiceText.ts', { './realAi': aiPrimitives });
  const { connectRealVoice } = loadIsolatedTypeScript('server/realVoice.ts', { './realAi': aiPrimitives, './safety': safety, './voiceText': voiceText });
  const injectedDelaysMs = { understanding: 40, firstSpeechChunk: 25, secondSpeechChunk: 15 };
  const calls = [], events = [], timings = [];
  let started, finish;
  const completed = new Promise(resolve => { finish = resolve; });
  class SyntheticSocket extends EventEmitter {
    OPEN = 1; readyState = 1;
    send(raw) {
      const event = JSON.parse(raw);
      if (started !== undefined) events.push({ type: event.type, elapsedMs: milliseconds(started) });
      if (event.type === 'voice_timing') {
        const { turn, pipeline, stage, durationMs, elapsedMs } = event;
        assert.ok(Number.isSafeInteger(turn) && turn > 0);
        assert.ok(Number.isFinite(durationMs) && durationMs >= 0 && Number.isFinite(elapsedMs) && elapsedMs >= 0);
        timings.push({ turn, pipeline, stage, durationMs, elapsedMs });
      }
      if (['turn_complete', 'error', 'speech_unavailable'].includes(event.type)) finish(event.type);
    }
    close() { if (this.readyState !== 1) return; this.readyState = 3; this.emit('close'); }
    message(value) { this.emit('message', Buffer.from(JSON.stringify(value))); }
  }
  const socket = new SyntheticSocket();
  let deadline;
  try {
    const engine = {
      provider: 'synthetic',
      voiceTurn: async (_request, signal) => {
        calls.push('synthetic_understanding'); await delay(injectedDelaysMs.understanding, undefined, { signal });
        return { input: 'Pergunta sintética sobre uma lanterna.', reply: 'Guarde a lanterna em um local fácil de alcançar.', status: 'ok' };
      },
      models: { generateContent: async () => { throw Error('An extra text generation was not expected.'); } },
      transcribe: async () => { throw Error('An extra transcription was not expected.'); },
      speech: async () => { throw Error('Buffered speech was not expected.'); },
      speechStream: async function* (_text, signal) {
        calls.push('synthetic_speech'); await delay(injectedDelaysMs.firstSpeechChunk, undefined, { signal });
        yield Buffer.alloc(4800);
        await delay(injectedDelaysMs.secondSpeechChunk, undefined, { signal }); yield Buffer.alloc(4800);
      },
    };
    connectRealVoice(socket, engine, 'Synthetic adult educational fixture.', { streamSpeech: true });
    const pcm = Buffer.alloc(200 * 32);
    for (let offset = 0; offset < pcm.length; offset += 2) pcm.writeInt16LE(Math.round(Math.sin(offset / 2 * Math.PI / 40) * 3000), offset);
    started = performance.now();
    for (let offset = 0; offset < pcm.length; offset += 3200) socket.message({ type: 'realtime_audio', pcmBase64: pcm.subarray(offset, offset + 3200).toString('base64') });
    socket.message({ type: 'audio_stream_end' });
    const result = await Promise.race([completed, new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(Error('Synthetic diagnostic timed out.')), 3000); })]);
    assert.equal(result, 'turn_complete');
    assert.deepEqual(calls, ['synthetic_understanding', 'synthetic_speech']);
    const first = type => events.find(event => event.type === type)?.elapsedMs ?? null;
    assert.ok(first('output_transcription') !== null && first('audio_chunk') >= first('output_transcription'));
    const report = {
      mode: 'synthetic-offline', observedAt: new Date().toISOString(), status: 'completed', injectedDelaysMs,
      networkRequests: 0, syntheticInputDurationMs: 200, explicitInputEnd: true,
      observedPipelineMs: { checkedText: first('output_transcription'), firstPcm: first('audio_chunk'), serverTurnComplete: first('turn_complete') },
      providerCalls: calls, serverTimingEvents: timings,
      limitations: [
        'All provider delays and responses are artificial; these are not Gemini or public-site latency measurements.',
        'Input is a synthetic tone and ends explicitly. No speech-recognition quality, VAD wall-clock delay or microphone is measured.',
        'First PCM is server output, not audible playback. No browser, AudioContext or device is used.',
      ],
    };
    saveReport('latency-synthetic', report);
    return report;
  } finally { clearTimeout(deadline); socket.close(); globalThis.fetch = previousFetch; }
}

async function readBounded(response, maximumBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw Error('Diagnostic response exceeded its fixed size limit.');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } finally { await reader.cancel().catch(() => {}); }
}

async function observePublicPath(origin, route) {
  const started = performance.now();
  const observation = { path: route, method: 'GET' };
  try {
    const response = await fetch(origin + route, {
      method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store',
      headers: { Accept: route === '/api/status' ? 'application/json' : 'text/html' }, signal: AbortSignal.timeout(60000),
    });
    observation.headersMs = milliseconds(started);
    observation.status = response.status;
    observation.contentType = response.headers.get('content-type');
    observation.serverTiming = response.headers.get('server-timing');
    const body = await readBounded(response, route === '/api/status' ? 65536 : 1048576);
    observation.totalMs = milliseconds(started); observation.bytes = body.length;
    if (route === '/' && response.ok) {
      observation.frontendEntry = body.toString('utf8').match(/<script[^>]*\bsrc=["'](\/assets\/[^"']+\.js)["']/)?.[1] ?? null;
    }
    if (route === '/api/status' && response.ok) {
      const status = JSON.parse(body.toString('utf8'));
      observation.runtime = {
        demo: status.demo === true, realAI: status.realAI === true, audience: typeof status.audience === 'string' ? status.audience : null,
        provider: typeof status.ai?.provider === 'string' ? status.ai.provider : null,
        mode: typeof status.ai?.mode === 'string' ? status.ai.mode : null, voice: status.ai?.voice === true, blocked: !!status.ai?.blocked,
      };
    }
  } catch (error) {
    observation.totalMs = milliseconds(started);
    observation.failure = ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'request_or_response_failure';
    if (typeof error.cause?.code === 'string' && /^[A-Z_]+$/.test(error.cause.code)) observation.networkCode = error.cause.code;
  }
  return observation;
}

async function publicReadonly(origin) {
  assert.ok(publicOrigins.has(origin), 'Use an exact approved HTTPS origin, without a trailing slash or another path.');
  const observations = [];
  // Serial and one-shot. This intentionally measures the actual observed order;
  // the page request can wake a sleeping backend before the status request.
  for (const route of ['/', '/api/status']) observations.push(await observePublicPath(origin, route));
  const report = {
    mode: 'public-readonly', observedAt: new Date().toISOString(), origin, observations,
    requestsAttempted: 2, credentialUse: false, providerCalls: 0,
    limitations: [
      'One observation per path; no retries, background warming, login, account data, AI generation or WebSocket connection.',
      'A slow first request is not proof of a cold start. No uptime or deployment state is inferred.',
      'This observes the published version, not unpublished workspace changes. It cannot measure answer quality or audible voice.',
      'The page request precedes the status request and can affect server availability. These observations are not a controlled host comparison.',
    ],
  };
  saveReport('public-readonly-' + publicOrigins.get(origin), report);
  return report;
}

async function main(arguments_) {
  if (arguments_.length === 0 || (arguments_.length === 1 && arguments_[0] === '--help')) {
    console.log(JSON.stringify({ mode: 'offline-plan', networkRequests: 0, usage: [
      'node tests/conversation-latency-review.cjs --simulate',
      ...[...publicOrigins.keys()].map(origin => 'node tests/conversation-latency-review.cjs --public-readonly ' + origin),
    ], note: 'No benchmark runs automatically. Public mode only reads the page and public API status.' }, null, 2));
    return;
  }
  if (arguments_.length === 1 && arguments_[0] === '--simulate') return simulate();
  if (arguments_.length === 2 && arguments_[0] === '--public-readonly') return publicReadonly(arguments_[1]);
  throw Error('Unsupported diagnostic arguments. Run without flags to inspect the offline plan.');
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main, publicReadonly, simulate };
