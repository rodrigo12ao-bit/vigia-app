const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { resolvePublicTestOrigin, expectedVoiceSocketOrigin } = require('./browser-target.cjs');

// Run only with explicit authorization for the existing, verified free Google project.
// Capture is a synthetic adult WAV injected into a virtual MediaStreamDestination.
// The physical microphone is never requested; Gemini STT/chat/TTS and Web Audio playback are real.
const configuredUrl = process.env.VIGIA_TEST_URL;
const publicUrl = resolvePublicTestOrigin(configuredUrl);
const online = !!configuredUrl || process.argv.includes('--online');
if (online && process.argv.includes('--local')) throw Error('Escolha somente --local ou um destino online.');
const root = online ? publicUrl : 'http://localhost:3119';
const expectedVoiceOrigin = expectedVoiceSocketOrigin(root);
const runLabel = process.env.VIGIA_CONTINUITY_LABEL || '';
if (runLabel && !/^[a-zA-Z0-9_-]{1,40}$/.test(runLabel)) throw Error('Rótulo de teste inválido.');
const audible = process.argv.includes('--audible');
const mobile = process.argv.includes('--mobile');
const prefix = 'gemini-google-continuity-' + (online ? 'online' : 'local') + (mobile ? '-mobile' : '') + (runLabel ? '-' + runLabel : '');
const expectedQuestions = [
  'Onde devo guardar a lanterna na mochila de emergência?',
  'E as pilhas dela?',
  'Como eu confiro se elas ainda funcionam?',
];
const report = {
  url: root,
  expectedVoiceOrigin,
  scope: 'Três falas adultas sintéticas locais, captura virtual MediaStreamDestination sem acesso ao microfone físico; transcrição, respostas e voz Google reais da cota gratuita; reprodução Web Audio real' + (audible ? ', saída audível.' : ', saída silenciada no teste.') + ' Não avalia qualidade por audição humana nem eco de alto-falante físico.',
  runLabel: runLabel || null,
  viewport: mobile ? '390x844, Chrome com celular emulado' : '1280x900, Chrome desktop',
  maxAllowedChunkGapMs: 150,
  turns: [],
};
let browser, page, server, temporaryDirectory;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync('artifacts', { recursive: true });

function readWave(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let format, pcm;
  for (let position = 12; position + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(position + 4), start = position + 8;
    assert.ok(start + length <= bytes.length, 'WAV sintético incompleto.');
    const type = bytes.toString('ascii', position, position + 4);
    if (type === 'fmt ') format = { encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), rate: bytes.readUInt32LE(start + 4), bits: bytes.readUInt16LE(start + 14) };
    if (type === 'data') pcm = bytes.subarray(start, start + length);
    position = start + length + length % 2;
  }
  assert.ok(format && pcm?.length, 'WAV sem formato ou fala sintética.');
  assert.equal(format.encoding, 1); assert.equal(format.channels, 1); assert.equal(format.bits, 16);
  assert.equal(format.rate, 16000); assert.equal(pcm.length % 2, 0);
  return { pcmBase64: pcm.toString('base64'), sampleRate: format.rate, samples: pcm.length / 2 };
}

async function button(text) {
  await page.waitForFunction(value => Array.from(document.querySelectorAll('button')).some(element => element.textContent.trim() === value && element.getClientRects().length && !element.disabled), { timeout: 30000 }, text);
  await page.evaluate(value => Array.from(document.querySelectorAll('button')).find(element => element.textContent.trim() === value && element.getClientRects().length && !element.disabled).click(), text);
}

