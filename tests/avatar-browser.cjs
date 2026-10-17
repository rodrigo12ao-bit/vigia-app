const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { resolvePublicTestOrigin } = require('./browser-target.cjs');

// Test the built application through its ordinary text/voice UI. API replies,
// voice sockets and microphone input are local fixtures; nothing reaches AI or
// account services and this test never reads .env or server private files.
const workspaceDir = fs.realpathSync(process.cwd());
const within = (directory, target) => {
  const relative = path.relative(directory, target);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
};
const publicDir = fs.realpathSync(path.resolve(process.env.VIGIA_AVATAR_BUILD_DIR || 'dist/netlify/public'));
assert.ok(within(workspaceDir, publicDir), 'O diretório do build precisa ficar dentro do workspace.');
assert.ok(fs.statSync(publicDir).isDirectory(), 'O diretório do build precisa existir.');
const online = process.argv.includes('--online');
const origin = online ? resolvePublicTestOrigin(process.env.VIGIA_AVATAR_PUBLIC_URL || 'https://vigia-aplicativo-18plus.netlify.app') : 'http://127.0.0.1:3138';
const headerOnly = process.argv.includes('--header-only');
const presentationOnly = process.argv.includes('--presentation-only');
const defaultPrefix = online ? 'artifacts/vigia-original-publication' : headerOnly ? 'artifacts/vigia-original-app-headers' : presentationOnly ? 'artifacts/vigia-original-app-presentation' : 'artifacts/vigia-original-app-browser';
const artifactsDir = path.join(workspaceDir, 'artifacts');
const prefix = path.resolve(process.env.VIGIA_AVATAR_EVIDENCE_PREFIX || defaultPrefix);
assert.ok(within(artifactsDir, prefix), 'O prefixo da evidência precisa ficar dentro de artifacts.');
// Check every existing parent before creating output directories so a junction
// or symbolic link cannot redirect browser evidence outside this workspace.
let evidenceParent = path.dirname(prefix);
while (!fs.existsSync(evidenceParent)) evidenceParent = path.dirname(evidenceParent);
const realEvidenceParent = fs.realpathSync(evidenceParent);
assert.ok(realEvidenceParent === workspaceDir || within(workspaceDir, realEvidenceParent), 'O caminho da evidência não pode sair do workspace.');
if (fs.existsSync(artifactsDir)) {
  const realArtifactsDir = fs.realpathSync(artifactsDir);
  assert.ok(within(workspaceDir, realArtifactsDir), 'A pasta artifacts não pode sair do workspace.');
  assert.ok(realEvidenceParent === realArtifactsDir || within(realArtifactsDir, realEvidenceParent), 'A evidência não pode sair de artifacts.');
}
if (process.env.VIGIA_AVATAR_EVIDENCE_PREFIX) {
  const directory = path.dirname(prefix), basename = path.basename(prefix);
  const existingEvidence = fs.existsSync(directory) && fs.readdirSync(directory).some(name => name === basename + '.json' || name.startsWith(basename + '-'));
  assert.ok(!existingEvidence, 'Este prefixo já possui evidências; escolha outro para preservá-las.');
}
const headPreviewPath = '/model/vigia-original-head.png';
const bustPreviewPath = '/model/vigia-original-preview.png';
const adultVersion = fs.readFileSync('src/lib/audience.ts', 'utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
const hosting = online ? new URL(origin).hostname.endsWith('.onrender.com') ? 'Render' : 'Netlify' : 'local';
const report = { scope: 'Selected built app on loopback, desktop and emulated mobile. Every API, voice socket and microphone response is fictitious. External traffic blocked. No real AI, account login, payment, publication or physical microphone.', hosting, buildDir: publicDir, evidencePrefix: prefix, checks: [], profiles: [], status: 'running' };
if (online) report.scope = 'Published ' + hosting + ' HTML/JS/PNG/GLB and service worker are real. The expected entry must be present in live HTML and load successfully; PNG/GLB assets must match the selected local build exactly. All API requests and voice sockets are mocked before reaching the network. Microphone input is the Chrome fake device. Desktop and mobile emulation, no real AI, login, payment, account change or physical microphone.';
report.origin = origin;
const status = { demo: false, realAI: true, localDemo: false, audience: '18plus', ai: { mode: 'adult-gemini', provider: 'gemini', blocked: null, consentVersion: 'avatar-local-fixture', voice: true } };
let browser, page, context, stage = 'setup', label;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, milliseconds = 6000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Operação local de navegador excedeu o prazo.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
const json = (response, code, body) => { response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
const server = http.createServer((request, response) => {
  try {
    const pathname = new URL(request.url, origin).pathname;
    if (pathname === '/api/status') return json(response, 200, status);
    if (['/api/session', '/api/adult-access'].includes(pathname)) return json(response, 200, { ok: true });
    if (pathname === '/api/ai-access') return json(response, 200, { allowed: true, voice: true, blocked: null });
    if (pathname === '/api/live-ticket') return json(response, 200, { ticket: 'avatar-local-ticket' });
    if (pathname === '/api/chat') return json(response, 200, { reply: 'Resposta fictícia para validar o avatar.', avatarState: 'explaining', status: 'ok' });
    if (pathname.startsWith('/api/')) return json(response, 503, { error: 'Endpoint bloqueado neste teste local.' });
    const file = path.resolve(publicDir, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self' blob:;" });
    fs.createReadStream(file).pipe(response);
  } catch (error) { json(response, 500, { error: error.message }); }
});

async function check(name, action) {
  stage = name;
  await action();
  report.checks.push({ name: label + ': ' + name, status: 'passed' });
  console.log('PASS ' + label + ': ' + name);
}

async function activate() {
  await page.click('[aria-label="Ativar avatar 3D"]');
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => window.avatarReview.drawCalls > 100);
  await wait(850);
}

async function emit(messages) {
  await page.evaluate(messages => messages.forEach(message => window.avatarReview.sockets.at(-1).emit(message)), messages);
}

async function movingCanvas(name) {
  const canvas = await page.$('canvas');
  assert.ok(canvas);
  const first = await canvas.screenshot({ path: prefix + '-' + label + '-' + name + '-a.png' });
  await wait(1000);
  const second = await canvas.screenshot({ path: prefix + '-' + label + '-' + name + '-b.png' });
  const hashes = [first, second].map(bytes => createHash('sha256').update(bytes).digest('hex'));
  assert.notEqual(hashes[0], hashes[1], 'The rendered avatar must change over time.');
  report.profiles.at(-1).frames.push({ mode: name, hashes });
}

function fixture(pathname) {
  if (pathname === '/api/status') return { code: 200, data: status };
  if (['/api/session', '/api/adult-access'].includes(pathname)) return { code: 200, data: { ok: true, simulated: true } };
  if (pathname === '/api/ai-access') return { code: 200, data: { allowed: true, voice: true, blocked: null, simulated: true } };
  if (pathname === '/api/live-ticket') return { code: 200, data: { ticket: 'avatar-local-ticket', simulated: true } };
  if (pathname === '/api/chat') return { code: 200, data: { reply: 'Resposta fictícia para validar o avatar.', avatarState: 'explaining', status: 'ok', simulated: true } };
  return { code: 503, data: { error: 'Endpoint bloqueado neste teste de publicação.' } };
}

async function publicationAssetsAndCache(profile, workerSessions) {
  await check('versão publicada e arquivos do avatar correspondem ao build revisado', async() => {
    await Promise.all(profile.assetHashTasks);
    for (const pathname of [headPreviewPath, bustPreviewPath, '/model/vigia-original.glb']) {
      const expected = createHash('sha256').update(fs.readFileSync(path.join(publicDir, pathname))).digest('hex');
      const actual = profile.assetHashes[pathname];
      assert.equal(actual, expected, 'Arquivo publicado desatualizado: ' + pathname);
    }
    const entry = profile.assetResponses.find(item => item.pathname === report.expectedEntry);
    assert.ok(entry && entry.status === 200, 'O JavaScript de entrada da versão atual precisa carregar.');
    assert.match(entry.cacheControl, /immutable/i, 'O bundle com nome versionado precisa de cache imutável.');
  });
  await check('service worker salva as prévias públicas e responde com o avatar sem rede', async() => {
    await page.waitForFunction(async() => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', { timeout: 60000 });
    if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[aria-label="Conversa & Voz"]');
    }
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(async paths => { for (const pathname of paths) { const response = await fetch(pathname, { cache: 'reload' }); if (!response.ok) throw Error('Prévia pública indisponível.'); await response.arrayBuffer(); } }, [headPreviewPath, bustPreviewPath]);
    await page.waitForFunction(async paths => {
      const cache = await caches.open('vigia-avatar-previews-v1');
      return (await Promise.all(paths.map(pathname => cache.match(pathname)))).every(Boolean);
    }, { timeout: 30000 }, [headPreviewPath, bustPreviewPath]);
    profile.cache = await page.evaluate(async() => {
      const inventory = [];
      for (const name of await caches.keys()) inventory.push({ name, urls: (await (await caches.open(name)).keys()).map(request => { const url = new URL(request.url); return url.origin + url.pathname; }) });
      return inventory;
    });
    assert.ok(!profile.cache.flatMap(cache => cache.urls).some(url => /\/api\/|firestore|identitytoolkit|generativelanguage/i.test(url)), 'O cache deve conter somente dados públicos.');
    await page.setOfflineMode(true);
    for (const session of workerSessions) await session.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    profile.offlineHashes = await page.evaluate(async paths => {
      const hashes = {};
      for (const pathname of paths) {
        const response = await fetch(pathname, { cache: 'reload' });
        if (!response.ok) throw Error('A prévia não respondeu sem rede.');
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        hashes[pathname] = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }
      return hashes;
    }, [headPreviewPath, bustPreviewPath]);
    for (const pathname of [headPreviewPath, bustPreviewPath]) assert.equal(profile.offlineHashes[pathname], profile.assetHashes[pathname]);
    await page.setOfflineMode(false);
    for (const session of workerSessions) await session.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  });
}

async function profile(mobile) {
  label = mobile ? 'mobile' : 'desktop';
  const profile = { label, errors: [], graphicsErrors: [], expectedContextLossEvents: [], blockedExternal: [], assetRequests: [], apiRequests: [], frames: [] };
  profile.assetHashes = {}; profile.assetHashTasks = []; profile.assetResponses = []; profile.mockedApis = []; profile.workerRequests = [];
  report.profiles.push(profile);
  context = await browser.createBrowserContext();
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  let inducingContextLoss = false;
  page.on('pageerror', error => (inducingContextLoss && /Avatar WebGL context unavailable/.test(error.message) ? profile.expectedContextLossEvents : profile.errors).push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error' || !/WebGL|THREE|GLTF|shader|Avatar/i.test(message.text())) return;
    (inducingContextLoss && /Avatar WebGL context unavailable/.test(message.text()) ? profile.expectedContextLossEvents : profile.graphicsErrors).push(message.text());
  });
  page.on('dialog', dialog => void dialog.accept());
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.setBypassServiceWorker(!online);
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (['blob:', 'data:'].includes(url.protocol)) { void request.continue(); return; }
    if (online && url.pathname.startsWith('/api/')) {
      profile.mockedApis.push(url.origin + url.pathname);
      const mocked = fixture(url.pathname);
      void request.respond({ status: request.method() === 'OPTIONS' ? 204 : mocked.code, contentType: 'application/json', headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }, body: request.method() === 'OPTIONS' ? '' : JSON.stringify(mocked.data) });
      return;
    }
    if (url.origin !== origin) { profile.blockedExternal.push(url.origin + url.pathname); void request.abort('blockedbyclient'); return; }
    if (online && !['GET', 'HEAD'].includes(request.method())) { profile.blockedExternal.push(url.origin + url.pathname); void request.abort('blockedbyclient'); return; }
    (url.pathname.startsWith('/api/') ? profile.apiRequests : profile.assetRequests).push(url.pathname);
    void request.continue();
  });
  if (online) page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return;
    profile.assetResponses.push({ pathname: url.pathname, status: response.status(), cacheControl: response.headers()['cache-control'] || '' });
    if ([headPreviewPath, bustPreviewPath, '/model/vigia-original.glb'].includes(url.pathname)) profile.assetHashTasks.push(response.buffer().then(bytes => { profile.assetHashes[url.pathname] = createHash('sha256').update(bytes).digest('hex'); }).catch(error => { profile.errors.push('Leitura de asset público: ' + error.message); }));
  });
  const workerSessions = new Set();
  const attachWorker = async target => {
    if (!online || target.type() !== 'service_worker' || !target.url().startsWith(origin + '/') || target.browserContext() !== context) return;
    const session = await target.createCDPSession(); workerSessions.add(session);
    await session.send('Network.enable');
    session.on('Fetch.requestPaused', async event => {
      try {
        const url = new URL(event.request.url);
        profile.workerRequests.push(url.origin + url.pathname);
        if (url.pathname.startsWith('/api/')) {
          profile.mockedApis.push(url.origin + url.pathname);
          const mocked = fixture(url.pathname);
          await session.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: mocked.code, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }, { name: 'Access-Control-Allow-Origin', value: origin }], body: Buffer.from(JSON.stringify(mocked.data)).toString('base64') });
        } else if (url.origin !== origin || !['GET', 'HEAD'].includes(event.request.method)) {
          profile.blockedExternal.push(url.origin + url.pathname);
          await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
        } else await session.send('Fetch.continueRequest', { requestId: event.requestId });
      } catch (error) { if (!/closed|detached|Invalid Interception/i.test(error.message)) profile.errors.push('Intercepção SW: ' + error.message); }
    });
    await session.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  };
  browser.on('targetcreated', attachWorker);
  await page.evaluateOnNewDocument(({ adultVersion }) => {
    sessionStorage.setItem('vigia_adult_access', adultVersion);
    localStorage.setItem('dc_is_guest', 'true');
    localStorage.setItem('vigia_ai_consent:guest', 'avatar-local-fixture');
    localStorage.setItem('vigia_mic_explained:guest', 'true');
    localStorage.setItem('vigia_progress:guest', JSON.stringify({ avatarGender: 'female' }));
    window.avatarReview = { drawCalls: 0, sockets: [], tracks: [], contexts: [], frames: 0 };
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Context) continue;
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = Context.prototype[name];
        if (!original) continue;
        Context.prototype[name] = function(...args) { window.avatarReview.drawCalls++; return original.apply(this, args); };
      }
    }
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext { constructor(...args) { super(...args); window.avatarReview.contexts.push(this); } };
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async(...args) => { const stream = await capture(...args); window.avatarReview.tracks.push(...stream.getTracks()); return stream; };
    window.WebSocket = class {
      static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
      readyState = 1; bufferedAmount = 0; sent = [];
      constructor(url) {
        if (!String(url).includes('/api/live-ws')) throw Error('Conexão real bloqueada neste teste.');
        this.url = String(url); window.avatarReview.sockets.push(this);
        setTimeout(() => { if (this.readyState !== 1) return; this.onopen?.(); this.emit({ type: 'open', mode: 'streamed-speech' }); }, 20);
      }
      emit(message) { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(message) }); }
      send(data) { const message = JSON.parse(data); this.sent.push(message); if (message.type === 'realtime_audio') window.avatarReview.frames++; if (message.type === 'interrupt') setTimeout(() => this.emit({ type: 'interrupted' }), 0); }
      close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
    };
  }, { adultVersion });
  const navigation = await page.goto(origin, { waitUntil: 'domcontentloaded' });
  if (online) {
    assert.equal(navigation.status(), 200);
    const published = await navigation.text();
    assert.ok(published.includes(report.expectedEntry), 'O HTML publicado não referencia a versão esperada do bundle.');
    profile.publishedIndexSha256 = createHash('sha256').update(published).digest('hex');
  }
  await page.waitForSelector('[aria-label="Conversa & Voz"]');
  await page.click('[aria-label="Conversa & Voz"]');
  await page.waitForSelector('textarea');

  await check('a nova prévia carrega sem baixar modelos ou gráficos 3D', async() => {
    await page.waitForSelector('img[src="' + headPreviewPath + '"]');
    await page.waitForFunction(path => [...document.querySelectorAll('img')].some(image => image.getAttribute('src') === path && image.complete && image.naturalWidth > 0), {}, headPreviewPath);
    assert.equal(await page.$('canvas'), null);
    assert.ok(profile.assetRequests.includes(headPreviewPath));
    assert.ok(!profile.assetRequests.some(url => /\.glb$|\/graphics-|\/vendor-three-|\/Avatar3D-/.test(url)), 'The preview must not eagerly request graphics.');
    if (headerOnly || presentationOnly) {
      await page.screenshot({ path: prefix + '-' + label + '-preview.png', fullPage: true });
      await (await page.$('img[src="' + headPreviewPath + '"]')).screenshot({ path: prefix + '-' + label + '-portrait-2d.png' });
    }
  });
  await check('ativar 3D em texto carrega o modelo original e desenha o avatar', async() => {
    await activate();
    assert.ok(profile.assetRequests.includes('/model/vigia-original.glb'));
    assert.ok(!profile.assetRequests.includes('/model/avatar_1.glb'));
    assert.equal(await page.$eval('[aria-label="Usar imagem do avatar"]', button => button.getAttribute('aria-pressed')), 'true');
    if (headerOnly) {
      profile.headerControl = await page.$eval('[aria-label="Usar imagem do avatar"]', button => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height, fontSize: getComputedStyle(button).fontSize };
      });
      assert.ok(profile.headerControl.width <= 22 && profile.headerControl.height <= 14, 'The compact header control must leave the face visible.');
    }
    await page.screenshot({ path: prefix + '-' + label + '-text.png', fullPage: true });
    if (headerOnly || presentationOnly) await (await page.$('canvas')).screenshot({ path: prefix + '-' + label + '-portrait-3d.png' });
  });
  await check('voltar ao 2D remove o Canvas e conserva a prévia', async() => {
    await page.click('[aria-label="Usar imagem do avatar"]');
    await page.waitForFunction(() => !document.querySelector('canvas'));
    assert.ok(await page.$('img[src="' + headPreviewPath + '"]'));
  });
  if (headerOnly) {
    assert.deepEqual(profile.errors, []);
    assert.deepEqual(profile.graphicsErrors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    browser.off('targetcreated', attachWorker);
    await bounded(context.close()); page = null; context = null;
    return;
  }
  await check('a conversa de voz fictícia usa o palco maior e anima a escuta', async() => {
    await page.click('[aria-label="Conversa por voz"]');
    await page.waitForFunction(() => window.avatarReview.sockets.length === 1 && window.avatarReview.tracks.some(track => track.readyState === 'live' && track.enabled));
    await page.waitForSelector('img[src="' + bustPreviewPath + '"]');
    if (presentationOnly) {
      await page.screenshot({ path: prefix + '-' + label + '-voice-preview.png', fullPage: true });
      await (await page.$('img[src="' + bustPreviewPath + '"]')).screenshot({ path: prefix + '-' + label + '-bust-2d.png' });
    }
    await activate();
    await page.waitForSelector('.vigia-avatar-listening canvas');
    const box = await (await page.$('canvas')).boundingBox();
    assert.ok(box.width >= 250 && box.height >= 150, 'Voice mode must provide a large stage.');
    await movingCanvas('listening');
    await page.screenshot({ path: prefix + '-' + label + '-voice.png', fullPage: true });
  });
  if (presentationOnly) {
    await check('apresentação final sem erros, volta para cabeça em texto e encerra voz', async() => {
      assert.deepEqual(profile.errors, []);
      assert.deepEqual(profile.graphicsErrors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
      await page.click('[aria-label="Conversa por texto"]');
      await page.waitForSelector('img[src="' + headPreviewPath + '"]');
      await page.waitForFunction(() => window.avatarReview.tracks.every(track => track.readyState === 'ended') && window.avatarReview.sockets.every(socket => socket.readyState === 3));
    });
    if (online) {
      await publicationAssetsAndCache(profile, workerSessions);
      await Promise.all(profile.assetHashTasks);
    }
    assert.deepEqual(profile.errors, []);
    assert.deepEqual(profile.graphicsErrors, []);
    browser.off('targetcreated', attachWorker);
    delete profile.assetHashTasks;
    await bounded(context.close()); page = null; context = null;
    return;
  }
  await check('o estado pensando responde aos eventos da conversa', async() => {
    await emit([{ type: 'processing' }, { type: 'input_transcription', text: 'Pergunta fictícia sobre a lanterna.' }]);
    await page.waitForFunction(() => document.body.innerText.includes('Preparando a resposta') && !document.querySelector('.vigia-avatar-listening canvas'));
    await movingCanvas('thinking');
  });
  await check('gestos de fala acompanham a reprodução fictícia', async() => {
    await emit([{ type: 'output_transcription', text: 'Confira a lanterna antes de guardar.' }, { type: 'reply_ready' }, { type: 'audio_chunk', pcmBase64: Buffer.alloc(480000).toString('base64') }, { type: 'turn_complete' }]);
    await page.waitForSelector('.vigia-avatar-speaking canvas');
    await movingCanvas('speaking');
    await page.screenshot({ path: prefix + '-' + label + '-speaking.png', fullPage: true });
    await page.click('[title="Interromper fala"]');
    await page.waitForSelector('.vigia-avatar-listening canvas');
  });
  await check('perda de contexto mostra a imagem e permite tentar 3D novamente', async() => {
    assert.deepEqual(profile.errors, []);
    assert.deepEqual(profile.graphicsErrors, []);
    inducingContextLoss = true;
    await page.$eval('canvas', canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    await page.waitForSelector('img[src="/model/vigia-original-preview.png"]');
    await page.waitForFunction(() => !document.querySelector('canvas') && document.body.innerText.includes('A imagem da Vigia continua disponível.'));
    await page.click('[aria-label="Usar imagem do avatar"]');
    await activate();
    inducingContextLoss = false;
    await page.waitForSelector('.vigia-avatar-listening canvas');
  });
  await check('reduzir movimento conserva uma pose estável', async() => {
    await page.click('[aria-label="Usar imagem do avatar"]');
    await page.waitForFunction(() => !document.querySelector('canvas'));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await activate();
    await wait(1200);
    const canvas = await page.$('canvas');
    const first = await canvas.screenshot();
    await wait(700);
    const second = await canvas.screenshot({ path: prefix + '-' + label + '-reduced-motion.png' });
    const hashes = [first, second].map(bytes => createHash('sha256').update(bytes).digest('hex'));
    assert.equal(hashes[0], hashes[1], 'A reduced-motion avatar should keep the same rendered pose.');
    profile.reducedMotionHashes = hashes;
  });
  await check('alternar para 2D e encerrar voz libera todos os recursos fictícios', async() => {
    await page.click('[aria-label="Usar imagem do avatar"]');
    await page.waitForFunction(() => !document.querySelector('canvas'));
    await page.click('[title="Encerrar"]');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Sim, encerrar'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Sim, encerrar').click());
    await page.waitForFunction(() => window.avatarReview.tracks.every(track => track.readyState === 'ended') && window.avatarReview.sockets.every(socket => socket.readyState === 3));
    assert.deepEqual(profile.errors, []);
    assert.deepEqual(profile.graphicsErrors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  });
  browser.off('targetcreated', attachWorker);
  await bounded(context.close()); page = null; context = null;
}

(async() => {
  try {
    fs.mkdirSync(path.dirname(prefix), { recursive: true });
    assert.ok(fs.existsSync(path.join(publicDir, 'index.html')), 'Prepare o build selecionado antes de rodar o teste.');
    assert.ok(fs.existsSync(path.join(publicDir, 'model/vigia-original.glb')), 'O modelo original precisa fazer parte do build.');
    report.bundleSha256 = createHash('sha256').update(fs.readFileSync(path.join(publicDir, 'index.html'))).digest('hex');
    if (online) {
      const expectedHTML = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
      const localEntry = expectedHTML.match(/<script[^>]+src="([^\"]+\/index-[^\"]+\.js)"/)?.[1];
      report.expectedEntry = process.env.VIGIA_AVATAR_EXPECTED_ENTRY || localEntry;
      report.entrySource = process.env.VIGIA_AVATAR_EXPECTED_ENTRY ? 'Verified deployment entry supplied by test operator; build environment may change the JavaScript hash.' : 'Selected local build.';
      assert.ok(report.expectedEntry, 'Bundle de entrada atual não encontrado.');
      assert.match(report.expectedEntry, /^\/assets\/index-[A-Za-z0-9_-]+\.js$/, 'O bundle esperado precisa ser um arquivo versionado da pasta assets.');
    } else await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3138, '127.0.0.1', resolve); });
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, args: ['--no-sandbox', '--disable-background-networking', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'], timeout: 60000 });
    await profile(false); await profile(true);
    report.status = 'passed';
    console.log('PASS ' + report.checks.length + ' verificações de avatar no app.');
  } catch (error) {
    report.status = 'failed'; report.checks.push({ name: (label || 'setup') + ': ' + stage, status: 'failed', error: error.message });
    report.stack = error.stack; process.exitCode = 1; console.error(error.stack);
    if (page) { report.failureText = await bounded(page.evaluate(() => document.body.innerText)).catch(() => null); await bounded(page.screenshot({ path: prefix + '-failure.png', fullPage: true })).catch(() => {}); }
  } finally {
    fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2));
    if (context) await bounded(context.close()).catch(() => {});
    if (browser) await bounded(browser.close()).catch(() => browser.process()?.kill());
    if (!online) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
})();
