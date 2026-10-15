const fs=require('node:fs'),assert=require('node:assert/strict');
const {resolvePublicTestOrigin}=require('./browser-target.cjs');
const root=resolvePublicTestOrigin(process.env.VIGIA_TEST_URL),label=process.env.VIGIA_LATENCY_LABEL||'after-online';
if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(label))throw Error('Rótulo inválido.');
const output='artifacts/initial-load-'+label+'.json';
if(fs.existsSync(output))throw Error('Já existe evidência com este rótulo; não será sobrescrita.');
(async()=>{let browser;const started=Date.now();try{
  const puppeteer=(await import('puppeteer')).default;
  browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,timeout:30000,args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage();page.setDefaultTimeout(30000);
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  const blocked=[];await page.setRequestInterception(true);page.on('request',request=>{
    if(!['GET','HEAD'].includes(request.method())){blocked.push({method:request.method(),path:new URL(request.url()).pathname});return request.abort('blockedbyclient');}
    return request.continue();
  });
  await page.evaluateOnNewDocument(()=>{
    window.__vigiaLongTasks=[];
    try{new PerformanceObserver(list=>{for(const task of list.getEntries())window.__vigiaLongTasks.push({startTime:task.startTime,duration:task.duration,name:task.name});}).observe({type:'longtask',buffered:true});}catch{}
    const observer=new MutationObserver(()=>{const gate=document.querySelector('[aria-label="Acesso para adultos"]');if(gate?.getClientRects().length){performance.mark('vigia-age-gate-visible');observer.disconnect();}});
    observer.observe(document,{childList:true,subtree:true,attributes:true});
  });
  await page.goto(root,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('[aria-label="Acesso para adultos"]',{visible:true});
  const visibleAtMs=await page.evaluate(()=>performance.getEntriesByName('vigia-age-gate-visible')[0]?.startTime??performance.now());
  await new Promise(resolve=>setTimeout(resolve,350));
  const r=await page.evaluate(()=>{
    const navigation=performance.getEntriesByType('navigation')[0],fcp=performance.getEntriesByName('first-contentful-paint')[0];
    const resources=performance.getEntriesByType('resource').map(entry=>({file:new URL(entry.name).origin+new URL(entry.name).pathname,initiatorType:entry.initiatorType,startTime:entry.startTime,duration:entry.duration,fetchStart:entry.fetchStart,requestStart:entry.requestStart,responseStart:entry.responseStart,responseEnd:entry.responseEnd,decodedBytes:entry.decodedBodySize,encodedBytes:entry.encodedBodySize,transferBytes:entry.transferSize}));
    return {ttfbMs:navigation?navigation.responseStart-navigation.requestStart:null,navigationMs:navigation?.duration??null,firstPaintMs:fcp?.startTime??null,navigationTiming:navigation?Object.fromEntries(['startTime','fetchStart','domainLookupStart','domainLookupEnd','connectStart','secureConnectionStart','connectEnd','requestStart','responseStart','responseEnd','domInteractive','domContentLoadedEventStart','domContentLoadedEventEnd','loadEventStart','loadEventEnd','duration'].map(key=>[key,navigation[key]])):null,resources,longTasks:window.__vigiaLongTasks||[],documentVisibility:document.visibilityState,documentHasFocus:document.hasFocus(),js:resources.filter(entry=>new URL(entry.file).pathname.endsWith('.js')).map(entry=>({...entry,file:new URL(entry.file).pathname})),entryAssets:[...document.querySelectorAll('script[type="module"][src]')].map(element=>new URL(element.src).pathname)};
  });
  Object.assign(r,{url:root,label,sampleCount:1,viewport:{width:390,height:844,isMobile:true,hasTouch:true},throttling:false,observationWindowMs:350,visibleAgeGateMs:visibleAtMs,elapsedWallMs:Date.now()-started,blockedRequests:blocked,scope:'Chrome novo, tela de celular emulada, primeira tela18+ real da hospedagem, sem throttling. Uma amostra, sem IA/microfone/login; não representa aparelho físico nem comprova Render frio. Nenhum aquecimento prévio ou networkidle usado.'});
  r.totalJsBytes=r.js.reduce((n,j)=>n+j.decodedBytes,0);r.totalJsTransferBytes=r.js.reduce((n,j)=>n+j.transferBytes,0);
  assert.ok(r.totalJsBytes>0);assert.equal(blocked.length,0,'Não deveria haver escrita na primeira tela.');
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync(output,JSON.stringify(r,null,2));console.log(JSON.stringify(r));
}catch(error){console.error(error.message);process.exitCode=1;}finally{
  if(browser){let timer;try{await Promise.race([browser.close(),new Promise(resolve=>timer=setTimeout(resolve,5000))]);}finally{clearTimeout(timer);if(browser.process()?.exitCode===null)browser.process().kill();}}
}})();
