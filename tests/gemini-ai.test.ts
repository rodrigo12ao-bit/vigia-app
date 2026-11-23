import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {GeminiAi} from '../server/geminiAi';import {realAiConfig,pcmWave} from '../server/realAi';import {GEMINI_SPEECH_STYLE} from '../server/geminiLiteralSpeech';
const key='FAKE_CONTRACT_KEY';const env={VIGIA_MODE:'local-real',AI_PROVIDER:'gemini',AI_AUDIENCE:'18plus',ENABLE_REAL_AI:'true',GEMINI_API_KEY:key,GEMINI_FREE_KEY_SHA256:createHash('sha256').update(key).digest('hex'),AI_COST_AUTHORIZED:'false'};
test('Gemini exige 18+ e verificação do plano gratuito da mesma chave',async()=>{for(const change of [{AI_AUDIENCE:'6to14'},{GEMINI_FREE_KEY_SHA256:''},{GEMINI_API_KEY:'changed'},{ENABLE_REAL_AI:'false'}]){let calls=0;const ai=new GeminiAi({...env,...change},async()=>{calls++;return new Response();});await assert.rejects(ai.models.generateContent({contents:'Mochila'}));assert.equal(calls,0);}assert.equal(realAiConfig(env).budget,0);});
test('falha HTTP temporária tenta uma vez com o mesmo pedido e mantém filtros de segurança',async()=>{
 const sent:any[]=[];const ai=new GeminiAi(env,async(_url,options)=>{sent.push(JSON.parse(options!.body as string));return sent.length===1?new Response('{}',{status:503}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Confira as pilhas da lanterna.'}]}}]});});
 assert.equal((await ai.models.generateContent({contents:'Lanterna'})).text,'Confira as pilhas da lanterna.');assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.ok(sent[1].safetySettings.every((s:any)=>s.threshold==='BLOCK_MEDIUM_AND_ABOVE'));
});
test('cota, permissão e segurança não repetem; duas falhas temporárias encerram; abortar impede repetição',async()=>{
 for(const status of [429,403,422,503]){let calls=0;const ai=new GeminiAi(env,async()=>{calls++;return new Response('{}',{status});});await assert.rejects(ai.models.generateContent({contents:'Lanterna'}));assert.equal(calls,status===503?2:1);}
 const c=new AbortController();let calls=0;const ai=new GeminiAi(env,async()=>{calls++;c.abort();return new Response('{}',{status:503});});await assert.rejects(ai.models.generateContent({contents:'Lanterna'},c.signal));assert.equal(calls,1);
});
test('texto e imagem usam o modelo gratuito fixado, sem ferramentas ou cache de conversas',async()=>{const seen:any[]=[];const ai=new GeminiAi(env,async(url:any,options:any)=>{seen.push({url,body:JSON.parse(options.body)});return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"reply":"'+seen.length+'"}'}]}}]});});const a=await ai.models.generateContent({contents:'Lanterna'}),b=await ai.models.generateContent({contents:[{inlineData:{mimeType:'image/png',data:'iVBORw0KGgo='}},{text:'Observe'}]});assert.notEqual(a.text,b.text);assert.match(seen[0].url,/gemini-3.5-flash-lite:generateContent$/);assert.equal(seen[1].body.contents[0].parts[0].inlineData.mimeType,'image/png');assert.equal(seen[0].body.tools,undefined);assert.equal(seen[0].body.cachedContent,undefined);assert.equal(seen[0].body.safetySettings.length,4);});
test('cota, rede, bloqueio e respostas incompletas retornam falha sem simulação',async()=>{for(const response of [()=>new Response('{}',{status:429}),()=>Promise.reject(Error('network')),()=>Response.json({promptFeedback:{blockReason:'SAFETY'}}),()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'fragmento'}]}}]})]){const ai=new GeminiAi(env,response as any);await assert.rejects(ai.models.generateContent({contents:'Lanterna'}));}});
test('silêncio não chama a API e áudio comprimido não contorna limite de duração',async()=>{let calls=0;const ai=new GeminiAi(env,async()=>{calls++;return new Response();});const r=await ai.transcribe(pcmWave(Buffer.alloc(32000)).toString('base64'),'audio/wav');assert.equal(r.status,'no_speech');assert.equal(r.text,'');await assert.rejects(ai.transcribe(pcmWave(Buffer.alloc(500000)).toString('base64'),'audio/wav'));await assert.rejects(ai.transcribe(Buffer.alloc(100).toString('base64'),'audio/mp3'));assert.equal(calls,0);});
test('síntese aceita somente PCM24k do modelo TTS gratuito',async()=>{let model='';const ai=new GeminiAi(env,async(url:any)=>{model=url;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:Buffer.alloc(100).toString('base64')}}]}}]});});const r=await ai.speech('Guarde a lanterna.');assert.equal(r.sampleRate,24000);assert.match(model,/gemini-3.8-flash-lite-tts/);});
test('TTS estável usa fala literal e metadados; WAV é desembrulhado uma vez e taxa incorreta é rejeitada',async()=>{
 let sent:any;const pcm=Buffer.alloc(100),ai=new GeminiAi(env,async(_url:any,options:any)=>{sent=JSON.parse(options.body);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'audio/wav',data:pcmWave(pcm,24000).toString('base64')}}]}}]});});
 const audio=await ai.speech('Guarde a lanterna.');assert.deepEqual(audio.pcm,pcm);assert.equal(sent.contents[0].parts[0].text,'Guarde a lanterna.');assert.equal(sent.contents[0].parts[0].speechMetadata.style,GEMINI_SPEECH_STYLE);assert.equal(sent.generationConfig.speechConfig.voiceConfig.voice,'Aoede');assert.equal(sent.generationConfig.thinkingConfig,undefined);assert.equal(sent.generationConfig.temperature,undefined);
 const bad=new GeminiAi(env,async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'audio/wav',data:pcmWave(pcm,16000).toString('base64')}}]}}]}));await assert.rejects(bad.speech('Lanterna'),/Áudio gerado inválido/);
});

