const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');

// Serve only the already built frontend. All API routes, sockets, speech and
// microphone input are simulated. This file never imports server code or .env.
const publicDir=path.resolve('dist/netlify/public');
const root='http://localhost:3135';
const prefix='artifacts/review-20261016-voice-browser';
fs.mkdirSync('artifacts',{recursive:true});
const report={url:root,scope:'Desktop e celular emulado. Frontend Netlify local, microfone fictício do Chrome, HTTP/WS/síntese simulados, toda solicitação externa bloqueada. Sem IA, Firebase ou dados reais.',results:[],requests:[],blockedExternal:[]};
let browser,page,stage,label;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise,ms=10000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Local browser operation exceeded '+ms+' ms')),ms);})]);}finally{clearTimeout(timer);}}
const status={demo:false,realAI:true,localDemo:false,audience:'18plus',ai:{mode:'adult-gemini',provider:'gemini',blocked:null,consentVersion:'review-isolated-no-ai',voice:true}};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((request,response)=>{
  const url=new URL(request.url,root);
  if(url.pathname.startsWith('/api/')){response.writeHead(503,{'Content-Type':'application/json'});response.end(JSON.stringify({error:'An API request escaped the browser simulation.'}));return;}
  let target=path.resolve(publicDir,'.'+decodeURIComponent(url.pathname));
  if(target!==publicDir&&!target.startsWith(publicDir+path.sep)){response.writeHead(403);response.end();return;}
  if(!fs.existsSync(target)||fs.statSync(target).isDirectory())target=path.join(publicDir,'index.html');
  response.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self' blob:;"});
  fs.createReadStream(target).pipe(response);
});

