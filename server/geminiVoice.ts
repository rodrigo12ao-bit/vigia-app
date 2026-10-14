import WebSocket from 'ws';
import {realAiConfig} from './realAi';
import {isEmergency,adultEmergencyReply} from './safety';
import {voiceText} from './voiceText';

export const GEMINI_LIVE_MODEL='gemini-3.8-live';
type Connect=(url:string,options:WebSocket.ClientOptions)=>WebSocket;

// A private server-to-server connection: the browser never receives the Google key.
// Native audio replaces STT → text → TTS, but a complete transcript and generation
// are still checked before any answer audio is released. No tools or paid fallback.
export function connectGeminiVoice(client:WebSocket,instruction:string,env:NodeJS.ProcessEnv=process.env,connect:Connect=(url,options)=>new WebSocket(url,options)){
 const config=realAiConfig(env);
 if(!config.enabled||config.provider!=='gemini')throw Error(config.blocked||'Gemini gratuito indisponível.');
 let closed=false,ready=false,input='',output='',audio:Buffer[]=[],bytes=0,generated=false,released=false,interrupted=false;
 let frames=0,frameBytes=0,windowStart=Date.now(),providerFinished=true,queuedText='',turnTimer:ReturnType<typeof setTimeout>|undefined;
 const send=(value:object)=>{if(!closed&&client.readyState===client.OPEN)client.send(JSON.stringify(value));};
 const upstream=connect('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',{headers:{'x-goog-api-key':env.GEMINI_API_KEY!},handshakeTimeout:12000,maxPayload:3000000});
 const clearTurn=()=>{input='';output='';audio=[];bytes=0;generated=released=interrupted=false;clearTimeout(turnTimer);turnTimer=undefined;};
 const cleanup=()=>{if(closed)return;closed=true;clearTimeout(setupTimer);clearTurn();upstream.close(1000);};
 const fail=(message='Não foi possível concluir a conversa por voz. Tente novamente.')=>{send({type:'error',message});client.close(1011);cleanup();};
 const emergency=()=>{send({type:'emergency',text:adultEmergencyReply.reply});client.close(1000);cleanup();};
 const setupTimer=setTimeout(()=>fail('A conexão de voz demorou demais. Tente novamente.'),15000);
 client.once('close',cleanup);
 const forward=(value:object)=>{if(!closed&&ready&&upstream.readyState===upstream.OPEN)upstream.send(JSON.stringify(value));};
 const textTurn=(text:string)=>{
  clearTurn();providerFinished=false;input=text;
  send({type:'input_transcription',text:input});send({type:'processing'});
  turnTimer=setTimeout(()=>fail('A resposta de voz demorou demais. Tente novamente.'),25000);
  forward({clientContent:{turns:[{role:'user',parts:[{text:input}]}],turnComplete:true}});
 };
 const release=()=>{
  if(!generated||released||interrupted||!input.trim()||closed)return;
  if(isEmergency(input)){emergency();return;}
  let reply:string;try{reply=voiceText(output);}catch{fail('A resposta de voz está indisponível.');return;}
  if(!bytes){fail('O Gemini não retornou áudio válido.');return;}
  released=true;clearTimeout(turnTimer);turnTimer=undefined;
  send({type:'output_transcription',text:reply});
  for(const pcm of audio)send({type:'audio_chunk',pcmBase64:pcm.toString('base64')});
  audio=[];bytes=0;
  // generationComplete precedes Google's playback delay. The browser waits for
  // its actual audio queue to finish, and saves this checked turn exactly once.
  send({type:'turn_complete'});
 };
 upstream.on('open',()=>{if(closed){upstream.close();return;}upstream.send(JSON.stringify({setup:{model:'models/'+GEMINI_LIVE_MODEL,generationConfig:{responseModalities:['AUDIO'],temperature:0.5,maxOutputTokens:800,speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Aoede'}}}},systemInstruction:{parts:[{text:instruction}]},inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{disabled:false,startOfSpeechSensitivity:'START_SENSITIVITY_LOW',endOfSpeechSensitivity:'END_SENSITIVITY_HIGH',prefixPaddingMs:100,silenceDurationMs:500}}}}));});
 upstream.on('message',raw=>{
  if(closed)return;
  try{
   const msg=JSON.parse(raw.toString());
   if(msg.error){fail(msg.error.code===429?'A cota gratuita de voz foi atingida. Tente mais tarde. Nenhum serviço pago foi ativado.':'O Gemini está indisponível para voz neste momento.');return;}
   if(msg.setupComplete){if(ready)return;ready=true;clearTimeout(setupTimer);send({type:'open',provider:'gemini',mode:'native-audio',voiceDisclosure:'Voz gerada por IA com Gemini, exclusiva para adultos. Cota gratuita.'});return;}
   const c=msg.serverContent;if(!c)return;
   if(c.interrupted){clearTurn();interrupted=true;send({type:'interrupted'});}
   if(c.inputTranscription?.text){
    // A new utterance after a completed turn must not inherit the old question.
    if(released)clearTurn();
    providerFinished=false;
    input+=c.inputTranscription.text;
    if(input.length>4000){fail('Sua fala ficou longa demais. Tente uma pergunta mais curta.');return;}
    send({type:'input_transcription',text:input.trim()});
    if(isEmergency(input)){emergency();return;}
    if(!turnTimer)turnTimer=setTimeout(()=>fail('A resposta de voz demorou demais. Tente novamente.'),25000);
   }
   if(!interrupted&&c.outputTranscription?.text){output+=c.outputTranscription.text;if(output.length>1500){fail('A resposta de voz ficou longa demais. Tente uma pergunta mais curta.');return;}}
   for(const part of interrupted?[]:c.modelTurn?.parts||[]){
    const a=part.inlineData;if(!a)continue;
    if(!/^audio\/(?:pcm|L16);.*rate=24000/.test(a.mimeType||'')||typeof a.data!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(a.data)){fail('O Gemini retornou áudio inválido.');return;}
    const pcm=Buffer.from(a.data,'base64');if(!pcm.length||pcm.length%2||(bytes+=pcm.length)>1500000){fail('O Gemini retornou áudio inválido.');return;}audio.push(pcm);
   }
   if(c.generationComplete)generated=true;
   release();
   if(c.turnComplete){
    providerFinished=true;
    if(!interrupted&&!released&&(output||bytes)){generated=true;release();if(!released&&!closed)fail('A transcrição de voz está indisponível.');}
    if(interrupted){const nextInput=input;clearTurn();input=nextInput;}
    if(queuedText&&!closed){const next=queuedText;queuedText='';textTurn(next);}
   }
  }catch{fail('A conexão de voz retornou dados inválidos.');}
 });
 upstream.on('error',()=>fail('Não foi possível conectar à voz do Gemini. Verifique a conexão e tente novamente.'));
 upstream.on('close',code=>{if(!closed)fail(code===1008?'A voz gratuita está indisponível ou sua cota foi atingida. Tente mais tarde.':'A conexão de voz foi encerrada. Você pode tentar novamente.');});
 client.on('message',raw=>{
  if(closed)return;
  if(Date.now()-windowStart>=1000){windowStart=Date.now();frames=frameBytes=0;}
  if(++frames>60){client.close(1008,'Limite de mensagens');cleanup();return;}
  try{
   const p=JSON.parse(raw.toString());
   if(p.type==='realtime_audio'){
    if(typeof p.pcmBase64!=='string'||p.pcmBase64.length>12000||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.pcmBase64))throw Error();
    const b=Buffer.from(p.pcmBase64,'base64');if(!b.length||b.length%2)throw Error();
    if((frameBytes+=b.length)>128000)throw Error();
    forward({realtimeInput:{audio:{data:p.pcmBase64,mimeType:'audio/pcm;rate=16000'}}});
   }else if(p.type==='audio_stream_end')forward({realtimeInput:{audioStreamEnd:true}});
   else if(p.type==='realtime_text'){
    if(typeof p.text!=='string'||!p.text.trim()||p.text.length>4000)throw Error();
    if(isEmergency(p.text)){emergency();return;}
    if(!providerFinished){if(released&&!queuedText)queuedText=p.text.trim();return;}
    textTurn(p.text.trim());
   }else throw Error();
  }catch{client.close(1008,'Mensagem inválida');cleanup();}
 });
 return {close:()=>{client.close(1000);cleanup();}};
}
