import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {geminiLiteralSpeech,geminiLiteralSpeechStream,GEMINI_LITERAL_SPEECH_MODEL,normalizeLiteralTranscript} from '../server/geminiLiteralSpeech';

class Socket extends EventEmitter {
  OPEN=1;readyState=1;sent:any[]=[];closed=0;
  send(value:string){this.sent.push(JSON.parse(value));}
  close(){if(this.readyState===3)return;this.readyState=3;this.closed++;this.emit('close');}
  terminate(){this.close();}
  message(value:any){this.emit('message',Buffer.from(JSON.stringify(value)),false);}
}
const key='FAKE_LITERAL_SPEECH_CONTRACT_KEY';
const env={AI_PROVIDER:'gemini',AI_AUDIENCE:'18plus',VIGIA_MODE:'adult-live',ENABLE_REAL_AI:'true',GEMINI_API_KEY:key,GEMINI_FREE_KEY_SHA256:createHash('sha256').update(key).digest('hex'),AI_COST_AUTHORIZED:'false'};
const expected='Guarde a lanterna na mochila.';
const pcm=Buffer.alloc(24000);for(let index=0;index<pcm.length;index+=2)pcm.writeInt16LE(index%4===0?500:-500,index);
const part={inlineData:{mimeType:'audio/pcm;rate=24000',data:pcm.toString('base64')}};
function fixture(text=expected,signal?:AbortSignal,timeout=15000){
  const provider=new Socket();let url='',options:any;
  const result=geminiLiteralSpeech(text,signal,env,(endpoint,o)=>{url=endpoint;options=o;return provider as any;},timeout);
  provider.emit('open');provider.message({setupComplete:{}});
  return {provider,result,url,options};
}
function finish(f:ReturnType<typeof fixture>,transcript=expected){f.provider.message({serverContent:{outputTranscription:{text:transcript},modelTurn:{parts:[part]},generationComplete:true}});}

