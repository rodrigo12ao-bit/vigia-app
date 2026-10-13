// Convert browser recording formats into bounded mono PCM for the server.
export async function recordingToWave(blob:Blob):Promise<Blob>{
  const AudioCtx=window.AudioContext||(window as any).webkitAudioContext;
  if(!AudioCtx)throw Error('Este navegador não consegue preparar a gravação.');
  const context=new AudioCtx();
  try{
    const audio=await context.decodeAudioData(await blob.arrayBuffer());
    if(!Number.isFinite(audio.duration)||audio.duration>15)throw Error('Fale em trechos de até 15 segundos.');
    const rate=16000,length=Math.floor(audio.duration*rate),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer);
    const put=(offset:number,value:string)=>[...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
    put(0,'RIFF');view.setUint32(4,36+length*2,true);put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,length*2,true);
    const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i));
    for(let i=0;i<length;i++){const index=Math.min(audio.length-1,Math.floor(i*audio.sampleRate/rate));const sample=Math.max(-1,Math.min(1,channels.reduce((sum,ch)=>sum+ch[index],0)/channels.length));view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);}
    return new Blob([buffer],{type:'audio/wav'});
  }finally{await context.close();}
}
