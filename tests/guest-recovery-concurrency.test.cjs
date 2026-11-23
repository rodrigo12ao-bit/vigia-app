const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');

function load(file,imports={}){
 const module={exports:{}};
 const code=transformSync(readFileSync(file,'utf8'),{loader:'ts',format:'cjs'}).code;
 new Function('module','exports','require',code)(module,module.exports,name=>{assert.ok(name in imports,'Unexpected import '+name);return imports[name];});
 return module.exports;
}
function tab(){const history=load('src/lib/historyStore.ts');return {history,recovery:load('src/lib/guestHistoryRecovery.ts',{'./historyStore':history})};}
function storage(rows=new Map(),hooks={}){
 return {rows,get length(){return rows.size;},key:index=>[...rows.keys()][index]??null,getItem(key){hooks.get?.(key);return rows.get(key)??null;},setItem(key,value){hooks.set?.(key,value);rows.set(key,value);},removeItem(key){hooks.remove?.(key);rows.delete(key);}};
}
const snapshot=(id,version=1,content='Synthetic response '+version)=>({id,title:'Synthetic '+id,createdAt:'2026-11-23T10:00:00.000Z',updatedAt:new Date(Date.UTC(2026,10,23,10,version)).toISOString(),messages:[{id:'u',role:'user',content:'Synthetic question',timestamp:new Date('2026-11-23T10:00:00.000Z')},{id:'a',role:'assistant',content,timestamp:new Date('2026-11-23T10:00:01.000Z')}]});
const pending=(local,recovery)=>[...local.rows].filter(([key])=>key.startsWith(recovery.guestHistoryRecoveryPrefix)).map(([key,raw])=>({key,raw,record:JSON.parse(raw)}));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const forbidden=async()=>{throw Error('Cloud storage is forbidden in this fixture.');};
function sharedLock(){
 const tails=new Map(),active=new Set(),trace=[];
 return {active,trace,request(name,action){
  trace.push({event:'requested',name});
  const operation=(tails.get(name)||Promise.resolve()).catch(()=>{}).then(async()=>{
   assert.equal(active.has(name),false,'A named lock must be exclusive.');active.add(name);trace.push({event:'acquired',name,held:[...active]});
   try{return await action();}finally{active.delete(name);trace.push({event:'released',name});}
  });
  tails.set(name,operation);
  return operation.finally(()=>{if(tails.get(name)===operation)tails.delete(name);});
 }};
}
function fakeCanonical(){
 const records=new Map();
 return {records,async load(){return [...records.values()].map(value=>structuredClone(value));},async save(value){records.set(value.id,structuredClone(value));}};
}

test('interleaved pagehide staging from separate instances preserves both conversations',async()=>{
 const a=tab(),b=tab(),rows=new Map(),localB=storage(rows);let interleaved=false;
 const localA=storage(rows,{set(){if(!interleaved){interleaved=true;b.recovery.stageGuestHistory(snapshot('b'),localB);}}});
 a.recovery.stageGuestHistory(snapshot('a'),localA);
 assert.equal(rows.has(a.recovery.guestHistoryRecoveryKey),false);
 assert.deepEqual(new Set(pending(localA,a.recovery).map(entry=>entry.record.id)),new Set(['a','b']));
 const locks=sharedLock(),ports={read:forbidden,write:forbidden,remove:forbidden};
 const storeA=a.history.createHistoryStore(ports,localA,{locks}),storeB=b.history.createHistoryStore(ports,localB,{locks});
 await Promise.all([a.recovery.recoverGuestHistory(storeA,localA),b.recovery.recoverGuestHistory(storeB,localB)]);
 assert.deepEqual(new Set((await storeA.load()).map(record=>record.id)),new Set(['a','b']));
 assert.deepEqual(pending(localA,a.recovery),[]);
});

test('older recovery completion cannot clear a newer snapshot or another conversation staged while saving',async()=>{
 const a=tab(),b=tab(),rows=new Map(),localA=storage(rows),localB=storage(rows),wait=deferred(),canonical=fakeCanonical();
 a.recovery.stageGuestHistory(snapshot('one',1),localA);const oldEntry=pending(localA,a.recovery)[0];
 const recovering=a.recovery.recoverGuestHistory({load:canonical.load,save:async record=>{await wait.promise;await canonical.save(record);}},localA);
 await tick();b.recovery.stageGuestHistory(snapshot('one',2),localB);b.recovery.stageGuestHistory(snapshot('other',1),localB);
 const freshEntries=pending(localB,b.recovery).filter(entry=>entry.key!==oldEntry.key);
 wait.resolve();await recovering;
 assert.equal(localA.getItem(oldEntry.key),null);
 for(const entry of freshEntries)assert.equal(localA.getItem(entry.key),entry.raw);
 await b.recovery.recoverGuestHistory(canonical,localB);
 assert.equal(canonical.records.get('one').messages[1].content,'Synthetic response 2');assert.ok(canonical.records.has('other'));
 assert.deepEqual(pending(localB,b.recovery),[]);
});

