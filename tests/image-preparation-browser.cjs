const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const origin='http://localhost:3133';
const publicDir=path.resolve('dist/netlify/public');
if(process.argv.slice(2).some(value=>value!=='--mobile-only'))throw Error('Unknown option.');
const mobileOnly=process.argv.includes('--mobile-only');
const status={demo:false,realAI:true,audience:'18plus',ai:{mode:'adult-gemini',provider:'gemini',blocked:null,consentVersion:'fixture-image-only',voice:true}};
const report={scope:'Actual built Netlify React UI served locally, desktop/mobile emulation. Image decoding is explicitly delayed; every API response is simulated and all external traffic is blocked. No real AI, account, microphone, Vite server or production deployment.',results:[],status:'running'};
const requests=[];let server,browser,page;
let timedOut=false;
const totalBudget=setTimeout(()=>{timedOut=true;server?.closeAllConnections();if(page)void page.close().catch(()=>{});else if(browser)void browser.close().catch(()=>{});},110000);
totalBudget.unref();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(name,run){console.log('RUN '+name);await run();report.results.push({name,status:'passed'});console.log('PASS '+name);}
async function select(color,name){
  return page.evaluate(async({color,name})=>{
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,64,64);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const transfer=new DataTransfer();transfer.items.add(new File([blob],name,{type:'image/png'}));
    const input=document.querySelector('input[type="file"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    return window.imageTasks.length-1;
  },{color,name});
}
async function finish(index,fail=false){await page.evaluate(({index,fail})=>window.finishImageTask(index,fail),{index,fail});}
async function ready(){await page.waitForFunction(()=>document.querySelector('img[alt="Prévia"]')&&document.querySelector('form[aria-busy="false"]')&&!document.querySelector('[title="Enviar mensagem"]')?.disabled);}
async function draft(text){await page.$eval('textarea',(element,value)=>{const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));},text);}
async function submit(){await page.$eval('textarea',element=>element.closest('form').requestSubmit());}
async function imageSource(){return page.$eval('img[alt="Prévia"]',element=>element.src);}

