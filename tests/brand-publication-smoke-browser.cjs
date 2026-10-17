const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { resolvePublicTestOrigin } = require('./browser-target.cjs');

// Short check of a confirmed production release. Fresh isolated Chrome profile,
// one emulated mobile viewport, fictitious APIs, no conversation or voice sent.
// All environment arguments are mandatory; the evidence prefix is exclusive.
// VIGIA_SMOKE_URL=https://vigia-app.onrender.com
// VIGIA_SMOKE_EXPECTED_ENTRY=/assets/index-<confirmed-hash>.js
// VIGIA_SMOKE_EVIDENCE_PREFIX=artifacts/vigia-brand-public-render-<release>
// VIGIA_SMOKE_CAPTURE_ENTRY=1 (optional; exactly one screenshot attempt)
// node tests/brand-publication-smoke-browser.cjs
// node tests/brand-publication-smoke-browser.cjs --mission-only
assert.ok(process.env.VIGIA_SMOKE_URL, 'Informe a publicação já confirmada.');
const origin = resolvePublicTestOrigin(process.env.VIGIA_SMOKE_URL);
const expectedEntry = process.env.VIGIA_SMOKE_EXPECTED_ENTRY;
const missionOnly = process.argv.includes('--mission-only');
assert.match(expectedEntry || '', /^\/assets\/index-[A-Za-z0-9_-]+\.js$/);
assert.ok(process.env.VIGIA_SMOKE_EVIDENCE_PREFIX, 'Informe um prefixo exclusivo de evidência.');
const workspace = fs.realpathSync(process.cwd()), artifacts = path.join(workspace, 'artifacts');
const prefix = path.resolve(process.env.VIGIA_SMOKE_EVIDENCE_PREFIX);
const within = (directory, target) => {
  const relative = path.relative(directory, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
assert.ok(within(artifacts, prefix), 'A evidência precisa ficar dentro de artifacts.');
let parent = path.dirname(prefix);
while (!fs.existsSync(parent)) parent = path.dirname(parent);
const realParent = fs.realpathSync(parent), realArtifacts = fs.realpathSync(artifacts);
assert.ok(within(workspace, realArtifacts));
assert.ok(realParent === realArtifacts || within(realArtifacts, realParent), 'A evidência não pode sair de artifacts por links.');
assert.ok(!fs.readdirSync(path.dirname(prefix)).some(name => name === path.basename(prefix) + '.json' || name.startsWith(path.basename(prefix) + '-')), 'Este prefixo já possui evidências.');
const adultVersion = fs.readFileSync('src/lib/audience.ts', 'utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert.ok(adultVersion);
const report = {
  status: 'running', origin, expectedEntry, missionOnly, viewport: { width: 390, height: 844 },
  scope: 'Published HTML, JS, CSS and model through a fresh isolated browser context. One emulated mobile viewport with reduced motion. All APIs fictitious; sockets, microphone and external traffic blocked. No real AI, account submission, user data, payment or publication. Automatic head render checked without repeated animation or screenshots.',
  checks: [], errors: [], graphicsErrors: [], external: [], mockedApis: [],
};
if (missionOnly) report.scope = 'Only published entry and computed mission-button color/contrast after the CSS-only correction. Isolated synthetic adult guest, one mobile viewport with reduced motion. All APIs fictitious; sockets, microphone and external traffic blocked. No chat/avatar/voice opened, screenshots, real AI, account submission, user data, payment or publication.';
const status = { demo: false, realAI: true, localDemo: false, audience: '18plus', ai: { mode: 'adult-gemini', provider: 'gemini', blocked: null, consentVersion: 'publication-smoke-fixture', voice: true } };
function fixture(pathname) {
  if (pathname === '/api/status') return { code: 200, data: status };
  if (['/api/session', '/api/adult-access'].includes(pathname)) return { code: 200, data: { ok: true, simulated: true } };
  if (pathname === '/api/ai-access') return { code: 200, data: { allowed: true, voice: true, blocked: null, simulated: true } };
  return { code: 503, data: { error: 'Serviço bloqueado neste teste visual.', simulated: true } };
}
let browser, context, page, stage = 'setup';
async function bounded(operation, milliseconds = 6000) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Prazo de operação do navegador excedido.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function check(name, action, continueOnFailure = false) {
  stage = name;
  try { await action(); report.checks.push({ name, status: 'passed' }); console.log('PASS ' + name); }
  catch (error) {
    if (!continueOnFailure) throw error;
    report.checks.push({ name, status: 'failed', error: error.message }); console.log('FAIL ' + name + ': ' + error.message);
  }
}
async function button(text) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === text && !button.disabled && button.getClientRects().length), {}, text);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled && button.getClientRects().length).click(), text);
}
async function colors(selector) {
  return page.evaluate(selector => {
    const element = document.querySelector(selector), style = getComputedStyle(element);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const rgb = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const luminance = channels => channels.map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = rgb(style.color), gradientColors = [...style.backgroundImage.matchAll(/(?:rgba?|oklch|oklab|color|hsl)a?\([^)]*\)|#[0-9a-f]{3,8}\b/gi)].map(match => match[0]);
    const backgrounds = gradientColors.length ? gradientColors.map(rgb) : [rgb(style.backgroundColor)];
    const ratios = backgrounds.map(background => { const a = luminance(foreground), b = luminance(background); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
    return { text: element.textContent.trim(), fontFamily: style.fontFamily, color: style.color, foreground, backgroundColor: style.backgroundColor, gradient: style.backgroundImage, gradientColors, backgrounds, ratios, minimumContrast: Math.min(...ratios), classes: element.className };
  }, selector);
}

(async () => {
  try {
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, args: ['--no-sandbox', '--disable-background-networking', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'], timeout: 45000, protocolTimeout: 20000 });
    context = await browser.createBrowserContext(); page = await context.newPage(); page.setDefaultTimeout(30000);
    await page.setViewport({ ...report.viewport, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setBypassServiceWorker(true);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGL|THREE|GLTF|shader|Avatar/i.test(message.text())) report.graphicsErrors.push(message.text()); });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (['blob:', 'data:'].includes(url.protocol)) { void request.continue(); return; }
      if (url.pathname.startsWith('/api/')) {
        report.mockedApis.push({ origin: url.origin, pathname: url.pathname, method: request.method() });
        const mocked = fixture(url.pathname);
        void request.respond({ status: request.method() === 'OPTIONS' ? 204 : mocked.code, contentType: 'application/json', headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }, body: request.method() === 'OPTIONS' ? '' : JSON.stringify(mocked.data) }); return;
      }
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) { report.external.push(url.origin + url.pathname); void request.abort('blockedbyclient'); return; }
      void request.continue();
    });
    await page.evaluateOnNewDocument(({ adultVersion, missionOnly }) => {
      localStorage.setItem('vigia_progress:guest', JSON.stringify({ nickname: 'Pessoa fictícia', avatarGender: 'female' }));
      localStorage.setItem('vigia_ai_consent:guest', 'publication-smoke-fixture');
      localStorage.setItem('vigia_feedback_v1:guest', JSON.stringify({ sounds: false, vibration: false, animations: true }));
      if (missionOnly) {
        localStorage.setItem('dc_is_guest', 'true');
        sessionStorage.setItem('vigia_adult_access', adultVersion);
      }
      window.publicationSmoke = { microphone: 0, sockets: 0, confirms: 0, drawCalls: 0 };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { window.publicationSmoke.microphone++; return Promise.reject(new DOMException('Microfone bloqueado no teste.', 'NotAllowedError')); };
      window.WebSocket = class { constructor() { window.publicationSmoke.sockets++; throw Error('Socket bloqueado no teste.'); } };
      window.confirm = () => { window.publicationSmoke.confirms++; return false; };
      for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!Context) continue;
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const original = Context.prototype[name]; if (!original) continue;
          Context.prototype[name] = function(...args) { window.publicationSmoke.drawCalls++; return original.apply(this, args); };
        }
      }
    }, { adultVersion, missionOnly });
    await check('HTML e entrada publicada correspondem à revisão confirmada', async () => {
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
      report.httpStatus = response.status(); assert.equal(report.httpStatus, 200);
      report.entry = (await response.text()).match(/<script[^>]+src="([^\"]+\/index-[^\"]+\.js)"/)?.[1];
      assert.equal(report.entry, expectedEntry);
    });
    if (missionOnly) {
      await check('a correção final deixa a missão marrom e com contraste mínimo de 4,5', async () => {
        await page.waitForSelector('.vigia-app[data-section="home"] .vigia-home-mission .vigia-primary');
        await page.waitForFunction(() => document.body.innerText.includes('Olá, Pessoa fictícia.'));
        report.mission = await colors('.vigia-home-mission .vigia-primary');
        assert.match(report.mission.text, /Começar missão/);
        assert.deepEqual(report.mission.foreground, [56, 40, 12]);
        assert.ok(report.mission.minimumContrast >= 4.5);
        report.isolation = await page.evaluate(() => window.publicationSmoke);
        assert.equal(report.isolation.microphone, 0); assert.equal(report.isolation.sockets, 0); assert.equal(report.isolation.confirms, 0); assert.equal(report.isolation.drawCalls, 0);
        assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
        assert.ok(!report.mockedApis.some(request => ['/api/chat', '/api/live-ticket', '/api/transcribe', '/api/tts'].includes(request.pathname)));
      });
      report.status = 'passed'; console.log('PASS 2/2 verificações da correção de contraste.');
      return;
    }
    await check('confirmação de 18 anos continua protegendo a entrada', async () => {
      await page.waitForSelector('[aria-label="Acesso para adultos"]');
      assert.equal(await page.$('.vigia-entry'), null);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Continuar').disabled), true);
      await page.click('input[type="checkbox"]'); await button('Continuar');
      await page.waitForSelector('.vigia-entry');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('vigia_adult_access')), adultVersion);
    });
    await check('entrada renovada mostra marca e CTAs sem a faixa antiga', async () => {
      await page.waitForSelector('.vigia-entry-emblem .vigia-brand-mark-symbol');
      report.welcome = await page.evaluate(() => {
        const entry = document.querySelector('.vigia-entry'), heading = entry.querySelector('h1');
        return { fontFamily: getComputedStyle(entry).fontFamily, headingFontFamily: getComputedStyle(heading).fontFamily, bodyFontFamily: getComputedStyle(document.body).fontFamily, gradient: getComputedStyle(entry).backgroundImage, actions: [...entry.querySelectorAll('.vigia-entry-actions button')].map(button => ({ text: button.textContent.trim(), disabled: button.disabled })), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2, oldInterface: /VIGIA 18\+\s*[•·].*Gemini real|\b3D\b/i.test(document.body.innerText) };
      });
      assert.match(report.welcome.fontFamily, /sans-serif/); assert.match(report.welcome.gradient, /gradient/);
      assert.deepEqual(report.welcome.actions, [{ text: 'Entrar ou criar conta', disabled: false }, { text: 'Explorar como visitante', disabled: false }]);
      assert.equal(report.welcome.horizontalOverflow, false); assert.equal(report.welcome.oldInterface, false);
      if (process.env.VIGIA_SMOKE_CAPTURE_ENTRY === '1') {
        report.screenshot = { attempted: true, path: prefix + '-welcome.png' };
        try { await bounded(page.screenshot({ path: report.screenshot.path, fullPage: false }), 12000); report.screenshot.status = 'saved'; }
        catch (error) { report.screenshot.status = 'unavailable'; report.screenshot.error = error.message; }
      }
    });
    await check('visitante abre o início renovado', async () => {
      await button('Explorar como visitante'); await page.waitForSelector('.vigia-app[data-section="home"] .vigia-home');
      await page.waitForFunction(() => document.body.innerText.includes('Olá, Pessoa fictícia.'));
      assert.ok(await page.$('.vigia-home-heading .vigia-brand-mark-symbol'));
      assert.ok(await page.$('.home-chat-action')); assert.ok(await page.$('.home-learning-action'));
      report.mission = await colors('.vigia-home-mission .vigia-primary');
      assert.match(report.mission.text, /Começar missão/);
    });
    // Record a known contrast defect without preventing the independent head
    // check. Production findings stay visible and are never counted as passed.
    await check('texto da missão tem marrom e contraste mínimo de 4,5', async () => {
      assert.deepEqual(report.mission.foreground, [56, 40, 12]); assert.ok(report.mission.minimumContrast >= 4.5);
    }, true);
    await check('texto usa azul 600 e a cabeça carrega automaticamente', async () => {
      await page.click('.navigation-tabs button[data-section="chat"]');
      await page.waitForSelector('.vigia-app[data-section="chat"] textarea');
      report.textMode = await colors('[aria-label="Conversa por texto"]');
      assert.match(report.textMode.classes, /from-blue-600/); assert.doesNotMatch(report.textMode.classes, /from-blue-500/);
      assert.ok(report.textMode.minimumContrast >= 4.5, 'A aba Texto precisa de contraste legível contra todos os extremos do gradiente.');
      await page.waitForSelector('[data-avatar-framing="head"] canvas');
      await page.waitForFunction(() => window.publicationSmoke.drawCalls > 0 && !document.querySelector('img[src="/model/vigia-original-head.png"]'));
      report.head = await page.evaluate(() => {
        const wrapper = document.querySelector('[data-avatar-framing="head"]'), canvas = wrapper.querySelector('canvas');
        return { framing: wrapper.dataset.avatarFraming, speaking: wrapper.dataset.avatarSpeaking, width: canvas.width, height: canvas.height, drawCalls: window.publicationSmoke.drawCalls, oldInterface: /VIGIA 18\+\s*[•·].*Gemini real|\b3D\b/i.test(document.body.innerText) };
      });
      assert.equal(report.head.framing, 'head'); assert.equal(report.head.speaking, 'false'); assert.ok(report.head.width > 0 && report.head.height > 0); assert.equal(report.head.oldInterface, false);
      report.isolation = await page.evaluate(() => window.publicationSmoke);
      assert.equal(report.isolation.microphone, 0); assert.equal(report.isolation.sockets, 0); assert.equal(report.isolation.confirms, 0);
      assert.deepEqual(report.errors, []); assert.deepEqual(report.graphicsErrors, []); assert.deepEqual(report.external, []);
      assert.ok(!report.mockedApis.some(request => ['/api/chat', '/api/live-ticket', '/api/transcribe', '/api/tts'].includes(request.pathname)));
    });
    report.status = report.checks.some(check => check.status === 'failed') ? 'failed' : 'passed';
    if (report.status === 'failed') process.exitCode = 1;
    console.log(report.status.toUpperCase() + ' ' + report.checks.filter(check => check.status === 'passed').length + '/' + report.checks.length + ' verificações públicas curtas.');
  } catch (error) {
    report.status = 'failed'; report.checks.push({ name: stage, status: 'failed', error: error.message }); report.stack = error.stack; process.exitCode = 1; console.error(error.stack);
    if (page) report.failureText = await bounded(page.evaluate(() => document.body.innerText)).catch(() => null);
  } finally {
    fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2));
    if (context) await bounded(context.close()).catch(() => {});
    if (browser) await bounded(browser.close()).catch(() => browser.process()?.kill());
  }
})();