test('staging immutable snapshots never changes or removes an already staged snapshot',()=>{
 const a=tab(),local=storage(),source=snapshot('one',2);a.recovery.stageGuestHistory(source,local);
 const first=pending(local,a.recovery)[0];source.messages[1].content='Changed outside storage';
 a.recovery.stageGuestHistory(snapshot('one',1),local);a.recovery.stageGuestHistory(snapshot('two'),local);
 assert.equal(local.getItem(first.key),first.raw);assert.equal(pending(local,a.recovery).length,3);
 assert.equal(JSON.parse(first.raw).messages[1].content,'Synthetic response 2');
});

test('legacy v1 and new v2 snapshots recover together without retaining consumed copies',async()=>{
 const a=tab(),local=storage(),canonical=fakeCanonical();
 local.setItem(a.recovery.guestHistoryRecoveryKey,JSON.stringify([snapshot('legacy-a'),snapshot('legacy-b')]));
 a.recovery.stageGuestHistory(snapshot('new-v2'),local);await a.recovery.recoverGuestHistory(canonical,local);
 assert.deepEqual(new Set(canonical.records.keys()),new Set(['legacy-a','legacy-b','new-v2']));
 assert.equal(local.getItem(a.recovery.guestHistoryRecoveryKey),null);assert.equal(local.length,0,'No retained payload markers');
});

test('a partially failed legacy batch preserves the entire original until a successful retry',async()=>{
 const a=tab(),local=storage(),canonical=fakeCanonical();let fail=true;
 const raw=JSON.stringify([snapshot('first'),snapshot('second')]);local.setItem(a.recovery.guestHistoryRecoveryKey,raw);
 const store={load:canonical.load,save:async record=>{if(record.id==='second'&&fail)throw Error('Synthetic write failure');await canonical.save(record);}};
 await assert.rejects(a.recovery.recoverGuestHistory(store,local),/write failure/);
 assert.equal(local.getItem(a.recovery.guestHistoryRecoveryKey),raw);assert.ok(canonical.records.has('first'));assert.equal(canonical.records.has('second'),false);
 fail=false;await tab().recovery.recoverGuestHistory(store,local);assert.equal(local.getItem(a.recovery.guestHistoryRecoveryKey),null);assert.equal(canonical.records.size,2);
});

test('a legacy representation changed before completion is preserved instead of clearing unseen data',async()=>{
 const a=tab(),local=storage(),canonical=fakeCanonical(),wait=deferred();
 local.setItem(a.recovery.guestHistoryRecoveryKey,JSON.stringify([snapshot('one')]));
 const recovering=a.recovery.recoverGuestHistory({load:canonical.load,save:async record=>{await wait.promise;await canonical.save(record);}},local);
 await tick();const replacement=JSON.stringify([snapshot('one',2),snapshot('unseen')]);local.setItem(a.recovery.guestHistoryRecoveryKey,replacement);
 wait.resolve();await recovering;assert.equal(local.getItem(a.recovery.guestHistoryRecoveryKey),replacement);
});

test('malformed v2 data stops recovery before any save and leaves valid snapshots untouched',async()=>{
 const a=tab(),local=storage(),canonical=fakeCanonical();a.recovery.stageGuestHistory(snapshot('valid'),local);
 local.setItem(a.recovery.guestHistoryRecoveryPrefix+'corrupt','{broken');const before=[...local.rows];
 await assert.rejects(a.recovery.recoverGuestHistory(canonical,local));assert.equal(canonical.records.size,0);assert.deepEqual([...local.rows],before);
});

test('malformed v1 data blocks staging and remains available for manual recovery',()=>{
 const a=tab(),local=storage();local.setItem(a.recovery.guestHistoryRecoveryKey,'not-json');const before=[...local.rows];
 assert.throws(()=>a.recovery.stageGuestHistory(snapshot('new'),local));assert.deepEqual([...local.rows],before);
});

