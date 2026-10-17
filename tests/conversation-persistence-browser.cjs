const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');

// Real built React UI and real Workbox update lifecycle. Only same-origin API
// replies, WebSocket and Chrome's media device are fixtures. All remote traffic
// is denied; no account, Google request, real microphone or AI service is used.
// Run after a publication build: node tests/conversation-persistence-browser.cjs
// Pass --presentation only to inspect the presentation build instead.
if(process.argv.slice(2).some(arg=>!['--presentation','--netlify'].includes(arg)))throw Error('Unknown option.');
if(process.argv.includes('--presentation')&&process.argv.includes('--netlify'))throw Error('Choose one build.');
const netlify=process.argv.includes('--netlify');
const prefix=netlify?'artifacts/review-20261016-persistence':'artifacts/conversation-persistence';
const publicDir=path.resolve(netlify?'dist/netlify/public':process.argv.includes('--presentation')?'dist/presentation/public':'dist/publication/public');
assert.ok(fs.existsSync(path.join(publicDir,'index.html')),'Build the selected UI first.');
const origin='http://localhost:3124';
const adultVersion=fs.readFileSync('src/lib/audience.ts','utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert.ok(adultVersion);
const canonicalKey='vigia_guest_chat_sessions_v1',recoveryKey='vigia_guest_chat_recovery_v1';
const saved={id:'fixture-preserved-session',title:'Histórico fictício preservado',createdAt:'2026-10-14T12:00:00.000Z',updatedAt:'2026-10-14T12:00:01.000Z',lastMessagePreview:'Resposta original fictícia.',messages:[{id:'fixture-user',role:'user',content:'Pergunta original fictícia.',timestamp:'2026-10-14T12:00:00.000Z'},{id:'fixture-reply',role:'assistant',content:'Resposta original fictícia.',timestamp:'2026-10-14T12:00:01.000Z'}]};
const aiStatus={demo:false,realAI:true,audience:'18plus',ai:{mode:'adult-gemini',provider:'gemini',blocked:null,consentVersion:'fixture-persistence-consent',voice:true}};
const report={scope:'Built React UI desktop/mobile emulation; real local Workbox lifecycle. All API/voice replies and media are synthetic. No external services, real accounts or physical-phone validation.',results:[],profiles:[],status:'running'};
let swRevision=1,holdNext=false,heldChats=[],browser,page,context,stage='setup';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sendJson=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,origin).pathname;
    if(pathname==='/api/status')return sendJson(res,200,aiStatus);
    if(['/api/session','/api/adult-access'].includes(pathname))return sendJson(res,200,{ok:true,simulated:true});
    if(pathname==='/api/ai-access')return sendJson(res,200,{allowed:true,voice:true,blocked:null});
    if(pathname==='/api/live-ticket')return sendJson(res,200,{ticket:'synthetic-persistence-ticket'});
    if(pathname==='/api/chat'){
      let body='';for await(const part of req)body+=part;
      const input=JSON.parse(body).message,reply='Resposta simulada para '+input;
      if(holdNext){holdNext=false;heldChats.push({res,input,reply});return;}
      return sendJson(res,200,{reply,status:'ok',avatarState:'explaining'});
    }
    if(pathname.startsWith('/api/'))return sendJson(res,503,{error:'Endpoint blocked by the isolated fixture.'});
    const file=path.resolve(publicDir,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(publicDir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
    let data=fs.readFileSync(file);
    if(pathname==='/sw.js')data=Buffer.concat([data,Buffer.from('\n// isolated fixture revision '+swRevision+'\n')]);
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(data);
  }catch(error){sendJson(res,500,{error:'Isolated fixture failed: '+error.message});}
});