test('leitura literal usa conexão privada, modelo gratuito, somente texto completo e Aoede',async()=>{
  const f=fixture(),setup=f.provider.sent[0].setup;
  assert.match(f.url,/\.v1beta\.GenerativeService\.BidiGenerateContent$/);
  assert.doesNotMatch(f.url,/FAKE_LITERAL|key=/);
  assert.equal(f.options.headers['x-goog-api-key'],key);
  assert.equal(setup.model,'models/'+GEMINI_LITERAL_SPEECH_MODEL);
  assert.equal(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Aoede');
  assert.equal(setup.generationConfig.responseModalities[0],'AUDIO');
  assert.equal(setup.generationConfig.maxOutputTokens,800);assert.equal(setup.generationConfig.temperature,0.5);
  assert.equal(setup.tools,undefined);assert.equal(setup.inputAudioTranscription,undefined);
  assert.equal(setup.sessionResumption,undefined);assert.equal(setup.proactivity,undefined);
  assert.match(setup.systemInstruction.parts[0].text,/Leia exatamente/);
  assert.equal(f.provider.sent[1].clientContent.turns[0].parts[0].text,expected);
  assert.equal(f.provider.sent.length,2);
  finish(f);const result=await f.result;assert.deepEqual(result.pcm,pcm);assert.equal(result.sampleRate,24000);assert.equal(f.provider.closed,1);
});
test('público infantil, chave sem prova gratuita, configuração paga e texto inválido não abrem conexão',async()=>{
  for(const change of [{AI_AUDIENCE:'6to14'},{GEMINI_FREE_KEY_SHA256:''},{GEMINI_API_KEY:'changed'},{AI_PROVIDER:'openai'},{ENABLE_REAL_AI:'false'}]){
    let calls=0;await assert.rejects(geminiLiteralSpeech(expected,undefined,{...env,...change},()=>{calls++;return new Socket() as any;}));assert.equal(calls,0);
  }
  for(const input of ['', 'x'.repeat(1501),'{"reply":"Guarde a lanterna."}','**Guarde a lanterna.**']){
    let calls=0;await assert.rejects(geminiLiteralSpeech(input,undefined,env,()=>{calls++;return new Socket() as any;}));assert.equal(calls,0);
  }
});
test('áudio permanece bufferizado até a última transcrição e generationComplete',async()=>{
  const f=fixture();let released=false;f.result.then(()=>released=true);
  f.provider.message({serverContent:{modelTurn:{parts:[part]}}});
  f.provider.message({serverContent:{outputTranscription:{text:'Guarde a lanterna '}}});
  await Promise.resolve();assert.equal(released,false);
  f.provider.message({serverContent:{outputTranscription:{text:'na mochila.'},generationComplete:true}});
  const result=await f.result;assert.deepEqual(result.pcm,pcm);assert.equal(f.provider.closed,1);
  const n=f.provider.sent.length;f.provider.message({serverContent:{outputTranscription:{text:'Resposta tardia'},modelTurn:{parts:[part]},generationComplete:true}});assert.equal(f.provider.sent.length,n);
});
test('JSON UTF-8 em frames binários é aceito; PCM bruto e UTF-8 inválido são bloqueados',async()=>{
  const provider=new Socket(),result=geminiLiteralSpeech(expected,undefined,env,()=>provider as any);
  provider.emit('open');provider.emit('message',Buffer.from(JSON.stringify({setupComplete:{}})),true);
  provider.emit('message',Buffer.from(JSON.stringify({serverContent:{outputTranscription:{text:expected},modelTurn:{parts:[part]},generationComplete:true}})),true);
  assert.deepEqual((await result).pcm,pcm);
  for(const raw of [Buffer.from([0xff,0xfe]),Buffer.alloc(200),Buffer.from('"not an event"')]){
    const f=fixture(),check=assert.rejects(f.result,(e:any)=>e.code==='invalid_response');f.provider.emit('message',raw,true);await check;assert.equal(f.provider.closed,1);
  }
});
test('transcrição opcional vazia aguarda texto; vazia na conclusão ou tipos inválidos bloqueiam áudio',async()=>{
  const f=fixture();let released=false;f.result.then(()=>released=true);
  f.provider.message({serverContent:{outputTranscription:{},modelTurn:{parts:[part]}}});
  await Promise.resolve();assert.equal(released,false);
  f.provider.message({serverContent:{outputTranscription:{text:expected},generationComplete:true}});
  assert.deepEqual((await f.result).pcm,pcm);
  const missing=fixture(),missingCheck=assert.rejects(missing.result,(e:any)=>e.code==='literal_mismatch');
  missing.provider.message({serverContent:{outputTranscription:{},modelTurn:{parts:[part]},generationComplete:true}});await missingCheck;
  for(const output of [null,[],expected,{text:null},{text:3},{text:{}}]){
    const bad=fixture(),check=assert.rejects(bad.result,(e:any)=>e.code==='invalid_response');bad.provider.message({serverContent:{outputTranscription:output}});await check;
  }
});
test('normalização aceita apenas apresentação; conserva números, acentos e sinais',()=>{
  assert.equal(normalizeLiteralTranscript('Guarde a lanterna: na mochila!'),normalizeLiteralTranscript('GUARDE a lanterna na mochila.'));
  assert.equal(normalizeLiteralTranscript('É seguro?'),normalizeLiteralTranscript('E\u0301 seguro.'));
  for(const [a,b] of [['não saia','saia'],['199','193'],['199','cento e noventa e nove'],['1,5','15'],['1.5','15'],['−2','2'],['-2','2'],['10%','10'],['R$ 10','10'],['é seguro','e seguro']])assert.notEqual(normalizeLiteralTranscript(a),normalizeLiteralTranscript(b));
});
test('qualquer mudança de palavras, números ou instruções bloqueia todo o áudio',async()=>{
  for(const [input,output] of [[expected,'Guarde a lanterna.'],[expected,'Claro! '+expected],[expected,expected+' Precisa de ajuda?'],['Ligue 199.','Ligue 193.'],['Não saia de casa.','Saia de casa.'],['São 1,5 metros.','São 15 metros.']]){
    const f=fixture(input);const check=assert.rejects(f.result,(e:any)=>e.code==='literal_mismatch');finish(f,output);await check;assert.equal(f.provider.closed,1);
  }
});
test('transcrição literal com áudio curtíssimo ou somente silêncio não libera voz',async()=>{
  const tiny=Buffer.alloc(2);tiny.writeInt16LE(500,0);
  for(const bytes of [tiny,Buffer.alloc(12000)]){
    const f=fixture(),check=assert.rejects(f.result,(e:any)=>e.code==='invalid_response');
    f.provider.message({serverContent:{outputTranscription:{text:expected},modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:bytes.toString('base64')}}]},generationComplete:true,turnComplete:true}});
    await check;assert.equal(f.provider.closed,1);
  }
});
test('PCM insuficiente em generationComplete aguarda o turno completo e revalida áudio tardio',async()=>{
  const f=fixture(),dummy=Buffer.alloc(2);let released=false;f.result.then(()=>released=true);
  f.provider.message({serverContent:{outputTranscription:{text:expected},modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:dummy.toString('base64')}}]},generationComplete:true}});
  await Promise.resolve();assert.equal(released,false);assert.equal(f.provider.closed,0);
  f.provider.message({serverContent:{modelTurn:{parts:[part]}}});
  await Promise.resolve();assert.equal(released,false);
  f.provider.message({serverContent:{turnComplete:true}});
  assert.deepEqual((await f.result).pcm,Buffer.concat([dummy,pcm]));assert.equal(f.provider.closed,1);
});
test('esperar turnComplete não libera silêncio, transcrição alterada, áudio parcial ou timeout',async()=>{
  for(const extra of [{}, {outputTranscription:{text:' Mais uma instrução.'},modelTurn:{parts:[part]}}]){
    const f=fixture(),check=assert.rejects(f.result);
    f.provider.message({serverContent:{outputTranscription:{text:expected},modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(2).toString('base64')}}]},generationComplete:true}});
    f.provider.message({serverContent:{...extra,turnComplete:true}});await check;assert.equal(f.provider.closed,1);
  }
  const waiting=fixture(expected,undefined,10);
  waiting.provider.message({serverContent:{outputTranscription:{text:expected},modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(2).toString('base64')}}]},generationComplete:true}});
  waiting.provider.message({serverContent:{modelTurn:{parts:[part]}}});
  await assert.rejects(waiting.result,(e:any)=>e.code==='voice_timeout');assert.equal(waiting.provider.closed,1);
});
test('geração ausente, transcrição ausente, interrupção e desconexão não liberam voz',async()=>{
  for(const content of [{outputTranscription:{text:expected},modelTurn:{parts:[part]},turnComplete:true},{modelTurn:{parts:[part]},generationComplete:true},{outputTranscription:{text:expected},modelTurn:{parts:[part]},interrupted:true}]){
    const f=fixture(),check=assert.rejects(f.result);f.provider.message({serverContent:content});await check;assert.equal(f.provider.closed,1);
  }
  const f=fixture(),check=assert.rejects(f.result,(e:any)=>e.code==='incomplete_response');f.provider.close();await check;
});
test('PCM, taxa, tamanho, transcrição e eventos inválidos falham antes da reprodução',async()=>{
  const badParts=[{inlineData:{mimeType:'audio/wav',data:part.inlineData.data}},{inlineData:{mimeType:'audio/pcm;rate=16000',data:part.inlineData.data}},{inlineData:{mimeType:'audio/pcm;rate=24000',data:'AQ=='}},{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.from('RIFFAA').toString('base64')}},{text:'Outro conteúdo'}];
  for(const bad of badParts){const f=fixture(),check=assert.rejects(f.result);f.provider.message({serverContent:{outputTranscription:{text:expected},modelTurn:{parts:[bad]},generationComplete:true}});await check;}
  for(const event of [{serverContent:{outputTranscription:{text:'x'.repeat(2001)}}},{toolCall:{functionCalls:[]}},{setupComplete:{}},{serverContent:{inputTranscription:{text:'Fala inesperada'}}}]){const f=fixture(),check=assert.rejects(f.result);f.provider.message(event);await check;}
  const huge=fixture(),check=assert.rejects(huge.result);for(let i=0;i<3;i++)huge.provider.message({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(1000000).toString('base64')}}]}}});await check;
  const flood=fixture(),floodCheck=assert.rejects(flood.result);for(let i=0;i<2001;i++)flood.provider.message({usageMetadata:{}});await floodCheck;
});
test('cota não tenta novamente nem muda para serviço pago',async()=>{
  const f=fixture(),check=assert.rejects(f.result,(e:any)=>e.code==='quota_unavailable');f.provider.message({error:{code:429,message:'private upstream detail'}});await check;assert.equal(f.provider.sent.length,2);assert.equal(f.provider.closed,1);
});
test('cancelamento antes e durante a leitura fecha a conexão e ignora áudio tardio',async()=>{
  const before=new AbortController();before.abort();let calls=0;await assert.rejects(geminiLiteralSpeech(expected,before.signal,env,()=>{calls++;return new Socket() as any;}),(e:any)=>e.code==='cancelled');assert.equal(calls,0);
  const controller=new AbortController(),f=fixture(expected,controller.signal),check=assert.rejects(f.result,(e:any)=>e.code==='cancelled');
  f.provider.message({serverContent:{modelTurn:{parts:[part]},outputTranscription:{text:'Guarde a lanterna '}}});controller.abort();finish(f);await check;assert.equal(f.provider.closed,1);
  const duringConnect=new AbortController(),provider=new Socket();await assert.rejects(geminiLiteralSpeech(expected,duringConnect.signal,env,()=>{duringConnect.abort();return provider as any;}),(e:any)=>e.code==='cancelled');assert.equal(provider.closed,1);
});
test('prazo inclui conexão e geração e não pode ultrapassar 15 segundos',async()=>{
  const f=fixture(expected,undefined,10);await assert.rejects(f.result,(e:any)=>e.code==='voice_timeout');assert.equal(f.provider.closed,1);
  for(const timeout of [0,15001,NaN])await assert.rejects(geminiLiteralSpeech(expected,undefined,env,()=>new Socket() as any,timeout),(e:any)=>e.code==='invalid_input');
});
test('limite de duas leituras simultâneas é liberado após cancelamento ou sucesso',async()=>{
  const a=fixture(),b=fixture();let calls=0;await assert.rejects(geminiLiteralSpeech(expected,undefined,env,()=>{calls++;return new Socket() as any;}),(e:any)=>e.code==='busy');assert.equal(calls,0);finish(a);finish(b);await Promise.all([a.result,b.result]);const c=fixture();finish(c);await c.result;
});
test('wrapper de streaming fornece um único PCM somente depois da conferência completa',async()=>{
  const provider=new Socket(),chunks:Buffer[]=[];
  const consume=(async()=>{for await(const buffer of geminiLiteralSpeechStream(expected,undefined,env,()=>provider as any))chunks.push(buffer);})();
  provider.emit('open');provider.message({setupComplete:{}});provider.message({serverContent:{outputTranscription:{text:expected},modelTurn:{parts:[part]}}});await Promise.resolve();assert.equal(chunks.length,0);
  provider.message({serverContent:{generationComplete:true}});await consume;assert.equal(chunks.length,1);assert.deepEqual(chunks[0],pcm);
});