test('two conflicting snapshots at the same instant retain both versions',async()=>{
 const a=tab(),local=storage(),canonical=fakeCanonical();a.recovery.stageGuestHistory(snapshot('one',1,'First version'),local);
 const second=snapshot('one',1,'Different version');second.updatedAt='2026-11-23T07:01:00.000-03:00';a.recovery.stageGuestHistory(second,local);
 await assert.rejects(a.recovery.recoverGuestHistory(canonical,local),/duas versões/);
 assert.equal(canonical.records.get('one').messages[1].content,'First version');
 assert.equal(pending(local,a.recovery)[0].record.messages[1].content,'Different version');
});

test('quota failure on a new snapshot cannot evict an older pending snapshot',()=>{
 const a=tab(),rows=new Map(),local=storage(rows);a.recovery.stageGuestHistory(snapshot('existing'),local);const before=[...rows];
 const full=storage(rows,{set(){throw new DOMException('Synthetic full storage','QuotaExceededError');}});
 assert.throws(()=>a.recovery.stageGuestHistory(snapshot('new'),full),/full storage/);assert.deepEqual([...rows],before);
});

test('discard removes only the selected conversation and refuses an unrecovered legacy target',()=>{
 const a=tab(),local=storage();a.recovery.stageGuestHistory(snapshot('delete',1),local);a.recovery.stageGuestHistory(snapshot('delete',2),local);a.recovery.stageGuestHistory(snapshot('keep'),local);
 const other=pending(local,a.recovery).find(entry=>entry.record.id==='keep');local.setItem('unrelated-setting','preserve');
 a.recovery.discardGuestHistory('delete',local);assert.equal(local.getItem(other.key),other.raw);assert.equal(local.getItem('unrelated-setting'),'preserve');assert.equal(pending(local,a.recovery).length,1);
 const raw=JSON.stringify([snapshot('legacy-target')]);local.setItem(a.recovery.guestHistoryRecoveryKey,raw);
 assert.throws(()=>a.recovery.discardGuestHistory('legacy-target',local),/Recupere/);assert.equal(local.getItem(a.recovery.guestHistoryRecoveryKey),raw);
});

test('a snapshot unexpectedly replaced under the same key is not deleted by an older recovery',async()=>{
 const a=tab(),local=storage(),canonical=fakeCanonical(),wait=deferred();a.recovery.stageGuestHistory(snapshot('one'),local);const old=pending(local,a.recovery)[0];
 const recovering=a.recovery.recoverGuestHistory({load:canonical.load,save:async record=>{await wait.promise;await canonical.save(record);}},local);
 await tick();const changed=JSON.stringify(snapshot('one',2));local.setItem(old.key,changed);wait.resolve();await recovering;
 assert.equal(local.getItem(old.key),changed);
});

test('account change after a canonical save still preserves the pending recovery snapshot',async()=>{
 const a=tab(),local=storage(),canonical=fakeCanonical();let current=true;a.recovery.stageGuestHistory(snapshot('one'),local);const before=[...local.rows];
 await assert.rejects(a.recovery.recoverGuestHistory({load:canonical.load,save:async record=>{await canonical.save(record);current=false;}},local,()=>current),/conta mudou/);
 assert.ok(canonical.records.has('one'));assert.deepEqual([...local.rows],before);
});