async function readyForSpeech(completedTurns) {
  await page.waitForFunction(expected => {
    const events = window.continuityEvents;
    if (events.some(event => ['error', 'speech_unavailable', 'interrupted', 'close', 'socket_close', 'socket_error'].includes(event.type))) return true;
    const naturalSources = window.continuityOutputSources.every(source => source.ended && source.stopCalls === 0);
    const tracks = window.continuityCaptureStreams.flatMap(stream => stream.getAudioTracks());
    return events.filter(event => event.type === 'turn_complete').length === expected &&
      window.continuitySent.filter(event => event.type === 'playback_ended').length >= expected &&
      naturalSources && tracks.length === 1 && tracks[0].enabled && tracks[0].readyState === 'live' &&
      document.body.innerText.includes('Pode falar!') &&
      !!document.querySelector('[title="Pausar Conversa"]') && !document.querySelector('[title="Interromper fala"]');
  }, { timeout: 120000 }, completedTurns);
  const events = await page.evaluate(() => window.continuityEvents);
  const failure = events.find(event => ['error', 'speech_unavailable', 'interrupted', 'close', 'socket_close', 'socket_error'].includes(event.type));
  assert.equal(failure, undefined, failure ? 'A sessão não voltou à escuta: ' + (failure.message || failure.type) : undefined);
  // Absorb a delayed browser callback or a stray packet before feeding another question.
  await wait(250);
  assert.ok(await page.evaluate(() => window.continuityOutputSources.every(source => source.ended && source.stopCalls === 0)));
  assert.equal(await page.evaluate(() => window.continuityCaptureCalls), 1, 'Somente uma captura deve controlar a sessão.');
}

function summarizeTurn(snapshot, number) {
  const events = snapshot.events.filter(event => event.turn === number);
  const sources = snapshot.sources.filter(source => source.turn === number);
  const input = events.filter(event => event.type === 'input_transcription').at(-1)?.text;
  const reply = events.filter(event => event.type === 'output_transcription').map(event => event.text || '').join('');
  const chunks = events.filter(event => event.type === 'audio_chunk');
  const receivedBytes = chunks.reduce((sum, event) => sum + event.bytes, 0);
  assert.ok(input && reply, 'O turno deve conter transcrição e resposta reais completas.');
  assert.equal(events.filter(event => event.type === 'reply_ready').length, 1);
  assert.equal(events.filter(event => event.type === 'turn_complete').length, 1);
  assert.ok(chunks.length > 0 && sources.length > 0, 'Cada resposta precisa ter voz Google e reprodução real.');
  assert.ok(sources.every(source => source.ended && source.stopCalls === 0), 'Toda fonte de áudio deve terminar naturalmente, sem corte.');
  assert.equal(sources.reduce((sum, source) => sum + source.samples, 0) * 2, receivedBytes,
    'Todos os bytes PCM recebidos devem ser agendados e reproduzidos uma vez.');
  const ordered = [...sources].sort((left, right) => left.scheduledAt - right.scheduledAt);
  assert.equal(new Set(sources.map(source => source.contextId)).size, 1,
    'As partes de um turno devem compartilhar o mesmo relógio de reprodução.');
  assert.ok(sources.every(source => source.startSucceeded && source.offset === 0 && source.playedSamples === source.samples),
    'Cada buffer recebido deve ser iniciado integralmente, sem omitir trechos.');
  const inputStart = snapshot.inputSources.find(source => source.number === number)?.startedMs;
  assert.ok(Number.isFinite(inputStart) && sources.every(source => source.startedMs >= inputStart),
    'A resposta não pode começar antes de injetar a fala sintética daquele turno.');
  let maximumGap = 0;
  for (let index = 1; index < ordered.length; index++) maximumGap = Math.max(maximumGap, ordered[index].scheduledAt - ordered[index - 1].scheduledEnd);
  assert.ok(maximumGap <= 0.15, 'Intervalo artificial entre partes de áudio: ' + Math.round(maximumGap * 1000) + ' ms.');
  const processing = events.find(event => event.type === 'processing')?.ms;
  const firstAudio = chunks[0]?.ms;
  return { number, input, reply, audioChunks: chunks.length, receivedPcmBytes: receivedBytes,
    playbackSources: sources.length, naturalEnds: sources.filter(source => source.ended && !source.stopCalls).length,
    playbackSeconds: sources.reduce((sum, source) => sum + source.duration, 0),
    maxScheduledGapMs: Math.round(maximumGap * 1000), processingToFirstAudioMs: firstAudio - processing,
    inputStartMs: inputStart, playbackEndMs: Math.max(...sources.map(source => source.endedMs)) };
}

