const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// Real legacy/current bundles and real SW lifecycle, same origin and storage.
// No production or real service is contacted. API answers are local fixtures;
// microphone and sockets are blocked because this test only updates text UI.
const legacyDir = path.resolve(process.env.VIGIA_LEGACY_PUBLIC_DIR || 'artifacts/avatar-upgrade-legacy-20261017/public');
const currentDir = path.resolve(process.env.VIGIA_CURRENT_PUBLIC_DIR || 'dist/publication/public');
const origin = 'http://127.0.0.1:3140';
const prefix = 'artifacts/vigia-original-upgrade';
const historyKey = 'vigia_guest_chat_sessions_v1';
const adultVersion = fs.readFileSync('src/lib/audience.ts', 'utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
const legacyHTML = fs.readFileSync(path.join(legacyDir, 'index.html'), 'utf8');
const legacyEntry = legacyHTML.match(/<script[^>]+src="([^\"]+\/index-[^\"]+\.js)"/)?.[1];
const currentHTML = fs.readFileSync(path.join(currentDir, 'index.html'), 'utf8');
const currentEntry = currentHTML.match(/<script[^>]+src="([^\"]+\/index-[^\"]+\.js)"/)?.[1];
const report = { status: 'running', scope: 'Local real SW upgrade from preserved legacy public bundle to the selected current public build. Same browser context, persisted guest history/progress/access and an IndexedDB sentinel. Every API reply is fictitious; sockets/capture/external traffic blocked. This does not validate a signed-in Firebase account or the byte-exact legacy Render production bundle.', legacyDir, currentDir, legacyEntry, currentEntry, checks: [], profiles: [], requests: [] };
const status = { demo: false, realAI: true, localDemo: false, audience: '18plus', ai: { mode: 'adult-gemini', provider: 'gemini', blocked: null, consentVersion: 'avatar-upgrade-fixture', voice: true } };
let serving = 'legacy', browser, page, context, label = 'setup', stage = 'setup';
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function bounded(promise, milliseconds = 6000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Prazo de fechamento do navegador excedido.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (response, code, data) => { response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
const server = http.createServer(async(request, response) => {
  try {
    const pathname = new URL(request.url, origin).pathname;
    report.requests.push({ label, serving, pathname, method: request.method });
    if (pathname === '/api/status') return json(response, 200, status);
    if (['/api/session', '/api/adult-access'].includes(pathname)) return json(response, 200, { ok: true, simulated: true });
    if (pathname === '/api/ai-access') return json(response, 200, { allowed: true, voice: true, blocked: null });
    if (pathname === '/api/chat') return json(response, 200, { reply: 'Resposta fictícia salva antes de atualizar.', avatarState: 'explaining', status: 'ok' });
    if (pathname.startsWith('/api/')) return json(response, 503, { error: 'Serviço bloqueado neste teste de atualização.' });
    const directory = serving === 'legacy' ? legacyDir : currentDir;
    const file = path.resolve(directory, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': pathname === '/sw.js' ? 'no-cache' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    if (pathname === '/sw.js' && serving === 'future') { response.end(fs.readFileSync(file, 'utf8') + '\n// avatar-upgrade-fixture-next-release\n'); return; }
    fs.createReadStream(file).pipe(response);
  } catch (error) { json(response, 500, { error: error.message }); }
});

async function check(name, action) {
  stage = name;
  await action();
  report.checks.push({ name: label + ': ' + name, status: 'passed' });
  console.log('PASS ' + label + ': ' + name);
}

async function clickText(text) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === text && !button.disabled), {}, text);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled).click(), text);
}

async function chat() {
  await page.waitForSelector('[aria-label="Conversa & Voz"], [title="Conversa & Voz"]');
  await page.click('[aria-label="Conversa & Voz"], [title="Conversa & Voz"]');
  await page.waitForSelector('textarea');
}

