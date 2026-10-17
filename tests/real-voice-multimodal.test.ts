import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {connectRealVoice} from '../server/realVoice';
import {type AiEngine,type VoiceTurnRequest,AiUnavailable} from '../server/realAi';
import {readPcmWave} from '../server/localAi';

class Socket extends EventEmitter {
 OPEN=1;readyState=1;sent:any[]=[];
 send(raw:string){this.sent.push(JSON.parse(raw));}
 close(code=1000){if(this.readyState===3)return;this.readyState=3;this.emit('close',code);}
 message(value:any){this.emit('message',Buffer.from(JSON.stringify(value)));}
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
function voiced(ms:number){const pcm=Buffer.alloc(ms*32);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(Math.round(Math.sin(i/2*Math.PI/40)*3000),i);return pcm;}
function staticNoise(ms:number){let seed=9347;const pcm=Buffer.alloc(ms*32);for(let i=0;i<pcm.length;i+=2){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pcm.writeInt16LE(Math.round(((seed/4294967296)*2-1)*4000),i);}return pcm;}
function sendAudio(socket:Socket,pcm:Buffer){for(let offset=0;offset<pcm.length;offset+=3200)socket.message({type:'realtime_audio',pcmBase64:pcm.subarray(offset,offset+3200).toString('base64')});}
function fixture(change:Partial<AiEngine>={},options:any={}){
 const socket=new Socket(),calls:string[]=[],requests:VoiceTurnRequest[]=[];
 const ai:AiEngine={provider:'gemini',transcribe:async()=>{calls.push('STT');return{text:'Lanterna',status:'ok',provider:'gemini'};},models:{generateContent:async()=>{calls.push('text');return{text:'Resposta digitada.'};}},voiceTurn:async request=>{calls.push('voiceTurn');requests.push(request);return{input:'Sim',reply:'Vamos conferir as pilhas.',status:'ok'};},speech:async()=>{throw Error('Unary speech must not run');},speechStream:async function*(){calls.push('TTS');yield Buffer.alloc(200);},...change};
 connectRealVoice(socket as any,ai,'Instrução educativa adulta.',{streamSpeech:true,...options});
 return{socket,calls,requests};
}

test('fala de150ms usa uma geração seguida de TTS e mantém todos os eventos stream-v1',async()=>{
 const f=fixture();sendAudio(f.socket,voiced(150));sendAudio(f.socket,Buffer.alloc(600*32));await settle();
 assert.deepEqual(f.calls,['voiceTurn','TTS']);assert.equal(f.requests.length,1);
 const captured=readPcmWave(Buffer.from(f.requests[0].audio,'base64'));assert.equal(captured.rate,16000);assert.equal(captured.pcm.length,(150+600)*32);
 assert.deepEqual(f.socket.sent.filter(e=>e.type!=='voice_timing').map(e=>e.type),['open','processing','input_transcription','output_transcription','reply_ready','audio_chunk','turn_complete']);
 assert.equal(f.socket.sent[0].mode,'streamed-speech');f.socket.close();
});

test('pausa de400ms não fecha frase; consoante ruidosa inicial permanece no áudio enviado',async()=>{
 const f=fixture();const prefix=staticNoise(200),first=voiced(150),pause=Buffer.alloc(400*32),second=voiced(200);
 sendAudio(f.socket,prefix);sendAudio(f.socket,first);sendAudio(f.socket,pause);await settle();assert.equal(f.calls.length,0);
 sendAudio(f.socket,second);sendAudio(f.socket,Buffer.alloc(600*32));await settle();assert.deepEqual(f.calls,['voiceTurn','TTS']);
 const captured=readPcmWave(Buffer.from(f.requests[0].audio,'base64')).pcm;
 assert.ok(captured.subarray(0,prefix.length).equals(prefix));assert.equal(captured.length,(200+150+400+200+600)*32);f.socket.close();
});

test('silêncio e som abaixo de150ms não geram IA; uma resposta curta posterior é recebida',async()=>{
 const f=fixture();sendAudio(f.socket,Buffer.alloc(1000*32));sendAudio(f.socket,voiced(100));f.socket.message({type:'audio_stream_end'});await settle();assert.equal(f.calls.length,0);
 sendAudio(f.socket,voiced(150));f.socket.message({type:'audio_stream_end'});await settle();assert.deepEqual(f.calls,['voiceTurn','TTS']);f.socket.close();
});

test('ruído branco constante não cria chamada nem mantém pergunta aberta até15segundos',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1_000_000});
 const f=fixture();for(let i=0;i<100;i++){sendAudio(f.socket,staticNoise(100));t.mock.timers.tick(100);}await settle();assert.equal(f.socket.readyState,1);assert.equal(f.calls.length,0);
 sendAudio(f.socket,voiced(200));for(let i=0;i<6;i++){sendAudio(f.socket,staticNoise(100));t.mock.timers.tick(100);}await settle();assert.deepEqual(f.calls,['voiceTurn','TTS']);f.socket.close();
});

test('texto digitado não chama geração de áudio e engines antigos continuam disponíveis',async()=>{
 const typed=fixture();typed.socket.message({type:'realtime_text',text:'Onde guardo a lanterna?'});await settle();assert.deepEqual(typed.calls,['text','TTS']);typed.socket.close();
 const legacy=fixture({voiceTurn:undefined});sendAudio(legacy.socket,voiced(200));legacy.socket.message({type:'audio_stream_end'});await settle();assert.deepEqual(legacy.calls,['STT','text','TTS']);legacy.socket.close();
});

