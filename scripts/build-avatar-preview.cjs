const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const modelPath = path.join(root, 'public/model/vigia-original.glb');
const htmlPath = path.join(root, 'avatar-vigia-original.html');

function html(script) {
  const license = fs.readFileSync(path.join(root, 'node_modules/three/LICENSE'), 'utf8').replace(/--/g, '—');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Meu avatar Vigia · 3D</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#15253d;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}button,a{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #ee8d37;outline-offset:4px}header{max-width:1240px;margin:auto;padding:30px 40px 20px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:800;letter-spacing:.015em}.mark{width:30px;height:30px;display:grid;place-items:center;background:#f07d33;border-radius:10px;color:white}.tag{font-size:12px;color:#586478;background:#fff;border:1px solid #e5e8ed;border-radius:24px;padding:8px 13px}main{max-width:1240px;margin:auto;padding:0 40px 30px;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:28px;align-items:center}.viewer{height:min(76vh,740px);min-height:510px;border-radius:30px;position:relative;overflow:hidden;background:#f4f5f7;border:1px solid #e3e7ed;box-shadow:0 20px 60px #172b4410}#stage{position:absolute;inset:0}canvas{display:block;width:100%;height:100%;touch-action:none}.viewer-label{position:absolute;top:24px;left:24px;pointer-events:none;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#728094}.hint{position:absolute;left:0;right:0;bottom:22px;text-align:center;pointer-events:none;color:#657187;font-size:12px}.panel{padding:4px 0}.eyebrow{font-size:12px;font-weight:750;letter-spacing:.16em;text-transform:uppercase;color:#d96724;margin:0 0 10px}h1{font-size:37px;line-height:1.13;letter-spacing:-.04em;margin:0 0 14px;font-weight:780}.intro{color:#617086;margin:0 0 28px;font-size:15px}.modes{display:grid;grid-template-columns:1fr 1fr;gap:9px}.mode{background:#fff;border:1px solid #e0e5ec;border-radius:12px;padding:12px 10px;color:#485871;font-size:14px;font-weight:650;transition:background .15s,border-color .15s}.mode:hover{border-color:#c4cedb}.mode[aria-pressed="true"]{background:#172942;border-color:#172942;color:white;box-shadow:0 4px 14px #17294218}.mode[data-mode="idle"]{grid-column:span 2}.detail{min-height:85px;margin:22px 0 20px}#mode-title{font-size:15px;font-weight:750;display:block;margin-bottom:5px}#mode-description{font-size:13px;color:#67768d;margin:0}.control-label{font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.1em;color:#8993a3;margin:0 0 8px}.angles{display:flex;gap:8px;margin-bottom:10px}.plain{border:1px solid #dde3eb;background:transparent;border-radius:10px;color:#57667e;font-size:12px;padding:9px 12px;flex:1}.plain[aria-pressed="true"]{background:#fff;border-color:#aebbcf;color:#172942}.motion-buttons{display:flex;gap:8px}.divider{height:1px;background:#e1e6ed;margin:23px 0}.download{display:flex;align-items:center;justify-content:center;text-decoration:none;width:100%;border:0;border-radius:12px;padding:13px;background:#eb7830;color:white;font-size:14px;font-weight:750;box-shadow:0 5px 16px #e47b3020}.download:hover{background:#df6d28}.secondary{background:transparent;box-shadow:none;color:#68768b;font-size:12px;padding:12px}.secondary:hover{background:#e9edf2;color:#273c5b}footer{max-width:1240px;padding:0 40px 28px;margin:auto;color:#8a94a4;font-size:11px;display:flex;justify-content:space-between;gap:15px}body:not(.ready) .controls{opacity:.4;pointer-events:none}.loaded::before{content:"";display:inline-block;width:6px;height:6px;background:#43a173;border-radius:50%;margin-right:7px}@media(max-width:850px){header{padding:22px 22px 16px}main{padding:0 22px 24px;grid-template-columns:1fr;gap:24px}.viewer{height:60vh;min-height:340px}.panel{max-width:540px;width:100%;margin:auto}h1{font-size:32px}.intro{margin-bottom:20px}.detail{min-height:65px;margin-top:18px}footer{padding:0 22px 25px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body>
<header><div class="brand"><span class="mark" aria-hidden="true">V</span>VIGIA</div><div class="tag" id="status" role="status">Preparando o seu avatar…</div></header>
<main><section class="viewer" aria-label="Prévia interativa do avatar"><div id="stage"></div><div class="viewer-label">Um novo companheiro</div><div class="hint">Arraste para girar · Aproxime com a roda do mouse ou dois dedos</div></section>
<section class="panel"><p class="eyebrow">Feito para o Vigia</p><h1>Seu avatar.<br>Agora em movimento.</h1><p class="intro">Um personagem original para acompanhar suas conversas. Explore os gestos e veja de todos os lados.</p>
<div class="controls"><div class="modes" aria-label="Escolha um gesto"><button type="button" class="mode" data-mode="idle" aria-pressed="true">Em repouso</button><button type="button" class="mode" data-mode="speaking" aria-pressed="false">Conversando</button><button type="button" class="mode" data-mode="listening" aria-pressed="false">Ouvindo</button><button type="button" class="mode" data-mode="thinking" aria-pressed="false">Pensando</button><button type="button" class="mode" data-mode="sad" aria-pressed="false">Acolhendo</button></div>
<div class="detail" aria-live="polite"><strong id="mode-title">Pronto para conversar</strong><p id="mode-description">Um companheiro atento, com movimentos suaves de repouso.</p></div>
<p class="control-label">Enquadramento</p><div class="angles"><button type="button" class="plain" data-framing="bust" aria-pressed="true">Busto</button><button type="button" class="plain" data-framing="head" aria-pressed="false">Cabeça</button><button type="button" class="plain" data-framing="full" aria-pressed="false">Corpo inteiro</button></div>
<p class="control-label">Veja de outro ângulo</p><div class="angles"><button type="button" class="plain" data-view="front" aria-pressed="false">De frente</button><button type="button" class="plain" data-view="three-quarter" aria-pressed="true">De lado</button></div><div class="motion-buttons"><button type="button" class="plain" id="spin" aria-pressed="false">Girar sozinho</button><button type="button" class="plain" id="pause">Pausar movimento</button></div>
<div class="divider"></div><button type="button" class="download" id="download-glb">Baixar meu avatar 3D</button><button type="button" class="download secondary" id="download-png">Salvar uma imagem sem fundo</button></div></section></main>
<footer><span>Modelo e animações criados para este projeto.</span><span>Esta prévia funciona sem internet.</span></footer>
<!-- Three.js license\n${license}\n-->
<script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}

