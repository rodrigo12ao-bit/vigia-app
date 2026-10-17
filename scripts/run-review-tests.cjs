const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const excluded=new Set(['api.test.ts','sala.test.ts','school.test.ts','adventure-api.test.ts','firestore.rules.test.ts']);
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
console.log('Local review: '+names.length+' test files; integration suites require explicit selection and local emulators.');
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{cwd:root,stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
