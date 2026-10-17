import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {EventEmitter} from 'node:events';
import {GeminiAi} from '../server/geminiAi';import {connectRealVoice} from '../server/realVoice';import {AiUnavailable} from '../server/realAi';
const key='FAKE_CONTRACT_KEY',env={AI_PROVIDER:'gemini',AI_AUDIENCE:'18plus',VIGIA_MODE:'local-real',ENABLE_REAL_AI:'true',GEMINI_API_KEY:key,GEMINI_FREE_KEY_SHA256:createHash('sha256').update(key).digest('hex')};
const packet=(e:any)=>'data: '+JSON.stringify(e)+'\r\n\r\n',audio=(data=Buffer.alloc(200).toString('base64'))=>({event_type:'step.delta',delta:{type:'audio',data,mime_type:'audio/l16',sample_rate:24000}}),done={event_type:'interaction.completed'};
function sse(events:any[]){const b=new TextEncoder().encode(events.map(packet).join(''));return new Response(new ReadableStream({start(c){for(let i=0;i<b.length;i+=7)c.enqueue(b.slice(i,i+7));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});}
async function collect(ai:GeminiAi,signal?:AbortSignal){const chunks:Buffer[]=[];for await(const p of ai.speechStream('Guarde a lanterna na mochila.',signal))chunks.push(p);return chunks;}
test('TTS por partes usa modelo gratuito, texto literal verificado, Aoede e store false',async()=>{let sent:any,headers:any;const ai=new GeminiAi(env,async(_u,o)=>{sent=JSON.parse(o!.body as string);headers=o!.headers;return sse([audio(),audio(),done]);});assert.equal((await collect(ai)).length,2);assert.equal(sent.store,false);assert.equal(sent.stream,true);assert.equal(sent.model,'gemini-3.8-flash-lite-tts');assert.equal(sent.input[0].content[0].text,'Guarde a lanterna na mochila.');assert.equal(sent.generation_config.speech_config[0].voice,'Aoede');assert.equal(headers['x-goog-api-key'],key);});
test('streaming rejeita projeto não verificado, taxa inválida, WAV, bytes ímpares e conclusão ausente',async()=>{let calls=0;const blocked=new GeminiAi({...env,GEMINI_FREE_KEY_SHA256:''},async()=>{calls++;return sse([]);});await assert.rejects(collect(blocked));assert.equal(calls,0);for(const events of [[audio('AQ=='),done],[{...audio(),delta:{...audio().delta,sample_rate:16000}},done],[audio(Buffer.from('RIFFAA').toString('base64')),done],[audio()],[{event_type:'interaction.failed'}]]){await assert.rejects(collect(new GeminiAi(env,async()=>sse(events))));}});
test('cota percorre somente dois TTS gratuitos; cancelamento não repete nem ativa serviço pago',async()=>{let calls=0;await assert.rejects(collect(new GeminiAi(env,async()=>{calls++;return new Response('{}',{status:429});})));assert.equal(calls,2);const c=new AbortController();const ai=new GeminiAi(env,async(_u,o)=>{assert.ok(o?.signal);c.abort();throw Error('abort');});await assert.rejects(collect(ai,c.signal));});
test('cota do Lite usa TTS Flash literal com Aoede; cooldown é individual e não abre Live',async()=>{
 const requests:any[]=[];let reads=0;
 const ai=new GeminiAi(env,async(_url,options)=>{const request=JSON.parse(options!.body as string);requests.push(request);return request.model==='gemini-3.8-flash-lite-tts'?new Response('{}',{status:429,headers:{'Retry-After':'60'}}):sse([audio(),done]);},async()=>{reads++;throw Error('Live must not open');});
 assert.equal((await collect(ai)).length,1);assert.equal((await collect(ai)).length,1);
 assert.deepEqual(requests.map(r=>r.model),['gemini-3.8-flash-lite-tts','gemini-3.8-flash-tts','gemini-3.8-flash-tts']);assert.equal(reads,0);
 for(const request of requests){assert.equal(request.store,false);assert.equal(request.stream,true);assert.equal(request.input[0].content[0].text,'Guarde a lanterna na mochila.');assert.equal(request.generation_config.speech_config[0].voice,'Aoede');assert.deepEqual(request.response_format,{type:'audio',mime_type:'audio/l16',sample_rate:24000});}
});
test('dois TTS em cota só então usam Live, com o mesmo sinal e texto e sem renovar prazo',async()=>{
 const models:string[]=[],signals:AbortSignal[]=[];const controller=new AbortController();let reads=0;
 const ai=new GeminiAi(env,async(_url,options)=>{models.push(JSON.parse(options!.body as string).model);signals.push(options!.signal as AbortSignal);return new Response('{}',{status:429});},async(text,signal,config)=>{reads++;assert.deepEqual(models,['gemini-3.8-flash-lite-tts','gemini-3.8-flash-tts']);assert.equal(signal,signals[0]);assert.equal(signals[0],signals[1]);assert.equal(text,'Guarde a lanterna na mochila.');assert.equal(config?.GEMINI_API_KEY,key);return{pcm:Buffer.alloc(200),sampleRate:24000};});
 assert.equal((await collect(ai,controller.signal)).length,1);assert.equal(reads,1);
 controller.abort();assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,true);
});
test('segurança, erro HTTP, desconexão e falha incompleta não selecionam outro TTS nem Live',async()=>{
 const failures=[async()=>new Response('{}',{status:403}),async()=>new Response('{}',{status:500}),async()=>{throw Error('network');},async()=>sse([{event_type:'interaction.failed',error:{code:422,status:'SAFETY'}}]),async()=>sse([audio()])];
 for(const failure of failures){let calls=0,reads=0;const ai=new GeminiAi(env,async()=>{calls++;return failure();},async()=>{reads++;throw Error('Live must not open');});await assert.rejects(collect(ai));assert.equal(calls,1);assert.equal(reads,0);}
 let calls=0,reads=0;const secondFails=new GeminiAi(env,async()=>++calls===1?new Response('{}',{status:429}):new Response('{}',{status:503}),async()=>{reads++;throw Error('Live must not open');});await assert.rejects(collect(secondFails));assert.equal(calls,2);assert.equal(reads,0);
});
class Socket extends EventEmitter{OPEN=1;readyState=1;sent:any[]=[];send(s:string){this.sent.push(JSON.parse(s));}close(){this.readyState=3;this.emit('close');}message(p:any){this.emit('message',Buffer.from(JSON.stringify(p)));}}
const wait=()=>new Promise(r=>setTimeout(r,20));
function fixture(change:any={},options:any={}){const socket=new Socket(),calls:string[]=[];const ai={provider:'gemini',models:{generateContent:async()=>{calls.push('checked-text');return{text:'Guarde a lanterna na mochila.'};}},transcribe:async()=>({text:'Onde guardo a lanterna?',status:'ok',provider:'gemini'}),speech:async()=>{throw Error('No unary fallback');},speechStream:async function*(){calls.push('speech-stream');yield Buffer.alloc(200);},...change};connectRealVoice(socket as any,ai,'Instrução educativa.',{streamSpeech:true,...options});return {socket,calls};}
test('voz envia áudio por partes apenas depois da resposta textual completa verificada',async()=>{const f=fixture();f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();assert.deepEqual(f.calls,['checked-text','speech-stream']);assert.deepEqual(f.socket.sent.filter(p=>p.type!=='voice_timing').map(p=>p.type),['open','processing','input_transcription','output_transcription','reply_ready','audio_chunk','turn_complete']);f.socket.close();});
test('moderação, resposta inválida e emergência impedem síntese e resposta pronta',async()=>{for(const text of ['{JSON incompleto','']){const f=fixture({models:{generateContent:async()=>({text})}});f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();assert.equal(f.socket.sent.some(p=>p.type==='audio_chunk'||p.type==='reply_ready'),false);assert.equal(f.calls.includes('speech-stream'),false);}const e=fixture();e.socket.message({type:'realtime_text',text:'tem fogo na minha casa'});assert.ok(e.socket.sent.some(p=>p.type==='emergency'));assert.equal(e.calls.length,0);});
test('interromper aborta áudio pendente, conserva texto verificado e ignora fragmentos tardios',async()=>{let finish!:()=>void,signal:AbortSignal|undefined;const f=fixture({speechStream:async function*(_text:string,s:AbortSignal){signal=s;yield Buffer.alloc(200);await new Promise<void>(r=>finish=r);yield Buffer.alloc(200);}});f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();f.socket.message({type:'interrupt'});assert.equal(signal?.aborted,true);const n=f.socket.sent.filter(p=>p.type==='audio_chunk').length;finish();await wait();assert.equal(f.socket.sent.filter(p=>p.type==='audio_chunk').length,n);assert.ok(f.socket.sent.some(p=>p.type==='reply_ready'));assert.equal(f.socket.sent.some(p=>p.type==='turn_complete'),false);f.socket.close();});
test('fala sustentada interrompe a síntese e conserva o início da nova gravação',async()=>{let finish!:()=>void;const f=fixture({speechStream:async function*(){yield Buffer.alloc(200);await new Promise<void>(r=>finish=r);}});f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();const pcm=Buffer.alloc(2048);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(4000,i);for(let i=0;i<5;i++)f.socket.message({type:'realtime_audio',pcmBase64:pcm.toString('base64')});assert.ok(f.socket.sent.some(p=>p.type==='interrupted'));finish();f.socket.close();});
test('nova fala interrompe também áudio ainda em reprodução depois da síntese terminar',async()=>{const f=fixture();f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();assert.ok(f.socket.sent.some(p=>p.type==='turn_complete'));const pcm=Buffer.alloc(2048);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(4000,i);for(let i=0;i<5;i++)f.socket.message({type:'realtime_audio',pcmBase64:pcm.toString('base64')});assert.equal(f.socket.sent.filter(p=>p.type==='interrupted').length,1);f.socket.close();});

test('429 respeita Retry-After e pausa somente TTS sem repetir chamadas nem expor metadados',async()=>{
 let calls=0;const ai=new GeminiAi(env,async url=>{calls++;return String(url).endsWith('/interactions')?new Response(JSON.stringify({error:{details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'7s'}],message:'PRIVATE_PROJECT_INFO'}}),{status:429,headers:{'Retry-After':'2'}}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Confira as pilhas.'}]}}]});});
 await assert.rejects(collect(ai),(e:AiUnavailable)=>e.code==='quota_unavailable'&&e.retryAfterMs===2000&&!e.message.includes('PRIVATE'));
 await assert.rejects(collect(ai),(e:AiUnavailable)=>e.code==='quota_unavailable'&&e.retryAfterMs!>0);assert.equal(calls,2);
 assert.equal((await ai.models.generateContent({contents:'Pilhas'})).text,'Confira as pilhas.');assert.equal(calls,3);
});
test('RetryInfo e falha429 dentro do fluxo mantêm cooldown sem repetição automática',async()=>{
 const ai=new GeminiAi(env,async()=>sse([{event_type:'interaction.failed',error:{status:'RESOURCE_EXHAUSTED',details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'3s'}]}}]));
 await assert.rejects(collect(ai),(e:AiUnavailable)=>e.code==='quota_unavailable'&&e.retryAfterMs===3000);
});
test('falha apenas da voz conserva resposta e contexto; microfone aguarda retomada explícita',async()=>{
 let seen:any,turns=0,speeches=0;
 const f=fixture({models:{generateContent:async(r:any)=>{seen=r;turns++;return{text:turns===1?'Guarde a lanterna na mochila.':'Confira também as pilhas.'};}},speechStream:async function*(){if(++speeches===1)throw new AiUnavailable('quota_unavailable','Voz indisponível',503,2000);yield Buffer.alloc(200);}});
 f.socket.message({type:'realtime_text',text:'Onde guardo a lanterna?'});await wait();
 const warning=f.socket.sent.find(p=>p.type==='speech_unavailable');assert.equal(warning.code,'quota_unavailable');assert.equal(warning.retryAfterMs,2000);assert.equal(f.socket.readyState,1);assert.ok(f.socket.sent.some(p=>p.type==='reply_ready'));assert.ok(f.socket.sent.some(p=>p.type==='turn_complete'));
 const pcm=Buffer.alloc(6000);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(4000,i);for(let i=0;i<2;i++)f.socket.message({type:'realtime_audio',pcmBase64:pcm.toString('base64')});f.socket.message({type:'audio_stream_end'});await wait();assert.equal(turns,1);
 f.socket.message({type:'resume_input'});f.socket.message({type:'realtime_text',text:'E as pilhas dela?'});await wait();assert.equal(turns,2);assert.match(seen.contents,/Onde guardo a lanterna/);assert.match(seen.contents,/Guarde a lanterna na mochila/);assert.ok(f.socket.sent.some(p=>p.type==='audio_chunk'));f.socket.close();
});
test('prazo total interrompe geração lenta sem inventar texto; síntese lenta preserva texto já verificado',async()=>{
 const blocked=(_request:any,signal:AbortSignal)=>new Promise<any>((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 const f=fixture({models:{generateContent:blocked}},{turnTimeoutMs:5});f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();assert.equal(f.socket.sent.find(p=>p.type==='error')?.code,'timeout');assert.equal(f.socket.sent.some(p=>p.type==='reply_ready'),false);assert.equal(f.socket.readyState,3);
 const s=fixture({speechStream:async function*(_text:string,signal:AbortSignal){await blocked(null,signal);yield Buffer.alloc(200);}},{turnTimeoutMs:5});s.socket.message({type:'realtime_text',text:'Lanterna'});await wait();assert.equal(s.socket.sent.find(p=>p.type==='speech_unavailable')?.code,'timeout');assert.ok(s.socket.sent.some(p=>p.type==='reply_ready'));assert.equal(s.socket.readyState,1);s.socket.close();
});

const settleVoice=()=>new Promise<void>(resolve=>setImmediate(resolve));
const pendingVoice=(signal:AbortSignal)=>new Promise<never>((_resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});

test('primeiro PCM dentro de20s permite fala ativa terminar além do antigo prazo',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
 let signal:AbortSignal|undefined,speeches=0;
 const f=fixture({models:{generateContent:async()=>{await new Promise(resolve=>setTimeout(resolve,18000));return{text:'Guarde a lanterna na mochila.'};}},speechStream:async function*(_text:string,s:AbortSignal){signal=s;speeches++;await new Promise(resolve=>setTimeout(resolve,800));yield Buffer.alloc(200);await new Promise(resolve=>setTimeout(resolve,1400));yield Buffer.alloc(200);await new Promise(resolve=>setTimeout(resolve,1400));yield Buffer.alloc(200);}});
 try{
  f.socket.message({type:'realtime_text',text:'Onde guardo a lanterna?'});await settleVoice();
  t.mock.timers.tick(18000);await settleVoice();assert.ok(f.socket.sent.some(p=>p.type==='reply_ready'));
  t.mock.timers.tick(800);await settleVoice();assert.equal(f.socket.sent.filter(p=>p.type==='audio_chunk').length,1);
  t.mock.timers.tick(1400);await settleVoice();assert.equal(signal?.aborted,false);assert.equal(f.socket.sent.filter(p=>p.type==='audio_chunk').length,2);
  t.mock.timers.tick(1400);await settleVoice();assert.equal(f.socket.sent.filter(p=>p.type==='audio_chunk').length,3);assert.equal(f.socket.sent.at(-1).type,'turn_complete');
  assert.equal(f.socket.sent.some(p=>p.type==='speech_unavailable'||p.type==='error'),false);assert.equal(speeches,1);
 }finally{f.socket.close();}
});

test('stream parado após primeiro PCM expira por inatividade sem repetir a fala',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
 let signal:AbortSignal|undefined,speeches=0;
 const f=fixture({speechStream:async function*(_text:string,s:AbortSignal){signal=s;speeches++;yield Buffer.alloc(200);await pendingVoice(s);}});
 try{
  f.socket.message({type:'realtime_text',text:'Lanterna'});await settleVoice();
  t.mock.timers.tick(14999);await settleVoice();assert.equal(signal?.aborted,false);
  t.mock.timers.tick(1);await settleVoice();assert.equal(signal?.aborted,true);assert.equal(f.socket.sent.find(p=>p.type==='speech_unavailable')?.code,'timeout');
  assert.equal(f.socket.sent.filter(p=>p.type==='audio_chunk').length,1);assert.equal(f.socket.sent.filter(p=>p.type==='reply_ready').length,1);assert.equal(f.socket.sent.at(-1).type,'turn_complete');assert.equal(f.socket.readyState,1);assert.equal(speeches,1);
 }finally{f.socket.close();}
});

