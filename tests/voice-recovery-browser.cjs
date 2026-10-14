const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { geminiEnv } = require('../scripts/gemini-env.cjs');

// The provider, HTTP chat replies, microphone and device speech are deliberately simulated.
// This test verifies recovery and history isolation; it never invokes real AI.
const online = process.env.VIGIA_TEST_URL === 'https://vigia-app.onrender.com';
if (process.env.VIGIA_TEST_URL && !online) throw Error('Endereço externo não autorizado para este teste.');
const port = '3116';
const root = online ? process.env.VIGIA_TEST_URL : 'http://localhost:' + port;
const artifactPrefix = online ? 'voice-recovery-online' : 'voice-recovery';
const report = {
  url: root,
  scope: 'Chrome desktop e celular emulado; WebSocket, respostas HTTP, microfone e síntese do aparelho simulados. Visitante e histórico apenas neste contexto isolado do navegador. Sem chamadas de IA, gravações no Firebase, dados reais ou validação acústica física.',
  results: [],
};
const saved = {
  id: 'voice-recovery-saved-fixture',
  title: 'Histórico fictício preservado',
  createdAt: '2026-10-14T12:00:00.000Z',
  updatedAt: '2026-10-14T12:00:01.000Z',
  lastMessagePreview: 'Resposta original do histórico fictício.',
  messages: [
    { id: 'fixture-user', role: 'user', content: 'Pergunta original do histórico fictício.', timestamp: '2026-10-14T12:00:00.000Z' },
    { id: 'fixture-assistant', role: 'assistant', content: 'Resposta original do histórico fictício.', timestamp: '2026-10-14T12:00:01.000Z' },
  ],
};
fs.mkdirSync('artifacts', { recursive: true });
const server = online ? null : spawn(process.execPath, ['--use-system-ca', 'dist/presentation/server/server.cjs'], {
  env: geminiEnv(port), windowsHide: true, stdio: 'ignore',
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, page;

async function clickButton(label) {
  await page.waitForFunction(value => Array.from(document.querySelectorAll('button')).some(button =>
    button.textContent.trim() === value && button.getClientRects().length && !button.disabled), { timeout: 10000 }, label);
  await page.evaluate(value => Array.from(document.querySelectorAll('button')).find(button =>
    button.textContent.trim() === value && button.getClientRects().length && !button.disabled).click(), label);
}

async function emit(messages, socketIndex) {
  await page.evaluate(({ messages, socketIndex }) => {
    const socket = socketIndex === undefined ? window.recoverySockets.at(-1) : window.recoverySockets[socketIndex];
    messages.forEach(message => socket.emit(message));
  }, { messages, socketIndex });
}

async function completeCheckedReply(input, reply, socketIndex) {
  await emit([
    { type: 'input_transcription', text: input },
    { type: 'output_transcription', text: reply },
    { type: 'reply_ready' },
  ], socketIndex);
}

async function expectSavedOnce(input, reply) {
  await page.waitForFunction(({ input, reply }) => {
    const sessions = JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]');
    return sessions.some(session => session.messages.filter(message => message.content === input).length === 1 &&
      session.messages.filter(message => message.content === reply).length === 1);
  }, { timeout: 10000 }, { input, reply });
  const counts = await page.evaluate(({ input, reply }) => {
    const messages = JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]').flatMap(session => session.messages);
    return [messages.filter(message => message.content === input).length, messages.filter(message => message.content === reply).length];
  }, { input, reply });
  assert.deepEqual(counts, [1, 1], 'Entrada e resposta devem ser salvas uma única vez, integralmente.');
}

async function expectReleased() {
  await page.waitForFunction(() => Object.values(window.VigiaTelemetry.resources).every(resource => resource.activeNow === 0), { timeout: 10000 });
  assert.ok(await page.evaluate(() => window.recoveryTracks.every(track => track.readyState === 'ended')),
    'Toda captura do microfone deve ser encerrada.');
  assert.ok(await page.evaluate(() => window.recoverySockets.every(socket => socket.readyState === 3)),
    'Toda conexão de voz deve ser encerrada.');
}

