const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Source-only upload. No credentials, local tooling, artifacts or build outputs
// are discovered implicitly. The manifest stays outside the upload tree.
const tag = process.argv[2];
if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(tag || '')) throw new Error('Identificador de pacote inválido.');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist', 'netlify', 'source-' + tag);
const manifestPath = path.join(root, 'artifacts', 'netlify-source-' + tag + '.json');
const allow = ['src','server','public','netlify','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','firebase-applet-config.json','server.ts','netlify.toml','scripts/build-netlify.cjs'];
const records = [];
const forbiddenName = name => /^\.env(?:\.|$)/i.test(name) || /^(?:\.git|\.tools|node_modules|artifacts)$/i.test(name) || /\.(?:pem|key|p12|pfx)$/i.test(name);
const privateMaterial = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{40,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/;

function rejectLinkedAncestors(location) {
  let current = path.resolve(location);
  for (;;) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('O pacote recusou um caminho com link.');
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
function inspect(relative) {
  const source = path.join(root, relative);
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink() || forbiddenName(path.basename(source))) throw new Error('O pacote recusou um arquivo ou caminho privado.');
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(source).sort()) inspect(path.join(relative, name));
  } else if (stat.isFile()) {
    const data = fs.readFileSync(source);
    if (privateMaterial.test(data.toString('utf8'))) throw new Error('O pacote recusou conteúdo com assinatura de credencial privada.');
    records.push({path:relative.split(path.sep).join('/'),bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
  } else throw new Error('O pacote recusou um tipo de arquivo não suportado.');
}

rejectLinkedAncestors(root);
rejectLinkedAncestors(path.dirname(target));
rejectLinkedAncestors(path.dirname(manifestPath));
if (fs.existsSync(target) || fs.existsSync(manifestPath)) throw new Error('O pacote já existe. Nenhum arquivo foi sobrescrito.');
for (const relative of allow) inspect(relative);
fs.mkdirSync(path.dirname(target), {recursive:true});
fs.mkdirSync(target); // Deliberately exclusive: never replace an older tree.
for (const record of records) {
  const destination = path.join(target, record.path);
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  const source = path.join(root, record.path);
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error('O pacote recusou um link durante a cópia.');
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  const copied = fs.readFileSync(destination);
  if (crypto.createHash('sha256').update(copied).digest('hex') !== record.sha256) throw new Error('Um arquivo mudou durante a preparação. Não envie esta cópia.');
}
fs.mkdirSync(path.dirname(manifestPath), {recursive:true});
fs.writeFileSync(manifestPath, JSON.stringify({tag,createdAt:new Date().toISOString(),sourceTree:path.relative(root,target).split(path.sep).join('/'),files:records.length,bytes:records.reduce((sum,record)=>sum+record.bytes,0),entries:records}, null, 2)+'\n', {flag:'wx'});
console.log(JSON.stringify({sourceTree:target,manifest:manifestPath,files:records.length,bytes:records.reduce((sum,record)=>sum+record.bytes,0)}));
