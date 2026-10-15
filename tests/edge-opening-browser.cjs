const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');

// Actual public build and browser, with an intentionally unavailable API.
// This proves frontend/backend independence locally, not Cloudflare latency or
// a physical Android device. No account, microphone, AI or production mutation.
const root='http://localhost:3126';
const publicDir=path.resolve('dist/edge/public');
const report={scope:'CDN architecture simulation: real static build, unavailable backend; desktop and mobile emulation. No real services.',startedAt:new Date().toISOString(),checks:[],profiles:[]};
let browser,server,page;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary'};
const check=async(name,fn)=>{await fn();report.checks.push({name,status:'passed'});console.log('PASS '+name);};

(async()=>{
 try{
  const {createVigiaEdge}=await import('../edge/pages-worker.mjs');
  let upstreamCalls=0,mode='offline',release;
  const worker=createVigiaEdge(async()=>{upstreamCalls++;if(mode==='hold')await new Promise(resolve=>release=resolve);throw Error('Backend deliberately unavailable.');});
  const assets={fetch:async request=>{
   const url=new URL(request.url);let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
   if(!relative||!path.extname(relative))relative='index.html';
   const file=path.resolve(publicDir,relative),safe=path.relative(publicDir,file);
   if(safe.startsWith('..')||path.isAbsolute(safe)||path.basename(file).startsWith('_')||!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('Missing',{status:404});
   return new Response(fs.readFileSync(file),{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}});
  }};
  server=http.createServer(async(req,res)=>{
   try{
    const response=await worker.fetch(new Request(root+req.url,{method:req.method,headers:req.headers}),{ASSETS:assets});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(500);res.end('Fixture failed');}
  });
  await new Promise((resolve,reject)=>server.once('error',reject).listen(3126,'127.0.0.1',resolve));
  const puppeteer=(await import('puppeteer')).default;
  browser=await puppeteer.launch({executablePath:process.env.VIGIA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox','--disable-background-networking','--deny-permission-prompts','--mute-audio']});
  const adultVersion=fs.readFileSync('src/lib/audience.ts','utf8').match(/adultAccessVersion\s*=\s*['"]([^'"]+)['"]/)[1];
  for(const mobile of [false,true]){
   const name=mobile?'mobile':'desktop',context=await browser.createBrowserContext();page=await context.newPage();page.setDefaultTimeout(30000);
   await page.setViewport(mobile?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1280,height:900});
   const state={profile:name,errors:[],blockedExternal:[],homeMs:null};report.profiles.push(state);
   page.on('pageerror',error=>state.errors.push(error.message));
   await page.evaluateOnNewDocument(version=>{sessionStorage.setItem('vigia_adult_access',version);localStorage.setItem('dc_is_guest','true');window.confirm=()=>false;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>Promise.reject(Error('Capture forbidden in loading test.'));},adultVersion);
   await page.setRequestInterception(true);page.on('request',request=>{
    if(new URL(request.url()).origin!==root){state.blockedExternal.push(new URL(request.url()).hostname);void request.abort();}else void request.continue();
   });
   mode='hold';const before=upstreamCalls,start=performance.now();await page.goto(root,{waitUntil:'domcontentloaded'});
   await check(name+': Home opens before the deliberately held background status returns',async()=>{await page.waitForSelector('[aria-label="Progresso da aventura"]',{visible:true});state.homeMs=Math.round(performance.now()-start);assert.ok(upstreamCalls<=before+1);});
   await check(name+': public learning opens independently of the pending backend',async()=>{await page.click('[aria-label="Aprender com a Vigia"]');await page.waitForSelector('[aria-label="Iniciar missão: Reconheça os perigos"]',{visible:true});assert.equal(upstreamCalls,before+1);});
   mode='hold';await page.click('[aria-label="Conversa & Voz"]');
   await check(name+': Chat interface opens while API is still pending',async()=>{await page.waitForSelector('textarea',{visible:true});await page.waitForSelector('[aria-label="Verificando conexão"]',{visible:true});assert.equal(upstreamCalls,before+1);await page.type('textarea','Rascunho fictício preservado entre abas.');});
   await check(name+': navigating away from pending API remains responsive',async()=>{await page.click('[aria-label="Início"]');await page.waitForSelector('[aria-label="Progresso da aventura"]',{visible:true});});
   mode='offline';release?.();release=undefined;
   await check(name+': unavailable API is explicit and draft survives tab switch',async()=>{await page.click('[aria-label="Conversa & Voz"]');await page.waitForSelector('[aria-label="Verificar conexão"]',{visible:true});assert.equal(await page.$eval('textarea',input=>input.value),'Rascunho fictício preservado entre abas.');assert.deepEqual(state.errors,[]);});
   await page.screenshot({path:`artifacts/professional-edge-opening-${name}.png`,fullPage:true});await context.close();page=null;
  }
  report.status='passed';
 }catch(error){report.status='failed';report.error=error.message;process.exitCode=1;console.error(error);if(page&&!page.isClosed())await page.screenshot({path:'artifacts/professional-edge-opening-failure.png',fullPage:true}).catch(()=>{});}
 finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();fs.writeFileSync('artifacts/professional-edge-opening.json',JSON.stringify(report,null,2));}
})();
