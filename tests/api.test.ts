import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const root=process.env.TEST_APP_URL || 'http://localhost:3000';
const origin=process.env.TEST_APP_ORIGIN || root;
let cookie='';
const post=async(path:string,data:any,extra:Record<string,string>={})=>fetch(root+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
before(async()=>{const status=await (await fetch(root+'/api/status')).json();assert.equal(status.demo,true,'Tests require demo mode');const r=await post('/api/session',{});cookie=r.headers.get('set-cookie')!.split(';')[0];});
test('API: sessão ausente, token falso e origem externa rejeitados',async()=>{
  const missing=await fetch(root+'/api/chat',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({message:'oi'})});assert.equal(missing.status,401);
  assert.equal((await post('/api/chat',{message:'oi'},{Authorization:'Bearer false'})).status,401);
  assert.equal((await post('/api/chat',{message:'oi'},{Origin:'https://invalid.example'})).status,403);
});
test('texto e cenário acionam a mesma orientação de emergência sem score inventado',async()=>{
  const a=await(await post('/api/chat',{message:'a água tá subindo muito rápido'})).json();
  const b=await(await post('/api/analyze-scenario',{scenario:'a água tá subindo muito rápido'})).json();assert.equal(a.status,'emergency');assert.equal(a.reply,b.reply);assert.equal(b.riskScore,undefined);
});
test('falha de análise e transcrição aparecem indisponíveis, sem risco ou texto fabricado',async()=>{
  const failure=await post('/api/analyze-scenario',{scenario:'Preparar mochila'},{'X-Demo-Failure':'true'});assert.equal(failure.status,503);const body=await failure.json();assert.equal(body.status,'unavailable');assert.equal(body.riskLevel,undefined);assert.equal(body.riskScore,undefined);
  const voice=await post('/api/transcribe',{audio:'AA==',mimeType:'audio/webm'});assert.equal(voice.status,503);assert.equal((await voice.json()).text,undefined);
});
test('simulações identificadas; imagem válida segue o mesmo contrato de texto',async()=>{
  const body=await(await post('/api/chat',{message:'Mochila',image:{mimeType:'image/jpeg',data:'AA=='}})).json();assert.equal(body.demo,true);assert.match(body.reply,/SIMULAÇÃO/);
  const quiz=await(await post('/api/generate-quiz',{topic:'Mochila'})).json();assert.equal(quiz.demo,true);assert.equal(quiz.options.length,3);
});
test('conteúdo e tipo de anexo inválidos são rejeitados',async()=>{
  assert.equal((await post('/api/chat',{message:'oi',chatHistory:[{role:'admin',content:'x'}]})).status,400);
  assert.equal((await post('/api/chat',{message:'oi',image:{mimeType:'image/svg+xml',data:'AAAA'}})).status,400);
});
test('backend, mapas e arquivos privados não são expostos',async()=>{
  for(const path of ['/server.cjs','/server.cjs.map','/server.ts','/server/server.cjs','/.env','/firestore.rules'])assert.equal((await fetch(root+path)).status,404,path);
});
test('WebSocket rejeita cliente sem ticket',async()=>{
  await new Promise<void>((resolve,reject)=>{const ws=new WebSocket(root.replace('http','ws')+'/api/live-ws',{headers:{Origin:origin}});ws.on('unexpected-response',(_req,response)=>{assert.equal(response.statusCode,401);ws.terminate();resolve();});ws.on('open',()=>{ws.close();reject(Error('Unauthorized WebSocket opened'));});ws.on('error',()=>{});});
});
test('ticket WebSocket vale uma vez; demo informa voz indisponível',async()=>{
  const {ticket}=await(await post('/api/live-ticket',{})).json();const url=root.replace('http','ws')+'/api/live-ws?ticket='+ticket;
  await new Promise<void>((resolve,reject)=>{const ws=new WebSocket(url,{headers:{Origin:origin}});ws.on('message',data=>{assert.match(String(data),/indisponível/);});ws.on('close',()=>resolve());ws.on('error',reject);});
  await new Promise<void>((resolve,reject)=>{const ws=new WebSocket(url,{headers:{Origin:origin}});ws.on('unexpected-response',(_req,response)=>{assert.equal(response.statusCode,401);ws.terminate();resolve();});ws.on('open',()=>reject(Error('Ticket reutilizado')));ws.on('error',()=>{});});
});
