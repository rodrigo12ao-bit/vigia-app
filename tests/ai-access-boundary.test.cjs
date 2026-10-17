const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const express=require('express');
require('../scripts/register-test-typescript.cjs');
// A verified free-plan fixture, with no real key, account or provider transport.
Object.assign(process.env,{VIGIA_MODE:'local-real',AI_AUDIENCE:'18plus',AI_PROVIDER:'gemini',ENABLE_REAL_AI:'true',AI_COST_AUTHORIZED:'false',HOST:'127.0.0.1',RENDER:'false',ENABLE_CLOUD_FIREBASE:'false',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',GEMINI_API_KEY:'fixture-no-real-key',GEMINI_FREE_KEY_SHA256:createHash('sha256').update('fixture-no-real-key').digest('hex')});
const {installSecurity,ADULT_ACCESS_VERSION}=require('../server/security.ts');
const {GEMINI_ADULT_CONSENT}=require('../server/geminiAi.ts');
test('variações de maiúsculas e barra final conservam acesso adulto e consentimento da IA',async t=>{
 const app=express();app.use(express.json());installSecurity(app);
 for(const path of ['/chat','/analyze-scenario','/generate-quiz','/transcribe','/tts'])app.post('/api'+path,(_request,response)=>response.json({reached:true}));
 const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const root='http://127.0.0.1:'+server.address().port,origin='http://localhost:3000';let cookie;
 const post=(path,data={},consent)=>fetch(root+'/api'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(consent?{'X-Vigia-AI-Consent':consent}:{})},body:JSON.stringify(data)});
 const session=await post('/session');assert.equal(session.status,200);cookie=session.headers.get('set-cookie').split(';')[0];
 assert.equal((await post('/CHAT/',{message:'Mochila'})).status,403);
 assert.equal((await post('/adult-access',{confirmed:true,version:ADULT_ACCESS_VERSION})).status,200);
 for(const path of ['/chat','/CHAT/','/analyze-scenario/','/GENERATE-QUIZ','/transcribe/','/TTS/','/LIVE-TICKET/']){
  const denied=await post(path,{message:'Mochila',scenario:'Preparar mochila'});assert.equal(denied.status,428,path);assert.equal((await denied.json()).code,'consent_required');
 }
 assert.equal((await post('/CHAT/',{message:'Mochila'},GEMINI_ADULT_CONSENT)).status,200);
 assert.equal((await post('/CHAT/',{message:'tem fogo na minha casa'})).status,200,'Orientação emergencial permanece local e não depende do consentimento ao fornecedor.');
});
