const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { geminiEnv } = require('../scripts/gemini-env.cjs');

// Everything that could send personal data or invoke AI is simulated here.
// This verifies browser lifecycle and device-voice consent, not real acoustics.
const online = process.env.VIGIA_TEST_URL === 'https://vigia-app.onrender.com';
if (process.env.VIGIA_TEST_URL && !online) throw Error('Endereço externo não autorizado.');
const root = online ? process.env.VIGIA_TEST_URL : 'http://localhost:3117';
const prefix = online ? 'voice-device-online' : 'voice-device';
const report = { url: root, scope: 'Chrome desktop/celular emulado; IA, WebSocket, microfone, síntese e login Firebase simulados. Sem IA real, dados pessoais ou gravações no Firebase.', results: [] };
const server = online ? null : spawn(process.execPath, ['--use-system-ca', 'dist/presentation/server/server.cjs'], { env: geminiEnv('3117'), windowsHide: true, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const seed = { id: 'device-history-fixture', title: 'Histórico fictício da voz', createdAt: '2026-10-14T12:00:00.000Z', updatedAt: '2026-10-14T12:00:00.000Z', lastMessagePreview: 'Resposta anterior fictícia.', messages: [
  { id: 'device-seed-user', role: 'user', content: 'Pergunta anterior fictícia.', timestamp: '2026-10-14T12:00:00.000Z' },
  { id: 'device-seed-reply', role: 'assistant', content: 'Resposta anterior fictícia.', timestamp: '2026-10-14T12:00:00.000Z' },
] };
let browser, page, label, stage;
fs.mkdirSync('artifacts', { recursive: true });

async function button(text) {
  await page.waitForFunction(value => Array.from(document.querySelectorAll('button')).some(element => element.textContent.trim() === value && element.getClientRects().length && !element.disabled), { timeout: 10000 }, text);
  await page.evaluate(value => Array.from(document.querySelectorAll('button')).find(element => element.textContent.trim() === value && element.getClientRects().length && !element.disabled).click(), text);
}
async function emit(messages, index) {
  await page.evaluate(({ messages, index }) => messages.forEach(message => (index === undefined ? window.deviceSockets.at(-1) : window.deviceSockets[index]).emit(message)), { messages, index });
}
async function newVoice() {
  stage='new-voice:wait-confirmation-exit';
  // The text view is mounted before the animated end-call overlay is removed.
  // A human cannot click the conversation controls until that overlay is gone.
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(element=>element.textContent.trim()==='Sim, encerrar'&&element.getClientRects().length),{timeout:10000});
  await page.waitForSelector('[title="Iniciar uma nova conversa"]');
  stage='new-voice:reset-conversation';
  await page.click('[title="Iniciar uma nova conversa"]');
  stage='new-voice:wait-visible-reset';
  await page.waitForFunction(()=>{
    const messages=Array.from(document.querySelectorAll('p.learning-copy')).filter(element=>element.getClientRects().length);
    return !!document.querySelector('textarea')&&messages.length===1&&messages[0].textContent.trim()==='Conversa com a Vigia reiniciada! Qual dúvida sobre prevenção você gostaria de tirar agora?';
  },{timeout:10000});
  const count = await page.evaluate(() => window.deviceSockets.length);
  await page.waitForSelector('[aria-label="Conversa por voz"]', { visible: true, timeout: 30000 });
  stage='new-voice:select-voice';
  await page.click('[aria-label="Conversa por voz"]');
  stage='new-voice:wait-capture';
  await page.waitForFunction(count => window.deviceSockets.length === count + 1 && window.deviceTracks.some(track => track.readyState === 'live' && track.enabled), { timeout: 10000 }, count);
  return count;
}
async function checkedReply(input, reply, extra = []) {
  await emit([{ type: 'input_transcription', text: input }, { type: 'output_transcription', text: reply }, { type: 'reply_ready' }, ...extra]);
}
async function unavailable(input, reply) {
  await checkedReply(input, reply, [{ type: 'speech_unavailable', code: 'quota', message: 'Síntese da IA indisponível nesta simulação.', retryAfterMs: 0 }, { type: 'turn_complete' }]);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(element => element.textContent.trim() === 'Usar voz do aparelho'));
}
async function chooseDevice() {
  const count = await page.evaluate(() => window.deviceSpeech.length);
  await button('Usar voz do aparelho');
  await page.waitForFunction(count => window.deviceSpeech.length > count, { timeout: 10000 }, count);
  return count;
}
async function resumeCount(index) {
  return page.evaluate(index => window.deviceSockets[index].sent.filter(message => message.type === 'resume_input').length, index);
}
async function finishSpeech(index) {
  await page.evaluate(index => window.finishDeviceSpeech(index), index);
}
async function assertCapturePaused() {
  await page.waitForFunction(() => window.deviceTracks.filter(track => track.readyState === 'live').every(track => !track.enabled));
  const frames = await page.evaluate(() => window.deviceFrames);
  await wait(180);
  assert.equal(await page.evaluate(() => window.deviceFrames), frames, 'O microfone não pode enviar áudio durante a leitura do aparelho.');
  assert.ok(await page.evaluate(() => !document.body.innerText.includes('Pode falar!')),
    'A interface não deve anunciar escuta ativa enquanto a captura está pausada.');
}
async function assertActive() {
  await page.waitForFunction(() => {
    const live = window.deviceTracks.filter(track => track.readyState === 'live');
    return live.length === 1 && live[0].enabled;
  });
}
async function assertClean() {
  await page.waitForFunction(() => Object.values(window.VigiaTelemetry.resources).every(resource => resource.activeNow === 0), { timeout: 10000 });
  assert.ok(await page.evaluate(() => window.deviceTracks.every(track => track.readyState === 'ended') && window.deviceSockets.every(socket => socket.readyState === 3)));
}
async function assertSaved(input, reply) {
  await page.waitForFunction(({ input, reply }) => JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]').some(session => session.messages.filter(message => message.content === input).length === 1 && session.messages.filter(message => message.content === reply).length === 1), { timeout: 10000 }, { input, reply });
}
function passed(name) { report.results.push({ name: label + ': ' + name, status: 'passed' }); stage = undefined; }

