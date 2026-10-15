const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildNetlify}=require('../scripts/build-netlify.cjs');

test('Netlify frontend uses cloud 18+ and exact direct voice origin without building the server',()=>{
  const calls=[],copies=[],environment={PATH:'fixture-path',VITE_FIREBASE_MODE:'demo',VITE_AUDIENCE:'children',VITE_VOICE_ORIGIN:'https://unapproved.invalid'};
  const status=buildNetlify({environment,spawn:(...args)=>{calls.push(args);return{status:0};},copy:(...args)=>copies.push(args),log:()=>{}});
  assert.equal(status,0);assert.equal(calls.length,1);
  const [node,args,options]=calls[0];
  assert.equal(node,process.execPath);
  assert.deepEqual(args,['node_modules/vite/bin/vite.js','build','--mode','publication','--outDir','dist/netlify/public']);
  assert.equal(options.env.VITE_FIREBASE_MODE,'cloud');assert.equal(options.env.VITE_AUDIENCE,'18plus');
  assert.equal(options.env.VITE_VOICE_ORIGIN,'https://vigia-app.onrender.com');assert.equal(options.env.PATH,'fixture-path');
  assert.equal('VITE_API_ORIGIN' in options.env,false);
  assert.equal(environment.VITE_FIREBASE_MODE,'demo');
  assert.deepEqual(copies.map(([source,destination])=>[path.relative(options.cwd,source).split(path.sep).join('/'),path.relative(options.cwd,destination).split(path.sep).join('/')]),[
    ['netlify/_redirects','dist/netlify/public/_redirects'],['netlify/_headers','dist/netlify/public/_headers']
  ]);
});
test('failed frontend build never copies routing files or reports success',()=>{
  let copied=false,logged=false;
  assert.equal(buildNetlify({spawn:()=>({status:2}),copy:()=>{copied=true;},log:()=>{logged=true;}}),2);
  assert.equal(copied,false);assert.equal(logged,false);
  assert.equal(buildNetlify({spawn:()=>({status:null}),copy:()=>{copied=true;},log:()=>{logged=true;}}),1);
  assert.equal(copied,false);assert.equal(logged,false);
});
test('Netlify routing leaves API to the Function before an unforced SPA fallback',()=>{
  const routing=fs.readFileSync('netlify/_redirects','utf8').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  assert.deepEqual(routing,['/* /index.html 200']);
  const proxy=fs.readFileSync('netlify/functions/api-proxy.mjs','utf8');
  assert.match(proxy,/path:\s*\['\/api',\s*'\/api\/\*'\]/);assert.doesNotMatch(proxy,/preferStatic\s*:\s*true/);
});
test('only versioned static assets use immutable caching and the service worker always revalidates',()=>{
  const headers=fs.readFileSync('netlify/_headers','utf8'),sections=headers.split(/\r?\n\s*\r?\n/).filter(Boolean);
  const immutable=sections.filter(section=>section.includes('immutable'));
  assert.equal(immutable.length,2);
  assert.ok(immutable.every(section=>/^\s*(?:#[^\n]*\n)*\/(?:assets\/\*|workbox-\*\.js)\r?\n/.test(section)));
  assert.match(headers,/\/sw\.js\r?\n\s+Cache-Control: no-cache/);
  assert.doesNotMatch(headers,/Access-Control-Allow-Origin|Allow-Credentials|\/api\/\*/);
});
