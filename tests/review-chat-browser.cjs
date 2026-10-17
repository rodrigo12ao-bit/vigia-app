const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const origin='http://localhost:3134',publicDir=path.resolve('dist/netlify/public');
const adultVersion=fs.readFileSync('src/lib/audience.ts','utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];
const historyKey='vigia_guest_chat_sessions_v1';
const status={demo:false,realAI:true,localDemo:false,audience:'18plus',ai:{mode:'adult-gemini',provider:'gemini',blocked:null,consentVersion:'review-fixture',voice:true}};
const report={scope:'Built Netlify UI served locally, desktop/mobile emulation; all API replies, microphone and timeouts simulated; external traffic blocked. No real AI, account, physical device or publication.',checks:[],profiles:[],status:'running'};
let browser,page,context,behavior='ok',requests=[],held=[],ttsRequests=0,stage='setup';
const json=(res,code,data)=>{if(!res.destroyed){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,origin).pathname;
    if(pathname==='/api/status')return json(res,200,status);
    if(['/api/session','/api/adult-access'].includes(pathname))return json(res,200,{ok:true});
    if(pathname==='/api/ai-access')return json(res,200,{allowed:true,voice:true,blocked:null});
    if(pathname==='/api/tts'){ttsRequests++;return json(res,503,{error:'Voz fictícia indisponível.'});}
    if(pathname==='/api/chat'){
      let body='';for await(const chunk of req)body+=chunk;
      const data=JSON.parse(body);requests.push(data);
      if(behavior==='hold'){held.push({res,data});return;}
      if(behavior==='fail')return json(res,503,{error:'Falha simulada de conexão.'});
      if(behavior==='malformed')return json(res,200,{reply:{invalid:true},emergencyTip:42});
      return json(res,200,{reply:'Resposta simulada: '+data.message,status:'ok',avatarState:'explaining',emergencyTip:42,interactiveOptions:[{},'Opção válida'],suggestedFollowUps:[null,'Pergunta válida']});
    }
    if(pathname.startsWith('/api/'))return json(res,503,{error:'Rota não permitida neste teste local.'});
    const file=path.resolve(publicDir,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(publicDir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(error){json(res,500,{error:'Fixture failure: '+error.message});}
});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(name,run){stage=name;await run();report.checks.push({name,status:'passed'});console.log('PASS '+name);}
async function draft(text){await page.$eval('textarea',(element,text)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(element,text);element.dispatchEvent(new Event('input',{bubbles:true}));},text);}
async function submit(){await page.$eval('textarea',element=>element.closest('form').requestSubmit());}
async function contains(text){await page.waitForFunction(text=>document.body.innerText.includes(text),{},text);}
async function saved(text){await page.waitForFunction(({key,text})=>JSON.parse(localStorage.getItem(key)||'[]').some(session=>session.messages.some(message=>message.content===text)),{},{key:historyKey,text});}
async function settled(){await page.waitForFunction(()=>!document.body.innerText.includes('A Vigia está preparando a resposta...'));}
async function hold(){for(let i=0;i<100&&!held.length;i++)await wait(20);assert.ok(held.length);return held.shift();}
async function image(){await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'fictional.png',{type:'image/png'}));const input=document.querySelector('input[type="file"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForSelector('img[alt="Prévia"]');}
async function openChat(){await page.click('[aria-label="Conversa & Voz"]');await page.waitForSelector('textarea');await page.waitForSelector('[aria-label="Conversa por voz"]');}
async function createPage(mobile,seed=[]){
  context=await browser.createBrowserContext();page=await context.newPage();page.setDefaultTimeout(15000);
  const profile={mobile,pageErrors:[],externalRequests:[]};report.profiles.push(profile);
  page.on('pageerror',error=>profile.pageErrors.push(error.message));page.on('dialog',dialog=>void dialog.accept());
  await page.setViewport(mobile?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1280,height:900});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setRequestInterception(true);page.on('request',request=>{const url=new URL(request.url());if(url.origin!==origin&&!['data:','blob:'].includes(url.protocol)){profile.externalRequests.push(url.origin+url.pathname);void request.abort('blockedbyclient');}else void request.continue();});
  await page.evaluateOnNewDocument(({adultVersion,historyKey,seed})=>{
    sessionStorage.setItem('vigia_adult_access',adultVersion);localStorage.setItem('dc_is_guest','true');localStorage.setItem('vigia_ai_consent:guest','review-fixture');localStorage.setItem(historyKey,JSON.stringify(seed));localStorage.setItem('vigia_mic_explained:guest','true');
    window.review={shortTimeout:false,tracks:[]};const timer=window.setTimeout;window.setTimeout=function(callback,delay,...args){return timer(callback,window.review.shortTimeout&&delay===90000?120:delay,...args);};
    const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await capture(...args);window.review.tracks.push(...stream.getTracks());return stream;};
  },{adultVersion,historyKey,seed});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('[aria-label="Progresso da aventura"]');await openChat();return profile;
}
async function closePage(){await context?.close();page=null;context=null;}
async function conversation(mobile){
  const label=mobile?'mobile':'desktop',profile=await createPage(mobile);behavior='ok';
  await check(label+': repeated submit sends once and response fields cannot crash the UI',async()=>{const count=requests.length;await draft('Mochila fictícia');await page.$eval('textarea',element=>{element.closest('form').requestSubmit();element.closest('form').requestSubmit();});await contains('Resposta simulada: Mochila fictícia');await saved('Resposta simulada: Mochila fictícia');assert.equal(requests.length,count+1);assert.equal(await page.$eval('textarea',element=>element.value),'');assert.deepEqual(profile.pageErrors,[]);});
  await check(label+': clicking Listen works even when audio starts muted',async()=>{const before=ttsRequests;await page.click('[title="Ouvir resposta"]');for(let i=0;i<100&&ttsRequests===before;i++)await wait(20);assert.equal(ttsRequests,before+1);});
  await check(label+': failed text/image request preserves the entire draft for retry',async()=>{behavior='fail';await image();await draft('Imagem fictícia para revisão');await submit();await contains('Falha simulada de conexão.');await settled();assert.equal(await page.$eval('textarea',element=>element.value),'Imagem fictícia para revisão');assert.ok(await page.$('img[alt="Prévia"]'));behavior='ok';await submit();await contains('Resposta simulada: Imagem fictícia para revisão');await page.waitForFunction(()=>!document.querySelector('img[alt="Prévia"]')&&document.querySelector('textarea').value==='');assert.equal(requests.at(-1).image.mimeType,'image/jpeg');});
  await check(label+': an attachment can be sent without typing a question',async()=>{await image();assert.equal(await page.$eval('[title="Enviar mensagem"]',button=>button.disabled),false);await submit();await contains('Resposta simulada: Analise esta imagem sobre segurança e riscos.');await settled();});
  await check(label+': a successful older response preserves the next text typed while waiting',async()=>{behavior='hold';await draft('Pergunta pendente');await submit();const pending=await hold();await draft('Próximo rascunho');json(pending.res,200,{reply:'Resposta pendente concluída',status:'ok'});await contains('Resposta pendente concluída');await settled();assert.equal(await page.$eval('textarea',element=>element.value),'Próximo rascunho');behavior='ok';});
  await check(label+': Enter during keyboard composition does not submit',async()=>{const count=requests.length;await page.$eval('textarea',element=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));await wait(180);assert.equal(requests.length,count);});
  await check(label+': invalid reply preserves the draft and leaves the app usable',async()=>{behavior='malformed';await draft('Resposta inválida fictícia');await submit();await contains('A resposta está indisponível.');await settled();assert.equal(await page.$eval('textarea',element=>element.value),'Resposta inválida fictícia');assert.deepEqual(profile.pageErrors,[]);behavior='ok';});
  await check(label+': a stalled request times out and a late reply cannot enter the conversation',async()=>{behavior='hold';await page.evaluate(()=>{window.review.shortTimeout=true;});await draft('Timeout fictício');await submit();const pending=await hold();await contains('A resposta demorou demais.');await settled();assert.equal(await page.$eval('textarea',element=>element.value),'Timeout fictício');json(pending.res,200,{reply:'Resposta atrasada proibida',status:'ok'});await wait(200);assert.equal(await page.evaluate(()=>document.body.innerText.includes('Resposta atrasada proibida')),false);await page.evaluate(()=>{window.review.shortTimeout=false;});behavior='ok';});
  await check(label+': a response completed on another tab does not leave a sent draft behind',async()=>{await draft('');behavior='hold';await draft('Concluir fora da conversa');await submit();const pending=await hold();await page.click('[aria-label="Aprender com a Vigia"]');await page.waitForSelector('[aria-label="Áreas de aprendizagem"]');json(pending.res,200,{reply:'Resposta fora da aba',status:'ok'});await saved('Resposta fora da aba');await openChat();assert.equal(await page.$eval('textarea',element=>element.value),'');await contains('Resposta fora da aba');behavior='ok';});
  await check(label+': returning before a reply synchronizes the cleared text and image into the new composer',async()=>{behavior='hold';await draft('Retornar antes da resposta');await image();await submit();const pending=await hold();await page.click('[aria-label="Aprender com a Vigia"]');await page.waitForSelector('[aria-label="Áreas de aprendizagem"]');await openChat();assert.equal(await page.$eval('textarea',element=>element.value),'Retornar antes da resposta');json(pending.res,200,{reply:'Resposta após remontagem',status:'ok'});await contains('Resposta após remontagem');await page.waitForFunction(()=>document.querySelector('textarea').value===''&&!document.querySelector('img[alt="Prévia"]'));behavior='ok';});
  await check(label+': a new draft typed after returning stays intact when the older reply finishes',async()=>{behavior='hold';await draft('Envio antigo');await submit();const pending=await hold();await page.click('[aria-label="Aprender com a Vigia"]');await page.waitForSelector('[aria-label="Áreas de aprendizagem"]');await openChat();await draft('Novo rascunho após voltar');json(pending.res,200,{reply:'Resposta preservando o novo rascunho',status:'ok'});await contains('Resposta preservando o novo rascunho');await settled();assert.equal(await page.$eval('textarea',element=>element.value),'Novo rascunho após voltar');await draft('');behavior='ok';});
  await check(label+': unsupported recording releases the microphone and keeps text available',async()=>{await page.evaluate(()=>{window.MediaRecorder=class {static isTypeSupported(){return true;}constructor(){throw Error('Gravação simulada indisponível.');}};});await page.click('[title="Falar pelo microfone"]');await contains('Gravação simulada indisponível.');await page.waitForFunction(()=>window.review.tracks.length>0&&window.review.tracks.every(track=>track.readyState==='ended'));assert.ok(await page.$('textarea'));});
  await check(label+': malformed stored history is preserved and switching cannot discard unsaved content',async()=>{await page.evaluate(key=>localStorage.setItem(key,JSON.stringify([{id:'broken',title:42,messages:[]}])),historyKey);await page.click('[aria-label="Aprender com a Vigia"]');await openChat();await contains('Histórico indisponível.');assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key))[0].title,historyKey),42);await page.click('[title="Iniciar uma nova conversa"]');await contains('Recarregue o histórico antes de trocar de conversa.');await contains('Resposta preservando o novo rascunho');assert.deepEqual(profile.pageErrors,[]);});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:'artifacts/review-20261016-chat-'+label+'.png',fullPage:true});await closePage();
  const messages=Array.from({length:198},(_,index)=>({id:'limit-'+index,role:index%2?'assistant':'user',content:'Conteúdo fictício '+index,timestamp:'2026-10-15T12:00:00.000Z'}));
  const seed=[{id:'limit-session',title:'Conversa no limite',createdAt:'2026-10-15T12:00:00.000Z',updatedAt:'2026-10-15T12:00:00.000Z',messages}];await createPage(mobile,seed);
  await check(label+': the last complete text turn reaches 200 messages and the next is blocked',async()=>{await page.click('[title="Abrir histórico de conversas"]');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Conversa no limite'));await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Conversa no limite').click());await draft('Último turno permitido');await submit();await contains('Resposta simulada: Último turno permitido');await saved('Resposta simulada: Último turno permitido');assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key))[0].messages.length,historyKey),200);const count=requests.length;await draft('Não deve exceder');await submit();await contains('Esta conversa atingiu o limite.');assert.equal(requests.length,count);});
  await closePage();
}
(async()=>{try{
  assert.ok(fs.existsSync(path.join(publicDir,'index.html')));await new Promise(resolve=>server.listen(3134,'127.0.0.1',resolve));
  const puppeteer=(await import('puppeteer')).default;
  browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox','--disable-background-networking','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  await conversation(false);await conversation(true);report.status='passed';console.log('PASS '+report.checks.length+' chat browser checks');
}catch(error){report.status='failed';report.checks.push({name:stage,status:'failed',error:error.message});process.exitCode=1;console.error(error.stack);if(page)await page.screenshot({path:'artifacts/review-20261016-chat-failure.png',fullPage:true}).catch(()=>{});
}finally{
  fs.writeFileSync('artifacts/review-20261016-chat-browser.json',JSON.stringify(report,null,2));
  await closePage();
  if(browser){let timer;try{await Promise.race([browser.close(),new Promise(resolve=>timer=setTimeout(resolve,5000))]);}finally{clearTimeout(timer);if(browser.process()?.exitCode===null)browser.process().kill();}}
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}})();
