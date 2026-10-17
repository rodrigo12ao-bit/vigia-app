const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');
const bundle=transform(readFileSync('src/utils/audioWave.ts','utf8'),{loader:'ts',format:'cjs'});
async function harness(audio,{decodeError,closeError,decodePending}={}){
  let created=0,closed=0;
  class Context{
    constructor(){created++;}
    async decodeAudioData(){if(decodeError)throw decodeError;if(decodePending)return decodePending;return audio;}
    async close(){closed++;if(closeError)throw closeError;}
  }
  const module={exports:{}};
  new Function('window','module','exports',(await bundle).code)({AudioContext:Context},module,module.exports);
  return {...module.exports,counts:()=>({created,closed})};
}

test('recording becomes a complete16kHz mono WAV with stereo channels mixed',async()=>{
  const audio={duration:1,sampleRate:48000,length:48000,numberOfChannels:2,getChannelData:index=>new Float32Array(48000).fill(index?0.25:0.75)};
  const h=await harness(audio),blob=await h.recordingToWave(new Blob(['simulated recording']));
  const bytes=await blob.arrayBuffer(),view=new DataView(bytes);
  assert.equal(blob.type,'audio/wav');assert.equal(bytes.byteLength,32044);assert.equal(view.getUint32(24,true),16000);
  assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(40,true),32000);assert.equal(view.getInt16(44,true),16383);
  assert.deepEqual(h.counts(),{created:1,closed:1});
});

test('empty or oversized recordings are rejected before allocating an audio context',async()=>{
  const h=await harness(null);
  await assert.rejects(h.recordingToWave(new Blob([])),/vazia/);
  await assert.rejects(h.recordingToWave(new Blob([new Uint8Array(10000001)])),/grande/);
  assert.deepEqual(h.counts(),{created:0,closed:0});
});

test('invalid duration and samples are rejected and their audio context always closes',async()=>{
  for(const change of [{duration:0},{duration:16},{numberOfChannels:0},{sampleRate:NaN},{getChannelData:()=>new Float32Array(16000).fill(NaN)}]){
    const h=await harness({duration:1,sampleRate:16000,length:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000),...change});
    await assert.rejects(h.recordingToWave(new Blob(['recording'])));assert.equal(h.counts().closed,1);
  }
});

test('context close failure cannot replace the real decoding error',async()=>{
  const h=await harness(null,{decodeError:new Error('invalid_recording'),closeError:new Error('already_closed')});
  await assert.rejects(h.recordingToWave(new Blob(['recording'])),/invalid_recording/);assert.equal(h.counts().closed,1);
});
test('cancelling stalled decoding releases the caller and closes the obsolete audio context',async()=>{
  const h=await harness(null,{decodePending:new Promise(()=>{})}),controller=new AbortController();
  const pending=h.recordingToWave(new Blob(['recording']),controller.signal);
  await new Promise(resolve=>setImmediate(resolve));controller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');assert.ok(h.counts().closed>=1);
  const already=new AbortController();already.abort();const before=h.counts().created;
  await assert.rejects(h.recordingToWave(new Blob(['recording']),already.signal));assert.equal(h.counts().created,before);
});
