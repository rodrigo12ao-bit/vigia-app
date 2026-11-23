import type {Response} from 'express';
import {AiUnavailable,aiErrorResponse,type AiEngine} from './realAi';

const maxAudioBytes=2400000;
const packetBytes=24000;

// A completed answer is read literally by the engine. Transport chunks are
// available immediately; no second answer or device voice is introduced here.
export async function streamCheckedSpeech(response:Response,engine:AiEngine,text:string,signal:AbortSignal):Promise<void> {
  if(signal.aborted||response.destroyed||response.writableEnded)return;
  if(!engine.speechStream)throw new AiUnavailable('configuration_blocked','A leitura por voz está indisponível.');
  if(typeof text!=='string'||!text.trim()||text.length>1500)throw new AiUnavailable('invalid_input','Texto de voz inválido ou grande demais.',400);
  let started=false,bytes=0;
  const active=()=>!signal.aborted&&!response.destroyed&&!response.writableEnded;
  const send=async(packet:object)=>{
    if(!active())throw new Error('Speech response closed');
    if(response.write(JSON.stringify(packet)+'\n'))return;
    // Respect a slow listener instead of retaining unbounded PCM in Node.
    await new Promise<void>((resolve,reject)=>{
      const cleanup=()=>{response.off('drain',drain);response.off('close',close);signal.removeEventListener('abort',close);};
      const drain=()=>{cleanup();resolve();};
      const close=()=>{cleanup();reject(new Error('Speech response closed'));};
      response.once('drain',drain);response.once('close',close);signal.addEventListener('abort',close,{once:true});
      if(!active())close();
    });
  };
  try{
    for await(const pcm of engine.speechStream(text,signal)){
      if(!active())return;
      if(!Buffer.isBuffer(pcm)||!pcm.length||pcm.length%2||pcm.toString('ascii',0,4)==='RIFF'||(bytes+=pcm.length)>maxAudioBytes)throw new AiUnavailable('invalid_response','A leitura retornou áudio inválido.');
      if(!started){
        response.setHeader('Content-Type','application/x-ndjson; charset=utf-8');
        response.setHeader('Cache-Control','no-store');
        response.setHeader('X-Content-Type-Options','nosniff');
        response.setHeader('X-Accel-Buffering','no');
        started=true;
        await send({type:'start',sampleRate:24000,encoding:'pcm_s16le'});
      }
      for(let offset=0;offset<pcm.length;offset+=packetBytes)await send({type:'audio',pcmBase64:pcm.subarray(offset,offset+packetBytes).toString('base64')});
    }
    if(!active())return;
    if(!bytes)throw new AiUnavailable('invalid_response','A leitura não retornou áudio.');
    await send({type:'done'});
    response.end();
  }catch(error){
    if(!active())return;
    if(!started)throw error; // Preserve normal HTTP errors before any audio.
    const failure=aiErrorResponse(error).body;
    try{await send({type:'error',code:failure.code,message:failure.error});}catch{/* The listener may already have closed. */}
    finally{if(!response.destroyed&&!response.writableEnded)response.end();}
  }
}
