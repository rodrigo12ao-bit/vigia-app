const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadHistoryModule,memoryStorage,historySession}=require('./helpers/history-fixture.cjs');
const noCloud={read:async()=>{throw Error('No cloud.');},write:async()=>{throw Error('No cloud.');},remove:async()=>{throw Error('No cloud.');}};

test('separate store modules use one named Web Lock around the whole guest mutation',async()=>{
  const [first,second]=await Promise.all([loadHistoryModule('src/lib/historyStore.ts'),loadHistoryModule('src/lib/historyStore.ts')]);
  const local=memoryStorage(),requests=[];let tail=Promise.resolve(),active=0,maxActive=0;
  const locks={request(name,action){requests.push(name);const operation=tail.then(async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setImmediate(resolve));try{return await action();}finally{active--;}});tail=operation.catch(()=>{});return operation;}};
  const firstStore=first.createHistoryStore(noCloud,local,{locks}),secondStore=second.createHistoryStore(noCloud,local,{locks});
  await Promise.all([firstStore.save(historySession('one')),secondStore.save(historySession('two'))]);
  await Promise.all([firstStore.renameGuest('one','Renomeada'),secondStore.remove('two')]);
  assert.deepEqual(requests,Array(4).fill(first.guestHistoryLockName));assert.equal(maxActive,1);
  const saved=await firstStore.load();assert.equal(saved.length,1);assert.equal(saved[0].id,'one');assert.equal(saved[0].title,'Renomeada');assert.equal(saved[0].messages.length,2);
});

test('the no-Web-Locks fallback preserves independent writes from multiple instances in this page',async()=>{
  const history=await loadHistoryModule('src/lib/historyStore.ts'),local=memoryStorage();
  const stores=Array.from({length:6},()=>history.createHistoryStore(noCloud,local,{locks:null}));
  await Promise.all(stores.map((store,index)=>store.save(historySession('s'+index))));
  assert.equal((await stores[0].load()).length,6);
  await Promise.all([stores[0].remove('s0'),stores[1].save(historySession('s6'))]);
  const ids=(await stores[0].load()).map(session=>session.id);assert.ok(!ids.includes('s0'));assert.ok(ids.includes('s6'));assert.equal(ids.length,6);
});

test('same-ID saves keep the existing last-write behavior without an unresolved conflict lock',async()=>{
  const history=await loadHistoryModule('src/lib/historyStore.ts'),local=memoryStorage(),store=history.createHistoryStore(noCloud,local,{locks:null});
  await store.save(historySession('same',2,3));
  await store.save(historySession('same',1,1));
  assert.equal((await store.load())[0].messages.length,2);
  await store.save(historySession('same',3,4));assert.equal((await store.load())[0].messages.length,6);
});

test('a denied Web Lock fails without silently falling back to an uncoordinated write',async()=>{
  const history=await loadHistoryModule('src/lib/historyStore.ts'),local=memoryStorage();
  const store=history.createHistoryStore(noCloud,local,{locks:{request:async()=>{throw Error('Lock unavailable');}}});
  await assert.rejects(store.save(historySession()),/Lock unavailable/);assert.equal(local.getItem(history.guestHistoryKey),null);
});
