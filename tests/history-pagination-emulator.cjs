const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const firestore=require('firebase/firestore');
const {loadHistoryService,memoryStorage,historySession}=require('./helpers/history-fixture.cjs');

// Opt-in integration: run with scripts/with-review-services.cjs. Only a local
// demo project and authenticated synthetic test context are ever used.
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080','Use the isolated local review wrapper.');
const projectId='demo-vigia-history-review',uid='history-review-owner';
let env,service,db,reads=[];
before(async()=>{
  env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});
  db=env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async context=>{
    const seed=context.firestore(),batch=firestore.writeBatch(seed);
    for(let index=0;index<61;index++){
      const id='s'+String(index).padStart(3,'0'),session=historySession(id,1,1);
      batch.set(firestore.doc(seed,'users',uid,'chat_sessions',id),{...session,separateAttachments:true,attachmentIds:[session.messages[0].id]});
      batch.set(firestore.doc(seed,'users',uid,'chat_sessions',id,'attachments',session.messages[0].id),{data:'data:image/png;base64,ZmFrZQ=='});
    }
    await batch.commit();
  });
  const paths=new WeakMap(),firebase={...firestore,db,
    collection(...args){const reference=firestore.collection(...args);paths.set(reference,reference.path);return reference;},
    query(reference,...constraints){const result=firestore.query(reference,...constraints);paths.set(result,paths.get(reference));return result;},
    async getDocs(reference){reads.push(paths.get(reference));return firestore.getDocs(reference);},
    async getDoc(reference){reads.push(reference.path);return firestore.getDoc(reference);},
  };
  service=await loadHistoryService({firebase,auth:{currentUser:{uid}},storage:memoryStorage()});
});
after(async()=>{await env?.cleanup();});

test('real Firestore cursor returns every same-date document and rename cannot skip an unseen row',async()=>{
  reads=[];const first=await service.loadSessionPage(uid);assert.equal(first.sessions.length,25);assert.ok(first.hasMore);
  assert.ok(first.sessions.every(session=>!('messages' in session)));assert.ok(reads.every(path=>!path.endsWith('/attachments')));
  await service.renameSession('s032','Renomeada durante a paginação',uid);
  let cursor=first.cursor,all=[...first.sessions];
  while(cursor){const page=await service.loadSessionPage(uid,cursor);all.push(...page.sessions);cursor=page.cursor;}
  assert.equal(all.length,61);assert.equal(new Set(all.map(session=>session.id)).size,61);assert.ok(all.some(session=>session.id==='s032'&&session.title==='Renomeada durante a paginação'));
  assert.ok(reads.every(path=>!path.endsWith('/attachments')));
});

test('real Firestore loads only selected attachments and continuation preserves unvisited conversations',async()=>{
  const untouched=(await firestore.getDoc(firestore.doc(db,'users',uid,'chat_sessions','s001'))).data();
  reads=[];const selected=await service.loadSession('s000',uid);
  assert.equal(selected.messages[0].imageUrl,'data:image/png;base64,ZmFrZQ==');assert.deepEqual(reads,['users/'+uid+'/chat_sessions/s000','users/'+uid+'/chat_sessions/s000/attachments']);
  selected.messages.push(...historySession('s000',2).messages.slice(-2).map(message=>({...message,timestamp:new Date(message.timestamp)})));selected.updatedAt=new Date().toISOString();
  await service.saveSession(selected,uid);
  const reopened=await service.loadSession('s000',uid);assert.equal(reopened.messages.length,4);assert.equal(reopened.messages[0].imageUrl,'data:image/png;base64,ZmFrZQ==');
  assert.deepEqual((await firestore.getDoc(firestore.doc(db,'users',uid,'chat_sessions','s001'))).data(),untouched);
});

test('legacy malformed metadata is not silently filtered out by Firestore ordering',async()=>{
  await env.withSecurityRulesDisabled(async context=>{const legacy=historySession('00-legacy');delete legacy.updatedAt;await firestore.setDoc(firestore.doc(context.firestore(),'users',uid,'chat_sessions',legacy.id),legacy);});
  await assert.rejects(service.loadSessionPage(uid),/Histórico inválido/);
  assert.ok((await firestore.getDoc(firestore.doc(db,'users',uid,'chat_sessions','00-legacy'))).exists());
  await firestore.deleteDoc(firestore.doc(db,'users',uid,'chat_sessions','00-legacy'));
});

test('delete-all reaches every page and removes each attachment subcollection',async()=>{
  await service.deleteAllSessions(uid);
  assert.equal((await firestore.getDocs(firestore.collection(db,'users',uid,'chat_sessions'))).size,0);
  for(const id of ['s000','s030','s060'])assert.equal((await firestore.getDocs(firestore.collection(db,'users',uid,'chat_sessions',id,'attachments'))).size,0);
});