(async () => {
  try {
    if (!online) {
      server = spawn(process.execPath, ['--use-system-ca', 'dist/presentation/server/server.cjs'], { env: require('../scripts/gemini-env.cjs').geminiEnv('3119'), windowsHide: true, stdio: 'ignore' });
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        assert.equal(server.exitCode, null);
        try { if ((await fetch(root + '/api/status')).ok) { ready = true; break; } } catch {}
        await wait(100);
      }
      assert.ok(ready, 'O servidor isolado não iniciou.');
    }
    const status = await (await fetch(root + '/api/status')).json();
    assert.equal(status.demo, false); assert.equal(status.ai?.provider, 'gemini'); assert.equal(status.audience, '18plus');

    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vigia-google-continuity-'));
    const utterances = expectedQuestions.map((text, index) => {
      const file = path.join(temporaryDirectory, 'adult-turn-' + (index + 1) + '.wav');
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/local-speech.ps1')], {
        input: JSON.stringify({ text, path: file }), encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'],
      });
      return readWave(file);
    });
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true,
      args: ['--no-sandbox', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required', ...(!audible ? ['--mute-audio'] : [])] });
    page = await browser.newPage(); page.on('dialog', dialog => dialog.accept());
    const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
    await page.evaluateOnNewDocument(expectedVoiceOrigin => {
      window.continuityTurn = 0; window.continuityEvents = []; window.continuitySent = [];
      window.continuityVoiceSockets = [];
      window.continuityOutputSources = []; window.continuityCaptureCalls = 0; window.continuityCaptureStreams = [];
      window.continuityInputSources = []; window.continuityMicContexts = new WeakSet();
      window.continuityOutputContexts = new WeakMap(); window.continuityOutputContextCount = 0;
      const NativeWS = WebSocket;
      window.WebSocket = class extends NativeWS {
        constructor(...args) {
          const url = new URL(String(args[0]), location.href), isVoice = url.pathname === '/api/live-ws';
          if (isVoice && url.origin !== expectedVoiceOrigin) throw Error('Destino de voz diferente do backend autorizado.');
          super(...args);
          if (!isVoice) return;
          window.continuityVoiceSockets.push(url.origin + url.pathname);
          this.addEventListener('message', event => {
            try {
              const body = JSON.parse(event.data);
              window.continuityEvents.push({ turn: window.continuityTurn, type: body.type, text: body.text, message: body.message,
                bytes: body.type === 'audio_chunk' ? atob(body.pcmBase64).length : undefined, ms: Math.round(performance.now()) });
            } catch {}
          });
          this.addEventListener('close', event => window.continuityEvents.push({ turn: window.continuityTurn, type: 'socket_close', code: event.code, ms: Math.round(performance.now()) }));
          this.addEventListener('error', () => window.continuityEvents.push({ turn: window.continuityTurn, type: 'socket_error', ms: Math.round(performance.now()) }));
        }
        send(raw) {
          try { const body = JSON.parse(raw); if (body.type !== 'realtime_audio') window.continuitySent.push({ turn: window.continuityTurn, type: body.type, ms: Math.round(performance.now()) }); } catch {}
          return super.send(raw);
        }
      };
      const createSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = createSource.apply(this, args);
        if (window.continuityMicContexts.has(this)) return source;
        const context = this, start = source.start, stop = source.stop;
        if (!window.continuityOutputContexts.has(context)) window.continuityOutputContexts.set(context, ++window.continuityOutputContextCount);
        let record;
        source.start = function (...parameters) {
          const scheduledAt = Math.max(context.currentTime, parameters[0] ?? 0);
          const offset = parameters[1] ?? 0;
          const actualDuration = Math.min(Math.max(0, (source.buffer?.duration || 0) - offset), parameters[2] ?? Infinity);
          record = { turn: window.continuityTurn, samples: source.buffer?.length || 0, duration: source.buffer?.duration || 0,
            sampleRate: source.buffer?.sampleRate, scheduledAt, scheduledEnd: scheduledAt + actualDuration, offset,
            playedSamples: Math.round(actualDuration * (source.buffer?.sampleRate || 0)), contextId: window.continuityOutputContexts.get(context),
            contextTimeAtStart: context.currentTime, startedMs: Math.round(performance.now()), ended: false, stopCalls: 0, startSucceeded: false };
          window.continuityOutputSources.push(record);
          const result = start.apply(source, parameters); record.startSucceeded = true; return result;
        };
        source.stop = function (...parameters) { if (record) record.stopCalls++; return stop.apply(source, parameters); };
        // Observe with an event listener; leave the application's onended callback intact.
        source.addEventListener('ended', () => { if (record) { record.ended = true; record.endedMs = Math.round(performance.now()); } });
        return source;
      };
      // This replacement never calls the native getUserMedia implementation.
      navigator.mediaDevices.getUserMedia = async options => {
        if (!options?.audio || options.video) throw Error('Somente a entrada adulta sintética é permitida neste teste.');
        window.continuityCaptureCalls++;
        if (!window.continuityMic) {
          const context = new AudioContext({ sampleRate: 16000 });
          window.continuityMicContexts.add(context);
          const destination = context.createMediaStreamDestination(), silence = context.createConstantSource();
          silence.offset.value = 0; silence.connect(destination); silence.start();
          window.continuityMic = { context, destination, silence };
        }
        await window.continuityMic.context.resume();
        const stream = window.continuityMic.destination.stream.clone();
        window.continuityCaptureStreams.push(stream);
        return stream;
      };
      window.feedContinuityUtterance = async ({ pcmBase64, sampleRate, number }) => {
        const { context, destination } = window.continuityMic;
        window.continuityTurn = number;
        const binary = atob(pcmBase64), bytes = new Uint8Array(binary.length);
        for (let index = 0; index < bytes.length; index++) bytes[index] = binary.charCodeAt(index);
        const view = new DataView(bytes.buffer), buffer = context.createBuffer(1, bytes.length / 2, sampleRate);
        const values = buffer.getChannelData(0);
        for (let index = 0; index < values.length; index++) { const value = view.getInt16(index * 2, true); values[index] = value / (value < 0 ? 32768 : 32767); }
        const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
        const record = { source, number, duration: buffer.duration, startedMs: Math.round(performance.now()), ended: false };
        window.continuityInputSources.push(record);
        await context.resume();
        await new Promise(resolve => { source.addEventListener('ended', () => { record.ended = true; source.disconnect(); resolve(); }, { once: true }); source.start(); });
      };
      window.closeContinuityMic = async () => {
        for (const record of window.continuityInputSources) if (!record.ended) { try { record.source.stop(); } catch {} }
        for (const stream of window.continuityCaptureStreams) stream.getTracks().forEach(track => track.stop());
        if (window.continuityMic) {
          try { window.continuityMic.silence.stop(); } catch {}
          window.continuityMic.destination.stream.getTracks().forEach(track => track.stop());
          await window.continuityMic.context.close().catch(() => {});
        }
      };
    }, expectedVoiceOrigin);
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[aria-label="Acesso para adultos"]'); await page.click('input[type="checkbox"]'); await button('Continuar');
    await page.waitForSelector('[aria-label="Boas-vindas à Vigia"]'); await button('Explorar como visitante');
    await page.waitForSelector('[aria-label="Progresso da aventura"]', { timeout: 60000 });
    await page.click('[title="Conversa & Voz"]');
    await page.waitForSelector('[aria-label="Conversa por voz"]', { visible: true, timeout: 60000 });
    await page.evaluate(() => { window.continuityVoiceClickMs = Math.round(performance.now()); });
    await page.click('[aria-label="Conversa por voz"]');
    await readyForSpeech(0);
    assert.deepEqual(await page.evaluate(() => window.continuityVoiceSockets), [expectedVoiceOrigin + '/api/live-ws']);
    for (let index = 0; index < utterances.length; index++) {
      await readyForSpeech(index);
      await page.evaluate(utterance => window.feedContinuityUtterance(utterance), { ...utterances[index], number: index + 1 });
      await readyForSpeech(index + 1);
      const snapshot = await page.evaluate(() => ({ events: window.continuityEvents, sources: window.continuityOutputSources,
        inputSources: window.continuityInputSources.map(source => ({ number: source.number, startedMs: source.startedMs })) }));
      const turn = summarizeTurn(snapshot, index + 1);
      if (index === 0) assert.match(turn.input, /lanterna|mochila/i);
      if (index === 1) { assert.match(turn.input, /pilhas/i); assert.match(turn.reply, /pilhas|bater|reserv|lanterna/i); }
      if (index === 2) { assert.match(turn.input, /confir|funcion/i); assert.match(turn.reply, /pilhas|bater|carga|test|validade|lanterna|funcion|verifi/i); }
      report.turns.push(turn);
      console.log('PASS Google turn ' + (index + 1) + ': complete playback, listening restored');
    }
    assert.equal(report.turns.length, 3);
    report.events = await page.evaluate(() => window.continuityEvents);
    report.voiceSockets = await page.evaluate(() => window.continuityVoiceSockets);
    report.sent = await page.evaluate(() => window.continuitySent);
    report.playbackSources = await page.evaluate(() => window.continuityOutputSources);
    report.inputSources = await page.evaluate(() => window.continuityInputSources.map(source => ({ number: source.number, duration: source.duration, startedMs: source.startedMs, ended: source.ended })));
    report.voiceClickMs = await page.evaluate(() => window.continuityVoiceClickMs);
    assert.ok(report.playbackSources.every(source => source.turn >= 1 && source.turn <= 3 && source.startedMs >= report.voiceClickMs),
      'Nenhuma resposta de voz deve iniciar antes do clique que abre a conversa ou fora dos três turnos.');
    assert.equal(report.events.some(event => ['error', 'speech_unavailable', 'interrupted', 'speech_on_device'].includes(event.type)), false);
    assert.equal(await page.evaluate(() => window.continuityCaptureCalls), 1);
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: 'artifacts/' + prefix + '.png', fullPage: true });
    await page.click('[title="Encerrar"]'); await button('Sim, encerrar'); await page.waitForSelector('textarea');
    await page.waitForFunction(() => Object.values(window.VigiaTelemetry.resources).every(resource => resource.activeNow === 0) && window.continuityCaptureStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')), { timeout: 10000 });
    await page.waitForFunction(turns => JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]').some(session => turns.every(turn => session.messages.filter(message => message.content === turn.input).length === 1 && session.messages.filter(message => message.content === turn.reply).length === 1)), { timeout: 10000 }, report.turns);
    await page.evaluate(() => window.closeContinuityMic());
    report.syntheticCaptureClosed = await page.evaluate(() => window.continuityMic.context.state === 'closed' && window.continuityMic.destination.stream.getTracks().every(track => track.readyState === 'ended'));
    assert.equal(report.syntheticCaptureClosed, true, 'A fonte virtual do teste também deve ser encerrada.');
    report.captureCalls = 1; report.status = 'passed';
    console.log('PASS three-turn real Google conversation, natural playback endings, history and cleanup');
  } catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1; console.error(error.message);
    if (page) {
      const snapshot = await page.evaluate(() => ({ events: window.continuityEvents, sent: window.continuitySent, playbackSources: window.continuityOutputSources,
        captureCalls: window.continuityCaptureCalls, tracks: window.continuityCaptureStreams?.flatMap(stream => stream.getTracks().map(track => ({ enabled: track.enabled, state: track.readyState }))) })).catch(() => ({}));
      Object.assign(report, snapshot);
      await page.screenshot({ path: 'artifacts/' + prefix + '-failure.png', fullPage: true }).catch(() => {});
      fs.writeFileSync('artifacts/' + prefix + '-failure.txt', await page.$eval('body', element => element.innerText).catch(() => ''));
    }
  } finally {
    await page?.evaluate(() => window.closeContinuityMic?.()).catch(() => {});
    fs.writeFileSync('artifacts/' + prefix + '.json', JSON.stringify(report, null, 2));
    if (browser) {
      let deadline;
      try { await Promise.race([browser.close(), new Promise(resolve => deadline = setTimeout(resolve, 10000))]); }
      finally { clearTimeout(deadline); if (browser.process()?.exitCode === null) browser.process().kill(); }
    }
    server?.kill();
    if (temporaryDirectory) {
      const temporaryRoot = fs.realpathSync(os.tmpdir()), resolved = fs.realpathSync(temporaryDirectory);
      if (!resolved.startsWith(temporaryRoot + path.sep) || !path.basename(resolved).startsWith('vigia-google-continuity-')) throw Error('Diretório temporário fora do escopo do teste.');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
})();