async function stored() {
  return page.evaluate(async({ historyKey }) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('vigia-upgrade-local-session', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const sentinel = await new Promise((resolve, reject) => { const request = db.transaction('session').objectStore('session').get('fictitious-session'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    return { history: localStorage.getItem(historyKey), guest: localStorage.getItem('dc_is_guest'), progress: localStorage.getItem('vigia_progress:guest'), adult: sessionStorage.getItem('vigia_adult_access'), sentinel };
  }, { historyKey });
}

async function run(mobile) {
  label = mobile ? 'mobile' : 'desktop'; serving = 'legacy';
  const profile = { label, errors: [], forbidden: [], states: [] };
  report.profiles.push(profile);
  context = await browser.createBrowserContext(); page = await context.newPage();
  page.setDefaultTimeout(40000);
  page.on('pageerror', error => profile.errors.push(error.message));
  page.on('dialog', dialog => void dialog.accept());
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (['blob:', 'data:'].includes(url.protocol) || url.origin === origin) { void request.continue(); return; }
    profile.forbidden.push(url.origin + url.pathname); void request.abort('blockedbyclient');
  });
  await page.evaluateOnNewDocument(({ adultVersion, historyKey }) => {
    // window.name survives this same-origin reload. Do not reseed storage on
    // update, otherwise a regression that clears it would be hidden by setup.
    if (window.name !== 'vigia-upgrade-test-seeded') {
      window.name = 'vigia-upgrade-test-seeded';
      localStorage.setItem('vigia_upgrade_seed', 'true');
      localStorage.setItem('dc_is_guest', 'true');
      localStorage.setItem('vigia_progress:guest', JSON.stringify({ nickname: 'Pessoa fictícia', avatarGender: 'female', starsScore: 17 }));
      localStorage.setItem(historyKey, JSON.stringify([{ id: 'upgrade-old-session', title: 'Conversa antes da atualização', createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z', messages: [{ id: 'upgrade-old-user', role: 'user', content: 'Pergunta anterior fictícia.', timestamp: '2026-10-17T00:00:00.000Z' }, { id: 'upgrade-old-reply', role: 'assistant', content: 'Resposta anterior fictícia.', timestamp: '2026-10-17T00:00:00.000Z' }] }]));
      sessionStorage.setItem('vigia_adult_access', adultVersion);
      localStorage.setItem('vigia_ai_consent:guest', 'avatar-upgrade-fixture');
    }
    window.upgradeGuards = { microphone: 0, sockets: 0 };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { window.upgradeGuards.microphone++; return Promise.reject(new DOMException('Captura bloqueada neste teste.', 'NotAllowedError')); };
    window.WebSocket = class { constructor() { window.upgradeGuards.sockets++; throw Error('Socket bloqueado neste teste local.'); } };
  }, { adultVersion, historyKey });
  const opening = await page.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.equal(opening.status(), 200, 'O servidor da fixture precisa entregar o HTML antigo.');
  await page.waitForFunction(async() => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', { timeout: 60000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForFunction(() => document.body.innerText.includes('Olá, Pessoa fictícia.'));
  await chat();
  await check('a versão antiga está controlada pelo worker e usa o avatar antigo', async() => {
    assert.ok(await page.$('img[src="/model/avatar-preview-female.png"]'));
    assert.equal(await page.$('img[src="/model/vigia-original-head.png"]'), null);
    await page.evaluate(async() => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('vigia-upgrade-local-session', 1); request.onupgradeneeded = () => request.result.createObjectStore('session'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise((resolve, reject) => { const transaction = db.transaction('session', 'readwrite'); transaction.objectStore('session').put({ nickname: 'Sessão local fictícia', marker: 'preserve-me' }, 'fictitious-session'); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
      db.close();
    });
    await page.click('[title="Abrir histórico de conversas"]');
    await clickText('Conversa antes da atualização');
    await page.waitForFunction(() => document.body.innerText.includes('Resposta anterior fictícia.'));
    await page.type('textarea', 'Rascunho fictício que deve permanecer.');
    profile.before = await stored();
    await page.screenshot({ path: prefix + '-' + label + '-legacy.png', fullPage: true });
  });
  serving = 'current';
  const swBeforeFocus = report.requests.filter(request => request.label === label && request.pathname === '/sw.js').length;
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
  await wait(1500);
  profile.focusObservation = await page.evaluate(async() => ({ waiting: !!(await navigator.serviceWorker.getRegistration())?.waiting, draft: document.querySelector('textarea')?.value, currentAvatar: !!document.querySelector('img[src="/model/vigia-original-head.png"]') }));
  profile.focusObservation.swFetches = report.requests.filter(request => request.label === label && request.pathname === '/sw.js').length - swBeforeFocus;
  await check('um check real do worker identifica a versão nova e mostra o aviso', async() => {
    await page.evaluate(async() => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    await page.waitForFunction(async() => !!(await navigator.serviceWorker.getRegistration())?.waiting);
    await page.waitForSelector('[aria-label="Atualização do aplicativo"]');
    await page.screenshot({ path: prefix + '-' + label + '-update-ready.png', fullPage: true });
  });
  await check('atualizar com rascunho é bloqueado e conserva a conversa aberta', async() => {
    await clickText('Atualizar Agora');
    await page.waitForFunction(() => document.body.innerText.includes('Há uma mensagem não enviada.'));
    assert.equal(await page.$eval('textarea', element => element.value), 'Rascunho fictício que deve permanecer.');
    assert.equal((await stored()).history, profile.before.history);
    assert.ok(await page.$('img[src="/model/avatar-preview-female.png"]'));
  });
  await check('salvar o rascunho fictício confirma o histórico antes da troca', async() => {
    await page.$eval('textarea', element => element.closest('form').requestSubmit());
    await page.waitForFunction(() => document.body.innerText.includes('Resposta fictícia salva antes de atualizar.') && document.querySelector('textarea').value === '');
    await page.waitForFunction(historyKey => JSON.parse(localStorage.getItem(historyKey) || '[]').some(session => session.messages.some(message => message.content === 'Resposta fictícia salva antes de atualizar.')), {}, historyKey);
    profile.saved = await stored();
  });
  await check('aplicar atualização ativa o worker novo e a cabeça nova sem apagar dados', async() => {
    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await clickText('Atualizar Agora');
    await navigation;
    // The startup authentication listener restores the guest profile and home.
    // Wait for that commit before interacting with the restored navigation.
    await page.waitForFunction(() => document.body.innerText.includes('Olá, Pessoa fictícia.'));
    await chat();
    await page.waitForSelector('img[src="/model/vigia-original-head.png"]');
    await page.waitForFunction(() => [...document.querySelectorAll('img')].some(image => image.src.endsWith('/model/vigia-original-head.png') && image.complete && image.naturalWidth > 0));
    const after = await stored(); profile.after = after;
    assert.equal(after.history, profile.saved.history);
    assert.equal(after.guest, profile.saved.guest);
    assert.equal(after.progress, profile.saved.progress);
    assert.equal(after.adult, profile.saved.adult);
    assert.deepEqual(after.sentinel, profile.saved.sentinel);
    const worker = await page.evaluate(async() => ({ active: (await navigator.serviceWorker.getRegistration())?.active?.state, waiting: !!(await navigator.serviceWorker.getRegistration())?.waiting, controlled: !!navigator.serviceWorker.controller }));
    assert.deepEqual(worker, { active: 'activated', waiting: false, controlled: true });
    await page.click('[title="Abrir histórico de conversas"]');
    await clickText('Conversa antes da atualização');
    await page.waitForFunction(() => document.body.innerText.includes('Resposta anterior fictícia.') && document.body.innerText.includes('Resposta fictícia salva antes de atualizar.'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    assert.deepEqual(profile.errors, []);
    assert.deepEqual(profile.forbidden, []);
    assert.deepEqual(await page.evaluate(() => window.upgradeGuards), { microphone: 0, sockets: 0 });
    await page.screenshot({ path: prefix + '-' + label + '-updated.png', fullPage: true });
  });
  await check('o avatar atualizado mostra o busto na voz e a cabeça ao retornar ao texto', async() => {
    const before = await stored();
    await page.click('[aria-label="Conversa por voz"]');
    await page.waitForSelector('img[src="/model/vigia-original-preview.png"]');
    await page.waitForFunction(() => [...document.querySelectorAll('img')].some(image => image.src.endsWith('/model/vigia-original-preview.png') && image.complete && image.naturalWidth > 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({ path: prefix + '-' + label + '-voice-bust.png', fullPage: true });
    await page.click('[aria-label="Conversa por texto"]');
    await page.waitForSelector('img[src="/model/vigia-original-head.png"]');
    assert.deepEqual(await stored(), before);
    assert.deepEqual(await page.evaluate(() => window.upgradeGuards), { microphone: 0, sockets: 0 });
    assert.deepEqual(profile.errors, []);
  });
  await check('Buscar atualização em Ajuda faz um check real e mantém o estado local', async() => {
    const before = await stored();
    await page.click('[aria-label="Emergência"], [title="Emergência"]');
    const count = report.requests.filter(request => request.label === label && request.pathname === '/sw.js').length;
    await clickText('Buscar atualização');
    await page.waitForFunction(() => document.body.innerText.includes('Versão atual.'));
    assert.ok(report.requests.filter(request => request.label === label && request.pathname === '/sw.js').length > count);
    assert.deepEqual(await stored(), before);
    await page.screenshot({ path: prefix + '-' + label + '-manual-check.png', fullPage: true });
  });
  await check('o cliente novo descobre outra atualização e também protege seu rascunho', async() => {
    await chat();
    await page.type('textarea', 'Rascunho da versão nova, sem envio.');
    const before = await stored();
    serving = 'future';
    await page.click('[aria-label="Emergência"], [title="Emergência"]');
    await clickText('Buscar atualização');
    await page.waitForFunction(async() => !!(await navigator.serviceWorker.getRegistration())?.waiting);
    await page.waitForSelector('[aria-label="Atualização do aplicativo"]');
    await chat();
    assert.equal(await page.$eval('textarea', element => element.value), 'Rascunho da versão nova, sem envio.');
    await clickText('Atualizar Agora');
    await page.waitForFunction(() => document.body.innerText.includes('Há uma mensagem não enviada.'));
    assert.equal(await page.$eval('textarea', element => element.value), 'Rascunho da versão nova, sem envio.');
    assert.deepEqual(await stored(), before);
    assert.deepEqual(profile.errors, []);
    assert.deepEqual(profile.forbidden, []);
    await page.screenshot({ path: prefix + '-' + label + '-protected-new-draft.png', fullPage: true });
  });
  await bounded(context.close()); context = null; page = null;
}

(async() => {
  try {
    fs.mkdirSync('artifacts', { recursive: true });
    assert.ok(currentEntry);
    report.legacySW = hash(fs.readFileSync(path.join(legacyDir, 'sw.js')));
    report.currentSW = hash(fs.readFileSync(path.join(currentDir, 'sw.js')));
    assert.notEqual(report.legacySW, report.currentSW);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3140, '127.0.0.1', resolve); });
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, args: ['--no-sandbox', '--disable-background-networking'], timeout: 60000 });
    await run(false); await run(true);
    report.status = 'passed'; console.log('PASS ' + report.checks.length + ' verificações de atualização real do avatar.');
  } catch (error) {
    report.status = 'failed'; report.checks.push({ name: label + ': ' + stage, status: 'failed', error: error.message }); report.stack = error.stack; process.exitCode = 1; console.error(error.stack);
    if (page) { report.failureText = await page.evaluate(() => document.body.innerText).catch(() => null); await page.screenshot({ path: prefix + '-failure.png', fullPage: true }).catch(() => {}); }
  } finally {
    fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2));
    if (context) await bounded(context.close()).catch(() => {});
    if (browser) await bounded(browser.close()).catch(() => browser.process()?.kill());
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})();
