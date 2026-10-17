const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { resolvePublicTestOrigin } = require('./browser-target.cjs');

// Focused production-asset check, with a fresh browser context. Every API
// response is synthetic; microphone, sockets and unrelated traffic are blocked.
// The native service-worker lifecycle and Registration.update() stay real.
// Example after the target release is confirmed live:
// VIGIA_PWA_TEST_URL=https://vigia-app.onrender.com
// VIGIA_PWA_EXPECTED_ENTRY=/assets/index-<confirmed-hash>.js
// VIGIA_PWA_EVIDENCE_PREFIX=artifacts/vigia-pwa-first-install-render-<release>
// node tests/pwa-first-install-browser.cjs
assert.ok(process.env.VIGIA_PWA_TEST_URL, 'Informe o endereço da publicação já confirmada.');
const origin = resolvePublicTestOrigin(process.env.VIGIA_PWA_TEST_URL);
const expectedEntry = process.env.VIGIA_PWA_EXPECTED_ENTRY;
assert.match(expectedEntry || '', /^\/assets\/index-[A-Za-z0-9_-]+\.js$/, 'Informe a entrada versionada da publicação já confirmada.');
assert.ok(process.env.VIGIA_PWA_EVIDENCE_PREFIX, 'Informe um prefixo exclusivo dentro de artifacts.');
const workspace = fs.realpathSync(process.cwd());
const artifacts = path.join(workspace, 'artifacts');
const prefix = path.resolve(process.env.VIGIA_PWA_EVIDENCE_PREFIX);
const within = (directory, target) => {
  const relative = path.relative(directory, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
assert.ok(within(artifacts, prefix), 'As evidências precisam ficar dentro de artifacts.');
let existingParent = path.dirname(prefix);
while (!fs.existsSync(existingParent)) existingParent = path.dirname(existingParent);
const realParent = fs.realpathSync(existingParent);
assert.ok(realParent === workspace || within(workspace, realParent), 'A evidência não pode sair do workspace.');
if (fs.existsSync(artifacts)) {
  const realArtifacts = fs.realpathSync(artifacts);
  assert.ok(within(workspace, realArtifacts));
  assert.ok(realParent === realArtifacts || within(realArtifacts, realParent), 'A evidência não pode sair de artifacts.');
}
const outputDirectory = path.dirname(prefix), outputName = path.basename(prefix);
assert.ok(!fs.existsSync(outputDirectory) || !fs.readdirSync(outputDirectory).some(name => name === outputName + '.json' || name.startsWith(outputName + '-')), 'Este prefixo já possui evidências; escolha outro.');

const adultVersion = fs.readFileSync('src/lib/audience.ts', 'utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert.ok(adultVersion);
const report = {
  status: 'running', origin, expectedEntry,
  scope: 'Fresh Chrome context using published HTML/JS and real service-worker installation/update. API responses are fictitious. Sockets, microphone and unrelated external traffic are blocked. One mobile viewport; no real AI, login, user data, payment or publication.',
  checks: [], errors: [], external: [], mockedApis: [], workerRequests: [], navigations: [],
};
const status = { demo: false, realAI: true, localDemo: false, audience: '18plus', ai: { mode: 'adult-gemini', provider: 'gemini', blocked: null, consentVersion: 'first-install-fixture', voice: true } };
function fixture(pathname) {
  if (pathname === '/api/status') return { code: 200, data: status };
  if (['/api/session', '/api/adult-access'].includes(pathname)) return { code: 200, data: { ok: true, simulated: true } };
  if (pathname === '/api/ai-access') return { code: 200, data: { allowed: true, voice: true, blocked: null, simulated: true } };
  return { code: 503, data: { error: 'Serviço bloqueado neste teste de primeira instalação.', simulated: true } };
}
let browser, context, page, stage = 'setup';
const workerSessions = new Set();
async function bounded(operation, milliseconds = 6000) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Prazo de operação do navegador excedido.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function check(name, action) {
  stage = name; await action(); report.checks.push({ name, status: 'passed' }); console.log('PASS ' + name);
}
async function state() {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      active: registration?.active?.state || null,
      waiting: registration?.waiting?.state || null,
      controlled: !!navigator.serviceWorker.controller,
      noticeVisible: !!document.querySelector('[aria-label="Atualização do aplicativo"]'),
      evidence: window.firstInstallReview,
      marker: localStorage.getItem('vigia_first_install_marker'),
    };
  });
}