async function check(name,run){stage=name;await run();report.results.push({name,status:'passed'});console.log('PASS '+name);}
async function visible(selector){await page.waitForSelector(selector,{visible:true});}
async function button(text){
  await page.waitForFunction(value=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()===value&&node.getClientRects().length&&!node.disabled),{},text);
  await page.evaluate(value=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===value&&node.getClientRects().length&&!node.disabled).click(),text);
}
async function contains(text){await page.waitForFunction(value=>document.body.innerText.includes(value),{},text);}
async function openChat(){await page.click('[aria-label="Conversa & Voz"]');await visible('textarea');await visible('[aria-label="Conversa por voz"]');}
async function send(message,hold=false){
  holdNext=hold;await page.type('textarea',message);
  const accessible=await page.$eval('[title="Enviar mensagem"]',button=>{const r=button.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !button.disabled&&(top===button||button.contains(top));});
  assert.ok(accessible,'The real Send button must stay enabled and unobstructed, including during a PWA update.');
  await page.click('[title="Enviar mensagem"]');
}
async function releaseChat(){
  for(let index=0;index<100&&!heldChats.length;index++)await wait(20);
  assert.ok(heldChats.length,'The held synthetic chat request must exist.');
  const item=heldChats.shift();sendJson(item.res,200,{reply:item.reply,status:'ok',avatarState:'explaining'});return item;
}
async function sessions(){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),canonicalKey);}
async function waitSaved(text){await page.waitForFunction(({key,text})=>JSON.parse(localStorage.getItem(key)||'[]').some(session=>session.messages.some(message=>message.content===text)),{}, {key:canonicalKey,text});}
async function nextUpdate(){
  swRevision++;
  await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();});
  await buttonVisible('Atualizar Agora');
}
async function buttonVisible(text){await page.waitForFunction(value=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()===value&&node.getClientRects().length),{},text);}
async function newPage(mobile,{failApp=false,failChat=false}={}){
  context=await browser.createBrowserContext();page=await context.newPage();page.setDefaultTimeout(20000);
  await page.setViewport(mobile?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1280,height:900});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  const state={blocked:[],errors:[],navigation:0,failApp,failChat};
  report.profiles.push({mobile,state});
  page.on('pageerror',error=>state.errors.push(error.message));
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())state.navigation++;});
  page.on('dialog',dialog=>void dialog.accept());
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const url=new URL(request.url());
    if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol)){state.blocked.push(url.origin+url.pathname);return void request.abort('blockedbyclient');}
    if((state.failApp&&/\/assets\/App-[^/]+\.js$/.test(url.pathname))||(state.failChat&&/\/assets\/ChatTab-[^/]+\.js$/.test(url.pathname)))return void request.respond({status:404,contentType:'text/javascript',body:'// Deliberate isolated chunk failure.'});
    void request.continue();
  });
  await page.evaluateOnNewDocument(({adultVersion,saved,canonicalKey,recoveryKey,netlify})=>{
    sessionStorage.setItem('vigia_adult_access',adultVersion);localStorage.setItem('dc_is_guest','true');
    localStorage.setItem('vigia_ai_consent:guest','fixture-persistence-consent');
    if(!localStorage.getItem(canonicalKey))localStorage.setItem(canonicalKey,JSON.stringify([saved]));
    window.persistenceFixture={writes:[],failStorage:false,sockets:[],tracks:[]};
    const originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(this===localStorage&&[canonicalKey,recoveryKey].includes(key)){
        if(window.persistenceFixture.failStorage)throw new DOMException('Synthetic storage failure.','QuotaExceededError');
        window.persistenceFixture.writes.push({key,at:performance.now()});
      }
      return originalSet.call(this,key,value);
    };
    if(window.ServiceWorker){
      const post=ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage=function(message,...args){if(message?.type==='SKIP_WAITING')sessionStorage.setItem('fixture_skip_waiting',String(Number(sessionStorage.getItem('fixture_skip_waiting')||0)+1));return post.call(this,message,...args);};
    }
    const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await capture(...args);window.persistenceFixture.tracks.push(...stream.getTracks());return stream;};
    window.WebSocket=class{
      static OPEN=1;readyState=1;bufferedAmount=0;
      constructor(url){if(!String(url).startsWith('ws://localhost:3124/api/live-ws')&&!(netlify&&String(url).startsWith('wss://vigia-app.onrender.com/api/live-ws?')))throw Error('Non-fixture WebSocket blocked.');window.persistenceFixture.sockets.push(this);setTimeout(()=>{this.onopen?.();this.emit({type:'open',mode:'streamed-speech'});},20);}
      emit(message){if(this.readyState===1)this.onmessage?.({data:JSON.stringify(message)});}
      send(raw){const message=JSON.parse(raw);if(message.type==='interrupt')setTimeout(()=>this.emit({type:'interrupted'}),0);if(message.type==='speech_output')this.emit(message);}
      close(){this.readyState=3;this.onclose?.();}
    };
  },{adultVersion,saved,canonicalKey,recoveryKey,netlify});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  return state;
}
async function closePage(){await context?.close();context=undefined;page=undefined;}