(async () => {
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server) assert.equal(server.exitCode, null);
      try { if ((await fetch(root + '/api/status')).ok) { ready = true; break; } } catch {}
      await wait(100);
    }
    assert.ok(ready, 'Servidor indisponível.');
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, args: ['--no-sandbox', '--disable-background-networking', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    for (const mobile of [false, true]) {
      label = mobile ? 'celular' : 'desktop';
      const context = await browser.createBrowserContext();
      page = await context.newPage();
      let allowDeviceConsent = true;
      const deviceConsent = [], remoteWrites = [], errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => {
        if (dialog.message().includes('fabricante')) {
          deviceConsent.push(dialog.message());
          return void (allowDeviceConsent ? dialog.accept() : dialog.dismiss());
        }
        void dialog.accept();
      });
      await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
      const uid = 'device-voice-fictitious-adult';
      const email = 'device-voice-fictitious-adult@example.invalid';
      const now = Math.floor(Date.now() / 1000);
      const jwt = [ { alg: 'none', typ: 'JWT' }, { iss: 'https://securetoken.google.com/demo-vigia', aud: 'demo-vigia', auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, email, email_verified: true, firebase: { identities: { email: [email] }, sign_in_provider: 'password' } } ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.';
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = new URL(request.url());
        const headers = { 'access-control-allow-origin': root, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'content-type,x-client-version,x-firebase-gmpid,authorization' };
        const respond = body => request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname.includes('identitytoolkit') || url.hostname === 'identitytoolkit.googleapis.com') {
          if (request.method() === 'OPTIONS') return void respond({});
          if (url.pathname.includes('accounts:signInWithPassword')) return void respond({ kind: 'identitytoolkit#VerifyPasswordResponse', localId: uid, email, displayName: 'Adulto fictício', idToken: jwt, registered: true, refreshToken: 'simulated-refresh-token', expiresIn: '3600' });
          if (url.pathname.includes('accounts:lookup')) return void respond({ users: [{ localId: uid, email, emailVerified: true, displayName: 'Adulto fictício', providerUserInfo: [{ providerId: 'password', email, federatedId: email, rawId: email }], createdAt: String(now * 1000), lastLoginAt: String(now * 1000) }] });
          return void respond({});
        }
        if (['/api/session', '/api/adult-access'].includes(url.pathname)) return void respond({ ok: true });
        if (url.pathname === '/api/ai-access') return void respond({ allowed: true, voice: true, blocked: null });
        if (url.pathname === '/api/live-ticket') return void respond({ ticket: 'simulated-device-ticket' });
        if (url.pathname === '/api/sala/profile') return void respond({ uid, nickname: 'Adulto fictício', role: 'infantil' });
        // Auth change initializes this read-like POST; do not touch the real account database.
        if (url.pathname === '/api/learning/adventure') return void respond({ ok: true });
        if (url.hostname === 'firestore.googleapis.com' || url.hostname.endsWith('.firebaseio.com') || (url.hostname === '127.0.0.1' && url.port === '8080')) {
          remoteWrites.push('blocked-database:' + request.method());
          return void request.abort();
        }
        if (url.origin === root && url.pathname.startsWith('/api/') && request.method() !== 'GET') {
          remoteWrites.push('blocked-api:' + url.pathname);
          return void request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Endpoint externo bloqueado pelo teste de interface.' }) });
        }
        void request.continue();
      });
      await page.evaluateOnNewDocument(seed => {
        localStorage.setItem('vigia_guest_chat_sessions_v1', JSON.stringify([seed]));
        window.deviceSockets = []; window.deviceTracks = []; window.deviceFrames = 0; window.deviceSpeech = []; window.deviceCancels = 0;
        const NativeWS = window.WebSocket;
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await capture(...args); window.deviceTracks.push(...stream.getTracks()); return stream; };
        window.WebSocket = class {
          static OPEN = 1;
          readyState = 1; bufferedAmount = 0; sent = [];
          constructor(url) {
            if (!String(url).includes('/api/live-ws')) return new NativeWS(url);
            window.deviceSockets.push(this);
            setTimeout(() => { this.onopen?.(); this.emit({ type: 'open', mode: 'streamed-speech' }); }, 20);
          }
          emit(message) { this.oldHandler = this.onmessage || this.oldHandler; this.oldHandler?.({ data: JSON.stringify(message) }); }
          send(data) { const message = JSON.parse(data); this.sent.push(message); if (message.type === 'realtime_audio') window.deviceFrames++; if (message.type === 'speech_output') setTimeout(() => this.emit({ type: 'speech_output', mode: message.mode }), 0); if (message.type === 'interrupt') setTimeout(() => this.emit({ type: 'interrupted' }), 0); }
          close() { this.readyState = 3; this.onclose?.(); }
        };
        Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(text) { this.text = text; } } });
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
          cancel() { window.deviceCancels++; },
          getVoices() { return [{ name: 'Voz fictícia do aparelho', lang: 'pt-BR', localService: true }]; },
          addEventListener() {}, removeEventListener() {},
          speak(utterance) {
            const record = { text: utterance.text, utterance, end: utterance.onend, error: utterance.onerror,
              tracksPaused: window.deviceTracks.filter(track => track.readyState === 'live').every(track => !track.enabled),
              socketOpen: window.deviceSockets.at(-1)?.readyState === 1 };
            window.deviceSpeech.push(record);
            setTimeout(() => utterance.onstart?.(), 0);
          },
        } });
        window.finishDeviceSpeech = index => window.deviceSpeech[index].end?.();
        window.failDeviceSpeech = index => window.deviceSpeech[index].error?.({ error: 'synthesis-failed' });
      }, seed);
      await page.goto(root, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[aria-label="Acesso para adultos"]'); await page.click('input[type="checkbox"]'); await button('Continuar');
      await page.waitForSelector('[aria-label="Boas-vindas à Vigia"]'); await button('Explorar como visitante');
      await page.click('[title="Conversa & Voz"]'); await page.waitForSelector('textarea');

      let socket = await newVoice();
      await emit([{ type: 'input_transcription', text: 'Pergunta parcial fictícia.' }, { type: 'output_transcription', text: 'Texto parcial não verificado' }, { type: 'speech_unavailable', code: 'quota', message: 'Falha fictícia antes da verificação.', retryAfterMs: 0 }]);
      await page.waitForFunction(() => document.body.innerText.includes('Falha fictícia antes da verificação.'));
      assert.ok(await page.evaluate(() => !Array.from(document.querySelectorAll('button')).some(element => element.textContent.trim() === 'Usar voz do aparelho')));
      assert.equal(await page.evaluate(() => window.deviceSpeech.length), 0);
      passed('texto parcial não oferece nem executa leitura no aparelho');

      await button('Tentar voz novamente'); await assertActive();
      const input = 'Pergunta fictícia sobre uma mochila.';
      const reply = 'Resposta completa simulada sobre uma mochila. Confira a lanterna antes de guardar.';
      await unavailable(input, reply);
      allowDeviceConsent = false;
      await button('Usar voz do aparelho');
      assert.equal(deviceConsent.length, 1);
      assert.equal(await page.evaluate(() => window.deviceSpeech.length), 0);
      assert.equal(await page.evaluate(index => window.deviceSockets[index].sent.filter(message => message.type === 'speech_output').length, socket), 0);
      assert.equal(await page.evaluate(index => window.deviceSockets[index].readyState, socket), 1);
      await assertCapturePaused();
      passed('recusar consentimento não lê nem seleciona modo e preserva a sessão pausada');

      allowDeviceConsent = true;
      const firstSpeech = await chooseDevice();
      await page.waitForFunction(index => window.deviceSockets[index].sent.some(message => message.type === 'speech_output' && message.mode === 'device'), {}, socket);
      await assertCapturePaused();
      assert.ok(await page.evaluate(index => window.deviceSpeech[index].tracksPaused && window.deviceSpeech[index].socketOpen, firstSpeech));
      assert.equal(await page.evaluate(() => window.deviceSockets.length), socket + 1);
      await assertSaved(input, reply);
      passed('aceitar consentimento lê a resposta completa na mesma conexão e preserva o histórico');
      const beforeFinish = await resumeCount(socket);
      await finishSpeech(firstSpeech);
      await page.waitForFunction(count => window.deviceSpeech.length === count + 2, {}, firstSpeech);
      await assertCapturePaused();
      assert.equal(await resumeCount(socket), beforeFinish);
      await finishSpeech(firstSpeech + 1); await assertActive();
      assert.equal(await resumeCount(socket), beforeFinish + 1);
      assert.equal(await page.evaluate(start => window.deviceSpeech.slice(start, start + 2).map(record => record.text).join(' '), firstSpeech), reply);
      await wait(500);
      assert.equal(await page.evaluate(() => window.deviceTracks.filter(track => track.readyState === 'live').length), 1,
        'O fim da leitura não pode abrir gravadores legados paralelos à sessão de voz.');
      passed('captura fica pausada durante todos os trechos e retoma uma única vez no fim natural');

      const nextInput = 'Pergunta fictícia seguinte, com o contexto da mochila.';
      const nextReply = 'Resposta seguinte integral e simulada, mantendo o contexto da mochila.';
      const nextSpeech = await page.evaluate(() => window.deviceSpeech.length);
      await checkedReply(nextInput, nextReply, [{ type: 'speech_on_device', text: nextReply }, { type: 'turn_complete' }]);
      await page.waitForFunction(count => window.deviceSpeech.length === count + 1, {}, nextSpeech);
      await assertCapturePaused();
      assert.equal(await page.evaluate(index => window.deviceSpeech[index].text, nextSpeech), nextReply);
      await finishSpeech(nextSpeech); await assertActive();
      await assertSaved(nextInput, nextReply); await assertSaved(input, reply);
      assert.equal(await page.evaluate(() => window.deviceSockets.length), socket + 1);
      passed('próxima resposta verificada é lida automaticamente, preservando contexto e a mesma conexão');

      const processingInput = 'Pergunta fictícia pausada enquanto a resposta é preparada.';
      const processingReply = 'Resposta integral simulada após a pausa durante o preparo.';
      const processingSpeech = await page.evaluate(() => window.deviceSpeech.length);
      await emit([{ type: 'input_transcription', text: processingInput }, { type: 'processing' }]);
      await page.waitForSelector('[title="Pausar Conversa"]');
      await page.click('[title="Pausar Conversa"]'); await assertCapturePaused();
      const processingResume = await resumeCount(socket);
      await emit([{ type: 'output_transcription', text: processingReply }, { type: 'reply_ready' }, { type: 'speech_on_device', text: processingReply }, { type: 'turn_complete' }]);
      await page.waitForFunction(count => window.deviceSpeech.length === count + 1, {}, processingSpeech);
      await finishSpeech(processingSpeech); await wait(180); await assertCapturePaused();
      assert.equal(await resumeCount(socket), processingResume,
        'Terminar a leitura não pode desfazer uma pausa manual feita durante o preparo da resposta.');
      await assertSaved(processingInput, processingReply);
      await page.click('[title="Ativar Conversa"]'); await assertActive();
      passed('pausa manual durante o preparo é respeitada no fim da leitura e exige retomada explícita');

      const pauseSpeech = await page.evaluate(() => window.deviceSpeech.length);
      stage = 'pause-reading:wait-speech';
      await checkedReply('Pergunta fictícia para pausar a leitura.', 'Resposta simulada para pausar a leitura.', [{ type: 'speech_on_device', text: 'Resposta simulada para pausar a leitura.' }, { type: 'turn_complete' }]);
      await page.waitForFunction(count => window.deviceSpeech.length === count + 1, {}, pauseSpeech);
      const pauseResume = await resumeCount(socket);
      stage = 'pause-reading:click-pause';
      await page.click('[title="Pausar Conversa"]');
      stage = 'pause-reading:wait-paused'; await assertCapturePaused();
      stage = 'pause-reading:late-end';
      await finishSpeech(pauseSpeech); await wait(180);
      assert.equal(await resumeCount(socket), pauseResume);
      stage = 'pause-reading:wait-retained-pause';
      await assertCapturePaused();
      stage = 'pause-reading:click-resume'; await page.click('[title="Ativar Conversa"]');
      stage = 'pause-reading:wait-active'; await assertActive();
      assert.equal(await resumeCount(socket), pauseResume + 1);
      passed('pausar durante leitura cancela sem retomada tardia e exige ativação explícita');

      const interruptedSpeech = await page.evaluate(() => window.deviceSpeech.length);
      await checkedReply('Pergunta fictícia para interromper.', 'Resposta simulada para interromper.', [{ type: 'speech_on_device', text: 'Resposta simulada para interromper.' }, { type: 'turn_complete' }]);
      await page.waitForFunction(count => window.deviceSpeech.length === count + 1, {}, interruptedSpeech);
      const interruptedResume = await resumeCount(socket);
      await page.click('[title="Interromper fala"]'); await assertActive();
      assert.equal(await resumeCount(socket), interruptedResume + 1);
      await finishSpeech(interruptedSpeech); await wait(180);
      assert.equal(await resumeCount(socket), interruptedResume + 1);
      passed('interromper cancela a fala e retoma uma vez; callback antigo não retoma de novo');

      const muteSpeech = await page.evaluate(() => window.deviceSpeech.length);
      await checkedReply('Pergunta fictícia para silenciar.', 'Resposta simulada para silenciar.', [{ type: 'speech_on_device', text: 'Resposta simulada para silenciar.' }, { type: 'turn_complete' }]);
      await page.waitForFunction(count => window.deviceSpeech.length === count + 1, {}, muteSpeech);
      const muteResume = await resumeCount(socket);
      await page.click('[title="Silenciar"]'); await assertCapturePaused();
      await finishSpeech(muteSpeech); await wait(180);
      assert.equal(await resumeCount(socket), muteResume);
      await page.click('[title="Áudio Mutado"]');
      await assertCapturePaused();
      await page.click('[title="Ativar Conversa"]'); await assertActive();
      passed('silenciar cancela leitura sem reativar o microfone por callback atrasado');

      const errorInput = 'Pergunta fictícia para falha da síntese.';
      const errorReply = 'Resposta integral simulada, preservada mesmo quando a voz do aparelho falha.';
      const errorSpeech = await page.evaluate(() => window.deviceSpeech.length);
      await checkedReply(errorInput, errorReply, [{ type: 'speech_on_device', text: errorReply }, { type: 'turn_complete' }]);
      await page.waitForFunction(count => window.deviceSpeech.length === count + 1, {}, errorSpeech);
      const errorResume = await resumeCount(socket);
      await page.evaluate(index => window.failDeviceSpeech(index), errorSpeech);
      await assertCapturePaused(); await assertSaved(errorInput, errorReply);
      await finishSpeech(errorSpeech); await wait(180);
      assert.equal(await resumeCount(socket), errorResume);
      assert.equal(await page.evaluate(() => window.deviceSpeech.length), errorSpeech + 1);
      passed('falha da síntese preserva texto integral e não pula frase nem retoma a captura');

      socket = await newVoice();
      await unavailable('Pergunta fictícia para trocar conversa.', 'Resposta simulada antes de trocar conversa.');
      const oldSpeech = await chooseDevice();
      await page.click('[title="Iniciar uma nova conversa"]'); await page.waitForSelector('textarea'); await assertClean();
      await finishSpeech(oldSpeech); await wait(180); await assertClean();
      passed('nova conversa limpa a sessão e não retoma captura quando termina uma leitura antiga');

      socket = await newVoice();
      await unavailable('Pergunta fictícia para abrir histórico.', 'Resposta simulada antes de abrir histórico.');
      const historySpeech = await chooseDevice();
      await page.click('[title="Abrir histórico de conversas"]'); await button(seed.title); await page.waitForSelector('textarea'); await assertClean();
      await finishSpeech(historySpeech); await wait(180); await assertClean();
      assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]').find(session => session.id === id), seed.id), seed);
      passed('abrir histórico encerra leitura e ignora término tardio sem sobrescrever a conversa');

      socket = await newVoice();
      await unavailable('Pergunta fictícia para encerrar.', 'Resposta simulada antes de encerrar.');
      const endSpeech = await chooseDevice();
      await page.click('[title="Encerrar"]'); await button('Sim, encerrar'); await page.waitForSelector('textarea'); await assertClean();
      await finishSpeech(endSpeech); await wait(180); await assertClean();
      passed('encerrar cancela a leitura e libera todos os recursos sem retomada tardia');

      socket = await newVoice();
      const earlySpeech = await page.evaluate(() => window.deviceSpeech.length);
      await button('Voz do aparelho');
      await page.waitForFunction(index => window.deviceSockets[index].sent.some(message => message.type === 'speech_output' && message.mode === 'device'), {}, socket);
      assert.equal(await page.evaluate(() => window.deviceSpeech.length), earlySpeech,
        'Escolher a voz antes da primeira resposta não pode fabricar uma leitura.');
      await assertActive();
      await emit([{ type: 'input_transcription', text: 'Pergunta parcial fictícia no modo aparelho.' }, { type: 'output_transcription', text: 'Fragmento não verificado no modo aparelho' }, { type: 'speech_on_device', text: 'Fragmento não verificado no modo aparelho' }]);
      await wait(100);
      assert.equal(await page.evaluate(() => window.deviceSpeech.length), earlySpeech,
        'speech_on_device não deve permitir ler texto parcial sem reply_ready.');
      const earlyInput = 'Pergunta fictícia verificada após escolher o aparelho antes da resposta.';
      const earlyReply = 'Resposta integral simulada após a escolha prévia da voz do aparelho.';
      await checkedReply(earlyInput, earlyReply, [{ type: 'speech_on_device', text: earlyReply }, { type: 'turn_complete' }]);
      await page.waitForFunction(count => window.deviceSpeech.length === count + 1, {}, earlySpeech);
      assert.equal(await page.evaluate(index => window.deviceSpeech[index].text, earlySpeech), earlyReply);
      await finishSpeech(earlySpeech); await assertActive(); await assertSaved(earlyInput, earlyReply);
      assert.equal(await page.evaluate(() => window.deviceSockets.length), socket + 1);
      passed('seleção do aparelho antes da primeira resposta mantém sessão, rejeita fragmentos e lê só a resposta verificada');

      socket = await newVoice();
      await unavailable('Pergunta fictícia antes de mudar conta.', 'Resposta simulada exclusiva da conta visitante.');
      const accountSpeech = await chooseDevice();
      await page.click('[aria-label="Perfil (Modo Visitante)"]'); await button('Trocar Conta');
      await page.waitForSelector('[aria-label="Boas-vindas à Vigia"]'); await button('Entrar ou criar conta');
      await page.waitForSelector('[aria-label="Acessar sua conta"]');
      await page.type('[aria-label="E-mail"]', email); await page.type('[aria-label="Senha"]', 'Only-a-simulated-fixture-123!'); await button('Entrar na Conta');
      await page.waitForSelector('[aria-label="Meu Perfil"]', { timeout: 10000 }); await assertClean();
      await finishSpeech(accountSpeech); await wait(180); await assertClean();
      assert.equal(await page.evaluate(index => window.deviceSockets[index].readyState, socket), 3);
      passed('login de outra conta simulado encerra a sessão visitante e não retoma leitura/captura antiga');

      report.networkGuard ??= [];
      report.networkGuard.push({ label, blocked: remoteWrites });
      assert.ok(!remoteWrites.some(path => path.startsWith('blocked-api:')), 'Nenhum endpoint real de IA ou escrita deve ser chamado: ' + JSON.stringify(remoteWrites));
      assert.deepEqual(errors, [], 'A interface não deve produzir exceções.');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
      await page.screenshot({ path: 'artifacts/' + prefix + '-' + label + '.png', fullPage: true });
      await context.close(); page = null;
    }
    console.log('PASS ' + report.results.length + ' simulated device voice checks');
  } catch (error) {
    report.results.push({ name: (label || '') + ': voz do aparelho simulada', status: 'failed', stage, error: error.message });
    if(page)report.failureState=await page.evaluate(()=>({ tracks:window.deviceTracks.map(track=>({enabled:track.enabled,state:track.readyState})), sockets:window.deviceSockets.map(socket=>({state:socket.readyState, sent:socket.sent.filter(message=>message.type!=='realtime_audio')})), speech:window.deviceSpeech.map(record=>({text:record.text,tracksPaused:record.tracksPaused,socketOpen:record.socketOpen})), controls:Array.from(document.querySelectorAll('button')).map(button=>({title:button.title,label:button.getAttribute('aria-label')})) })).catch(()=>null);
    process.exitCode = 1; console.error(error.message);
    if (page) { await page.screenshot({ path: 'artifacts/' + prefix + '-failure.png', fullPage: true }).catch(() => {}); fs.writeFileSync('artifacts/' + prefix + '-failure.txt', await page.$eval('body', element => element.innerText).catch(() => '')); }
  } finally {
    server?.kill(); await browser?.close(); fs.writeFileSync('artifacts/' + prefix + '-results.json', JSON.stringify(report, null, 2));
  }
})();
