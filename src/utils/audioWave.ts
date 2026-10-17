// Convert browser recording formats into bounded mono PCM for the server.
export async function recordingToWave(blob:Blob,signal?:AbortSignal):Promise<Blob>{
  if(signal?.aborted)throw signal.reason||new DOMException('Operação cancelada.','AbortError');
  if(!blob.size||blob.size>10000000)throw Error('A gravação está vazia ou grande demais. Grave um trecho de até 15 segundos.');
  const AudioCtx=window.AudioContext||(window as any).webkitAudioContext;
  if(!AudioCtx)throw Error('Este navegador não consegue preparar a gravação.');
  const context=new AudioCtx();
  let abort:()=>void=()=>{};
  try{
    const cancelled=new Promise<never>((_resolve,reject)=>{
      abort=()=>{try{void context.close().catch(()=>undefined);}catch{}reject(signal?.reason||new DOMException('Operação cancelada.','AbortError'));};
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    });
    const decode=async()=>{const bytes=await blob.arrayBuffer();if(signal?.aborted)throw signal.reason||new DOMException('Operação cancelada.','AbortError');return context.decodeAudioData(bytes);};
    const audio=await Promise.race([decode(),cancelled]);
    if(!Number.isFinite(audio.duration)||audio.duration<=0||audio.duration>15)throw Error('Fale em trechos de até 15 segundos.');
    if(!audio.length||!audio.numberOfChannels||!Number.isFinite(audio.sampleRate)||audio.sampleRate<=0)throw Error('A gravação não contém áudio válido.');
    const rate=16000,length=Math.floor(audio.duration*rate),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer);
    const put=(offset:number,value:string)=>[...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
    put(0,'RIFF');view.setUint32(4,36+length*2,true);put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,length*2,true);
    const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i));
    for(let i=0;i<length;i++){const position=Math.min(audio.length-1,i*audio.sampleRate/rate),index=Math.floor(position),right=Math.min(audio.length-1,index+1),fraction=position-index;const mixed=channels.reduce((sum,ch)=>sum+ch[index]*(1-fraction)+ch[right]*fraction,0)/channels.length;if(!Number.isFinite(mixed))throw Error('A gravação contém áudio inválido.');const sample=Math.max(-1,Math.min(1,mixed));view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);}
    return new Blob([buffer],{type:'audio/wav'});
  }finally{signal?.removeEventListener('abort',abort);await context.close().catch(()=>undefined);}
}
