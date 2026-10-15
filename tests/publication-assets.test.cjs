const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { writeRelease, verifyRelease, resolveRevision, releaseSummary } = require('../scripts/publication-assets.cjs');
const revision = 'a'.repeat(40), otherRevision = 'b'.repeat(40);

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vigia-release-assets-'));
  const publicationDir = path.join(directory, 'dist', 'publication'), publicDir = path.join(publicationDir, 'public');
  fs.mkdirSync(path.join(publicDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><div id="root"></div><script type="module" crossorigin src="/assets/index-fixture.js"></script>');
  fs.writeFileSync(path.join(publicDir, 'assets', 'index-fixture.js'), 'console.log("public fixture");');
  t.after(() => {
    const temporaryRoot = fs.realpathSync(os.tmpdir()), resolved = fs.realpathSync(directory);
    const relative = path.relative(temporaryRoot, resolved);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(resolved).startsWith('vigia-release-assets-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const options = { publicationDir, revision };
  return { directory, publicationDir, publicDir, options, manifest: path.join(publicationDir, 'release.json'),
    verify: () => verifyRelease({ publicationDir, expectedRevision: revision }) };
}
function reject(fn, code) { assert.throws(fn, error => error.code === code && !error.message.includes('fixture')); }
function editManifest(f, edit) { const data = JSON.parse(fs.readFileSync(f.manifest, 'utf8')); edit(data); fs.writeFileSync(f.manifest, JSON.stringify(data)); }

test('pacote válido registra index e entrada reais fora da pasta pública e confere hashes', t => {
  const f = fixture(t), written = writeRelease(f.options);
  assert.deepEqual(f.verify(), written); assert.equal(written.entry.path, 'assets/index-fixture.js');
  assert.equal(written.formatVersion, 1); assert.equal(written.index.sha256.length, 64);
  assert.equal(fs.existsSync(path.join(f.publicDir, 'release.json')), false);
  assert.equal(releaseSummary(written), `Publicação verificada: ${revision.slice(0, 12)} • /assets/index-fixture.js`);
});
test('revisão Render prevalece; sem Render nem repositório a revisão pode ficar indisponível', t => {
  const f = fixture(t);
  assert.equal(resolveRevision({ RENDER_GIT_COMMIT: otherRevision }, f.directory), otherRevision);
  assert.equal(resolveRevision({}, f.directory), null);
  writeRelease({ publicationDir: f.publicationDir, revision: null });
  assert.equal(verifyRelease({ publicationDir: f.publicationDir }).revision, null);
  reject(() => f.verify(), 'release_revision_mismatch');
});
test('manifesto ausente e JSON corrompido impedem inicialização', t => {
  const f = fixture(t); reject(() => f.verify(), 'release_manifest_invalid');
  fs.writeFileSync(f.manifest, '{broken'); reject(() => f.verify(), 'release_manifest_invalid');
});
test('index ausente impede inicialização', t => {
  const f = fixture(t); writeRelease(f.options); fs.unlinkSync(path.join(f.publicDir, 'index.html'));
  reject(() => f.verify(), 'release_asset_missing');
});
test('entrada ausente impede inicialização', t => {
  const f = fixture(t); writeRelease(f.options); fs.unlinkSync(path.join(f.publicDir, 'assets', 'index-fixture.js'));
  reject(() => f.verify(), 'release_asset_missing');
});
test('index corrompido é rejeitado pelo SHA256', t => {
  const f = fixture(t); writeRelease(f.options); fs.appendFileSync(path.join(f.publicDir, 'index.html'), '<p>Outra revisão</p>');
  reject(() => f.verify(), 'release_index_mismatch');
});
test('entrada corrompida é rejeitada pelo SHA256', t => {
  const f = fixture(t); writeRelease(f.options); fs.appendFileSync(path.join(f.publicDir, 'assets', 'index-fixture.js'), 'changed();');
  reject(() => f.verify(), 'release_entry_mismatch');
});
test('revisão divergente, inválida ou formato desconhecido falham sem ecoar valores', t => {
  const f = fixture(t); writeRelease(f.options);
  reject(() => verifyRelease({ publicationDir: f.publicationDir, expectedRevision: otherRevision }), 'release_revision_mismatch');
  reject(() => resolveRevision({ RENDER_GIT_COMMIT: 'segredo-nao-publico' }), 'release_revision_invalid');
  editManifest(f, data => { data.formatVersion = 999; }); reject(() => f.verify(), 'release_manifest_invalid');
});
test('traversal e entrada externa no HTML são rejeitados antes de ler arquivos fora de public', t => {
  const f = fixture(t);
  for (const source of ['../private.js', '/../private.js', '//example.invalid/private.js', 'https://example.invalid/private.js', '/assets/%2e%2e/private.js', 'C:/private.js', 'assets\\..\\private.js']) {
    fs.writeFileSync(path.join(f.publicDir, 'index.html'), `<script type="module" src="${source}"></script>`);
    reject(() => writeRelease(f.options), 'release_asset_path_invalid');
  }
});
test('traversal no manifesto não permite ler fora de public', t => {
  const f = fixture(t); writeRelease(f.options); editManifest(f, data => { data.entry.path = '../private.js'; });
  reject(() => f.verify(), 'release_asset_path_invalid');
});
test('link de diretório que escapa de public é rejeitado pelo caminho real', t => {
  const f = fixture(t), outside = path.join(f.directory, 'outside-public');
  fs.mkdirSync(outside);fs.writeFileSync(path.join(outside, 'entry.js'), 'public-test-only');
  fs.symlinkSync(outside, path.join(f.publicDir, 'assets', 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(f.publicDir, 'index.html'), '<script type="module" src="/assets/external/entry.js"></script>');
  reject(() => writeRelease(f.options), 'release_asset_path_invalid');
});
test('entrada declarada deve coincidir com o script module real mesmo se o hash de index mudar', t => {
  const f = fixture(t); writeRelease(f.options);
  const html = '<script type="module" src="/assets/another.js"></script>';
  fs.writeFileSync(path.join(f.publicDir, 'index.html'), html);
  editManifest(f, data => { data.index.sha256 = crypto.createHash('sha256').update(html).digest('hex'); });
  reject(() => f.verify(), 'release_entry_mismatch');
});
test('múltiplas entradas ou ausência de script module impedem manifesto ambíguo', t => {
  const f = fixture(t);
  for (const html of ['<script src="/assets/index-fixture.js"></script>', '<script type="module" data-src="/assets/index-fixture.js"></script>', '<script data-type="module" src="/assets/index-fixture.js"></script>', '<script type="module" src="/assets/index-fixture.js"></script><script type="module" src="/assets/another.js"></script>']) {
    fs.writeFileSync(path.join(f.publicDir, 'index.html'), html); reject(() => writeRelease(f.options), 'release_entry_invalid');
  }
});
test('start falha pelo pacote antes de ler qualquer credencial e não imprime caminhos privados', t => {
  const f = fixture(t), start = path.resolve('scripts/start-publication.cjs');
  const result = spawnSync(process.execPath, [start], { cwd: f.directory, env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: 'credencial-nao-deve-ser-lida' }, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pacote de publicação inválido ou desatualizado/);
  assert.doesNotMatch(result.stderr + result.stdout, /credencial-nao-deve-ser-lida|ENOENT|private_key/);
});