(async () => {
  try {
    fs.mkdirSync(outputDirectory, { recursive: true });
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, args: ['--no-sandbox', '--disable-background-networking'], timeout: 60000 });
    context = await browser.createBrowserContext();
    page = await context.newPage(); page.setDefaultTimeout(45000);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) report.navigations.push(frame.url()); });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (['blob:', 'data:'].includes(url.protocol)) { void request.continue(); return; }
      if (url.pathname.startsWith('/api/')) {
        report.mockedApis.push({ origin: url.origin, pathname: url.pathname, method: request.method() });
        const mocked = fixture(url.pathname);
        void request.respond({ status: request.method() === 'OPTIONS' ? 204 : mocked.code, contentType: 'application/json', headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }, body: request.method() === 'OPTIONS' ? '' : JSON.stringify(mocked.data) }); return;
      }
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
        report.external.push(url.origin + url.pathname); void request.abort('blockedbyclient'); return;
      }
      void request.continue();
    });
    browser.on('targetcreated', async target => {
      if (target.type() !== 'service_worker' || target.browserContext() !== context || !target.url().startsWith(origin + '/')) return;
      try {
        const session = await target.createCDPSession(); workerSessions.add(session);
        session.on('Fetch.requestPaused', async event => {
          try {
            const url = new URL(event.request.url); report.workerRequests.push(url.origin + url.pathname);
            if (url.pathname.startsWith('/api/')) {
              report.mockedApis.push({ origin: url.origin, pathname: url.pathname, method: event.request.method, worker: true });
              const mocked = fixture(url.pathname);
              await session.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: mocked.code, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }, { name: 'Access-Control-Allow-Origin', value: origin }], body: Buffer.from(JSON.stringify(mocked.data)).toString('base64') });
            } else if (url.origin !== origin || !['GET', 'HEAD'].includes(event.request.method)) {
              report.external.push(url.origin + url.pathname); await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
            } else await session.send('Fetch.continueRequest', { requestId: event.requestId });
          } catch (error) { if (!/closed|detached|Invalid Interception/i.test(error.message)) report.errors.push('SW interception: ' + error.message); }
        });
        await session.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      } catch (error) { if (!/closed|detached/i.test(error.message)) report.errors.push('SW attachment: ' + error.message); }
    });
    await page.evaluateOnNewDocument(({ adultVersion }) => {
      if (window.name !== 'vigia-first-install-seeded') {
        window.name = 'vigia-first-install-seeded';
        localStorage.setItem('dc_is_guest', 'true');
        localStorage.setItem('vigia_progress:guest', JSON.stringify({ nickname: 'Teste fictício', avatarGender: 'female' }));
        localStorage.setItem('vigia_ai_consent:guest', 'first-install-fixture');
        sessionStorage.setItem('vigia_adult_access', adultVersion);
        localStorage.setItem('vigia_first_install_marker', 'preserve-fixture');
      }
      window.firstInstallReview = { updates: [], microphone: 0, sockets: 0, everUpdateNotice: false };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { window.firstInstallReview.microphone++; return Promise.reject(new DOMException('Microfone bloqueado no teste.', 'NotAllowedError')); };
      window.WebSocket = class { constructor() { window.firstInstallReview.sockets++; throw Error('Socket bloqueado no teste.'); } };
      const update = ServiceWorkerRegistration.prototype.update;
      ServiceWorkerRegistration.prototype.update = function (...args) {
        const record = { status: 'pending' }; window.firstInstallReview.updates.push(record);
        return update.apply(this, args).then(value => { record.status = 'resolved'; return value; }, error => { record.status = 'rejected'; throw error; });
      };
      new MutationObserver(() => {
        if (document.querySelector('[aria-label="Atualização do aplicativo"]')) window.firstInstallReview.everUpdateNotice = true;
      }).observe(document, { subtree: true, childList: true });
    }, { adultVersion });

    await check('o HTML inicial referencia a publicação final esperada', async () => {
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200); assert.ok((await response.text()).includes(expectedEntry));
      await page.waitForFunction(() => document.body.innerText.includes('Olá, Teste fictício.'));
    });
    await check('a primeira instalação ativa o worker sem anunciar uma atualização', async () => {
      await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', { timeout: 60000 });
      await page.waitForFunction(() => window.firstInstallReview.updates.every(update => update.status !== 'pending'));
      report.firstActivation = await state();
      assert.equal(report.firstActivation.waiting, null); assert.equal(report.firstActivation.noticeVisible, false);
      assert.equal(report.firstActivation.evidence.everUpdateNotice, false);
      assert.equal(report.firstActivation.marker, 'preserve-fixture');
      await page.screenshot({ path: prefix + '-first-activation.png', fullPage: true });
    });
    await check('o cliente controlado conserva o perfil e continua sem aviso falso', async () => {
      // This worker does not claim a page loaded before its first installation.
      // One explicit test reload is needed to obtain its normal controller.
      if (!report.firstActivation.controlled) {
        report.explicitControllerReload = true;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.body.innerText.includes('Olá, Teste fictício.'));
      }
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await page.waitForFunction(() => window.firstInstallReview.updates.every(update => update.status !== 'pending'));
      report.controlledState = await state();
      assert.equal(report.controlledState.waiting, null); assert.equal(report.controlledState.noticeVisible, false);
      assert.equal(report.controlledState.evidence.everUpdateNotice, false);
      assert.equal(report.controlledState.marker, 'preserve-fixture');
    });
    await check('Buscar atualização chama o check nativo e confirma Versão atual', async () => {
      await page.click('[aria-label="Emergência"], [title="Emergência"]');
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Buscar atualização' && !button.disabled));
      const before = await page.evaluate(() => window.firstInstallReview.updates.length);
      await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Buscar atualização' && !button.disabled).click());
      await page.waitForFunction(before => window.firstInstallReview.updates.length > before && window.firstInstallReview.updates.at(-1).status === 'resolved' && document.body.innerText.includes('Versão atual.'), {}, before);
      report.manualCheck = await state();
      assert.equal(report.manualCheck.active, 'activated'); assert.equal(report.manualCheck.controlled, true);
      assert.equal(report.manualCheck.waiting, null); assert.equal(report.manualCheck.noticeVisible, false);
      assert.equal(report.manualCheck.evidence.everUpdateNotice, false);
      assert.equal(report.manualCheck.evidence.microphone, 0); assert.equal(report.manualCheck.evidence.sockets, 0);
      assert.equal(report.manualCheck.marker, 'preserve-fixture');
      assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
      await page.waitForFunction(() => !document.body.innerText.includes('Preparando orientações…'));
      await page.screenshot({ path: prefix + '-manual-check.png', fullPage: true });
    });
    report.status = 'passed'; console.log('PASS ' + report.checks.length + ' verificações de primeira instalação.');
  } catch (error) {
    report.status = 'failed'; report.checks.push({ name: stage, status: 'failed', error: error.message });
    report.stack = error.stack; process.exitCode = 1; console.error(error.stack);
    if (page) { report.failureText = await bounded(page.evaluate(() => document.body.innerText)).catch(() => null); report.failureState = await bounded(state()).catch(() => null); await bounded(page.screenshot({ path: prefix + '-failure.png', fullPage: true })).catch(() => {}); }
  } finally {
    fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2));
    if (context) await bounded(context.close()).catch(() => {});
    if (browser) await bounded(browser.close()).catch(() => browser.process()?.kill());
  }
})();
