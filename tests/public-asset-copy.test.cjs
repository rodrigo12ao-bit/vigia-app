const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {copyPublicAssets}=require('../scripts/copy-public-assets.cjs');
test('public asset copy falls back to byte-preserving IO on cloud-sync CopyFile failure',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vigia-copy-review-'));
  const source=path.join(directory,'source'),destination=path.join(directory,'destination');
  fs.mkdirSync(path.join(source,'model'),{recursive:true});
  const bytes=Buffer.from([0,1,2,255,0,42]);fs.writeFileSync(path.join(source,'model','fixture.glb'),bytes);
  let fallback=0;
  copyPublicAssets(source,destination,{...fs,copyFileSync(){fallback++;throw Object.assign(Error('Fixture cloud sync failure'),{code:'UNKNOWN'});}});
  assert.equal(fallback,1);assert.deepEqual(fs.readFileSync(path.join(destination,'model','fixture.glb')),bytes);
});
test('unreadable public asset prevents a success report instead of silently dropping it',()=>{
  const io={mkdirSync(){},readdirSync(){return[{name:'missing.png',isDirectory:()=>false,isFile:()=>true}];},copyFileSync(){throw Error('Copy denied');},readFileSync(){throw Error('Read denied');},writeFileSync(){assert.fail('Cannot write missing data');}};
  assert.throws(()=>copyPublicAssets('source','destination',io),/Read denied/);
});
test('OneDrive directory metadata falls back to lstat without losing the icon bytes',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vigia-cloud-kind-'));
  const source=path.join(directory,'source'),destination=path.join(directory,'destination');
  fs.mkdirSync(source);const bytes=Buffer.from('<svg/>');fs.writeFileSync(path.join(source,'icon.svg'),bytes);
  copyPublicAssets(source,destination,{...fs,readdirSync(){return[{name:'icon.svg',isDirectory:()=>false,isFile:()=>false}];}});
  assert.deepEqual(fs.readFileSync(path.join(destination,'icon.svg')),bytes);
});
test('a genuine symbolic link remains unsupported and no target data is read',()=>{
  const io={mkdirSync(){},readdirSync(){return[{name:'linked.svg',isDirectory:()=>false,isFile:()=>false}];},lstatSync(){return{isDirectory:()=>false,isFile:()=>false};},readFileSync(){assert.fail('Link target must not be read');},copyFileSync(){assert.fail('Link must not be copied');}};
  assert.throws(()=>copyPublicAssets('source','destination',io),/Unsupported public asset/);
});