async function build() {
  if (!fs.existsSync(modelPath)) throw new Error('O modelo public/model/vigia-original.glb ainda não foi gerado.');
  const model = fs.readFileSync(modelPath);
  // Resolve only the local entry and installed Three.js files. This also avoids
  // esbuild scanning inaccessible ancestors of the workspace on Windows.
  const localModules = {
    name: 'local-avatar-bundle',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        let file;
        if (args.path === 'three') file = path.join(root, 'node_modules/three/build/three.module.js');
        else if (args.path.startsWith('three/')) file = path.join(root, 'node_modules', args.path);
        else if (path.isAbsolute(args.path)) file = args.path;
        else if (args.path.startsWith('.')) file = path.resolve(args.importer ? path.dirname(args.importer) : root, args.path);
        else throw new Error('Dependência inesperada na prévia: ' + args.path);
        return { path: file, namespace: 'avatar-local' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'avatar-local' }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'js' }));
    },
  };
  const result = await esbuild.build({
    absWorkingDir: root, tsconfigRaw: {},
    plugins: [localModules],
    entryPoints: [path.join(root, 'scripts/avatar-preview-entry.js')],
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020',
    minify: true, legalComments: 'none',
    define: { __AVATAR_GLB_BASE64__: JSON.stringify(model.toString('base64')), __AVATAR_GLB_BYTES__: String(model.length) },
  });
  fs.writeFileSync(htmlPath, html(result.outputFiles[0].text));
  console.log('Prévia offline criada: ' + htmlPath);
}

