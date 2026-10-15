const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { resolvePublicTestOrigin } = require('./browser-target.cjs');

// Real application, public static files and service worker. Only /api/status and
// guest bootstrap are simulated. No AI request, real sign-in, Firebase write or microphone.
// This verifies a registered/controlling PWA, not installation on a physical phone.
// node --use-system-ca tests/loading-regression-browser.cjs [--online] [--label run]
const args = process.argv.slice(2);
let label = process.env.VIGIA_LOADING_REGRESSION_LABEL || 'run';
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--label') { label = args[++index]; continue; }
  if (args[index].startsWith('--label=')) { label = args[index].slice(8); continue; }
  if (!['--online','--auth-only'].includes(args[index])) throw Error('Opção desconhecida: ' + args[index]);
}
const authOnly=args.includes('--auth-only');
assert.ok(label && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(label), 'Rótulo de teste inválido.');
const publicUrl = resolvePublicTestOrigin(process.env.VIGIA_TEST_URL);
const online = args.includes('--online') || !!process.env.VIGIA_TEST_URL;
const root = online ? publicUrl : 'http://localhost:3122';
const adultVersion = fs.readFileSync('src/lib/audience.ts', 'utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert.ok(adultVersion, 'Confirmação de público adulto não encontrada.');
const prefix = `loading-regression-${online ? 'online' : 'local'}-${label}`;
const statusFixture = { demo: false, realAI: true, audience: '18plus', ai: { mode: 'adult-gemini', provider: 'gemini', blocked: null, consentVersion: 'fixture-loading-only', voice: true } };
const report = { url: root, startedAt: new Date().toISOString(), scope: 'Regressão de carregamento desktop/celular emulado. /api/status e sessão guest simulados explicitamente; nenhum serviço de IA, conta real, escrita Firebase ou microfone. Assets e service worker reais. Offline não equivale à instalação em aparelho físico.',
  results: [], contexts: [], authResetObservations: [], authOnly, status: 'running' };
fs.mkdirSync('artifacts', { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeUrl = value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return String(value).split(/[?#]/)[0]; } };
let browser, server, page, activeContext, stage = 'setup';

async function check(name, fn) {
  stage = name;
  try { await fn(); report.results.push({ name, status: 'passed' }); console.log('PASS ' + name); }
  catch (error) { report.results.push({ name, status: 'failed', error: error.message }); throw error; }
}
async function visible(selector) { await page.waitForSelector(selector, { visible: true }); }
async function button(text, within = 'body') {
  await page.waitForFunction(({ text, within }) => [...document.querySelectorAll(within + ' button')].some(element => element.textContent.trim() === text && element.getClientRects().length && !element.disabled), {}, { text, within });
  await page.evaluate(({ text, within }) => [...document.querySelectorAll(within + ' button')].find(element => element.textContent.trim() === text && element.getClientRects().length && !element.disabled).click(), { text, within });
}
async function closeDialog(selector) {
  await page.keyboard.press('Escape');
  await page.waitForSelector(selector, { hidden: true });
}
async function homeReady() {
  await visible('[aria-label="Progresso da aventura"]');
  await page.waitForFunction(() => !document.querySelector('[aria-label="Boas-vindas à Vigia"]') && document.querySelector('[aria-label="Início"]')?.getAttribute('aria-current') === 'page');
}
async function chatReady() {
  await visible('[aria-label="Conversa por texto"]'); await visible('textarea');
  await page.waitForFunction(() => document.querySelector('[aria-label="Conversa & Voz"]')?.getAttribute('aria-current') === 'page');
}
async function learnReady() { await visible('[aria-label="Áreas de aprendizagem"]'); await visible('[aria-label="Iniciar missão: Reconheça os perigos"]'); }
async function screenshot(profile, name) { await page.screenshot({ path: `artifacts/${prefix}-${profile}-${name}.png`, fullPage: true }); }
async function failureEvidence(id) {
  if (!page || page.isClosed()) return;
  await page.screenshot({ path: `artifacts/${prefix}-${id}-failure.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`artifacts/${prefix}-${id}-failure.txt`, await page.$eval('body', element => element.innerText).catch(() => ''));
}
async function authResetSnapshot() {
  return page.evaluate(()=>{
    const emailFields=document.querySelectorAll('[aria-label="E-mail"]'),passwordFields=document.querySelectorAll('[aria-label="Senha"]');
    const email=emailFields[0],password=passwordFields[0];
    return {emailExists:!!email,passwordExists:!!password,emailCount:emailFields.length,passwordCount:passwordFields.length,
      emailIsInput:email instanceof HTMLInputElement,passwordIsInput:password instanceof HTMLInputElement,
      emailCleared:email?.value==='',passwordCleared:password?.value==='',
      emailVisible:!!email?.getClientRects().length,passwordVisible:!!password?.getClientRects().length,
      visibilityState:document.visibilityState};
  });
}
async function assertNoCapture() {
  assert.deepEqual(await page.evaluate(() => ({ microphone: window.loadingGuards.microphone, sockets: window.loadingGuards.sockets, consent: window.loadingGuards.consent })), { microphone: 0, sockets: 0, consent: 0 });
}

async function newContext(mobile, id, seedGuest) {
  activeContext = await browser.createBrowserContext();
  page = await activeContext.newPage();
  page.setDefaultTimeout(40000); page.setDefaultNavigationTimeout(90000);
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const state = { id, statusMode: 'hold', offline: false, statusRequests: [], pending: [], forbidden: [], pageErrors: [], requests: [], workerSessions: new Set() };
  report.contexts.push({ id, statusRequests: state.statusRequests, forbidden: state.forbidden, pageErrors: state.pageErrors, requests: state.requests });
  await page.evaluateOnNewDocument(({ seedGuest, adultVersion }) => {
    sessionStorage.setItem('vigia_adult_access', adultVersion);
    if (seedGuest) localStorage.setItem('dc_is_guest', 'true');
    localStorage.setItem('vigia_feedback_v1:guest', JSON.stringify({ sounds: false, vibration: false, animations: false }));
    window.loadingGuards = { microphone: 0, sockets: 0, consent: 0 };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { window.loadingGuards.microphone++; return Promise.reject(new DOMException('Captura bloqueada pelo teste de interface.', 'NotAllowedError')); };
    const NativeWS = window.WebSocket;
    window.WebSocket = class extends NativeWS { constructor(...args) { window.loadingGuards.sockets++; throw Error('WebSocket não autorizado neste teste de carregamento.'); } };
    window.confirm = () => { window.loadingGuards.consent++; return false; };
  }, { seedGuest, adultVersion });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    try {
      const url = new URL(request.url()), pathname = url.pathname;
      state.requests.push({ stage, url: safeUrl(request.url()), method: request.method(), type: request.resourceType() });
      if (url.origin === root && pathname === '/api/status') {
        state.statusRequests.push({ stage, mode: state.statusMode, offline: state.offline });
        if (state.offline) return await request.abort('internetdisconnected');
        if (state.statusMode === 'hold') { state.pending.push(request); return; }
        return await request.respond({ status: state.statusMode === 'error' ? 503 : 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(state.statusMode === 'error' ? { error: 'Indisponibilidade 503 simulada pelo teste.' } : statusFixture) });
      }
      if (url.origin === root && ['/api/session', '/api/adult-access'].includes(pathname)) {
        if (state.offline) return await request.abort('internetdisconnected');
        return await request.respond({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: '{"ok":true,"simulated":true}' });
      }
      if ((url.origin === root && pathname.startsWith('/api/')) || /firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|generativelanguage\.googleapis\.com|api\.openai\.com/.test(url.hostname) || /^(?:127\.0\.0\.1|localhost)$/.test(url.hostname) && ['8080', '9099'].includes(url.port)) {
        state.forbidden.push({ stage, url: safeUrl(request.url()), method: request.method() });
        return await request.abort('blockedbyclient');
      }
      if (state.offline) return await request.abort('internetdisconnected');
      await request.continue();
    } catch (error) { if (!/closed|handled|invalid interception/i.test(error.message)) state.pageErrors.push({ stage, message: 'Fixture: ' + error.message }); }
  });
  page.on('pageerror', error => state.pageErrors.push({ stage, message: error.message }));
  // Existing and newly created service-worker targets receive the same offline
  // condition as the page. The request interceptor also blocks accidental network.
  state.attachWorker = async target => {
    if (target.type() !== 'service_worker' || !target.url().startsWith(root + '/') || target.browserContext() !== activeContext) return;
    try {
      const session = await target.createCDPSession(); state.workerSessions.add(session);
      await session.send('Network.enable');
      await session.send('Network.emulateNetworkConditions', { offline: state.offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    } catch (error) { state.pageErrors.push({ stage, message: 'Fixture SW: ' + error.message }); }
  };
  browser.on('targetcreated', state.attachWorker);
  for (const target of browser.targets()) await state.attachWorker(target);
  state.close = async () => {
    browser.off('targetcreated', state.attachWorker);
    for (const request of state.pending.splice(0)) await request.abort('aborted').catch(() => {});
    await activeContext.close(); activeContext = undefined; page = undefined;
  };
  return state;
}

async function answerPending(state, status) {
  state.statusMode = status === 200 ? 'ready' : 'error';
  assert.ok(state.pending.length, 'O status pendente precisa ter sido solicitado pelo aplicativo.');
  for (const request of state.pending.splice(0)) await request.respond({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(status === 200 ? statusFixture : { error: 'Falha 503 simulada pelo teste.' }) });
}
async function cacheInventory() {
  return page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      result.push({ name, urls: (await cache.keys()).map(request => { const url = new URL(request.url); return url.origin + url.pathname; }) });
    }
    return result;
  });
}
function assertPublicCache(inventory) {
  const urls = inventory.flatMap(cache => cache.urls);
  assert.ok(urls.some(url => url.startsWith(root + '/assets/')), 'O PWA deve salvar assets públicos usados.');
  for (const value of urls) {
    const url = new URL(value);
    assert.ok(!/^\/api(?:\/|$)/.test(url.pathname) && !/firestore|identitytoolkit|securetoken|generativelanguage|openai/i.test(url.hostname), 'Cache não pode conter API/conta/IA: ' + value);
    assert.ok(url.origin === root ? /^(?:\/|\/index\.html|\/manifest\.webmanifest|\/robots\.txt|\/assets\/.+\.(?:js|css)|\/icons\/.+\.(?:svg|png|ico)|\/model\/avatar-preview-(?:female|male)\.png)$/.test(url.pathname) : /^fonts\.(?:googleapis|gstatic)\.com$/.test(url.hostname), 'Somente arquivos públicos conhecidos podem ficar no CacheStorage: ' + value);
  }
}

async function statusAndLazy(mobile) {
  const profile = mobile ? 'mobile' : 'desktop', state = await newContext(mobile, profile + '-status-lazy', false);
  try {
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await visible('[aria-label="Boas-vindas à Vigia"]');
    await check(profile + ': painéis lazy ausentes antes de sua primeira abertura', async () => {
      assert.equal(state.requests.some(request => /\/(?:AuthModal|ProfileModal|BadgesModal)-[^/]+\.js$/.test(new URL(request.url).pathname)), false);
    });
    await check(profile + ': Auth abre, fecha e reabre sem enviar ou reter credenciais', async () => {
      await button('Entrar ou criar conta'); await visible('[aria-label="Acessar sua conta"]');
      await page.type('[aria-label="E-mail"]', 'adulto.ficticio@example.invalid');
      await page.type('[aria-label="Senha"]', 'senha-ficticia-nao-enviada');
      await closeDialog('[aria-label="Acessar sua conta"]');
      await page.click('[aria-label="Entrar ou Criar Conta"]'); await visible('[aria-label="Acessar sua conta"]');
      // Auth intentionally clears credentials in its open-state effect, after
      // the retained modal becomes visible; wait for that documented reset.
      const observation={profile,startedAt:new Date().toISOString(),polling:'raf',timeoutMs:5000,initial:await authResetSnapshot(),waitTimedOut:false};
      report.authResetObservations.push(observation);
      const started=Date.now();
      try {
        await page.waitForFunction(() => document.querySelector('[aria-label="E-mail"]')?.value === '' && document.querySelector('[aria-label="Senha"]')?.value === '', { timeout: 5000 });
      } catch(error) {
        observation.waitTimedOut=true;observation.afterTimeout=await authResetSnapshot();
        const state=observation.afterTimeout;
        // A timed-out RAF observer alone does not prove retained credentials.
        // Accept only an immediate, explicit read of unique, visible, cleared
        // inputs; preserve the timing failure instead of claiming a <=5s reset.
        if(!(state.emailCount===1&&state.passwordCount===1&&state.emailIsInput&&state.passwordIsInput&&state.emailVisible&&state.passwordVisible&&state.emailCleared&&state.passwordCleared))throw error;
        observation.timingVerified=false;
        observation.note='RAF wait exceeded5s; immediate independent DOM read found both unique visible fields cleared. Reset functionality verified, <=5s timing not established.';
      }
      observation.elapsedMs=Date.now()-started;observation.final=await authResetSnapshot();
      if(!observation.waitTimedOut)observation.timingVerified=true;
      assert.equal(await page.$eval('[aria-label="E-mail"]', input => input.value), '');
      assert.equal(await page.$eval('[aria-label="Senha"]', input => input.value), '');
      assert.equal(state.requests.filter(request => /\/AuthModal-[^/]+\.js$/.test(new URL(request.url).pathname)).length, 1, 'Reabrir não deve baixar novamente o módulo Auth.');
    });
    if(authOnly){await assertNoCapture();assert.deepEqual(state.forbidden,[]);assert.deepEqual(state.pageErrors,[]);return;}
    await check(profile + ': Home utilizável enquanto /api/status permanece pendente', async () => {
      await button('Continuar como Visitante', '[aria-label="Acessar sua conta"]'); await homeReady();
      assert.ok(state.pending.length > 0); assert.ok(state.statusRequests.every(request => request.mode === 'hold'));
      await screenshot(profile, 'home-pending');
    });
    await check(profile + ': Chat pendente desabilita voz e microfone sem abrir captura', async () => {
      await page.click('[aria-label="Conversa & Voz"]'); await chatReady();
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Verificando conexão"]').length === 2 && [...document.querySelectorAll('[aria-label="Verificando conexão"]')].every(button => button.disabled));
      await page.evaluate(() => document.querySelectorAll('[aria-label="Verificando conexão"]').forEach(button => button.click()));
      await assertNoCapture();
    });
    await check(profile + ': status 503 oferece nova verificação honesta e texto preservado', async () => {
      await page.type('textarea', 'Rascunho fictício local, sem envio.');
      await answerPending(state, 503);
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Verificar conexão"]').length === 2);
      assert.match(await page.$eval('body', element => element.innerText), /Não foi possível verificar a conexão/);
      assert.equal(await page.$eval('textarea', input => input.value), 'Rascunho fictício local, sem envio.');
      await assertNoCapture(); await screenshot(profile, 'connection-503');
    });
    await check(profile + ': botão de voz refaz somente GET/status e pode falhar novamente', async () => {
      const previous = state.statusRequests.length; state.statusMode = 'hold';
      await page.click('[aria-label="Verificar conexão"]');
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="Verificando conexão"]').length === 2);
      for (let index = 0; index < 100 && !state.pending.length; index++) await wait(20);
      assert.equal(state.statusRequests.length, previous + 1);
      await assertNoCapture(); await answerPending(state, 503);
      await visible('[aria-label="Verificar conexão"]');
    });
    await check(profile + ': botão do microfone recupera status sem iniciar voz automaticamente', async () => {
      const previous = state.statusRequests.length; state.statusMode = 'hold';
      await page.evaluate(() => [...document.querySelectorAll('[aria-label="Verificar conexão"]')].at(-1).click());
      for (let index = 0; index < 100 && !state.pending.length; index++) await wait(20);
      assert.equal(state.statusRequests.length, previous + 1);
      await answerPending(state, 200); await visible('[aria-label="Conversa por voz"]');
      await visible('[aria-label="Falar pelo microfone"]');
      await wait(200); await assertNoCapture();
      assert.equal(await page.$eval('textarea', input => input.value), 'Rascunho fictício local, sem envio.');
    });
    await check(profile + ': Profile lazy mantém rascunho ao fechar e reabrir', async () => {
      await page.click('[aria-label="Perfil (Modo Visitante)"]'); await visible('[aria-label="Meu perfil"]');
      await page.click('[title="Editar Apelido"]');
      const selector = '[aria-label="Meu perfil"] input[type="text"]';
      await page.$eval(selector, input => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.click(selector, { clickCount: 3 }); await page.type(selector, 'Rascunho fictício QA');
      await closeDialog('[aria-label="Meu perfil"]');
      await page.click('[aria-label="Perfil (Modo Visitante)"]'); await visible(selector);
      assert.equal(await page.$eval(selector, input => input.value), 'Rascunho fictício QA');
      assert.equal(state.requests.filter(request => /\/ProfileModal-[^/]+\.js$/.test(new URL(request.url).pathname)).length, 1);
      await screenshot(profile, 'profile-reopened');
    });
    await check(profile + ': Badges lazy abre e reabre com as mesmas conquistas', async () => {
      await button('Ver todas as medalhas', '[aria-label="Meu perfil"]');
      await visible('[aria-label="Medalhas e conquistas"]');
      const previous = await page.$eval('[aria-label="Medalhas e conquistas"]', element => element.innerText);
      await closeDialog('[aria-label="Medalhas e conquistas"]');
      await page.click('[aria-label="Perfil (Modo Visitante)"]'); await visible('[aria-label="Meu perfil"]');
      await button('Ver todas as medalhas', '[aria-label="Meu perfil"]'); await visible('[aria-label="Medalhas e conquistas"]');
      assert.equal(await page.$eval('[aria-label="Medalhas e conquistas"]', element => element.innerText), previous);
      assert.equal(state.requests.filter(request => /\/BadgesModal-[^/]+\.js$/.test(new URL(request.url).pathname)).length, 1);
      await closeDialog('[aria-label="Medalhas e conquistas"]');
    });
    await check(profile + ': nenhuma conta, IA, captura ou sessão de voz acionada', async () => {
      await assertNoCapture(); assert.deepEqual(state.forbidden, []); assert.deepEqual(state.pageErrors, []);
    });
  } catch (error) { await failureEvidence(state.id); throw error; }
  finally { await state.close(); }
}

async function offlinePwa(mobile) {
  const profile = mobile ? 'mobile' : 'desktop', state = await newContext(mobile, profile + '-offline-pwa', true);
  state.statusMode = 'ready';
  const evidence = report.contexts.at(-1);
  try {
    await page.goto(root, { waitUntil: 'domcontentloaded' }); await homeReady();
    await check(profile + ': service worker instala e controla uma nova navegação', async () => {
      await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', { timeout: 60000 });
      await page.reload({ waitUntil: 'domcontentloaded' }); await homeReady();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      evidence.controllingWorker = await page.evaluate(() => ({ scriptURL: navigator.serviceWorker.controller.scriptURL, state: navigator.serviceWorker.controller.state }));
    });
    await check(profile + ': páginas visitadas e atividade pública ficam no cache do PWA', async () => {
      await page.click('[aria-label="Aprender com a Vigia"]'); await learnReady();
      await page.click('[aria-label="Iniciar missão: Reconheça os perigos"]'); await visible('[aria-label="Reconheça os perigos"] .answer-option');
      await button('Voltar às missões'); await learnReady();
      await page.click('[aria-label="Conversa & Voz"]'); await chatReady();
      await visible('[aria-label="Conversa por voz"]');
      await page.click('[aria-label="Início"]'); await homeReady();
      const visited = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url => url.origin === location.origin && url.pathname.startsWith('/assets/') && /\.(?:js|css)$/.test(url.pathname)).map(url => url.origin + url.pathname));
      await page.waitForFunction(async urls => {
        const stored = new Set();
        for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) { const url = new URL(request.url); stored.add(url.origin + url.pathname); }
        return urls.every(url => stored.has(url));
      }, { timeout: 40000 }, [...new Set(visited)]);
      evidence.visitedPublicAssets = [...new Set(visited)];
      evidence.cacheBeforeOffline = await cacheInventory(); assertPublicCache(evidence.cacheBeforeOffline);
      assert.ok(evidence.cacheBeforeOffline.flatMap(cache => cache.urls).some(url => /\/ChatTab-[^/]+\.js$/.test(new URL(url).pathname)));
      assert.ok(evidence.cacheBeforeOffline.flatMap(cache => cache.urls).some(url => /\/LearningCenter-[^/]+\.js$/.test(new URL(url).pathname)));
    });
    await check(profile + ': reload sem rede abre Home pelo PWA', async () => {
      state.offline = true;
      await page.setOfflineMode(true);
      for (const session of state.workerSessions) await session.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await page.reload({ waitUntil: 'domcontentloaded' }); await homeReady();
      assert.equal(await page.evaluate(() => navigator.onLine), false);
      assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
      await screenshot(profile, 'offline-home');
    });
    await check(profile + ': atividade visitada abre e responde sem rede nem IA', async () => {
      await page.click('[aria-label="Aprender com a Vigia"]'); await learnReady();
      await page.click('[aria-label="Iniciar missão: Reconheça os perigos"]');
      await visible('[aria-label="Reconheça os perigos"] .answer-option');
      await button('É perigoso', '[aria-label="Reconheça os perigos"]');
      await visible('[aria-label="Reconheça os perigos"] .mission-feedback');
      assert.match(await page.$eval('[aria-label="Reconheça os perigos"] .mission-feedback', element => element.innerText), /água pode esconder buracos/i);
      await screenshot(profile, 'offline-activity');
      await button('Voltar às missões');
    });
    await check(profile + ': Chat offline abre texto e informa falha de conexão', async () => {
      await page.click('[aria-label="Conversa & Voz"]'); await chatReady();
      await visible('[aria-label="Verificar conexão"]');
      await page.type('textarea', 'Rascunho offline fictício, sem envio.');
      assert.equal(await page.$eval('textarea', input => input.value), 'Rascunho offline fictício, sem envio.');
      await assertNoCapture(); await screenshot(profile, 'offline-chat');
    });
    await check(profile + ': CacheStorage contém só assets públicos, sem API ou dados Firebase', async () => {
      evidence.cacheAfterOffline = await cacheInventory(); assertPublicCache(evidence.cacheAfterOffline);
      assert.deepEqual(state.forbidden, []); await assertNoCapture();
      assert.deepEqual(state.pageErrors, []);
    });
  } catch (error) { await failureEvidence(state.id); throw error; }
  finally { await state.close(); }
}

(async () => {
  try {
    if (!online) {
      let occupied = false;
      try { await fetch(root + '/api/status', { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
      assert.equal(occupied, false, 'A porta exclusiva 3122 já está ocupada.');
      server = spawn(process.execPath, ['--use-system-ca', 'dist/presentation/server/server.cjs'], { env: require('../scripts/gemini-env.cjs').geminiEnv('3122'), windowsHide: true, stdio: 'ignore' });
      let ready = false;
      for (let index = 0; index < 150; index++) {
        assert.equal(server.exitCode, null, 'Servidor de apresentação encerrou antes do teste.');
        try { if ((await fetch(root + '/api/status', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
        await wait(100);
      }
      assert.ok(ready, 'O servidor de apresentação não iniciou.');
    }
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ executablePath: process.env.VIGIA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true,
      args: ['--no-sandbox', '--disable-background-networking', '--deny-permission-prompts', '--mute-audio'] });
    for (const mobile of (authOnly?[false]:[false,true])) { await statusAndLazy(mobile); if(!authOnly)await offlinePwa(mobile); }
    report.status = 'passed';
    console.log(`PASS ${report.results.length} checks de carregamento/conexão/lazy/offline; serviços de IA e contas não utilizados.`);
  } catch (error) {
    report.status = 'failed'; report.error = error.message; report.failureStage = stage; process.exitCode = 1; console.error(stage + ': ' + error.message);
    if (page && !page.isClosed()) {
      await page.screenshot({ path: `artifacts/${prefix}-failure.png`, fullPage: true }).catch(() => {});
      fs.writeFileSync(`artifacts/${prefix}-failure.txt`, await page.$eval('body', element => element.innerText).catch(() => ''));
    }
  } finally {
    if (activeContext) await activeContext.close().catch(() => {});
    if (browser) {
      let timer;
      try { await Promise.race([browser.close(), new Promise(resolve => timer = setTimeout(resolve, 10000))]); }
      finally { clearTimeout(timer); if (browser.process()?.exitCode === null) browser.process().kill(); }
    }
    server?.kill(); report.finishedAt = new Date().toISOString();
    fs.writeFileSync(`artifacts/${prefix}.json`, JSON.stringify(report, null, 2));
  }
})();