test('PCM contínuo não renova o teto absoluto de45s contado desde processing',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
 let signal:AbortSignal|undefined,speeches=0;
 const f=fixture({speechStream:async function*(_text:string,s:AbortSignal){signal=s;speeches++;for(;;){yield Buffer.alloc(200);await new Promise(resolve=>setTimeout(resolve,1000));if(s.aborted)throw s.reason;}}});
 try{
  f.socket.message({type:'realtime_text',text:'Lanterna'});await settleVoice();
  for(let second=0;second<44;second++){t.mock.timers.tick(1000);await settleVoice();}
  assert.equal(signal?.aborted,false);assert.equal(f.socket.sent.some(p=>p.type==='speech_unavailable'),false);
  t.mock.timers.tick(1000);await settleVoice();assert.equal(signal?.aborted,true);assert.equal(f.socket.sent.find(p=>p.type==='speech_unavailable')?.code,'timeout');assert.equal(speeches,1);
  const count=f.socket.sent.filter(p=>p.type==='audio_chunk').length;t.mock.timers.tick(60000);await settleVoice();assert.equal(f.socket.sent.filter(p=>p.type==='audio_chunk').length,count);
 }finally{f.socket.close();}
});

test('interrupção e fechamento cancelam stream e todos os seus prazos sem eventos tardios',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
 for(const action of ['interrupt','close']){
  let signal:AbortSignal|undefined;
  const f=fixture({speechStream:async function*(_text:string,s:AbortSignal){signal=s;yield Buffer.alloc(200);await pendingVoice(s);}});
  f.socket.message({type:'realtime_text',text:'Lanterna'});await settleVoice();
  if(action==='interrupt')f.socket.message({type:'interrupt'});else f.socket.close();
  await settleVoice();assert.equal(signal?.aborted,true);const count=f.socket.sent.length;
  t.mock.timers.tick(60000);await settleVoice();assert.equal(f.socket.sent.length,count);assert.equal(f.socket.sent.some(p=>p.type==='speech_unavailable'),false);f.socket.close();
 }
});