for(const format of ['v1','v2']){
 test(format+': deletion waits for a suspended recovery in another instance and the deleted ID stays absent',{timeout:5000},async()=>{
  const a=tab(),b=tab(),rows=new Map(),localA=storage(rows),localB=storage(rows),locks=sharedLock();
  const ports={read:forbidden,write:forbidden,remove:forbidden};
  const storeA=a.history.createHistoryStore(ports,localA,{locks}),storeB=b.history.createHistoryStore(ports,localB,{locks});
  await storeA.save(snapshot('unrelated'));
  if(format==='v1')localA.setItem(a.recovery.guestHistoryRecoveryKey,JSON.stringify([snapshot('deleted')]));
  else a.recovery.stageGuestHistory(snapshot('deleted'),localA);
  locks.trace.length=0;
  const entered=deferred(),resume=deferred();let paused=false,deleted=false;
  const slowStore={...storeB,load:async()=>{const captured=await storeB.load();if(!paused){paused=true;entered.resolve();await resume.promise;}return captured;}};
  const recovering=b.recovery.recoverGuestHistory(slowStore,localB,()=>true,{locks});
  await entered.promise;
  const deleting=a.recovery.deleteGuestHistory(storeA,localA,'deleted',()=>true,{locks});
  deleting.then(()=>{deleted=true;});await tick();
  assert.equal(deleted,false,'Deletion must not overtake a recovery holding a captured snapshot.');
  assert.ok(locks.active.has(a.recovery.guestHistoryRecoveryLockName));
  resume.resolve();await Promise.all([recovering,deleting]);
  await Promise.all([a.recovery.recoverGuestHistory(storeA,localA,()=>true,{locks}),b.recovery.recoverGuestHistory(storeB,localB,()=>true,{locks})]);
  assert.deepEqual((await storeA.load()).map(record=>record.id),['unrelated']);
  assert.equal(localA.getItem(a.recovery.guestHistoryRecoveryKey),null);assert.deepEqual(pending(localA,a.recovery),[]);
  assert.equal(locks.active.size,0);
  const canonicalAcquisitions=locks.trace.filter(entry=>entry.event==='acquired'&&entry.name===a.history.guestHistoryLockName);
  assert.ok(canonicalAcquisitions.length>=2);assert.ok(canonicalAcquisitions.every(entry=>entry.held.includes(a.recovery.guestHistoryRecoveryLockName)),'Nested writes must acquire recovery before canonical.');
 });

 test(format+': a recovery queued during deletion cannot enumerate snapshots before the delete lock is released',{timeout:5000},async()=>{
  const a=tab(),b=tab(),rows=new Map(),localA=storage(rows),readsB=[];
  const localB=storage(rows,{get:key=>{readsB.push(key);}}),locks=sharedLock(),ports={read:forbidden,write:forbidden,remove:forbidden};
  const storeA=a.history.createHistoryStore(ports,localA,{locks}),storeB=b.history.createHistoryStore(ports,localB,{locks});
  if(format==='v1')localA.setItem(a.recovery.guestHistoryRecoveryKey,JSON.stringify([snapshot('deleted')]));
  else a.recovery.stageGuestHistory(snapshot('deleted'),localA);
  const entered=deferred(),resume=deferred();
  const slowDelete={...storeA,remove:async id=>{entered.resolve();await resume.promise;await storeA.remove(id);}};
  const deleting=a.recovery.deleteGuestHistory(slowDelete,localA,'deleted',()=>true,{locks});
  await entered.promise;
  const recovering=b.recovery.recoverGuestHistory(storeB,localB,()=>true,{locks});
  await tick();assert.deepEqual(readsB,[],'Even snapshot enumeration belongs inside the recovery lock.');
  resume.resolve();await Promise.all([deleting,recovering]);
  assert.deepEqual(await storeA.load(),[]);assert.deepEqual(pending(localA,a.recovery),[]);assert.equal(localA.getItem(a.recovery.guestHistoryRecoveryKey),null);
  assert.equal(locks.active.size,0);
 });
}

test('the same-page recovery queue coordinates deletion without Web Locks',{timeout:5000},async()=>{
 const a=tab(),local=storage(),canonical=fakeCanonical(),entered=deferred(),resume=deferred();
 a.recovery.stageGuestHistory(snapshot('deleted'),local);
 const store={...canonical,remove:async id=>{canonical.records.delete(id);}};
 const recovering=a.recovery.recoverGuestHistory({...store,save:async record=>{entered.resolve();await resume.promise;await canonical.save(record);}},local,()=>true,{locks:null});
 await entered.promise;let removed=false;
 const deleting=a.recovery.deleteGuestHistory(store,local,'deleted',()=>true,{locks:null}).then(()=>{removed=true;});
 await tick();assert.equal(removed,false);resume.resolve();await Promise.all([recovering,deleting]);
 assert.equal(canonical.records.has('deleted'),false);assert.deepEqual(pending(local,a.recovery),[]);
});

test('failed coordinated deletion releases both locks for another instance to retry without deadlock',{timeout:5000},async()=>{
 const a=tab(),b=tab(),rows=new Map(),localA=storage(rows),localB=storage(rows),locks=sharedLock(),ports={read:forbidden,write:forbidden,remove:forbidden};
 const storeA=a.history.createHistoryStore(ports,localA,{locks}),storeB=b.history.createHistoryStore(ports,localB,{locks});
 a.recovery.stageGuestHistory(snapshot('retry'),localA);
 await assert.rejects(a.recovery.deleteGuestHistory({...storeA,remove:async()=>{throw Error('Synthetic deletion failure');}},localA,'retry',()=>true,{locks}),/deletion failure/);
 assert.equal((await storeA.load())[0].id,'retry');assert.equal(locks.active.size,0);
 await b.recovery.deleteGuestHistory(storeB,localB,'retry',()=>true,{locks});
 assert.deepEqual(await storeA.load(),[]);assert.equal(locks.active.size,0);
});