async function expectNoLateReply(marker) {
  await wait(650);
  assert.ok(await page.evaluate(value => !document.body.innerText.includes(value) &&
    !JSON.stringify(JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]')).includes(value), marker),
  'Uma resposta atrasada da sessão encerrada não pode aparecer na conversa nem no histórico.');
}

async function startVoice(expectedSocketCount) {
  const startedWaitingAt = Date.now();
  const labelsBeforeWait = await page.evaluate(() => Array.from(document.querySelectorAll('button'))
    .filter(button => ['Conversa por voz', 'Voz indisponível nesta prévia'].includes(button.title))
    .map(button => button.getAttribute('aria-label')));
  // Publication starts conservatively unavailable until its status request resolves.
  // Wait for the real voice control rather than racing that asynchronous UI update.
  await page.waitForSelector('[aria-label="Conversa por voz"]', { visible: true, timeout: 30000 });
  report.voiceReadiness ??= [];
  report.voiceReadiness.push({ expectedSocketCount, labelsBeforeWait, waitedMs: Date.now() - startedWaitingAt });
  await page.click('[aria-label="Conversa por voz"]');
  await page.waitForFunction(count => window.recoverySockets.length === count &&
    window.recoveryTracks.some(track => track.readyState === 'live' && track.enabled) &&
    window.recoveryFrames > 0, { timeout: 10000 }, expectedSocketCount);
  await page.waitForSelector('[title="Pausar Conversa"]');
}

(async () => {
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server) assert.equal(server.exitCode, null, 'O servidor isolado deve permanecer ativo.');
      try { if ((await fetch(root + '/api/status')).ok) { ready = true; break; } } catch {}
      await wait(100);
    }
    assert.ok(ready, 'O servidor isolado não iniciou.');
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true,
      args: ['--no-sandbox', '--disable-background-networking', '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    });
    for (const mobile of [false, true]) {
      const label = mobile ? 'celular' : 'desktop';
      const context = await browser.createBrowserContext();
      page = await context.newPage();
      let acceptDeviceConsent = true;
      const deviceConsentDialogs = [];
      const blockedAiRequests = [];
      page.on('dialog', dialog => {
        if (dialog.message().includes('A leitura usa a voz disponível no aparelho.')) {
          deviceConsentDialogs.push(dialog.message());
          return void (acceptDeviceConsent ? dialog.accept() : dialog.dismiss());
        }
        void dialog.accept();
      });
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = new URL(request.url());
        const respond = body => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        // No authenticated account or server-side guest writes are needed for these UI fixtures.
        if (['/api/session', '/api/adult-access'].includes(url.pathname)) return void respond({ ok: true });
        if (url.pathname === '/api/ai-access') return void respond({ allowed: true, voice: true, blocked: null });
        if (url.pathname === '/api/live-ticket') return void respond({ ticket: 'simulated-browser-recovery-ticket' });
        if (url.pathname === '/api/chat') {
          const body = JSON.parse(request.postData() || '{}');
          report.results.push({ name: label + ': pedido por texto após falha de voz preserva o contexto',
            status: body.chatHistory?.some(message => message.content === 'Resposta integral simulada após cota de voz.') ? 'passed' : 'failed' });
          return void respond({ reply: 'Resposta por texto simulada, com o contexto preservado.', avatarState: 'explaining', status: 'ok' });
        }
        if (['/api/tts', '/api/transcribe', '/api/analyze-scenario', '/api/generate-quiz'].includes(url.pathname)) {
          blockedAiRequests.push(url.pathname);
          return void request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Endpoint real bloqueado pelo teste simulado.' }) });
        }
        // Guard against accidental remote database writes even if the UI changes later.
        if ((url.hostname === 'firestore.googleapis.com' || url.hostname.endsWith('.firebaseio.com')) &&
          request.method() !== 'GET') {
          blockedAiRequests.push('unexpected-firebase-write:' + request.method());
          return void request.abort();
        }
        if (url.origin === root && url.pathname.startsWith('/api/') && request.method() !== 'GET') {
          blockedAiRequests.push('unexpected-api-write:' + url.pathname);
          return void request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Gravação remota bloqueada pelo teste simulado.' }) });
        }
        void request.continue();
      });
      await page.evaluateOnNewDocument(seed => {
        localStorage.setItem('vigia_guest_chat_sessions_v1', JSON.stringify([seed]));
        window.recoveryFrames = 0; window.recoverySockets = []; window.recoveryTracks = []; window.recoveryAudioSources = 0;
        const createSource = AudioContext.prototype.createBufferSource;
        AudioContext.prototype.createBufferSource = function (...args) {
          window.recoveryAudioSources++;
          return createSource.apply(this, args);
        };
        window.recoveryDeviceSpeech = [];
        const speechTimers = new Set();
        Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
          constructor(text) { this.text = text; }
        } });
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
          cancel() { for (const timer of speechTimers) clearTimeout(timer); speechTimers.clear(); },
          getVoices() { return [{ name: 'Voz fictícia do teste', lang: 'pt-BR', localService: true }]; },
          addEventListener() {}, removeEventListener() {},
          speak(utterance) {
            window.recoveryDeviceSpeech.push({ text: utterance.text,
              microphoneStopped: window.recoveryTracks.every(track => track.readyState === 'ended'),
              socketsClosed: window.recoverySockets.every(socket => socket.readyState === 3) });
            const timer = setTimeout(() => { speechTimers.delete(timer); utterance.onstart?.(); utterance.onend?.(); }, 0);
            speechTimers.add(timer);
          },
        } });
        const NativeWebSocket = window.WebSocket;
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (...args) => {
          const stream = await capture(...args);
          window.recoveryTracks.push(...stream.getTracks());
          return stream;
        };
        window.WebSocket = class {
          static OPEN = 1;
          readyState = 1;
          bufferedAmount = 0;
          sent = [];
          constructor(url) {
            if (!String(url).includes('/api/live-ws')) return new NativeWebSocket(url);
            window.recoverySockets.push(this);
            setTimeout(() => { this.onopen?.(); this.emit({ type: 'open', mode: 'streamed-speech' }); }, 25);
          }
          emit(message) {
            // Retain the old handler to exercise late browser messages after cleanup.
            this.lastHandler = this.onmessage || this.lastHandler;
            this.lastHandler?.({ data: JSON.stringify(message) });
          }
          send(data) {
            const message = JSON.parse(data); this.sent.push(message);
            if (message.type === 'realtime_audio') window.recoveryFrames++;
          }
          close() { this.readyState = 3; this.onclose?.(); }
        };
      }, saved);
      await page.goto(root, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[aria-label="Acesso para adultos"]');
      await page.click('input[type="checkbox"]');
      await clickButton('Continuar');
      await page.waitForSelector('[aria-label="Boas-vindas à Vigia"]');
      await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label="Boas-vindas à Vigia"] button')).find(button => button.textContent.includes('Explorar')).click());
      await page.click('[title="Conversa & Voz"]');
      await page.waitForSelector('textarea');
      await startVoice(1);

      const quotaInput = 'Pergunta fictícia sobre uma mochila segura.';
      const quotaReply = 'Resposta integral simulada após cota de voz.';
      await completeCheckedReply(quotaInput, quotaReply);
      await emit([{ type: 'audio_chunk', pcmBase64: Buffer.alloc(480000).toString('base64') }]);
      await page.waitForSelector('[title="Interromper fala"]');
      await page.click('[title="Pausar Conversa"]');
      await page.waitForFunction(() => window.recoveryTracks.filter(track => track.readyState === 'live').every(track => !track.enabled));
      const pausedFrames = await page.evaluate(() => window.recoveryFrames);
      await wait(220);
      assert.equal(await page.evaluate(() => window.recoveryFrames), pausedFrames);
      await page.click('[title="Ativar Conversa"]');
      await page.waitForFunction(() => window.recoveryTracks.some(track => track.readyState === 'live' && track.enabled));
      report.results.push({ name: label + ': pausar captura durante a resposta realmente interrompe o envio do microfone', status: 'passed' });

      await emit([
        { type: 'speech_unavailable', code: 'quota', message: 'Cota de voz simulada. Sua resposta continua disponível por texto.', retryAfterMs: 1200 },
        { type: 'turn_complete' },
      ]);
      await page.waitForFunction(reply => document.body.innerText.includes(reply) &&
        window.recoveryTracks.filter(track => track.readyState === 'live').every(track => !track.enabled), { timeout: 10000 }, quotaReply);
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button =>
        /^Tentar voz em \d+ s$/.test(button.textContent.trim()) && button.disabled), { timeout: 1000 });
      const cooldown = await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(button => /^Tentar voz em \d+ s$/.test(button.textContent.trim()))?.disabled);
      assert.equal(cooldown, true, 'A tentativa de voz deve aguardar o prazo informado pelo provedor.');
      assert.equal(await page.$eval('[title="Ativar Conversa"]', button => button.disabled), true);
      const quotaFrames = await page.evaluate(() => window.recoveryFrames);
      await wait(200);
      assert.equal(await page.evaluate(() => window.recoveryFrames), quotaFrames);
      assert.equal(await page.evaluate(() => window.recoverySockets[0].readyState), 1);
      await expectSavedOnce(quotaInput, quotaReply);
      report.results.push({ name: label + ': cota exclusiva da síntese preserva resposta integral e histórico, pausa captura e mantém a sessão', status: 'passed' });

      await clickButton('Tentar voz novamente');
      await page.waitForFunction(() => window.recoveryTracks.some(track => track.readyState === 'live' && track.enabled));
      assert.equal(await page.evaluate(() => window.recoverySockets.length), 1);
      await page.waitForFunction(() => !document.body.innerText.includes('Cota de voz simulada.'));
      report.results.push({ name: label + ': retomar após o prazo reutiliza a mesma conexão sem duplicar a resposta', status: 'passed' });

      await emit([{ type: 'processing' }]);
      await page.waitForSelector('[title="Interromper fala"]');
      await page.click('[title="Pausar Conversa"]');
      await emit([{ type: 'interrupted' }]);
      await page.waitForFunction(() => window.recoveryTracks.filter(track => track.readyState === 'live').every(track => !track.enabled));
      assert.ok(await page.evaluate(() => !document.body.innerText.includes('Pode falar!')),
        'Uma interrupção do servidor não deve apresentar escuta ativa enquanto o microfone está pausado.');
      await page.click('[title="Ativar Conversa"]');
      await page.waitForFunction(() => window.recoveryTracks.some(track => track.readyState === 'live' && track.enabled));
      report.results.push({ name: label + ': interrupção recebida durante pausa mantém captura e indicador de escuta desativados', status: 'passed' });

      await emit([
        { type: 'speech_unavailable', code: 'quota', message: 'Cota de voz simulada para continuar por texto.', retryAfterMs: 0 },
        { type: 'turn_complete' },
      ]);
      await clickButton('Continuar por texto');
      await page.waitForSelector('textarea');
      await expectReleased();
      await page.type('textarea', 'E qual é o próximo item da mochila fictícia?');
      await page.click('[title="Enviar mensagem"]');
      await page.waitForFunction(() => document.body.innerText.includes('Resposta por texto simulada, com o contexto preservado.'));
      await expectSavedOnce(quotaInput, quotaReply);
      report.results.push({ name: label + ': continuar por texto libera áudio e microfone sem perder mensagens', status: 'passed' });

      await startVoice(2);
      const newInput = 'Pergunta fictícia antes de iniciar outra conversa.';
      const newReply = 'Resposta integral simulada preservada antes de outra conversa.';
      await completeCheckedReply(newInput, newReply);
      await page.waitForSelector('[title="Interromper fala"]');
      // Switch before the history debounce: the switch must flush the checked reply.
      await page.click('[title="Iniciar uma nova conversa"]');
      await page.waitForSelector('textarea');
      await expectReleased();
      const newMarker = 'RESPOSTA_ATRASADA_NOVA_CONVERSA';
      await completeCheckedReply('Pergunta atrasada fictícia.', newMarker, 1);
      await emit([{ type: 'turn_complete' }, { type: 'audio_chunk', pcmBase64: Buffer.alloc(8000).toString('base64') }], 1);
      await expectNoLateReply(newMarker);
      assert.ok(await page.evaluate(reply => !document.body.innerText.includes(reply), newReply));
      await expectSavedOnce(newInput, newReply);
      report.results.push({ name: label + ': nova conversa encerra sessão pendente e ignora texto/áudio atrasados, preservando histórico anterior', status: 'passed' });

      await startVoice(3);
      const historyInput = 'Pergunta fictícia antes de abrir um histórico.';
      const historyReply = 'Resposta integral simulada preservada antes de abrir histórico.';
      await completeCheckedReply(historyInput, historyReply);
      await page.waitForSelector('[title="Interromper fala"]');
      await page.click('[title="Abrir histórico de conversas"]');
      await clickButton(saved.title);
      await page.waitForSelector('textarea');
      await page.waitForFunction(text => document.body.innerText.includes(text), { timeout: 10000 }, saved.messages[1].content);
      await expectReleased();
      const historyMarker = 'RESPOSTA_ATRASADA_HISTORICO';
      await completeCheckedReply('Pergunta atrasada de outro histórico.', historyMarker, 2);
      await emit([{ type: 'turn_complete' }], 2);
      await expectNoLateReply(historyMarker);
      await expectSavedOnce(historyInput, historyReply);
      assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]').find(session => session.id === id), saved.id), saved,
        'Abrir o histórico não pode sobrescrever nem modificar sua conversa.');
      report.results.push({ name: label + ': abrir histórico durante resposta pendente encerra voz, ignora callbacks atrasados e não sobrescreve a conversa restaurada', status: 'passed' });

      await page.click('[title="Iniciar uma nova conversa"]');
      await page.waitForSelector('textarea');
      await startVoice(4);
      const emergencyInput = 'Emergência fictícia exclusiva desta simulação de interface.';
      const emergencyReply = 'Orientação de emergência simulada: procure um lugar seguro e acione o serviço de emergência local.';
      const audioSourcesBeforeEmergency = await page.evaluate(() => window.recoveryAudioSources);
      await emit([
        { type: 'input_transcription', text: emergencyInput },
        { type: 'emergency', text: emergencyReply },
      ]);
      await expectReleased();
      await expectSavedOnce(emergencyInput, emergencyReply);
      assert.equal(await page.evaluate(() => window.recoveryAudioSources), audioSourcesBeforeEmergency,
        'A orientação de emergência não deve produzir áudio inventado ou chamar a síntese.');
      await page.click('[aria-label="Conversa por texto"]');
      await page.waitForSelector('textarea');
      await page.waitForFunction(text => document.body.innerText.includes(text), { timeout: 10000 }, emergencyReply);
      assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]').find(session => session.id === id), saved.id), saved);
      report.results.push({ name: label + ': emergência salva exatamente uma entrada e uma orientação, encerra sessão e recursos sem fabricar áudio', status: 'passed' });

      await page.click('[title="Iniciar uma nova conversa"]');
      await page.waitForSelector('textarea');
      await startVoice(5);
      const uncheckedFragment = 'Fragmento simulado ainda não verificado';
      await emit([
        { type: 'input_transcription', text: 'Pergunta fictícia com transcrição ainda parcial.' },
        { type: 'output_transcription', text: uncheckedFragment },
        { type: 'speech_unavailable', code: 'quota', message: 'Falha de voz simulada antes de confirmar a resposta.', retryAfterMs: 0 },
      ]);
      await page.waitForFunction(() => document.body.innerText.includes('Falha de voz simulada antes de confirmar a resposta.'));
      assert.ok(await page.evaluate(() => !Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Ouvir no aparelho')),
        'Uma transcrição parcial sem reply_ready ou conclusão não pode oferecer leitura no aparelho.');
      assert.equal(await page.evaluate(() => window.recoveryDeviceSpeech.length), 0);
      report.results.push({ name: label + ': fragmento ainda não verificado não oferece nem executa leitura no aparelho', status: 'passed' });

      await clickButton('Tentar voz novamente');
      await page.waitForFunction(() => window.recoveryTracks.some(track => track.readyState === 'live' && track.enabled));
      const deviceInput = 'Pergunta fictícia para leitura opcional no aparelho.';
      const deviceReply = 'Resposta integral verificada e simulada para ouvir no aparelho. Inclua uma lanterna e confira as pilhas.';
      await completeCheckedReply(deviceInput, deviceReply);
      await emit([
        { type: 'speech_unavailable', code: 'quota', message: 'Síntese simulada indisponível; a resposta completa está pronta.', retryAfterMs: 0 },
        { type: 'turn_complete' },
      ]);
      acceptDeviceConsent = false;
      await clickButton('Ouvir no aparelho');
      await page.waitForSelector('textarea');
      await expectReleased();
      assert.equal(deviceConsentDialogs.length, 1);
      assert.match(deviceConsentDialogs[0], /serviços do fabricante/);
      assert.equal(await page.evaluate(() => window.recoveryDeviceSpeech.length), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('vigia_reading_voice_consent:guest')), null);
      await expectSavedOnce(deviceInput, deviceReply);
      report.results.push({ name: label + ': recusar consentimento de leitura encerra a captura e preserva texto sem reproduzir voz', status: 'passed' });

      await startVoice(6);
      const acceptedInput = 'Nova pergunta fictícia para ouvir a resposta completa.';
      const acceptedReply = 'Esta resposta integral é a frase verificada da simulação. A leitura respeita exatamente esse texto.';
      await completeCheckedReply(acceptedInput, acceptedReply);
      await emit([
        { type: 'speech_unavailable', code: 'quota', message: 'Síntese simulada indisponível para validar leitura opcional.', retryAfterMs: 0 },
        { type: 'turn_complete' },
      ]);
      acceptDeviceConsent = true;
      await clickButton('Ouvir no aparelho');
      await page.waitForSelector('textarea');
      await page.waitForFunction(() => window.recoveryDeviceSpeech.length === 2);
      const spoken = await page.evaluate(() => window.recoveryDeviceSpeech);
      assert.equal(deviceConsentDialogs.length, 2);
      assert.equal(spoken.map(chunk => chunk.text).join(' '), acceptedReply,
        'A leitura deve usar a resposta verificada integral, sem substituir por frase pronta.');
      assert.ok(spoken.every(chunk => chunk.microphoneStopped && chunk.socketsClosed),
        'A conexão e o microfone devem estar encerrados antes de qualquer leitura no aparelho.');
      assert.equal(await page.evaluate(() => localStorage.getItem('vigia_reading_voice_consent:guest')), 'true');
      await expectReleased();
      await expectSavedOnce(acceptedInput, acceptedReply);
      assert.ok(await page.evaluate(fragment => !JSON.stringify(JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1') || '[]')).includes(fragment), uncheckedFragment),
        'A transcrição parcial não deve ser salva como resposta verificada.');
      assert.deepEqual(blockedAiRequests, [], 'A leitura opcional não deve pedir síntese, transcrição ou qualquer outro endpoint de IA.');
      report.results.push({ name: label + ': leitura opcional com consentimento reproduz a resposta integral, após encerrar microfone e conexão, sem chamar a IA', status: 'passed' });
      assert.deepEqual(pageErrors, [], 'A recuperação não deve gerar exceções na página.');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
      await page.screenshot({ path: 'artifacts/' + artifactPrefix + '-' + label + '.png', fullPage: true });
      await context.close(); page = null;
    }
    assert.ok(report.results.every(result => result.status === 'passed'));
    console.log('PASS ' + report.results.length + ' simulated voice recovery checks');
  } catch (error) {
    report.results.push({ name: 'Recuperação de voz simulada', status: 'failed', error: error.message });
    console.error(error.message); process.exitCode = 1;
    if (page) {
      await page.screenshot({ path: 'artifacts/' + artifactPrefix + '-failure.png', fullPage: true }).catch(() => {});
      fs.writeFileSync('artifacts/' + artifactPrefix + '-failure.txt', await page.$eval('body', element => element.innerText).catch(() => ''));
    }
  } finally {
    server?.kill();
    await browser?.close();
    fs.writeFileSync('artifacts/' + artifactPrefix + '-results.json', JSON.stringify(report, null, 2));
  }
})();
