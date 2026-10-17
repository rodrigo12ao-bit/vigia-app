const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

// The real consolidated frontend, served only on loopback. All API replies are
// synthetic. No real AI, sign-in, provider key, publication or physical device.
// Use a fresh evidence prefix for each run; previous proofs are never replaced.
// VIGIA_BRAND_BUILD_DIR=dist/netlify/public
// VIGIA_BRAND_EVIDENCE_PREFIX=artifacts/vigia-brand-refresh-local-<release>
// node tests/brand-refresh-browser.cjs
const workspace = fs.realpathSync(process.cwd());
const within = (directory, target) => {
  const relative = path.relative(directory, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const publicDir = fs.realpathSync(path.resolve(process.env.VIGIA_BRAND_BUILD_DIR || 'dist/netlify/public'));
assert.ok(within(workspace, publicDir), 'O build precisa ficar dentro do workspace.');
assert.ok(process.env.VIGIA_BRAND_EVIDENCE_PREFIX, 'Informe um prefixo exclusivo dentro de artifacts.');
const artifacts = path.join(workspace, 'artifacts'), prefix = path.resolve(process.env.VIGIA_BRAND_EVIDENCE_PREFIX);
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
const origin = 'http://127.0.0.1:3151';
const report = { status: 'running', publicDir, scope: 'Consolidated local frontend, desktop/mobile emulation and reduced motion. Real 18+ gate, welcome/auth-dialog/guest UI and four sections. Every API reply is synthetic; external traffic, sockets and physical microphone blocked. No account submission, AI generation, cloud write or publication.', checks: [], profiles: [] };
const status = { demo: false, realAI: true, localDemo: false, audience: '18plus', ai: { mode: 'adult-gemini', provider: 'gemini', blocked: null, consentVersion: 'brand-refresh-fixture', voice: true } };
const json = (response, code, data) => { response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
const server = http.createServer((request, response) => {
  try {
    const pathname = new URL(request.url, origin).pathname;
    if (pathname === '/api/status') return json(response, 200, status);
    if (['/api/session', '/api/adult-access'].includes(pathname)) return json(response, 200, { ok: true, simulated: true });
    if (pathname === '/api/ai-access') return json(response, 200, { allowed: true, voice: true, blocked: null, simulated: true });
    if (pathname.startsWith('/api/')) return json(response, 503, { error: 'API bloqueada no teste visual.', simulated: true });
    const filename = path.resolve(publicDir, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!within(publicDir, filename) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404); response.end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self' blob:;" });
    fs.createReadStream(filename).pipe(response);
  } catch (error) { json(response, 500, { error: error.message }); }
});
let browser, context, page, label = 'setup', stage = 'setup';
async function bounded(operation, milliseconds = 6000) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Prazo de fechamento do navegador excedido.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function check(name, action) { stage = name; await action(); report.checks.push({ name: label + ': ' + name, status: 'passed' }); console.log('PASS ' + label + ': ' + name); }
async function button(text, scope = 'body') {
  await page.waitForFunction(({ text, scope }) => [...document.querySelectorAll(scope + ' button')].some(button => button.textContent.trim() === text && !button.disabled && button.getClientRects().length), {}, { text, scope });
  await page.evaluate(({ text, scope }) => [...document.querySelectorAll(scope + ' button')].find(button => button.textContent.trim() === text && !button.disabled && button.getClientRects().length).click(), { text, scope });
}
async function presentation() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2 && document.body.scrollWidth <= innerWidth + 2), 'A interface não pode ultrapassar a largura da tela.');
  assert.ok(!await page.evaluate(() => /VIGIA 18\+\s*[•·].*Gemini real|\b3D\b/i.test(document.body.innerText)), 'A faixa antiga e controles internos de animação foram removidos do produto.');
  const accountContrast = await page.evaluate(() => {
    const color = value => { const parts = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 }; };
    const composite = (foreground, background) => foreground.rgb.map((channel, index) => channel * foreground.alpha + background[index] * (1 - foreground.alpha));
    const luminance = rgb => rgb.map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const nav = document.querySelector('.app-navigation'); if (!nav) return [];
    const navBackground = composite(color(getComputedStyle(nav).backgroundColor), [255, 255, 255]);
    return [...nav.querySelectorAll('.navigation-icon,.navigation-profile')].map(button => {
      const style = getComputedStyle(button), background = composite(color(style.backgroundColor), navBackground), foreground = composite(color(style.color), background);
      const a = luminance(foreground), b = luminance(background);
      return { label: button.getAttribute('aria-label'), profile: button.classList.contains('navigation-profile'), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  });
  for (const control of accountContrast) assert.ok(control.ratio >= (control.profile ? 4.5 : 3), 'O botão de conta/som precisa de contraste legível na barra clara: ' + control.label);
}
async function screenshot(name) { await page.screenshot({ path: prefix + '-' + label + '-' + name + '.png', fullPage: !['adult-gate', 'welcome', 'welcome-intro', 'login'].includes(name) }); }

async function profile(mobile, reduced = false) {
  label = reduced ? 'mobile-reduced' : mobile ? 'mobile' : 'desktop';
  const profile = { label, errors: [], external: [], api: [], themes: [] }; report.profiles.push(profile);
  context = await browser.createBrowserContext(); page = await context.newPage(); page.setDefaultTimeout(45000);
  await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
  await page.setBypassServiceWorker(true);
  page.on('pageerror', error => profile.errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (['blob:', 'data:'].includes(url.protocol)) { void request.continue(); return; }
    if (url.origin !== origin) { profile.external.push(url.origin + url.pathname); void request.abort('blockedbyclient'); return; }
    if (url.pathname.startsWith('/api/')) profile.api.push({ pathname: url.pathname, method: request.method() });
    void request.continue();
  });
  await page.evaluateOnNewDocument(() => {
    if (window.name !== 'vigia-brand-test-seeded') {
      window.name = 'vigia-brand-test-seeded';
      localStorage.setItem('vigia_progress:guest', JSON.stringify({ nickname: 'Pessoa fictícia', avatarGender: 'female' }));
      localStorage.setItem('vigia_ai_consent:guest', 'brand-refresh-fixture');
      localStorage.setItem('vigia_feedback_v1:guest', JSON.stringify({ sounds: false, vibration: false, animations: true }));
    }
    window.brandReview = { microphone: 0, sockets: 0, confirms: 0 };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { window.brandReview.microphone++; return Promise.reject(new DOMException('Microfone bloqueado no teste visual.', 'NotAllowedError')); };
    window.WebSocket = class { constructor() { window.brandReview.sockets++; throw Error('Socket bloqueado no teste visual.'); } };
    window.confirm = () => { window.brandReview.confirms++; return false; };
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await check('a entrada continua protegida pela confirmação real de 18 anos', async () => {
    await page.waitForSelector('[aria-label="Acesso para adultos"]');
    assert.equal(await page.$('.vigia-entry'), null);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Continuar').disabled), true);
    await presentation(); await screenshot('adult-gate');
    if (!reduced) {
      await button('Tenho menos de 18 anos');
      await page.waitForFunction(() => document.body.innerText.includes('O acesso não está disponível para menores de 18 anos.'));
      assert.equal(await page.$('.vigia-entry'), null);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('vigia_adult_access')), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('dc_is_guest')), null);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[aria-label="Acesso para adultos"]');
    }
    await page.click('input[type="checkbox"]'); await button('Continuar');
    await page.waitForSelector('.vigia-entry');
  });
  await check('marca vetorial, gradiente e ambos os CTAs ficam disponíveis na entrada', async () => {
    assert.equal(await page.evaluate(() => sessionStorage.getItem('vigia_adult_access')), adultVersion);
    await page.waitForSelector('.vigia-entry-emblem .vigia-brand-mark-symbol');
    profile.entry = await page.evaluate(() => {
      const entry = document.querySelector('.vigia-entry'), actions = [...document.querySelectorAll('.vigia-entry-actions button')];
      return { gradient: getComputedStyle(entry).backgroundImage, optionsOpen: document.querySelector('.welcome-options').open, actions: actions.map(button => { const rect = button.getBoundingClientRect(); return { text: button.textContent.trim(), disabled: button.disabled, pointerEvents: getComputedStyle(button).pointerEvents, top: rect.top, bottom: rect.bottom, insideViewport: rect.top >= 0 && rect.bottom <= innerHeight + 2 }; }), animations: [...document.querySelectorAll('.vigia-brand-mark-symbol,.vigia-brand-mark-float')].map(element => ({ name: getComputedStyle(element).animationName, duration: getComputedStyle(element).animationDuration })) };
    });
    assert.match(profile.entry.gradient, /gradient/); assert.equal(profile.entry.optionsOpen, false);
    assert.deepEqual(profile.entry.actions.map(action => action.text), ['Entrar ou criar conta', 'Explorar como visitante']);
    for (const action of profile.entry.actions) { assert.equal(action.disabled, false); assert.notEqual(action.pointerEvents, 'none'); assert.equal(action.insideViewport, true, 'Os dois CTAs precisam ficar visíveis sem rolar na tela testada.'); }
    if (reduced) for (const animation of profile.entry.animations) assert.equal(animation.name, 'none');
    else assert.ok(profile.entry.animations.some(animation => animation.name === 'vigia-brand-arrive'));
    await presentation();
    await screenshot(reduced ? 'welcome' : 'welcome-intro');
  });
  if (reduced) {
    await check('movimento reduzido deixa a marca estável sem bloquear visitante', async () => {
      const symbol = await page.$('.vigia-entry-emblem');
      const first = await symbol.screenshot(); await new Promise(resolve => setTimeout(resolve, 650)); const second = await symbol.screenshot();
      assert.deepEqual(first, second, 'A marca precisa ficar estática quando movimento reduzido é solicitado.');
      await button('Explorar como visitante', '.vigia-entry-actions');
      await page.waitForSelector('.vigia-home');
      await page.waitForFunction(() => { const image = document.querySelector('.vigia-home-mission img'); return image?.complete && image.naturalWidth > 0; });
      await presentation(); await screenshot('home');
    });
  } else {
    await check('o CTA de acesso abre o diálogo sem enviar credenciais', async () => {
      profile.ctaBeforeIntroFinished = await page.evaluate(() => document.querySelector('.vigia-brand-mark-symbol').getAnimations().some(animation => animation.playState === 'running' && animation.currentTime < 1200));
      await button('Entrar ou criar conta', '.vigia-entry-actions');
      await page.waitForSelector('[role="dialog"][aria-label="Acessar sua conta"]');
      await page.waitForSelector('[aria-label="E-mail"]'); assert.equal(await page.$('.vigia-entry'), null);
      await presentation(); await screenshot('login');
      assert.ok(!profile.external.length); assert.ok(!profile.api.some(request => !['/api/status', '/api/session', '/api/adult-access'].includes(request.pathname)));
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vigia-entry');
      await new Promise(resolve => setTimeout(resolve, 1250)); await screenshot('welcome');
    });
    await check('visitante abre o início renovado com a aparência correta', async () => {
      await button('Explorar como visitante', '.vigia-entry-actions');
      await page.waitForSelector('.vigia-home'); await page.waitForFunction(() => document.body.innerText.includes('Olá, Pessoa fictícia.'));
      assert.equal(await page.evaluate(() => localStorage.getItem('dc_is_guest')), 'true');
      assert.ok(await page.$('.vigia-home-heading .vigia-brand-mark-symbol'));
      assert.ok(await page.$('.vigia-home-mission img[src="/model/vigia-original-preview.png"]'));
      await page.waitForFunction(() => { const image = document.querySelector('.vigia-home-mission img'); return image?.complete && image.naturalWidth > 0; });
      assert.ok(await page.$('.home-chat-action')); assert.ok(await page.$('.home-learning-action'));
      await presentation(); await screenshot('home');
    });
    for (const section of ['home', 'chat', 'learn', 'phones']) await check('setor ' + section + ' tem tema próprio e cabe na tela', async () => {
      await page.click('.navigation-tabs button[data-section="' + section + '"]');
      await page.waitForSelector('.vigia-app[data-section="' + section + '"]');
      if (section === 'home') await page.waitForSelector('.vigia-home');
      if (section === 'chat') await page.waitForSelector('textarea');
      if (section === 'learn') await page.waitForSelector('[aria-label="Áreas de aprendizagem"]');
      if (section === 'phones') await page.waitForFunction(() => document.body.innerText.includes('Precisa de ajuda?'));
      const theme = await page.evaluate(section => {
        const app = document.querySelector('.vigia-app'), button = document.querySelector('.navigation-tabs button[data-section="' + section + '"]');
        return { section: app.dataset.section, accent: getComputedStyle(app).getPropertyValue('--section-accent').trim(), active: button.getAttribute('aria-current'), navAccent: getComputedStyle(button).getPropertyValue('--section-accent').trim(), buttonColor: getComputedStyle(button).color, background: getComputedStyle(app).backgroundImage };
      }, section);
      assert.equal(theme.active, 'page'); assert.ok(theme.accent); assert.equal(theme.navAccent, theme.accent); profile.themes.push(theme);
      await presentation(); await screenshot('section-' + section);
    });
    assert.equal(new Set(profile.themes.map(theme => theme.accent)).size, 4, 'Os quatro setores precisam ter cores distintas.');
  }
  assert.deepEqual(profile.errors, []); assert.deepEqual(profile.external, []);
  assert.deepEqual(await page.evaluate(() => window.brandReview), { microphone: 0, sockets: 0, confirms: 0 });
  assert.ok(!profile.api.some(request => ['/api/chat', '/api/live-ticket', '/api/transcribe', '/api/tts'].includes(request.pathname)));
  await bounded(context.close()); context = null; page = null;
}

(async () => {
  try {
    fs.mkdirSync(outputDirectory, { recursive: true });
    const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'); report.entry = html.match(/<script[^>]+src="([^\"]+\/index-[^\"]+\.js)"/)?.[1]; assert.ok(report.entry);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3151, '127.0.0.1', resolve); });
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, args: ['--no-sandbox', '--disable-background-networking', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'], timeout: 60000 });
    await profile(false); await profile(true); await profile(true, true);
    report.status = 'passed'; console.log('PASS ' + report.checks.length + ' verificações de entrada e identidade visual.');
  } catch (error) {
    report.status = 'failed'; report.checks.push({ name: label + ': ' + stage, status: 'failed', error: error.message }); report.stack = error.stack; process.exitCode = 1; console.error(error.stack);
    if (page) { report.failureText = await bounded(page.evaluate(() => document.body.innerText)).catch(() => null); await bounded(page.screenshot({ path: prefix + '-failure.png', fullPage: true })).catch(() => {}); }
  } finally {
    fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2));
    if (context) await bounded(context.close()).catch(() => {});
    if (browser) await bounded(browser.close()).catch(() => browser.process()?.kill());
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})();