(async()=>{try{
  assert.ok(fs.existsSync(path.join(publicDir,'index.html')),'Build the Netlify package first.');
  const assets=path.join(publicDir,'assets'),chatFile=fs.readdirSync(assets).find(file=>/^ChatTab-.*\.js$/.test(file));
  assert.ok(chatFile&&fs.readFileSync(path.join(assets,chatFile),'utf8').includes('Aguarde antes de enviar'),'The built Chat must include the image preparation guard.');
  server=http.createServer((request,response)=>{
    const pathname=new URL(request.url,origin).pathname;
    const file=path.resolve(publicDir,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(publicDir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end('Local fixture: not found.');return;}
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
    response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3133,'localhost',resolve);});
  browser=await(await import('puppeteer')).default.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox','--disable-background-networking','--mute-audio']});
  const adultVersion=fs.readFileSync('src/lib/audience.ts','utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)?.[1];assert.ok(adultVersion);
  for(const mode of (mobileOnly?['mobile']:['desktop','mobile'])){
    const context=await browser.createBrowserContext();page=await context.newPage();page.setDefaultTimeout(90000);page.setDefaultNavigationTimeout(120000);let acceptDialogs=true;page.on('dialog',dialog=>acceptDialogs?dialog.accept():dialog.dismiss());
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewport(mode==='desktop'?{width:1280,height:900}:{width:390,height:844,isMobile:true,hasTouch:true});
    await page.evaluateOnNewDocument(version=>{
      sessionStorage.setItem('vigia_adult_access',version);localStorage.setItem('dc_is_guest','true');localStorage.setItem('vigia_ai_consent:guest','fixture-image-only');
      localStorage.setItem('vigia_feedback_v1:guest',JSON.stringify({sounds:false,vibration:false,animations:false}));
      const decode=window.createImageBitmap;window.imageTasks=[];
      window.createImageBitmap=(...args)=>new Promise((resolve,reject)=>window.imageTasks.push({args,resolve,reject}));
      window.finishImageTask=async(index,fail)=>{const task=window.imageTasks[index];if(fail){task.reject(Error('Falha de imagem simulada.'));return;}try{task.resolve(await decode.apply(window,task.args));}catch(error){task.reject(error);}};
      navigator.mediaDevices.getUserMedia=()=>Promise.reject(Error('Microfone bloqueado no teste de imagem.'));
    },adultVersion);
    await page.setRequestInterception(true);page.on('request',async request=>{
      const url=new URL(request.url());
      if(url.origin!==origin)return request.abort('blockedbyclient');
      if(!url.pathname.startsWith('/api/'))return request.continue();
      let payload={};try{payload=JSON.parse(request.postData()||'{}');}catch{}
      if(url.pathname==='/api/chat')requests.push(payload);
      const response=url.pathname==='/api/status'?status:url.pathname==='/api/chat'?{reply:'Resposta simulada: recebi a imagem fictícia.',avatarState:'explaining',provider:'fixture'}:{ok:true,simulated:true};
      return request.respond({status:200,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(response)});
    });
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[aria-label="Conversa & Voz"]');await page.click('[aria-label="Conversa & Voz"]');await page.waitForSelector('textarea');
    await check(mode+': decoding blocks Enter, button and programmatic submit without losing draft',async()=>{
      await draft('Pergunta sobre a imagem fictícia.');const task=await select('#ff0000','synthetic-red.png');
      await page.waitForSelector('form[aria-busy="true"]');assert.equal(await page.$eval('[title="Enviar mensagem"]',element=>element.disabled),true);
      const before=requests.length;await page.focus('textarea');await page.keyboard.press('Enter');await submit();await submit();await wait(100);
      assert.equal(requests.length,before);assert.equal(await page.$eval('textarea',element=>element.value),'Pergunta sobre a imagem fictícia.');
      await finish(task);await ready();const expected=await imageSource();
      await draft('');await submit();assert.equal(requests.length,before);assert.equal(await page.$eval('[title="Enviar mensagem"]',element=>element.disabled),true);
      await draft('Pergunta sobre a imagem fictícia.');await submit();
      await page.waitForFunction(()=>!document.querySelector('img[alt="Prévia"]')&&document.body.innerText.includes('Resposta simulada: recebi a imagem fictícia.'));
      assert.equal(requests.length,before+1);assert.equal(requests.at(-1).image?.mimeType,'image/jpeg');assert.equal(requests.at(-1).image?.data,expected.split(',')[1]);
      await wait(100);assert.equal(await page.$('img[alt="Prévia"]'),null);
    });
    await check(mode+': failed replacement preserves the previous image and draft',async()=>{
      await draft('Rascunho preservado.');const first=await select('#ff0000','kept-red.png');await finish(first);await ready();const previous=await imageSource();
      const failed=await select('#0000ff','invalid-replacement.png');await finish(failed,true);
      await page.waitForFunction(()=>document.querySelector('form[aria-busy="false"]')&&document.body.innerText.includes('Falha de imagem simulada.'));
      assert.equal(await imageSource(),previous);assert.equal(await page.$eval('textarea',element=>element.value),'Rascunho preservado.');
    });
    await check(mode+': a late older selection cannot overwrite the latest prepared image',async()=>{
      const older=await select('#0000ff','older-blue.png'),newer=await select('#00ff00','newer-green.png');
      await finish(newer);await ready();const latest=await imageSource();await finish(older);await wait(100);
      assert.equal(await imageSource(),latest);assert.equal(await page.$eval('form',element=>element.getAttribute('aria-busy')),'false');
    });
    await check(mode+': cancel history keeps image/text; confirmed switch discards late image only',async()=>{
      const previous=await imageSource(),text=await page.$eval('textarea',element=>element.value),delayed=await select('#0000ff','history-delayed-blue.png');
      await page.click('[title="Abrir histórico de conversas"]');
      const title='Pergunta sobre a imagem fictícia.'.slice(0,30);
      await page.waitForFunction(title=>[...document.querySelectorAll('button')].some(button=>button.textContent.startsWith(title)&&button.getClientRects().length),{},title);
      acceptDialogs=false;
      await page.evaluate(title=>[...document.querySelectorAll('button')].find(button=>button.textContent.startsWith(title)&&button.getClientRects().length).click(),title);
      await wait(50);assert.equal(await imageSource(),previous);assert.equal(await page.$eval('textarea',element=>element.value),text);assert.equal(await page.$eval('form',element=>element.getAttribute('aria-busy')),'true');
      acceptDialogs=true;
      await page.evaluate(title=>[...document.querySelectorAll('button')].find(button=>button.textContent.startsWith(title)&&button.getClientRects().length).click(),title);
      await page.waitForFunction(()=>!document.querySelector('img[alt="Prévia"]')&&document.querySelector('form[aria-busy="false"]'));
      await finish(delayed);await wait(100);assert.equal(await page.$('img[alt="Prévia"]'),null);assert.equal(await page.$eval('textarea',element=>element.value),text);
    });
    await check(mode+': removing an image cancels preparation and prevents preview revival',async()=>{
      const previous=await select('#ff0000','remove-kept-red.png');await finish(previous);await ready();
      const delayed=await select('#0000ff','remove-delayed-blue.png');await page.click('[title="Remover imagem"]');await finish(delayed);await wait(100);
      assert.equal(await page.$('img[alt="Prévia"]'),null);assert.equal(await page.$eval('form',element=>element.getAttribute('aria-busy')),'false');
      assert.equal(await page.$eval('textarea',element=>element.value),'Rascunho preservado.');
    });
    await check(mode+': new conversation invalidates an old preparation',async()=>{
      const delayed=await select('#ff0000','new-chat-delayed-red.png');await page.click('[title="Iniciar uma nova conversa"]');
      await page.waitForFunction(()=>document.querySelector('textarea')?.value===''&&document.querySelector('form[aria-busy="false"]'));
      await finish(delayed);await wait(100);assert.equal(await page.$('img[alt="Prévia"]'),null);
    });
    await check(mode+': leaving Chat invalidates preparation without erasing the text draft',async()=>{
      await draft('Texto entre abas.');const delayed=await select('#ff0000','unmount-delayed-red.png');await page.click('[aria-label="Início"]');
      await page.waitForSelector('textarea',{hidden:true});await finish(delayed);await page.click('[aria-label="Conversa & Voz"]');await page.waitForSelector('textarea');
      assert.equal(await page.$('img[alt="Prévia"]'),null);assert.equal(await page.$eval('textarea',element=>element.value),'Texto entre abas.');assert.deepEqual(errors,[]);
    });
    await context.close();page=undefined;
  }
  report.status='passed';
}catch(error){report.status='failed';report.error=timedOut?'Limite total de 110 segundos atingido; nenhuma repetição automática.':error.message;process.exitCode=1;if(page){await page.screenshot({path:'artifacts/image-preparation-failure.png',fullPage:true}).catch(()=>{});fs.writeFileSync('artifacts/image-preparation-failure.txt',await page.$eval('body',element=>element.innerText).catch(()=>''));}console.error(report.error);
}finally{
  clearTimeout(totalBudget);
  if(browser){let deadline;try{await Promise.race([browser.close(),new Promise(resolve=>deadline=setTimeout(resolve,10000))]);}finally{clearTimeout(deadline);if(browser.process()?.exitCode===null)browser.process().kill();}}
  server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/image-preparation'+(mobileOnly?'-mobile':'')+'-results.json',JSON.stringify(report,null,2));
}})();