test('budgets curtos de primeiro áudio, inatividade e total são injetáveis sem ampliar STT',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
 const stalled=fixture({speechStream:async function*(_text:string,s:AbortSignal){yield Buffer.alloc(200);await pendingVoice(s);}},{turnTimeoutMs:5,speechIdleTimeoutMs:8,streamTimeoutMs:30});
 try{
  stalled.socket.message({type:'realtime_text',text:'Lanterna'});await settleVoice();
  t.mock.timers.tick(5);await settleVoice();assert.equal(stalled.socket.sent.some(p=>p.type==='speech_unavailable'),false);
  t.mock.timers.tick(3);await settleVoice();assert.equal(stalled.socket.sent.find(p=>p.type==='speech_unavailable')?.code,'timeout');
 }finally{stalled.socket.close();}
 const noFirstAudio=fixture({speechStream:async function*(_text:string,s:AbortSignal){await pendingVoice(s);}},{turnTimeoutMs:5,speechIdleTimeoutMs:8,streamTimeoutMs:30});
 try{
  noFirstAudio.socket.message({type:'realtime_text',text:'Lanterna'});await settleVoice();t.mock.timers.tick(5);await settleVoice();assert.equal(noFirstAudio.socket.sent.find(p=>p.type==='speech_unavailable')?.code,'timeout');assert.equal(noFirstAudio.socket.sent.some(p=>p.type==='audio_chunk'),false);
 }finally{noFirstAudio.socket.close();}
});
test('emergência digitada fornece entrada e orientação para salvar uma vez, sem geração de IA',()=>{
 const f=fixture();f.socket.message({type:'realtime_text',text:'tem fogo na minha casa'});assert.equal(f.socket.sent.find(p=>p.type==='input_transcription')?.text,'tem fogo na minha casa');assert.ok(f.socket.sent.find(p=>p.type==='emergency')?.text);assert.equal(f.calls.length,0);assert.equal(f.socket.readyState,3);
});
test('cota antes de áudio usa uma leitura gratuita do mesmo texto; cooldown evita repetir TTS',async()=>{
 let requests=0;const reads:string[]=[];
 const ai=new GeminiAi(env,async()=>{requests++;return new Response('{}',{status:429});},async(text,signal,config)=>{assert.equal(config?.GEMINI_API_KEY,key);assert.ok(!signal?.aborted);reads.push(text);return{pcm:Buffer.alloc(200),sampleRate:24000};});
 assert.equal((await collect(ai)).length,1);assert.equal((await collect(ai)).length,1);assert.equal(requests,2);assert.deepEqual(reads,['Guarde a lanterna na mochila.','Guarde a lanterna na mochila.']);
});
test('cota depois de áudio parcial e cancelamento não disparam outra voz nem repetem a fala',async()=>{
 let reads=0;const literal=async()=>{reads++;return{pcm:Buffer.alloc(200),sampleRate:24000};};
 for(const liteQuota of [false,true]){
  const models:string[]=[];
  const ai=new GeminiAi(env,async(_url,options)=>{const model=JSON.parse(options!.body as string).model;models.push(model);return liteQuota&&model==='gemini-3.8-flash-lite-tts'?new Response('{}',{status:429}):sse([audio(),{event_type:'interaction.failed',error:{code:429}}]);},literal);
  await assert.rejects(collect(ai));assert.equal(reads,0);assert.deepEqual(models,liteQuota?['gemini-3.8-flash-lite-tts','gemini-3.8-flash-tts']:['gemini-3.8-flash-lite-tts']);
 }
 let calls=0;const c=new AbortController(),cancelled=new GeminiAi(env,async()=>{calls++;c.abort();return new Response('{}',{status:429});},literal);await assert.rejects(collect(cancelled,c.signal));assert.equal(reads,0);assert.equal(calls,1);
});
test('falha de correspondência na alternativa gratuita mantém indisponibilidade sem resposta pronta',async()=>{
 let reads=0;const ai=new GeminiAi(env,async()=>new Response('{}',{status:429}),async()=>{reads++;throw new AiUnavailable('literal_mismatch','A voz divergiu.');});
 await assert.rejects(collect(ai),(e:AiUnavailable)=>e.code==='literal_mismatch');assert.equal(reads,1);
});
test('cota também na leitura gratuita bloqueia repetição de conexões e informa espera',async()=>{
 let reads=0;const ai=new GeminiAi(env,async()=>new Response('{}',{status:429}),async()=>{reads++;throw new AiUnavailable('quota_unavailable','Voz indisponível.');});
 await assert.rejects(collect(ai),(e:AiUnavailable)=>e.retryAfterMs===60000);await assert.rejects(collect(ai),(e:AiUnavailable)=>e.retryAfterMs!>0);assert.equal(reads,1);
});

