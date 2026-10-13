const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {geminiEnv}=require('../scripts/gemini-env.cjs');
const root='http://localhost:3107',report={scope:'Isolated Chrome, synthetic adult microphone input, actual Gemini free-tier STT/chat/TTS. No physical microphone or child data.',results:[]};
let serverLog='';
const server=spawn(process.execPath,['--use-system-ca','dist/presentation/server/server.cjs'],{env:geminiEnv('3107'),windowsHide:true,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>{serverLog+=d;console.error(d.toString());});
let browser,page;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function button(label){await page.waitForFunction(v=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===v&&b.getClientRects().length),{timeout:30000},label);await page.evaluate(v=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===v&&b.getClientRects().length).click(),label);}
(async()=>{try{
 for(let i=0;i<100;i++){assert.equal(server.exitCode,null);try{if((await fetch(root+'/api/status')).ok)break;}catch{}await wait(100);}
 const puppeteer=(await import('puppeteer')).default;
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox','--disable-background-networking','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.resolve('artifacts/gemini-synthetic-adult-input.wav'),'--autoplay-policy=no-user-gesture-required'],timeout:60000});
 page=await browser.newPage();page.on('dialog',d=>d.accept());await page.setViewport({width:1280,height:900});
 const events=[];page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.evaluateOnNewDocument(()=>{window.testVoiceEvents=[];const NativeWS=window.WebSocket;window.WebSocket=class extends NativeWS{constructor(...args){super(...args);this.addEventListener('message',e=>{try{const b=JSON.parse(e.data);window.testVoiceEvents.push({type:b.type,...(b.text?{text:b.text}:{}),...(b.message?{message:b.message}:{})});}catch{}});}};});
 await page.goto(root,{waitUntil:'domcontentloaded'});await page.waitForSelector('[aria-label="Acesso para adultos"]');await page.click('input[type="checkbox"]');await button('Continuar');
 await page.waitForSelector('[aria-label="Boas-vindas à Vigia"]');await page.evaluate(()=>Array.from(document.querySelectorAll('[aria-label="Boas-vindas à Vigia"] button')).find(b=>b.textContent.includes('Explorar')).click());
 await page.click('[title="Conversa & Voz"]');await page.waitForSelector('textarea');await page.click('[aria-label="Conversa por voz"]');
 await page.waitForFunction(()=>window.testVoiceEvents.some(e=>e.type==='turn_complete')||window.testVoiceEvents.some(e=>e.type==='error'),{timeout:120000});
 const received=await page.evaluate(()=>window.testVoiceEvents);events.push(...received);const error=events.find(e=>e.type==='error');assert.equal(error,undefined,error?.message);
 assert.match(events.find(e=>e.type==='input_transcription')?.text||'',/lanterna|mochila/i);const reply=events.find(e=>e.type==='output_transcription')?.text;assert.ok(reply);assert.doesNotMatch(reply,/[{}]|```|auxiliary_list/);assert.ok(events.some(e=>e.type==='audio_chunk'));assert.ok(await page.evaluate(()=>window.VigiaTelemetry.resources.outputContexts.createdTotal>0));
 await page.screenshot({path:'artifacts/gemini-browser-real-voice.png',fullPage:true});report.results.push({name:'Captura sintética pelo navegador, transcrição, resposta real e reprodução de áudio',status:'passed',events});console.log('PASS real browser voice');
 await page.click('[title="Encerrar"]');await button('Sim, encerrar');await page.waitForSelector('textarea');await page.waitForFunction(()=>Object.values(window.VigiaTelemetry.resources).every(r=>r.activeNow===0),{timeout:10000});report.results.push({name:'Encerrar libera microfone, áudio e WebSocket; mantém transcrição no histórico',status:'passed'});console.log('PASS voice cleanup');
}catch(e){report.results.push({name:'Voz pela interface',status:'failed',error:e.message});if(page){await page.screenshot({path:'artifacts/gemini-browser-voice-failure.png',fullPage:true}).catch(()=>{});fs.writeFileSync('artifacts/gemini-browser-voice-failure.txt',await page.$eval('body',e=>e.innerText).catch(()=>''));}console.error(e.message);process.exitCode=1;
}finally{server.kill();await browser?.close();fs.writeFileSync('artifacts/gemini-voice-browser-results.json',JSON.stringify(report,null,2));fs.writeFileSync('artifacts/gemini-voice-browser-server.txt',serverLog);}})();
