const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

// Readiness is a visible, usable screen followed by a fixed 350 ms observation window.
// This measures guest navigation only: no account, AI inference, microphone or Firebase write.
// Examples: node tests/loading-performance.cjs --label before --mobile --slow
//           node tests/loading-performance.cjs --local --label before-local
const args = process.argv.slice(2);
let label = process.env.VIGIA_LOADING_LABEL || 'run';
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--label') { label = args[++index]; continue; }
  if (arg.startsWith('--label=')) { label = arg.slice(8); continue; }
  if (!['--local', '--mobile', '--slow'].includes(arg)) throw Error('Opção de teste desconhecida: ' + arg);
}
if (!label || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(label)) throw Error('Rótulo de teste inválido. Use até 48 letras, números, _ ou -.');
const local = args.includes('--local'), mobile = args.includes('--mobile'), slow = args.includes('--slow');
const publicUrl = 'https://vigia-app.onrender.com';
if (process.env.VIGIA_TEST_URL && process.env.VIGIA_TEST_URL.replace(/\/$/, '') !== publicUrl) throw Error('Endereço externo não autorizado.');
if (local && process.env.VIGIA_TEST_URL) throw Error('Escolha --local ou VIGIA_TEST_URL.');
const root = local ? 'http://localhost:3120' : publicUrl;
const source = fs.readFileSync(path.resolve('src/lib/audience.ts'), 'utf8');
const adultVersion = source.match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert.ok(adultVersion, 'A versão da confirmação 18+ precisa existir.');
const observationMs = 350;
const viewport = mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 };
const network = slow ? { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750, connectionType: 'cellular3g' } : null;
const prefix = `loading-performance-${label}-${local ? 'local' : 'online'}-${mobile ? 'mobile' : 'desktop'}${slow ? '-slow' : ''}`;
fs.mkdirSync('artifacts', { recursive: true });
const report = {
  url: root, label, startedAt: new Date().toISOString(), status: 'running',
  scope: 'Chrome isolado; duas sessões de visitante sem conta, IA, microfone nem escrita no Firebase. Emulação de tela/rede não representa um celular físico.',
  viewport, network, cpuSlowdown: slow ? 4 : 1, observationWindowMs: observationMs,
  readiness: 'Elemento visível e habilitado da tela esperada; depois janela fixa de observação. Não usa networkidle.',
  serverStartup: local ? 'Servidor próprio na porta 3120; consulta /api/status apenas para aguardar sua inicialização.' : 'Sem consulta prévia para aquecer o servidor. Estado anterior de suspensão/carga desconhecido.',
  metricNotes: [
    'TTFB=responseStart-requestStart inclui rede/proxy/espera do servidor; não é tempo puro de processamento do servidor.',
    'FCP e LCP são métricas de navegação. Cliques têm actionToVisibleMs; LCP pode parar na primeira interação e não representa a troca de tela.',
    'Bytes decoded, encoded e transfer são distintos. Transfer zero pode ser cache ou informação indisponível de outra origem.',
    'Recursos são atribuídos à fase em que foram observados concluídos; start/end mostram transferências que atravessaram fases.',
    'Precache do service worker pode ocorrer fora da página e não aparecer em ResourceTiming/CDP da página. Inventário de CacheStorage é registrado separadamente.',
    'Throttling CDP, se solicitado, aplica-se à página; tráfego de workers pode ter cobertura diferente. Nenhum cache é limpo entre as navegações de retorno.',
    'GET /api/status é observado quando solicitado pelo aplicativo. Apenas /api/session e /api/adult-access podem criar sessão de visitante em memória.',
    'Os dois perfis usam processos Chrome novos. O perfil de retorno preserva o mesmo processo, página, sessão e cache; não representa login persistido.',
  ], profiles: [],
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, browser, currentPage, currentProfile;

function safeUrl(value) {
  try { const url = new URL(value); return url.origin + url.pathname; } catch { return String(value).split(/[?#]/)[0]; }
}
const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

async function closeBrowser() {
  if (!browser) return;
  const own = browser; browser = undefined;
  let timer;
  try { await Promise.race([own.close(), new Promise(resolve => timer = setTimeout(resolve, 10000))]); }
  finally { clearTimeout(timer); if (own.process()?.exitCode === null) own.process().kill(); }
}

async function prepareProfile(puppeteer, id, seedGuest) {
  currentProfile = { id, seed: seedGuest ? 'Confirmação adulta e dc_is_guest locais, sem conta Firebase.' : 'Nenhum storage ou cache prévio.', phases: [], requests: [], errors: [], unexpectedRequests: [] };
  report.profiles.push(currentProfile);
  browser = await puppeteer.launch({ executablePath: process.env.VIGIA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true,
    args: ['--no-sandbox', '--disable-background-networking', '--deny-permission-prompts', '--mute-audio'] });
  currentPage = await browser.newPage();
  await currentPage.setViewport(viewport);
  currentPage.setDefaultTimeout(120000);
  currentPage.setDefaultNavigationTimeout(180000);
  const cdp = await currentPage.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: [
    '*/api/chat*', '*/api/transcribe*', '*/api/tts*', '*/api/analyze*', '*/api/generate*', '*/api/live*',
    '*/api/sala/*', '*/api/learning/*', '*firestore.googleapis.com*', '*identitytoolkit.googleapis.com*', '*securetoken.googleapis.com*',
    '*generativelanguage.googleapis.com*', '*api.openai.com*',
  ] });
  if (slow) {
    await cdp.send('Network.emulateNetworkConditions', network);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const profile = currentProfile;
  let activePhase = 'setup', sequence = 0;
  const requests = new Map();
  currentPage.on('request', request => {
    const url = safeUrl(request.url()), pathname = new URL(request.url()).pathname;
    const entry = { id: ++sequence, phase: activePhase, url, method: request.method(), type: request.resourceType(), startedAt: Date.now() };
    requests.set(request, entry); profile.requests.push(entry);
    if (url.startsWith(root + '/api/') && !['/api/status', '/api/session', '/api/adult-access'].includes(pathname)) profile.unexpectedRequests.push({ phase: activePhase, url, method: entry.method });
    if (/firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|generativelanguage\.googleapis\.com|api\.openai\.com/.test(url)) profile.unexpectedRequests.push({ phase: activePhase, url, method: entry.method });
  });
  currentPage.on('response', response => {
    const entry = requests.get(response.request());
    if (!entry) return;
    const headers = response.headers();
    Object.assign(entry, { status: response.status(), responseAt: Date.now(), fromCache: response.fromCache(), fromServiceWorker: response.fromServiceWorker(),
      cacheControl: headers['cache-control'] || null, contentEncoding: headers['content-encoding'] || null, contentLength: headers['content-length'] || null });
  });
  currentPage.on('requestfinished', request => {
    const entry = requests.get(request);
    if (entry) Object.assign(entry, { finishedAt: Date.now(), elapsedMs: Date.now() - entry.startedAt });
  });
  currentPage.on('requestfailed', request => {
    const entry = requests.get(request);
    if (entry) Object.assign(entry, { failedAt: Date.now(), failure: request.failure()?.errorText || 'Falha sem detalhe' });
  });
  currentPage.on('pageerror', error => profile.errors.push({ phase: activePhase, message: error.message }));
  await currentPage.evaluateOnNewDocument(({ seedGuest, adultVersion }) => {
    if (seedGuest) { sessionStorage.setItem('vigia_adult_access', adultVersion); localStorage.setItem('dc_is_guest', 'true'); }
    performance.setResourceTimingBufferSize(5000);
    window.loadingPerformance = { lcp: null, longTasks: [], microphoneCalls: 0 };
    try { new PerformanceObserver(list => { for (const entry of list.getEntries()) window.loadingPerformance.lcp = { startTime: entry.startTime, size: entry.size, element: entry.element?.tagName || null }; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    try { new PerformanceObserver(list => { for (const entry of list.getEntries()) window.loadingPerformance.longTasks.push({ startTime: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
    if (navigator.mediaDevices?.getUserMedia) navigator.mediaDevices.getUserMedia = () => { window.loadingPerformance.microphoneCalls++; return Promise.reject(new DOMException('Microfone bloqueado pelo teste de carregamento.', 'NotAllowedError')); };
  }, { seedGuest, adultVersion });
  return { page: currentPage, profile, setPhase: name => { activePhase = name; }, seenResources: new Set() };
}

async function visible(page, selector) { await page.waitForSelector(selector, { visible: true }); }
async function homeReady(page) {
  await visible(page, '[aria-label="Progresso da aventura"]');
  await page.waitForFunction(() => !document.querySelector('[aria-label="Boas-vindas à Vigia"]') && document.querySelector('[aria-label="Início"]')?.getAttribute('aria-current') === 'page');
}
async function chatReady(page) {
  await visible(page, '[aria-label="Conversa por texto"]'); await visible(page, 'textarea');
  await page.waitForFunction(() => document.querySelector('[aria-label="Conversa & Voz"]')?.getAttribute('aria-current') === 'page' && !document.querySelector('textarea')?.disabled);
}
async function exactButton(page, text) {
  await page.waitForFunction(value => [...document.querySelectorAll('button')].some(element => element.textContent.trim() === value && element.getClientRects().length && !element.disabled), {}, text);
  await page.evaluate(value => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === value && element.getClientRects().length && !element.disabled).click(), text);
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const safe = value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return String(value).split(/[?#]/)[0]; } };
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    const resources = performance.getEntriesByType('resource').map(entry => ({ url: safe(entry.name), initiatorType: entry.initiatorType, startMs: entry.startTime, endMs: entry.responseEnd,
      durationMs: entry.duration, decodedBytes: entry.decodedBodySize, encodedBytes: entry.encodedBodySize, transferBytes: entry.transferSize, protocol: entry.nextHopProtocol,
      deliveryType: entry.deliveryType || null, workerStartMs: entry.workerStart || 0 }));
    let serviceWorker;
    try {
      const registrations = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
      const cacheNames = 'caches' in window ? await caches.keys() : [];
      serviceWorker = { controlled: !!navigator.serviceWorker?.controller, controller: navigator.serviceWorker?.controller ? safe(navigator.serviceWorker.controller.scriptURL) : null,
        registrations: registrations.map(registration => ({ scope: safe(registration.scope), active: registration.active?.state || null, installing: registration.installing?.state || null, waiting: registration.waiting?.state || null })),
        caches: await Promise.all(cacheNames.map(async name => { const cache = await caches.open(name); return { name, entries: (await cache.keys()).length }; })) };
    } catch (error) { serviceWorker = { unavailable: error.message }; }
    const state = window.loadingPerformance;
    return { timeOrigin: performance.timeOrigin, snapshotMs: performance.now(), navigation: nav ? {
      type: nav.type, ttfbMs: nav.responseStart - nav.requestStart, firstByteFromNavigationStartMs: nav.responseStart,
      dnsMs: nav.domainLookupEnd - nav.domainLookupStart, connectMs: nav.connectEnd - nav.connectStart,
      tlsMs: nav.secureConnectionStart ? nav.connectEnd - nav.secureConnectionStart : null,
      responseEndMs: nav.responseEnd, domContentLoadedMs: nav.domContentLoadedEventEnd || null, loadMs: nav.loadEventEnd || null,
      decodedBytes: nav.decodedBodySize, encodedBytes: nav.encodedBodySize, transferBytes: nav.transferSize, workerStartMs: nav.workerStart,
    } : null, fcpMs: paints.find(entry => entry.name === 'first-contentful-paint')?.startTime ?? null,
      lcp: state?.lcp || null, longTasks: state?.longTasks || [], microphoneCalls: state?.microphoneCalls ?? null, resources, serviceWorker };
  });
}

function summarizeResources(resources) {
  const totals = { count: resources.length, decodedBytes: 0, encodedBytes: 0, transferBytes: 0, jsDecodedBytes: 0, cssDecodedBytes: 0 };
  for (const resource of resources) {
    for (const key of ['decodedBytes', 'encodedBytes', 'transferBytes']) totals[key] += resource[key] || 0;
    if (/\.m?js$/.test(resource.url)) totals.jsDecodedBytes += resource.decodedBytes || 0;
    if (/\.css$/.test(resource.url)) totals.cssDecodedBytes += resource.decodedBytes || 0;
  }
  return { ...totals, largest: [...resources].sort((left, right) => right.decodedBytes - left.decodedBytes).slice(0, 12) };
}

async function phase(context, name, action, ready, navigation = false, screenshot = false) {
  context.setPhase(name);
  const startWall = Date.now(), startMs = navigation ? 0 : await context.page.evaluate(() => performance.now());
  await action(); await ready(context.page);
  const visibleWallMs = Date.now() - startWall, visibleMs = await context.page.evaluate(() => performance.now());
  await wait(observationMs);
  const data = await snapshot(context.page);
  const phaseResources = data.resources.filter(resource => {
    const key = `${data.timeOrigin}|${resource.url}|${resource.startMs}|${resource.endMs}`;
    if (context.seenResources.has(key)) return false;
    context.seenResources.add(key); return true;
  });
  const metric = { name, kind: navigation ? 'navigation' : 'action', visibleAtMs: round(visibleMs), actionToVisibleMs: round(visibleMs - startMs),
    driverToVisibleMs: visibleWallMs, observationEndedAtMs: round(data.snapshotMs), documentTimeOrigin: data.timeOrigin,
    navigation: data.navigation, navigationFcpMs: round(data.fcpMs), navigationLcp: data.lcp,
    phaseResources: summarizeResources(phaseResources), cumulativeResources: summarizeResources(data.resources), resourcesObservedThisPhase: phaseResources,
    longTasksObservedBeforeSnapshot: { count: data.longTasks.length, totalMs: round(data.longTasks.reduce((sum, task) => sum + task.duration, 0)), entries: data.longTasks },
    serviceWorker: data.serviceWorker, inFlightRequests: context.profile.requests.filter(request => !request.finishedAt && !request.failedAt).map(request => ({ id: request.id, url: request.url, type: request.type })),
    microphoneCalls: data.microphoneCalls };
  context.profile.phases.push(metric);
  assert.equal(data.microphoneCalls, 0, 'A navegação não pode iniciar o microfone.');
  if (screenshot) {
    context.setPhase(name + '-screenshot');
    await context.page.screenshot({ path: `artifacts/${prefix}-${context.profile.id}-${name}.png`, fullPage: true });
  }
  console.log(`${context.profile.id}/${name}: ${metric.actionToVisibleMs} ms até tela visível; ${metric.phaseResources.decodedBytes} bytes decoded observados nesta fase`);
}

(async () => {
  try {
    if (local) {
      // Refuse to reuse or interfere with an existing service on our dedicated port.
      let occupied = false;
      try { await fetch(root + '/api/status', { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
      assert.equal(occupied, false, 'A porta 3120 já está em uso; o teste não deve reutilizar outro servidor.');
      const env = require('../scripts/gemini-env.cjs').geminiEnv('3120');
      server = spawn(process.execPath, ['--use-system-ca', 'dist/presentation/server/server.cjs'], { env, windowsHide: true, stdio: 'ignore' });
      let ready = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        assert.equal(server.exitCode, null, 'O servidor de apresentação encerrou antes do teste.');
        try { if ((await fetch(root + '/api/status', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
        await wait(100);
      }
      assert.ok(ready, 'O servidor isolado não iniciou.');
    }
    const puppeteer = (await import('puppeteer')).default;
    const first = await prepareProfile(puppeteer, 'first-visitor', false);
    await phase(first, 'adult-gate', () => first.page.goto(root, { waitUntil: 'domcontentloaded' }), page => visible(page, '[aria-label="Acesso para adultos"]'), true, true);
    await phase(first, 'accept-to-welcome', async () => { await first.page.click('[aria-label="Acesso para adultos"] input[type="checkbox"]'); await exactButton(first.page, 'Continuar'); }, page => visible(page, '[aria-label="Boas-vindas à Vigia"]'));
    await phase(first, 'guest-to-home', () => exactButton(first.page, 'Explorar como visitante'), homeReady);
    await phase(first, 'open-chat', () => first.page.click('[aria-label="Conversa & Voz"]'), chatReady, false, true);
    await phase(first, 'return-home-same-cache', () => first.page.reload({ waitUntil: 'domcontentloaded' }), homeReady, true);
    await phase(first, 'return-open-chat', () => first.page.click('[aria-label="Conversa & Voz"]'), chatReady, false, true);
    assert.deepEqual(first.profile.unexpectedRequests, [], 'A avaliação de visitante não deve solicitar IA, contas ou banco.');
    await closeBrowser();

    const adult = await prepareProfile(puppeteer, 'accepted-guest-fresh-browser', true);
    await phase(adult, 'direct-home', () => adult.page.goto(root, { waitUntil: 'domcontentloaded' }), homeReady, true);
    await phase(adult, 'open-chat', () => adult.page.click('[aria-label="Conversa & Voz"]'), chatReady, false, true);
    assert.deepEqual(adult.profile.unexpectedRequests, [], 'A avaliação de visitante não deve solicitar IA, contas ou banco.');
    report.status = 'passed';
    report.passedReadinessMilestones = report.profiles.reduce((sum, profile) => sum + profile.phases.length, 0);
    report.httpErrors = report.profiles.flatMap(profile => profile.requests.filter(request => request.status >= 400 || request.failure).map(request => ({ profile: profile.id, ...request })));
    report.pageErrors = report.profiles.flatMap(profile => profile.errors.map(error => ({ profile: profile.id, ...error })));
    // Readiness can pass with a failed optional request; preserve those failures explicitly.
    console.log(`PASS ${report.passedReadinessMilestones} marcos visíveis; ${report.httpErrors.length} falhas HTTP/rede; ${report.pageErrors.length} erros de página. Não foram feitas chamadas de IA.`);
  } catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1;
    console.error(error.message);
    if (currentPage && !currentPage.isClosed()) {
      await currentPage.screenshot({ path: `artifacts/${prefix}-${currentProfile?.id || 'setup'}-failure.png`, fullPage: true }).catch(() => {});
      fs.writeFileSync(`artifacts/${prefix}-failure.txt`, await currentPage.$eval('body', element => element.innerText).catch(() => ''));
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(`artifacts/${prefix}.json`, JSON.stringify(report, null, 2));
    await closeBrowser(); server?.kill();
  }
})();