test('voz do aparelho recebe só resposta completa verificada, sem solicitar síntese cloud',async()=>{
 const f=fixture();f.socket.message({type:'speech_output',mode:'device'});
 f.socket.message({type:'realtime_text',text:'Onde guardo a lanterna?'});await wait();
 assert.deepEqual(f.calls,['checked-text']);
 assert.deepEqual(f.socket.sent.find(p=>p.type==='speech_output'),{type:'speech_output',mode:'device'});
 assert.deepEqual(f.socket.sent.find(p=>p.type==='speech_on_device'),{type:'speech_on_device',text:'Guarde a lanterna na mochila.'});
 assert.equal(f.socket.sent.some(p=>p.type==='audio_chunk'),false);
 const names=f.socket.sent.map(p=>p.type);assert.ok(names.indexOf('reply_ready')<names.indexOf('speech_on_device'));assert.equal(names.at(-1),'turn_complete');f.socket.close();
});

test('leitura no aparelho mantém contexto e bloqueia captura até retomada explícita',async()=>{
 let seen:any,turns=0;
 const f=fixture({models:{generateContent:async(r:any)=>{seen=r;return{text:++turns===1?'Guarde a lanterna na mochila.':'Confira também as pilhas.'};}}});
 f.socket.message({type:'speech_output',mode:'device'});f.socket.message({type:'realtime_text',text:'Onde guardo a lanterna?'});await wait();
 const pcm=Buffer.alloc(6000);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(4000,i);
 for(let i=0;i<2;i++)f.socket.message({type:'realtime_audio',pcmBase64:pcm.toString('base64')});
 f.socket.message({type:'audio_stream_end'});f.socket.message({type:'realtime_text',text:'Resposta do alto-falante'});await wait();assert.equal(turns,1);
 f.socket.message({type:'resume_input'});f.socket.message({type:'realtime_text',text:'E as pilhas dela?'});await wait();assert.equal(turns,2);
 assert.match(seen.contents,/Onde guardo a lanterna/);assert.match(seen.contents,/Guarde a lanterna na mochila/);
 assert.equal(f.socket.sent.filter(p=>p.type==='speech_on_device').length,2);assert.equal(f.calls.includes('speech-stream'),false);f.socket.close();
});