test('emergência transcrita prevalece sobre resposta proposta e não pede síntese',async()=>{
 const f=fixture({voiceTurn:async()=>({input:'Tem fogo na minha casa.',reply:'Resposta não verificada.',status:'ok'})});sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await settle();
 assert.equal(f.socket.readyState,3);assert.match(f.socket.sent.find(e=>e.type==='emergency').text,/199/);assert.equal(f.socket.sent.some(e=>['audio_chunk','output_transcription','reply_ready'].includes(e.type)),false);assert.equal(f.calls.includes('TTS'),false);
});

test('JSON inválido, fala ausente, resposta parcial e bloqueio não liberam áudio nem texto sugerido',async()=>{
 for(const voiceTurn of [async()=>({input:'Lanterna',reply:'',status:'ok'}),async()=>({input:42,reply:'Na mochila.',status:'ok'}),async()=>({input:'Lanterna',reply:'Na mochila.',status:'no_speech'}),async()=>{throw new AiUnavailable('content_blocked','Bloqueado');}]){
  const f=fixture({voiceTurn:voiceTurn as AiEngine['voiceTurn']});sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await settle();assert.ok(f.socket.sent.some(e=>e.type==='error'));assert.equal(f.socket.sent.some(e=>['audio_chunk','output_transcription','reply_ready'].includes(e.type)),false);assert.equal(f.calls.includes('TTS'),false);
 }
 const empty=fixture({voiceTurn:async()=>({input:'',reply:'',status:'no_speech'})});sendAudio(empty.socket,voiced(200));empty.socket.message({type:'audio_stream_end'});await settle();assert.equal(empty.socket.sent.at(-1).type,'turn_complete');assert.equal(empty.calls.includes('TTS'),false);empty.socket.close();
});

test('fechamento e interrupção abortam mesma geração e ignoram resposta tardia',async()=>{
 for(const stop of ['close','interrupt']){
  let finish!:(value:any)=>void,signal:AbortSignal|undefined;
  const f=fixture({voiceTurn:async(_request,s)=>{signal=s;return new Promise(resolve=>finish=resolve);}});
  sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await settle();
  if(stop==='close')f.socket.close();else f.socket.message({type:'interrupt'});
  assert.equal(signal?.aborted,true);finish({input:'Lanterna',reply:'Resposta tardia.',status:'ok'});await settle();
  assert.equal(f.socket.sent.some(e=>['input_transcription','output_transcription','reply_ready','audio_chunk'].includes(e.type)),false);assert.equal(f.calls.includes('TTS'),false);f.socket.close();
 }
});

test('prazo existente cancela entendimento multimodal sem tentar STT, texto ou TTS alternativos',async()=>{
 let signal:AbortSignal|undefined;
 const f=fixture({voiceTurn:async(_request,s)=>{signal=s;return new Promise((_,reject)=>s!.addEventListener('abort',()=>reject(s!.reason),{once:true}));}},{turnTimeoutMs:5});
 sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(signal?.aborted,true);assert.equal(f.socket.sent.find(e=>e.type==='error')?.code,'timeout');assert.equal(f.calls.length,0);assert.equal(f.socket.sent.some(e=>['output_transcription','audio_chunk'].includes(e.type)),false);
});

test('contexto curto pertence à sessão de voz; síntese falha preserva resposta e continuidade',async()=>{
 let reads=0;const f=fixture({speechStream:async function*(){if(++reads===1)throw new AiUnavailable('quota_unavailable','Voz indisponível');yield Buffer.alloc(200);}});
 sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await settle();assert.ok(f.socket.sent.some(e=>e.type==='speech_unavailable'));assert.equal(f.requests[0].history.length,0);
 sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await settle();assert.equal(f.requests.length,1);
 f.socket.message({type:'resume_input'});sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await settle();
 assert.deepEqual(f.requests[1].history,[{role:'user',content:'Sim'},{role:'assistant',content:'Vamos conferir as pilhas.'}]);
 for(let i=0;i<6;i++){sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await settle();}
 assert.equal(f.requests.at(-1)!.history.length,12);assert.equal(reads,8);
 const other=fixture();sendAudio(other.socket,voiced(200));other.socket.message({type:'audio_stream_end'});await settle();assert.deepEqual(other.requests[0].history,[]);other.socket.close();f.socket.close();
});

test('tempos locais são numéricos e não contêm transcrição, áudio, contexto ou segredo',async()=>{
 const f=fixture();sendAudio(f.socket,voiced(200));f.socket.message({type:'audio_stream_end'});await settle();
 const timings=f.socket.sent.filter(e=>e.type==='voice_timing');assert.deepEqual(timings.map(e=>e.stage),['understanding','first_audio','complete']);
 for(const entry of timings){assert.equal(entry.pipeline,'multimodal');assert.equal(entry.turn,1);assert.ok(Number.isInteger(entry.durationMs)&&entry.durationMs>=0);assert.ok(Number.isInteger(entry.elapsedMs)&&entry.elapsedMs>=0);assert.deepEqual(Object.keys(entry).sort(),['durationMs','elapsedMs','pipeline','stage','turn','type']);}
 assert.doesNotMatch(JSON.stringify(timings),/Sim|pilhas|audio\/wav|Instrução|FAKE|KEY/);f.socket.close();
});

test('ruído não dispara interrupção da síntese em andamento',async()=>{
 let finish!:()=>void;const f=fixture({speechStream:async function*(){yield Buffer.alloc(200);await new Promise<void>(resolve=>finish=resolve);}});
 f.socket.message({type:'realtime_text',text:'Lanterna'});await settle();sendAudio(f.socket,staticNoise(800));assert.equal(f.socket.sent.some(e=>e.type==='interrupted'),false);finish();await settle();f.socket.close();
});
