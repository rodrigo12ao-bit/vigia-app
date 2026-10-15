const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');
const helper=transform(readFileSync('src/lib/voiceOrigin.ts','utf8'),{loader:'ts',format:'cjs'}).then(result=>{const module={exports:{}};new Function('module','exports',result.code)(module,module.exports);return module.exports;});
const render='https://vigia-app.onrender.com',netlify={protocol:'https:',host:'synthetic-vigia.netlify.app'};

test('no override preserves the existing Render and local same-origin WebSocket',async()=>{
  const {buildVoiceSocketUrl}=await helper;
  assert.equal(buildVoiceSocketUrl({protocol:'https:',host:'vigia-app.onrender.com'},'one-use-ticket'),'wss://vigia-app.onrender.com/api/live-ws?ticket=one-use-ticket&voiceProtocol=stream-v1');
  assert.equal(buildVoiceSocketUrl({protocol:'http:',host:'localhost:3001'},'local-ticket'),'ws://localhost:3001/api/live-ws?ticket=local-ticket&voiceProtocol=stream-v1');
  assert.equal(buildVoiceSocketUrl(netlify,'ticket',undefined,''),'wss://synthetic-vigia.netlify.app/api/live-ws?ticket=ticket&voiceProtocol=stream-v1');
});
test('explicit Netlify configuration connects only WSS to the exact Render backend',async()=>{
  const {buildVoiceSocketUrl}=await helper;
  for(const override of [render,render+'/'])assert.equal(new URL(buildVoiceSocketUrl(netlify,'one-use-ticket',undefined,override)).origin,'wss://vigia-app.onrender.com');
});
test('one-use ticket, voice protocol and conversation context survive safely encoded',async()=>{
  const {buildVoiceSocketUrl}=await helper,ticket='ticket?&=/+ ç',context='Nome fictício & contexto? #sem dados pessoais';
  const url=new URL(buildVoiceSocketUrl(netlify,ticket,context,render));
  assert.equal(url.pathname,'/api/live-ws');assert.equal(url.searchParams.get('ticket'),ticket);assert.equal(url.searchParams.get('voiceProtocol'),'stream-v1');assert.equal(url.searchParams.get('context'),context);assert.equal(url.hash,'');assert.equal([...url.searchParams.keys()].length,3);
});
for(const override of ['http://vigia-app.onrender.com','wss://vigia-app.onrender.com','https://other.onrender.com','https://vigia-app.onrender.com.attacker.example','https://attacker.example@vigia-app.onrender.com','https://user:password@vigia-app.onrender.com','https://vigia-app.onrender.com/path','https://vigia-app.onrender.com?x=1','https://vigia-app.onrender.com#fragment','https://vigia-app.onrender.com:8443','//vigia-app.onrender.com',' https://vigia-app.onrender.com','https://vigia-app.onrender.com/../','https://vigia-app.onrender.com\\@attacker.example'])test('reject unapproved voice origin '+override,async()=>{
  const {buildVoiceSocketUrl}=await helper;assert.throws(()=>buildVoiceSocketUrl(netlify,'ticket','context',override),/não é permitido/);
});
test('missing voice ticket and unsupported local origin fail closed',async()=>{
  const {buildVoiceSocketUrl}=await helper;
  assert.throws(()=>buildVoiceSocketUrl(netlify,''),/confirmar/);
  assert.throws(()=>buildVoiceSocketUrl({protocol:'file:',host:''},'ticket'),/indisponível/);
});