test('saída device não contorna erro de geração, texto inválido, emergência ou limite do protocolo',async()=>{
 for(const change of [{models:{generateContent:async()=>{throw new AiUnavailable('content_blocked','Conteúdo bloqueado.',422);}}},{models:{generateContent:async()=>({text:''})}}]){
  const f=fixture(change);f.socket.message({type:'speech_output',mode:'device'});f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();
  assert.equal(f.socket.sent.some(p=>p.type==='reply_ready'||p.type==='speech_on_device'||p.type==='audio_chunk'),false);assert.equal(f.socket.readyState,3);
 }
 const emergency=fixture();emergency.socket.message({type:'speech_output',mode:'device'});emergency.socket.message({type:'realtime_text',text:'tem fogo na minha casa'});assert.ok(emergency.socket.sent.some(p=>p.type==='emergency'));assert.equal(emergency.socket.sent.some(p=>p.type==='speech_on_device'),false);
 for(const mode of [null,'paid','DEVICE',{}]){const f=fixture();f.socket.message({type:'speech_output',mode});assert.equal(f.socket.readyState,3);assert.deepEqual(f.calls,[]);}
});

test('modo de saída não muda síntese já iniciada; fechamento cancela geração device pendente',async()=>{
 let finish!:()=>void;const f=fixture({speechStream:async function*(){yield Buffer.alloc(200);await new Promise<void>(r=>finish=r);yield Buffer.alloc(200);}});
 f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();f.socket.message({type:'speech_output',mode:'device'});finish();await wait();
 assert.equal(f.socket.sent.filter(p=>p.type==='audio_chunk').length,2);assert.equal(f.socket.sent.some(p=>p.type==='speech_on_device'),false);f.socket.close();
 let resolve!:(v:any)=>void;const closed=fixture({models:{generateContent:()=>new Promise(r=>resolve=r)}});
 closed.socket.message({type:'speech_output',mode:'device'});closed.socket.message({type:'realtime_text',text:'Lanterna'});await wait();closed.socket.close();resolve({text:'Resposta tardia.'});await wait();
 assert.equal(closed.socket.sent.some(p=>p.type==='reply_ready'||p.type==='speech_on_device'||p.type==='output_transcription'),false);
});