function passed(name){report.results.push({name:label+': '+name,status:'passed'});console.log('PASS '+label+': '+name);stage=undefined;}
async function clickButton(text){
  await page.waitForFunction(value=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent.trim()===value&&button.getClientRects().length&&!button.disabled),{timeout:10000},text);
  await page.evaluate(value=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===value&&button.getClientRects().length&&!button.disabled).click(),text);
}
async function emit(messages,index){
  await page.evaluate(({messages,index})=>messages.forEach(message=>(index===undefined?window.review.sockets.at(-1):window.review.sockets[index]).emit(message)),{messages,index});
}
async function active(){await page.waitForFunction(()=>window.review.tracks.filter(track=>track.readyState==='live').length===1&&window.review.tracks.filter(track=>track.readyState==='live')[0].enabled&&window.review.frames>0,{timeout:10000});}
async function paused(){await page.waitForFunction(()=>window.review.tracks.some(track=>track.readyState==='live')&&window.review.tracks.filter(track=>track.readyState==='live').every(track=>!track.enabled),{timeout:10000});}
async function clean(){
  await page.waitForFunction(()=>Object.values(window.VigiaTelemetry?.resources||{}).every(resource=>resource.activeNow===0)&&window.review.contexts.every(context=>context.state==='closed'),{timeout:10000});
  assert.ok(await page.evaluate(()=>window.review.tracks.every(track=>track.readyState==='ended')&&window.review.sockets.every(socket=>socket.readyState===3)),'Every microphone and voice socket must be closed.');
}
async function saved(input,reply){
  await page.waitForFunction(({input,reply})=>JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1')||'[]').some(session=>session.messages.filter(message=>message.content===input).length===1&&session.messages.filter(message=>message.content===reply).length===1),{timeout:10000},{input,reply});
}
async function cloudReply(input,reply,bytes=24000){
  await emit([{type:'processing'},{type:'input_transcription',text:input},{type:'output_transcription',text:reply},{type:'reply_ready'},{type:'audio_chunk',pcmBase64:Buffer.alloc(bytes).toString('base64')},{type:'turn_complete'}]);
}
async function endCall(){await page.click('[title="Encerrar"]');await clickButton('Sim, encerrar');await clean();}
async function startVoice(expected){
  await page.waitForSelector('[aria-label="Conversa por voz"]',{visible:true,timeout:30000});
  await page.click('[aria-label="Conversa por voz"]');
  await active();assert.equal(await page.evaluate(()=>window.review.sockets.length),expected);
}

(async()=>{
  try{
    console.log('Starting isolated voice browser test, PID '+process.pid);
    fs.writeFileSync(prefix+'.pid',String(process.pid));
    assert.ok(fs.existsSync(path.join(publicDir,'index.html')),'Build must finish before running this test.');
    report.bundleSha256=createHash('sha256').update(fs.readFileSync(path.join(publicDir,'index.html'))).digest('hex');
    report.startedAt=new Date().toISOString();
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3135,'127.0.0.1',resolve);});
    const puppeteer=(await import('puppeteer')).default;
    browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox','--disable-background-networking','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
    for(const mobile of [false,true]){
      label=mobile?'celular':'desktop';stage='opening';
      const context=await browser.createBrowserContext();page=await context.newPage();
      const errors=[],apiCalls=[];
      page.on('requestfailed',request=>{report.failedRequests??=[];report.failedRequests.push({label,url:request.url(),error:request.failure()?.errorText});});
      page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void dialog.accept());
      await page.setViewport(mobile?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1280,height:900});
      await page.setBypassServiceWorker(true);
      await page.setRequestInterception(true);
      page.on('request',request=>{
        const url=new URL(request.url());
        if(['data:','blob:'].includes(url.protocol)){void request.continue();return;}
        if(url.origin!==root){report.blockedExternal.push({label,url:url.origin+url.pathname,method:request.method()});void request.abort();return;}
        if(!url.pathname.startsWith('/api/')){void request.continue();return;}
        apiCalls.push(url.pathname);report.requests.push({label,path:url.pathname,method:request.method()});
        const respond=(body,code=200)=>request.respond({status:code,contentType:'application/json',body:JSON.stringify(body)});
        if(url.pathname==='/api/status'){void respond(status);return;}
        if(['/api/session','/api/adult-access'].includes(url.pathname)){void respond({ok:true});return;}
        if(url.pathname==='/api/ai-access'){void respond({allowed:true,voice:true,blocked:null});return;}
        if(url.pathname==='/api/live-ticket'){void respond({ticket:'review-isolated-ticket'});return;}
        if(url.pathname==='/api/chat'){void respond({reply:'Resposta de texto fictícia do teste local.',avatarState:'explaining',status:'ok'});return;}
        void respond({error:'Endpoint deliberately blocked in the isolated voice test.'},503);
      });
      await page.evaluateOnNewDocument(()=>{
        localStorage.setItem('vigia_mic_explained:guest','true');
        window.review={sockets:[],tracks:[],contexts:[],gains:[],sources:[],frames:0,speech:[],rejectMic:false,captureCalls:0};
        const NativeContext=window.AudioContext;
        window.AudioContext=class extends NativeContext{
          constructor(...args){super(...args);window.review.contexts.push(this);}
          createGain(...args){const gain=super.createGain(...args);window.review.gains.push(gain);return gain;}
          createBufferSource(...args){const source=super.createBufferSource(...args);window.review.sources.push(source);return source;}
        };
        const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=async(...args)=>{
          window.review.captureCalls++;
          if(window.review.rejectMic)throw new DOMException('Microphone denied in isolated test','NotAllowedError');
          const stream=await capture(...args);window.review.tracks.push(...stream.getTracks());return stream;
        };
        window.WebSocket=class{
          static OPEN=1;static CONNECTING=0;static CLOSED=3;readyState=1;bufferedAmount=0;sent=[];
          constructor(url){
            if(!String(url).includes('/api/live-ws'))throw Error('Unexpected real socket blocked by isolated test.');
            this.url=String(url);window.review.sockets.push(this);
            setTimeout(()=>{if(this.readyState!==1)return;this.onopen?.();this.emit({type:'open',mode:'streamed-speech'});},20);
          }
          emit(message){if(this.readyState===1)this.onmessage?.({data:JSON.stringify(message)});}
          send(data){const message=JSON.parse(data);this.sent.push(message);if(message.type==='realtime_audio')window.review.frames++;
            if(message.type==='interrupt')setTimeout(()=>{this.interruptAckCount=(this.interruptAckCount||0)+1;this.emit({type:'interrupted'});},0);
            if(message.type==='speech_output')setTimeout(()=>this.emit({type:'speech_output',mode:message.mode}),0);
          }
          close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.();}
        };
        Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;}}});
        Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
          cancel(){},getVoices(){return[{name:'Voz local fictícia',lang:'pt-BR',localService:true}];},addEventListener(){},removeEventListener(){},
          speak(utterance){window.review.speech.push({utterance,end:utterance.onend,error:utterance.onerror,text:utterance.text,paused:window.review.tracks.filter(track=>track.readyState==='live').every(track=>!track.enabled)});setTimeout(()=>utterance.onstart?.(),0);},
        }});
      });
      await page.goto(root,{waitUntil:'domcontentloaded'});
      console.log('Loaded local frontend for '+label);
      await page.waitForSelector('[aria-label="Acesso para adultos"]');await page.click('input[type="checkbox"]');await clickButton('Continuar');
      await page.waitForSelector('[aria-label="Boas-vindas à Vigia"]');await clickButton('Explorar como visitante');
      await page.click('[title="Conversa & Voz"]');await page.waitForSelector('textarea');
      await startVoice(1);passed('inicia uma sessão e um microfone fictício');

      stage='mute';await page.click('[title="Silenciar"]');
      await page.waitForFunction(()=>window.review.gains.length&&window.review.gains.every(gain=>gain.gain.value===0));
      await page.click('[title="Áudio Mutado"]');await page.waitForFunction(()=>window.review.gains.every(gain=>gain.gain.value===1));passed('silenciar e ativar som alteram o volume da reprodução');

      stage='pause';await page.click('[title="Pausar Conversa"]');await paused();
      const pausedFrames=await page.evaluate(()=>window.review.frames);await wait(180);assert.equal(await page.evaluate(()=>window.review.frames),pausedFrames);
      await page.click('[title="Ativar Conversa"]');await active();assert.equal(await page.evaluate(()=>window.review.sockets.length),1);passed('pausar bloqueia envio de áudio e retomar conserva a conexão');

      stage='manual pause playback';await cloudReply('Pergunta fictícia sobre mochila.','Guarde a lanterna na mochila.',48000);await paused();
      await page.click('[title="Pausar Conversa"]');await wait(1250);await paused();
      await page.click('[title="Ativar Conversa"]');await active();passed('pausa manual continua após o fim da fala');

      stage='automatic playback';const input='Onde ficam as pilhas fictícias?',reply='Guarde pilhas reservas junto da lanterna.';
      await cloudReply(input,reply);await paused();const echoFrames=await page.evaluate(()=>window.review.frames);await wait(150);
      assert.equal(await page.evaluate(()=>window.review.frames),echoFrames);await active();await saved(input,reply);passed('reprodução bloqueia eco, retoma no fim e salva texto uma vez');

      stage='interrupt';await cloudReply('Pergunta fictícia para interromper.','Resposta fictícia longa para interromper.',240000);
      await page.waitForSelector('[title="Interromper fala"]');await page.click('[title="Interromper fala"]');await active();
      await page.waitForFunction(()=>window.review.sockets[0].interruptAckCount===1);
      assert.ok(await page.evaluate(()=>window.review.sockets[0].sent.some(message=>message.type==='interrupt')));passed('interrupção cancela áudio e volta à escuta');

      stage='speech recovery';const unavailableInput='Pergunta fictícia com voz indisponível.',unavailableReply='Resposta verificada preservada quando a voz falha.';
      await emit([{type:'processing'},{type:'input_transcription',text:unavailableInput},{type:'output_transcription',text:unavailableReply},{type:'reply_ready'},{type:'speech_unavailable',message:'Falha de voz fictícia, texto preservado.',retryAfterMs:1200},{type:'turn_complete'}]);
      await paused();
      await page.waitForFunction(()=>document.querySelector('[title="Ativar Conversa"]')?.disabled,{timeout:1000});
      assert.equal(await page.$eval('[title="Ativar Conversa"]',button=>button.disabled),true);
      await saved(unavailableInput,unavailableReply);
      await clickButton('Tentar voz novamente');await active();assert.equal(await page.evaluate(()=>window.review.sockets.length),1);passed('falha da síntese conserva histórico e respeita retomada explícita');

      stage='device speech';const deviceInput='Pergunta fictícia para leitura local.',deviceReply='Confira a lanterna antes de guardar.';
      await emit([{type:'processing'},{type:'input_transcription',text:deviceInput},{type:'output_transcription',text:deviceReply},{type:'reply_ready'},{type:'speech_unavailable',message:'Leitura fictícia disponível no aparelho.'},{type:'turn_complete'}]);
      await clickButton('Usar voz do aparelho');await page.waitForFunction(()=>window.review.speech.length===1);await paused();
      assert.ok(await page.evaluate(()=>window.review.speech[0].paused));assert.equal(await page.evaluate(()=>window.review.speech[0].text),deviceReply);
      await page.evaluate(()=>window.review.speech[0].end());await active();await saved(deviceInput,deviceReply);passed('voz do aparelho lê só o texto verificado e retoma uma vez');

      stage='device error';await emit([{type:'processing'},{type:'input_transcription',text:'Pergunta fictícia para erro local.'},{type:'output_transcription',text:'Resposta fictícia preservada no erro local.'},{type:'reply_ready'},{type:'speech_on_device',text:'Resposta fictícia preservada no erro local.'},{type:'turn_complete'}]);
      await page.waitForFunction(()=>window.review.speech.length===2);await page.evaluate(()=>window.review.speech[1].error({error:'synthesis-failed'}));await paused();
      await page.waitForFunction(()=>document.body.innerText.includes('não conseguiu ler'));passed('erro de leitura mantém microfone pausado e texto disponível');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
      await bounded(page.screenshot({path:prefix+'-'+label+'.png',fullPage:true}));if(mobile)await bounded(page.screenshot({path:prefix+'.png',fullPage:true}));
      stage='end call';await endCall();passed('encerrar fecha microfone, conexões e contextos de áudio');

      stage='remote close';await startVoice(2);await page.evaluate(()=>window.review.sockets.at(-1).close());await clean();
      await page.click('[title="Ativar Conversa"]');await active();assert.equal(await page.evaluate(()=>window.review.sockets.length),3);passed('fechamento remoto permite reconectar com novos recursos');
      stage='transport error';await emit([{type:'error',message:'Falha de conexão fictícia.'}]);await clean();
      await page.waitForFunction(()=>document.body.innerText.includes('Falha de conexão fictícia.'));passed('erro de transporte mostra feedback e limpa recursos');

      stage='microphone rejection';await page.evaluate(()=>window.review.rejectMic=true);await page.click('[title="Ativar Conversa"]');
      await page.waitForFunction(()=>window.review.sockets.length===4&&window.review.sockets[3].readyState===3);await clean();
      await page.waitForFunction(()=>document.body.innerText.toLowerCase().includes('microfone'));passed('permissão recusada encerra os recursos sem iniciar captura');
      await page.evaluate(()=>window.review.rejectMic=false);await page.click('[title="Ativar Conversa"]');await active();
      assert.equal(await page.evaluate(()=>window.review.sockets.length),5);await endCall();passed('nova tentativa após recusa funciona e encerra sem vazamentos');

      stage='MediaRecorder unavailable';await page.evaluate(()=>{Object.defineProperty(window,'MediaRecorder',{configurable:true,value:undefined});});
      await page.click('[title="Falar pelo microfone"]');await page.waitForFunction(()=>document.body.innerText.includes('Gravação de áudio não suportada.'));
      await clean();assert.equal(apiCalls.filter(value=>value==='/api/transcribe').length,0);passed('ditado sem MediaRecorder mostra erro e libera o microfone');
      assert.deepEqual(errors,[],'The browser must not report uncaught errors.');
      assert.equal(apiCalls.filter(value=>value==='/api/tts').length,0,'No server TTS is requested by these voice UI fixtures.');
      report.results.push({name:label+': nenhuma chamada de IA ou gravação remota',status:'passed',apiCalls});
      report.resources??=[];report.resources.push({label,...await page.evaluate(()=>({telemetry:window.VigiaTelemetry.resources,tracks:window.review.tracks.length,sockets:window.review.sockets.length,contexts:window.review.contexts.length,frames:window.review.frames}))});
      await context.close();page=null;
    }
    console.log('PASS '+report.results.length+' isolated voice browser checks');
  }catch(error){
    report.results.push({name:(label||'setup')+': '+(stage||'voice browser'),status:'failed',error:error.message});report.errorStack=error.stack;console.error(error.stack);process.exitCode=1;
    if(page){report.failureText=await bounded(page.evaluate(()=>document.body.innerText),5000).catch(()=>null);await bounded(page.screenshot({path:prefix+'-failure.png',fullPage:true})).catch(()=>{});}
  }finally{
    fs.mkdirSync('artifacts',{recursive:true});report.finishedAt=new Date().toISOString();
    fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2));
    fs.writeFileSync(prefix+'.txt',report.results.map(result=>result.status.toUpperCase()+' '+result.name+(result.error?' — '+result.error:'')).join('\n')+'\n'+(report.errorStack||'')+'\n'+(report.failureText||''));
    if(browser)await bounded(browser.close(),6000).catch(()=>browser.process()?.kill());
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})();