async function persistence(mobile){
  const label=mobile?'mobile':'desktop',state=await newPage(mobile);
  await visible('[aria-label="Progresso da aventura"]');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload({waitUntil:'domcontentloaded'});await visible('[aria-label="Progresso da aventura"]');
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await openChat();
  let identity;
  await check(label+': leaving within 500 ms saves the response under the same identity',async()=>{
    await send('primeiro turno fictício',true);const item=await releaseChat();await contains(item.reply);
    await page.click('[aria-label="Aprender com a Vigia"]');await visible('[aria-label="Áreas de aprendizagem"]');
    await waitSaved(item.reply);identity=(await sessions()).find(session=>session.messages.some(message=>message.content===item.reply)).id;
    await openChat();assert.ok(await page.evaluate(value=>document.body.innerText.includes(value),item.reply));
    await page.type('textarea','Rascunho fictício preservado');await page.click('[aria-label="Aprender com a Vigia"]');await visible('[aria-label="Áreas de aprendizagem"]');await openChat();
    assert.equal(await page.$eval('textarea',node=>node.value),'Rascunho fictício preservado');
    assert.equal((await sessions()).filter(session=>session.messages.some(message=>message.content===item.reply)).length,1);
    await page.$eval('textarea',node=>{const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(node,'');node.dispatchEvent(new Event('input',{bubbles:true}));});
  });
  await check(label+': a response completed outside Chat survives synchronous pagehide staging and reload',async()=>{
    await send('resposta enquanto a aba aprende',true);
    await page.click('[aria-label="Aprender com a Vigia"]');await visible('[aria-label="Áreas de aprendizagem"]');
    const item=await releaseChat();await wait(50);
    const staged=await page.evaluate(key=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(key)||'[]');},recoveryKey);
    const confirmed=await sessions();
    assert.ok([...staged,...confirmed].some(session=>session.id===identity&&session.messages.some(message=>message.content===item.reply)),'The latest App-owned response must already be confirmed or synchronously staged on pagehide.');
    await page.reload({waitUntil:'domcontentloaded'});await visible('[aria-label="Progresso da aventura"]');await openChat();await waitSaved(item.reply);
    const rows=await sessions();assert.equal(rows.filter(session=>session.messages.some(message=>message.content===item.reply)).length,1);assert.equal(rows.find(session=>session.messages.some(message=>message.content===item.reply)).id,identity);
  });
  await check(label+': opening saved history alone does not rewrite its contents',async()=>{
    await page.click('[title="Abrir histórico de conversas"]');await contains(saved.title);
    const before=await page.evaluate(({key,id})=>({writes:window.persistenceFixture.writes.length,session:JSON.parse(localStorage.getItem(key)).find(session=>session.id===id)}),{key:canonicalKey,id:saved.id});
    await button(saved.title);await contains('Resposta original fictícia.');await wait(650);
    const after=await page.evaluate(({key,id})=>({writes:window.persistenceFixture.writes.length,session:JSON.parse(localStorage.getItem(key)).find(session=>session.id===id)}),{key:canonicalKey,id:saved.id});
    assert.deepEqual(after,before);
  });
  await check(label+': PWA update refuses an unsent draft without clearing it',async()=>{
    await nextUpdate();await page.type('textarea','Rascunho que impede atualizar');const navigations=state.navigation;
    await button('Atualizar Agora');await contains('Há uma mensagem não enviada.');assert.equal(state.navigation,navigations);
    assert.equal(await page.$eval('textarea',node=>node.value),'Rascunho que impede atualizar');
    await page.$eval('textarea',node=>{const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(node,'');node.dispatchEvent(new Event('input',{bubbles:true}));});
  });
  await check(label+': PWA update refuses active voice and leaving Chat clears the voice guard',async()=>{
    await page.click('[aria-label="Conversa por voz"]');await visible('[title="Pausar Conversa"]');
    await button('Atualizar Agora');await contains('Encerre a conversa por voz antes de atualizar.');
    await page.click('[aria-label="Aprender com a Vigia"]');await visible('[aria-label="Áreas de aprendizagem"]');
    await page.waitForFunction(()=>window.persistenceFixture.tracks.every(track=>track.readyState==='ended'));
    await openChat();
  });
  await check(label+': failed saving prevents the PWA update; retry confirms saving before reload',async()=>{
    await page.evaluate(()=>{window.persistenceFixture.failStorage=true;});
    await send('salvamento indisponível fictício');await contains('Resposta simulada para salvamento indisponível fictício');
    const navigations=state.navigation;await button('Atualizar Agora');await contains('Synthetic storage failure.');assert.equal(state.navigation,navigations);
    assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('fixture_skip_waiting')||0)),0);
    await page.evaluate(()=>{window.persistenceFixture.failStorage=false;});
    const navigation=page.waitForNavigation({waitUntil:'domcontentloaded'});await button('Atualizar Agora');await navigation;await visible('[aria-label="Progresso da aventura"]');
    assert.ok((await sessions()).some(session=>session.messages.some(message=>message.content==='Resposta simulada para salvamento indisponível fictício')));
    assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('fixture_skip_waiting')||0)),1);
  });
  await page.screenshot({path:`${prefix}-${label}.png`,fullPage:true});
  assert.deepEqual(state.errors,[]);assert.deepEqual(state.blocked,[]);await closePage();
}
async function chunkFailures(){
  let state=await newPage(false,{failApp:true});
  await check('startup chunk failure offers explicit retry without touching saved history',async()=>{
    await visible('[role="alert"]');await buttonVisible('Tentar carregar novamente');
    const before=await page.evaluate(key=>localStorage.getItem(key),canonicalKey),navigations=state.navigation;await wait(300);assert.equal(state.navigation,navigations);
    state.failApp=false;const navigation=page.waitForNavigation({waitUntil:'domcontentloaded'});await button('Tentar carregar novamente');await navigation;await visible('[aria-label="Progresso da aventura"]');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),canonicalKey),before);
  });await closePage();
  state=await newPage(false,{failChat:true});await visible('[aria-label="Progresso da aventura"]');
  await check('first Chat chunk failure leaves Home usable and manual reload preserves history',async()=>{
    const before=await page.evaluate(key=>localStorage.getItem(key),canonicalKey);
    await page.click('[aria-label="Conversa & Voz"]');await contains('Este recurso está indisponível.');await buttonVisible('Recarregar aplicativo');
    await button('Voltar');await visible('[aria-label="Progresso da aventura"]');assert.equal(await page.evaluate(key=>localStorage.getItem(key),canonicalKey),before);
    await page.click('[aria-label="Conversa & Voz"]');await buttonVisible('Recarregar aplicativo');state.failChat=false;
    const navigation=page.waitForNavigation({waitUntil:'domcontentloaded'});await button('Recarregar aplicativo');await navigation;await visible('[aria-label="Progresso da aventura"]');await openChat();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),canonicalKey),before);
  });await closePage();
}

(async()=>{
  fs.mkdirSync('artifacts',{recursive:true});
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3124,'127.0.0.1',resolve);});
    const puppeteer=(await import('puppeteer')).default;
    browser=await puppeteer.launch({executablePath:process.env.VIGIA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox','--disable-background-networking','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio']});
    for(const mobile of [false,true])await persistence(mobile);
    await chunkFailures();report.status='passed';console.log(`PASS ${report.results.length} persistence/PWA/startup UI checks.`);
  }catch(error){report.status='failed';report.error=error.message;report.failureStage=stage;process.exitCode=1;console.error(stage+': '+error.message);if(page&&!page.isClosed()){await page.screenshot({path:prefix+'-failure.png',fullPage:true}).catch(()=>{});fs.writeFileSync(prefix+'-failure.txt',await page.$eval('body',node=>node.innerText).catch(()=>''));}}
  finally{await closePage().catch(()=>{});if(browser){let timer;try{await Promise.race([browser.close(),new Promise(resolve=>timer=setTimeout(resolve,10000))]);}finally{clearTimeout(timer);if(browser.process()?.exitCode===null)browser.process().kill();}}for(const item of heldChats)item.res.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(prefix+'-browser.json',JSON.stringify(report,null,2));}
})();