async function captureAndCheck() {
  const puppeteer = (await import('puppeteer')).default;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vigia-original-preview-'));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, pipe: true, userDataDir: profile,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-background-networking', '--disable-component-update', '--no-first-run'],
    timeout: 60000,
  });
  const errors = [], external = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.avatarPreview?.diagnostics().ready, { timeout: 30000 });
    const initial = await page.evaluate(async () => { await window.avatarPreview.ready; window.avatarPreview.pause(); return window.avatarPreview.diagnostics(); });
    assert.equal(initial.ready, true);
    assert.deepEqual(initial.clips.map(clip => clip.name).sort(), ['Alert', 'Happy', 'Idle', 'LookAround', 'Sad'].sort());
    const modes = ['idle', 'speaking', 'listening', 'thinking', 'sad'];
    const movement = await page.evaluate(modes => modes.map(mode => {
      window.avatarPreview.setMode(mode, true);
      const before = window.avatarPreview.advance(0.1);
      const after = window.avatarPreview.advance(0.9);
      return { mode, clip: after.clip, changed: JSON.stringify(before.joints) !== JSON.stringify(after.joints), joints: after.joints.length };
    }), modes);
    for (const check of movement) assert.ok(check.changed, check.mode + ' deve mover o modelo');
    await page.evaluate(() => { window.avatarPreview.setMode('idle', true); window.avatarPreview.advance(0.3); });
    const png = await page.evaluate(() => window.avatarPreview.capturePNG({ width: 1200, height: 1200, transparent: true, view: 'three-quarter' }));
    const previewPath = path.join(root, 'public/model/vigia-original-preview.png');
    fs.writeFileSync(previewPath, Buffer.from(png.split(',')[1], 'base64'));
    const headPNG = await page.evaluate(() => window.avatarPreview.capturePNG({ width: 1200, height: 1200, transparent: true, view: 'front', framing: 'head' }));
    const headPath = path.join(root, 'public/model/vigia-original-head.png');
    fs.writeFileSync(headPath, Buffer.from(headPNG.split(',')[1], 'base64'));
    assert.equal(await page.evaluate(() => window.avatarPreview.diagnostics().framing), 'bust');
    await page.screenshot({ path: path.join(root, 'artifacts/vigia-original-viewer-desktop.png'), fullPage: true });
    await page.click('[data-mode="speaking"]');
    assert.equal(await page.evaluate(() => window.avatarPreview.diagnostics().clip), 'Happy');
    await page.click('[data-mode="listening"]');
    assert.equal(await page.evaluate(() => window.avatarPreview.diagnostics().clip), 'Alert');
    await page.click('[data-view="front"]');
    await page.click('[data-framing="head"]');
    assert.equal(await page.evaluate(() => window.avatarPreview.diagnostics().framing), 'head');
    await page.click('[data-framing="full"]');
    assert.equal(await page.evaluate(() => window.avatarPreview.diagnostics().framing), 'full');
    await page.click('[data-framing="bust"]');
    await page.click('#spin');
    assert.equal(await page.$eval('#spin', button => button.getAttribute('aria-pressed')), 'true');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.screenshot({ path: path.join(root, 'artifacts/vigia-original-viewer-mobile.png'), fullPage: true });
    const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth, canvasWidth: document.querySelector('canvas').getBoundingClientRect().width }));
    assert.equal(mobile.overflow, false);
    assert.ok(mobile.canvasWidth > 300);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    const checks = { model: path.relative(root, modelPath), preview: path.relative(root, previewPath), head: path.relative(root, headPath), framing: ['bust', 'head', 'full'], defaultFraming: 'bust', offline: true, errors, external, animations: initial.clips, movement, mobile };
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts/vigia-original-preview-checks.json'), JSON.stringify(checks, null, 2));
    console.log(JSON.stringify(checks, null, 2));
  } finally {
    await browser.close();
    const resolvedProfile = path.resolve(profile);
    if (resolvedProfile.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolvedProfile).startsWith('vigia-original-preview-')) fs.rmSync(resolvedProfile, { recursive: true, force: true });
  }
}

build().then(() => process.argv.includes('--capture') ? captureAndCheck() : null).catch(error => { console.error(error); process.exitCode = 1; });
