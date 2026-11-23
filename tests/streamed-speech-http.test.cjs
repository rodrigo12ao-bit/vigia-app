const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
require('../scripts/register-test-typescript.cjs');
const {streamCheckedSpeech}=require('../server/streamedSpeech.ts');
const {AiUnavailable}=require('../server/realAi.ts');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
class ResponsePort extends EventEmitter {
  headers=new Map();packets=[];destroyed=false;writableEnded=false;headersSent=false;backpressure=false;
  setHeader(name,value){assert.equal(this.headersSent,false);this.headers.set(name.toLowerCase(),value);}
  write(line){this.headersSent=true;assert.ok(line.endsWith('\n'));this.packets.push(JSON.parse(line));return !this.backpressure;}
  end(){this.writableEnded=true;}
}
const engine=speechStream=>({speechStream});

test('HTTP reading emits the first PCM before synthesis finishes and preserves ordered sample boundaries',async()=>{
  const tail=deferred(),response=new ResponsePort(),abort=new AbortController();
  const first=Buffer.alloc(48002,3),last=Buffer.alloc(120,5);
  const run=streamCheckedSpeech(response,engine(async function*(){yield first;await tail.promise;yield last;}),'Resposta verificada.',abort.signal);
  await flush();
  assert.equal(response.headers.get('content-type'),'application/x-ndjson; charset=utf-8');
  assert.deepEqual(response.packets[0],{type:'start',sampleRate:24000,encoding:'pcm_s16le'});
  assert.equal(response.writableEnded,false);assert.equal(response.packets.some(packet=>packet.type==='done'),false);
  assert.deepEqual(Buffer.concat(response.packets.filter(packet=>packet.type==='audio').map(packet=>Buffer.from(packet.pcmBase64,'base64'))),first);
  tail.resolve();await run;
  assert.equal(response.packets.at(-1).type,'done');assert.equal(response.writableEnded,true);
  const audio=response.packets.filter(packet=>packet.type==='audio').map(packet=>Buffer.from(packet.pcmBase64,'base64'));
  assert.ok(audio.every(chunk=>chunk.length<=24000&&chunk.length%2===0));assert.deepEqual(Buffer.concat(audio),Buffer.concat([first,last]));
});

test('a provider failure before PCM keeps HTTP error handling available',async()=>{
  const response=new ResponsePort();
  await assert.rejects(streamCheckedSpeech(response,engine(async function*(){throw new AiUnavailable('quota_unavailable','Cota fictícia indisponível.');}),'Texto.',new AbortController().signal),error=>error.code==='quota_unavailable');
  assert.equal(response.headersSent,false);assert.deepEqual(response.packets,[]);
});

test('a failure after PCM has one terminal error and never repeats synthesis or reports done',async()=>{
  let calls=0;const response=new ResponsePort();
  await streamCheckedSpeech(response,engine(async function*(){calls++;yield Buffer.alloc(100,1);throw new AiUnavailable('provider_unavailable','Falha fictícia de voz.');}),'Texto.',new AbortController().signal);
  assert.equal(calls,1);assert.deepEqual(response.packets.map(packet=>packet.type),['start','audio','error']);
  assert.equal(response.packets.at(-1).code,'provider_unavailable');assert.equal(response.writableEnded,true);
});

test('malformed, oversized or missing PCM never becomes a completed reading',async()=>{
  for(const chunk of [Buffer.alloc(0),Buffer.alloc(3),Buffer.from('RIFF0000'),Buffer.alloc(2400002),'not PCM']){
    const response=new ResponsePort();
    await assert.rejects(streamCheckedSpeech(response,engine(async function*(){yield chunk;}),'Texto.',new AbortController().signal));
    assert.equal(response.headersSent,false);
  }
  await assert.rejects(streamCheckedSpeech(new ResponsePort(),engine(async function*(){}),'Texto.',new AbortController().signal));
});

test('backpressure pauses generation and cancellation releases the reader without queued late audio',async()=>{
  let advanced=false,closed=false;const response=new ResponsePort(),abort=new AbortController();response.backpressure=true;
  const run=streamCheckedSpeech(response,engine(async function*(){try{yield Buffer.alloc(100,1);advanced=true;yield Buffer.alloc(100,2);}finally{closed=true;}}),'Texto.',abort.signal);
  await flush();assert.deepEqual(response.packets.map(packet=>packet.type),['start']);assert.equal(advanced,false);
  abort.abort();await run;assert.equal(closed,true);assert.equal(advanced,false);assert.equal(response.listenerCount('drain'),0);
  assert.equal(response.packets.some(packet=>packet.type==='audio'||packet.type==='done'),false);
});

test('an already cancelled request does not start the provider',async()=>{
  let calls=0;const abort=new AbortController();abort.abort();
  await streamCheckedSpeech(new ResponsePort(),engine(async function*(){calls++;yield Buffer.alloc(100); }),'Texto.',abort.signal);
  assert.equal(calls,0);
});
