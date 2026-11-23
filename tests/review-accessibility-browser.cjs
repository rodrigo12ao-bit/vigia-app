// Built application, real DOM/keyboard and synthetic services only.
// Run after npm run build:netlify in an environment that permits Chrome.
// CHROME_PATH selects an installed browser; this script never downloads one.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const publicDir=path.resolve('dist/netlify/public');
const evidenceDir=path.resolve(process.env.VIGIA_ENTRY_EVIDENCE_DIR||`artifacts/review-entry-${Date.now()}`);
assert.ok(evidenceDir.startsWith(path.resolve('artifacts')+path.sep),'Evidence directory must be inside artifacts.');
assert.ok(!fs.existsSync(evidenceDir),'Choose a new evidence directory; previous results are preserved.');
fs.mkdirSync(evidenceDir,{recursive:true});
const report={scope:'Built local Vigia UI; synthetic HTTP/Firebase failures, no cloud writes or real AI. Desktop, mobile and a 320px viewport. No physical-device or screen-reader claim.',status:'running',checks:[],profiles:[]};
let origin,browser,context,page,stage='setup';
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,origin).pathname;
  if(pathname==='/api/status')return send(res,200,{demo:false,realAI:true,localDemo:false,audience:'18plus',ai:{mode:'adult-gemini',provider:'gemini',blocked:null,consentVersion:'entry-qa-synthetic',voice:true}});
  if(['/api/session','/api/adult-access'].includes(pathname))return send(res,200,{ok:true});
  if(pathname.startsWith('/api/'))return send(res,503,{error:'Serviço fictício indisponível neste teste de interface.'});
  const target=path.resolve(publicDir,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(publicDir+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end();}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary','.woff2':'font/woff2'};
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res);
 }catch(error){send(res,500,{error:'Local QA fixture failure: '+error.message});}
});
async function check(name,run){stage=name;await run();report.checks.push({name,status:'passed'});console.log('PASS '+name);}
async function clickText(label,scope='body'){
 const clicked=await page.evaluate(({label,scope})=>{const button=[...document.querySelector(scope).querySelectorAll('button')].find(button=>button.textContent.trim()===label);if(!button)return false;button.click();return true;},{label,scope});assert.equal(clicked,true,'Missing button '+label);
}
async function fill(selector,value){await page.$eval(selector,(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function dialogFocus(label){await page.waitForFunction(label=>document.querySelector(`[role="dialog"][aria-label="${label}"]`)?.contains(document.activeElement),{},label);}
async function assertLabels(){
 const problems=await page.$eval('.vigia-auth-modal',dialog=>[...dialog.querySelectorAll('input')].filter(input=>!input.labels.length||!input.labels[0].textContent.trim()).map(input=>input.name||input.type));
 assert.deepEqual(problems,[],'Every rendered input must have an associated visible label.');
}
async function assertInputMetrics(){
 const fields=await page.$$eval('.vigia-auth-modal input:not([type=checkbox])',inputs=>inputs.map(input=>({font:parseFloat(getComputedStyle(input).fontSize),height:input.getBoundingClientRect().height})));
 for(const field of fields){assert.ok(field.font>=16,'Inputs must avoid small mobile text.');assert.ok(field.height>=44,'Input target too small.');}
}
async function assertNoOverflow(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');}
async function profile(label,viewport,{blockSession=false}={}){
 context=await browser.createBrowserContext();page=await context.newPage();page.setDefaultTimeout(15000);
 const observations={label,viewport,blockedSession:blockSession,pageErrors:[],blockedRequests:[]};report.profiles.push(observations);
 page.on('pageerror',error=>observations.pageErrors.push(error.message));
 await page.setViewport(viewport);await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.setRequestInterception(true);
 page.on('request',request=>{
  const url=new URL(request.url());
  if(url.origin===origin||['data:','blob:'].includes(url.protocol))return void request.continue();
  // Fulfil the SDK's auth request without contacting Firebase or creating users.
  const cors={'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':request.headers()['access-control-request-headers']||'*'};
  if(url.hostname==='identitytoolkit.googleapis.com'&&request.method()==='OPTIONS')return void request.respond({status:204,headers:cors});
  if(url.hostname==='identitytoolkit.googleapis.com'&&url.pathname.includes('sendOobCode'))return void request.respond({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({email:'adult@example.test'})});
  if(url.hostname==='identitytoolkit.googleapis.com'&&url.pathname.includes('signInWithPassword'))return void request.respond({status:400,headers:cors,contentType:'application/json',body:JSON.stringify({error:{code:400,message:'INVALID_LOGIN_CREDENTIALS'}})});
  observations.blockedRequests.push(url.origin+url.pathname);void request.abort('blockedbyclient');
 });
 await page.evaluateOnNewDocument(blockSession=>{
  if(blockSession)Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Synthetic denied sessionStorage','SecurityError');}});
  window.__entryQa={denyProfileWrite:false};
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(window.__entryQa.denyProfileWrite&&key==='vigia_progress:guest')throw new DOMException('Synthetic storage full','QuotaExceededError');return original.call(this,key,value);};
 },blockSession);
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await check(label+': explicit adult declaration is required',async()=>{
  await page.waitForSelector('.adult-entry-card');assert.equal(await page.$eval('.adult-entry-card .vigia-primary',button=>button.disabled),true);
  await page.click('.adult-entry-card input[type=checkbox]');await page.click('.adult-entry-card .vigia-primary');
  await page.waitForSelector('.vigia-entry-card');await dialogFocus('Boas-vindas à Vigia');await assertNoOverflow();
 });
 await check(label+': welcome keyboard loop includes appearance choices only when expanded',async()=>{
  await page.$eval('.vigia-entry summary',summary=>summary.focus());await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Entrar ou criar conta');
  await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
  await page.click('.vigia-entry summary');await page.$eval('.vigia-entry-options .extra-actions button:last-child',button=>button.focus());
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Entrar ou criar conta');
 });
 await check(label+': Auth labels, input metrics and stacked focus',async()=>{
  await page.click('.vigia-entry-actions .vigia-primary');await page.waitForSelector('.vigia-auth-modal');await dialogFocus('Acessar sua conta');
  assert.ok(await page.$('.vigia-entry-card'),'Welcome trigger must remain mounted beneath Auth.');await assertLabels();await assertInputMetrics();
  for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('.vigia-auth-modal').contains(document.activeElement)),true);}
  await page.evaluate(()=>document.querySelector('.navigation-brand').focus());await dialogFocus('Acessar sua conta');
 });
 await check(label+': registration labels and password visibility reset',async()=>{
  await page.click('.vigia-auth-modal [aria-label="Mostrar senha"]');assert.equal(await page.$eval('.vigia-auth-modal input[name=password]',input=>input.type),'text');
  await clickText('Criar Conta','.vigia-auth-modal');await page.waitForSelector('.vigia-auth-modal input[name=nickname]');await assertLabels();await assertInputMetrics();
  assert.equal(await page.$eval('.vigia-auth-modal input[name=password]',input=>input.type),'password');
  await assertNoOverflow();await page.screenshot({path:path.join(evidenceDir,label+'-registration.png'),fullPage:true});
 });
 await check(label+': recovery success is announced and legal dialog returns focus',async()=>{
  await clickText('Entrar','.vigia-auth-modal');await clickText('Esqueci minha senha','.vigia-auth-modal');await assertLabels();
  await fill('.vigia-auth-modal input[name=email]','adult@example.test');await page.$eval('.vigia-auth-modal form',form=>form.requestSubmit());
  await page.waitForFunction(()=>[...document.querySelectorAll('.vigia-auth-modal [role=status]')].some(node=>node.textContent.includes('instruções')));
  await clickText('Política de Privacidade','.vigia-auth-modal');await dialogFocus('Informações de privacidade e termos');await page.keyboard.press('Escape');
  await dialogFocus('Acessar sua conta');assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Política de Privacidade');
 });
 await check(label+': closing Auth returns to the original welcome action',async()=>{
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.vigia-auth-modal'));await dialogFocus('Boas-vindas à Vigia');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Entrar ou criar conta');
  await page.screenshot({path:path.join(evidenceDir,label+'-welcome.png'),fullPage:true});
 });
 await check(label+': profile write failure preserves draft and retry persists it',async()=>{
  await page.click('.vigia-entry-actions .vigia-secondary');await page.waitForFunction(()=>!document.querySelector('.vigia-entry-card'));
  await page.click('.navigation-profile');await page.waitForSelector('[role=dialog][aria-label="Meu perfil"]');
  await page.click('[aria-label="Editar apelido"]');await fill('[role=dialog][aria-label="Meu perfil"] input[name=nickname]','Aprendiz fictício');
  await page.evaluate(()=>{window.__entryQa.denyProfileWrite=true;});await page.click('[aria-label="Salvar apelido"]');
  await page.waitForSelector('[role=dialog][aria-label="Meu perfil"] [role=alert]');
  assert.equal(await page.$eval('[role=dialog][aria-label="Meu perfil"] input[name=nickname]',input=>input.value),'Aprendiz fictício');
  await page.evaluate(()=>{window.__entryQa.denyProfileWrite=false;});await page.click('[aria-label="Salvar apelido"]');
  await page.waitForFunction(()=>!document.querySelector('[role=dialog][aria-label="Meu perfil"] input[name=nickname]'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('vigia_progress:guest')).nickname),'Aprendiz fictício');
  await assertNoOverflow();await page.screenshot({path:path.join(evidenceDir,label+'-profile.png'),fullPage:true});
 });
 assert.deepEqual(observations.pageErrors,[],'Unexpected browser errors');await context.close();page=null;context=null;
}
(async()=>{
 try{
  assert.ok(fs.existsSync(path.join(publicDir,'index.html')),'Run npm run build:netlify first.');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  const candidates=[process.env.CHROME_PATH,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  const executablePath=candidates.find(file=>fs.existsSync(file));assert.ok(executablePath,'Set CHROME_PATH to an installed supported browser.');
  const puppeteer=(await import('puppeteer')).default;
  browser=await puppeteer.launch({executablePath,headless:true,pipe:true,args:['--no-sandbox','--disable-background-networking']});
  await profile('desktop',{width:1280,height:900},{blockSession:true});
  await profile('mobile',{width:390,height:844,isMobile:true,hasTouch:true});
  await profile('narrow',{width:320,height:700,isMobile:true,hasTouch:true});
  report.status='passed';console.log('PASS '+report.checks.length+' entry/accessibility browser checks');
 }catch(error){report.status='failed';report.checks.push({name:stage,status:'failed',error:error.message});process.exitCode=1;console.error(error.stack);if(page)await page.screenshot({path:path.join(evidenceDir,'failure.png'),fullPage:true}).catch(()=>{});
 }finally{
  fs.writeFileSync(path.join(evidenceDir,'report.json'),JSON.stringify(report,null,2));
  await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
  server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));
 }
})();