test('provedor que ignora abort não libera resposta nem voz após o prazo total',async()=>{
 for(const mode of ['cloud','device']){
  const f=fixture({models:{generateContent:async()=>{await new Promise(r=>setTimeout(r,12));return{text:'Resposta tardia.'};}}},{turnTimeoutMs:3});
  f.socket.message({type:'speech_output',mode});f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();
  assert.equal(f.socket.sent.find(p=>p.type==='error')?.code,'timeout');assert.equal(f.socket.sent.some(p=>['output_transcription','reply_ready','speech_on_device','audio_chunk'].includes(p.type)),false);assert.equal(f.socket.readyState,3);
 }
 const f=fixture({speechStream:async function*(){await new Promise(r=>setTimeout(r,12));yield Buffer.alloc(200);}},{turnTimeoutMs:3});
 f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();assert.equal(f.socket.sent.some(p=>p.type==='audio_chunk'),false);assert.equal(f.socket.sent.find(p=>p.type==='speech_unavailable')?.code,'timeout');assert.equal(f.socket.readyState,1);f.socket.close();
});

test('fluxo de síntese sem PCM preserva a resposta e informa voz indisponível',async()=>{
 const f=fixture({speechStream:async function*(){}});f.socket.message({type:'realtime_text',text:'Lanterna'});await wait();
 assert.ok(f.socket.sent.some(p=>p.type==='reply_ready'));assert.ok(f.socket.sent.some(p=>p.type==='speech_unavailable'));
 assert.equal(f.socket.sent.some(p=>p.type==='audio_chunk'),false);assert.equal(f.socket.sent.at(-1).type,'turn_complete');assert.equal(f.socket.readyState,1);f.socket.close();
});
