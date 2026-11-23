const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
// These suites need services or an optional runtime installed separately.
// Explicit selection still runs them and fails if their prerequisites are absent.
const excluded=new Set(['api.test.ts','sala.test.ts','school.test.ts','adventure-api.test.ts','firestore.rules.test.ts','edge-runtime.test.cjs']);
const selected=process.argv.slice(2);
const names=selected.length?selected.map(value=>path.basename(value)):fs.readdirSync(path.join(root,'tests')).filter(name=>/\.test\.(?:ts|cjs)$/.test(name)&&!excluded.has(name));
const directory=path.join(root,'.tools','review-tests');
fs.mkdirSync(directory,{recursive:true});
const files=names.sort().map(name=>{
  if(!/^[\w.-]+\.test\.(?:ts|cjs)$/.test(name)||!fs.existsSync(path.join(root,'tests',name)))throw Error('Unknown test: '+name);
  if(name.endsWith('.cjs'))return path.join(root,'tests',name);
  const wrapper=path.join(directory,name+'.cjs');
  fs.writeFileSync(wrapper,'require('+JSON.stringify(path.join(root,'scripts','register-test-typescript.cjs'))+');\nrequire('+JSON.stringify(path.join(root,'tests',name))+');\n');
  return wrapper;
});
if(!selected.length&&!fs.existsSync(path.join(root,'.tools','build','graph-publication.json'))&&!fs.existsSync(path.join(root,'.tools','build','graph-presentation.json'))){
  console.error('Gere o pacote antes da revisão: npm run build:netlify (o teste de carregamento inspeciona o grafo real).');
  process.exit(1);
}
console.log('Local review: '+names.length+' test files. Emulators and optional Edge runtime are separate suites: '+[...excluded].join(', ')+'.');
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{cwd:root,stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
