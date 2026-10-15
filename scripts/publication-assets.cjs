const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const FORMAT_VERSION = 1;
const RELEASE_FILE = 'release.json';

function invalid(code) {
  const error = new Error('Pacote de publicação inválido ou desatualizado. Refaça o build antes de iniciar.');
  error.code = code;
  throw error;
}
function revision(value) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) invalid('release_revision_invalid');
  return value.toLowerCase();
}
function resolveRevision(env = process.env, repositoryDir = process.cwd()) {
  if (env.RENDER_GIT_COMMIT !== undefined) return revision(env.RENDER_GIT_COMMIT);
  try {
    return revision(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryDir, encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch { return null; }
}
function safeRelative(value) {
  if (typeof value !== 'string' || !value || !/^[a-zA-Z0-9_./-]+$/.test(value) || path.isAbsolute(value)
    || value.split('/').some(segment => !segment || segment === '.' || segment === '..')) invalid('release_asset_path_invalid');
  return value;
}
function contained(root, file) {
  const relative = path.relative(root, file);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function assetFile(publicDir, value) {
  const relative = safeRelative(value);
  let root, file;
  try {
    root = fs.realpathSync(publicDir);
    file = fs.realpathSync(path.resolve(root, relative));
  } catch { invalid('release_asset_missing'); }
  if (!contained(root, file)) invalid('release_asset_path_invalid');
  try { if (!fs.statSync(file).isFile()) invalid('release_asset_missing'); }
  catch (error) { if (error.code?.startsWith('release_')) throw error; invalid('release_asset_missing'); }
  return file;
}
function entryFromHtml(html) {
  const entries = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\stype\s*=\s*(['"])module\1/i.test(tag)) continue;
    const source = /\ssrc\s*=\s*(['"])(.*?)\1/i.exec(tag)?.[2];
    if (source === undefined) continue;
    if (source.startsWith('//') || /[\\%?#:]/.test(source)) invalid('release_asset_path_invalid');
    const relative = source.startsWith('/') ? source.slice(1) : source.startsWith('./') ? source.slice(2) : source;
    safeRelative(relative);
    if (!relative.endsWith('.js')) invalid('release_entry_invalid');
    entries.push(relative);
  }
  if (entries.length !== 1) invalid('release_entry_invalid');
  return entries[0];
}
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function manifestFile(publicationDir) {
  const file = path.resolve(publicationDir, RELEASE_FILE);
  try { if (fs.lstatSync(file).isSymbolicLink()) invalid('release_manifest_invalid'); }
  catch (error) { if (error.code !== 'ENOENT') { if (error.code?.startsWith('release_')) throw error; invalid('release_manifest_invalid'); } }
  return file;
}

function writeRelease({ publicationDir = path.resolve('dist/publication'), revision: value = resolveRevision() } = {}) {
  const publicDir = path.join(publicationDir, 'public');
  const indexFile = assetFile(publicDir, 'index.html');
  const entry = entryFromHtml(fs.readFileSync(indexFile, 'utf8'));
  const entryFile = assetFile(publicDir, entry);
  const release = { formatVersion: FORMAT_VERSION, revision: value === null ? null : revision(value),
    index: { path: 'index.html', sha256: digest(indexFile) }, entry: { path: entry, sha256: digest(entryFile) } };
  fs.writeFileSync(manifestFile(publicationDir), JSON.stringify(release, null, 2) + '\n');
  return release;
}

function verifyRelease({ publicationDir = path.resolve('dist/publication'), expectedRevision = process.env.RENDER_GIT_COMMIT } = {}) {
  let release;
  try {
    const file = manifestFile(publicationDir);
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 32768) invalid('release_manifest_invalid');
    release = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) { if (error.code?.startsWith('release_')) throw error; invalid('release_manifest_invalid'); }
  if (!release || release.formatVersion !== FORMAT_VERSION || release.index?.path !== 'index.html'
    || !/^[a-f0-9]{64}$/.test(release.index?.sha256 || '') || !/^[a-f0-9]{64}$/.test(release.entry?.sha256 || '')) invalid('release_manifest_invalid');
  if (release.revision !== null) revision(release.revision);
  if (expectedRevision !== undefined && revision(expectedRevision) !== release.revision) invalid('release_revision_mismatch');
  const publicDir = path.join(publicationDir, 'public');
  const indexFile = assetFile(publicDir, release.index.path), entryFile = assetFile(publicDir, release.entry?.path);
  if (digest(indexFile) !== release.index.sha256) invalid('release_index_mismatch');
  if (entryFromHtml(fs.readFileSync(indexFile, 'utf8')) !== release.entry.path) invalid('release_entry_mismatch');
  if (digest(entryFile) !== release.entry.sha256) invalid('release_entry_mismatch');
  return release;
}

function releaseSummary(release) { return `Publicação verificada: ${release.revision?.slice(0, 12) || 'revisão indisponível'} • /${release.entry.path}`; }
module.exports = { FORMAT_VERSION, resolveRevision, writeRelease, verifyRelease, releaseSummary };