test('Flash-Lite mantém pensamento minimal e esquema sem aceitar sampling depreciado ou configuração de outro modelo',async()=>{
 let sent:any;
 const schema={type:'OBJECT',properties:{reply:{type:'STRING'}},required:['reply']};
 const ai=new GeminiAi(env,async(_url,options)=>{sent=JSON.parse(options!.body as string);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'Não deve ser exibido.'},{text:'{"reply":"Confira as pilhas."}'}]}}]});});
 const output=await ai.models.generateContent({contents:'E as pilhas?',config:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:600,temperature:0.1,topP:0.1,topK:1,thinkingConfig:{thinkingLevel:'high',includeThoughts:true},tools:[{googleSearch:{}}]}});
 assert.equal(output.text,'{"reply":"Confira as pilhas."}');
 assert.deepEqual(sent.generationConfig,{maxOutputTokens:600,responseMimeType:'application/json',responseSchema:schema,thinkingConfig:{thinkingLevel:'minimal'}});
 assert.equal(sent.tools,undefined);assert.equal(sent.cachedContent,undefined);assert.equal(sent.safetySettings.length,4);
});

test('cancelamento antes da chamada ou resposta tardia invalida texto, transcrição e leitura sem nova tentativa',async()=>{
 const pcm=Buffer.alloc(3200);for(let index=0;index<pcm.length;index+=2)pcm.writeInt16LE(2000,index);
 const jobs=[
  {run:(ai:GeminiAi,signal:AbortSignal)=>ai.models.generateContent({contents:'Lanterna'},signal),parts:[{text:'Confira as pilhas.'}]},
  {run:(ai:GeminiAi,signal:AbortSignal)=>ai.transcribe(pcmWave(pcm).toString('base64'),'audio/wav',signal),parts:[{text:'{"text":"Lanterna"}'}]},
  {run:(ai:GeminiAi,signal:AbortSignal)=>ai.speech('Confira as pilhas.',signal),parts:[{inlineData:{mimeType:'audio/L16;rate=24000',data:Buffer.alloc(100).toString('base64')}}]},
 ];
 for(const job of jobs){
  const controller=new AbortController();let calls=0,finish!:(response:Response)=>void;
  const ai=new GeminiAi(env,async(_url,options)=>{calls++;assert.ok(options?.signal);return new Promise<Response>(resolve=>finish=resolve);});
  const pending=job.run(ai,controller.signal);assert.equal(calls,1);controller.abort();
  finish(Response.json({candidates:[{finishReason:'STOP',content:{parts:job.parts}}]}));
  await assert.rejects(pending,(error:any)=>error.code==='cancelled');
  await assert.rejects(job.run(ai,controller.signal),(error:any)=>error.code==='cancelled');assert.equal(calls,1);
 }
});

test('cancelamento durante leitura do JSON impede liberar corpo tardio mesmo após HTTP200',async()=>{
 let started!:()=>void,finish!:(value:any)=>void;
 const reading=new Promise<void>(resolve=>started=resolve),body=new Promise(resolve=>finish=resolve),controller=new AbortController();
 const response=new Response('{}');response.json=()=>{started();return body;};
 const ai=new GeminiAi(env,async()=>response);
 const pending=ai.models.generateContent({contents:'Lanterna'},controller.signal);
 await reading;controller.abort();finish({candidates:[{finishReason:'STOP',content:{parts:[{text:'Texto cancelado.'}]}}]});
 await assert.rejects(pending,(error:any)=>error.code==='cancelled');
});
test('síntese repete uma resposta incompleta uma vez, sem repetir cota ou bloqueio',async()=>{
 let calls=0;
 const ai=new GeminiAi(env,async()=>{calls++;return calls===1?Response.json({candidates:[{finishReason:'OTHER'}]}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:Buffer.alloc(100).toString('base64')}}]}}]});});
 assert.equal((await ai.speech('Uma lanterna.')).pcm.length,100);assert.equal(calls,2);
 const cases:Array<{response:()=>Response,expected:number}>=[
  {response:()=>new Response('{}',{status:429}),expected:1},
  {response:()=>Response.json({promptFeedback:{blockReason:'SAFETY'}}),expected:1},
  {response:()=>Response.json({candidates:[{finishReason:'OTHER'}]}),expected:2}
 ];
 for(const c of cases){let n=0;const failed=new GeminiAi(env,async()=>{n++;return c.response();});await assert.rejects(failed.speech('Uma lanterna.'));assert.equal(n,c.expected);}
});
