const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadHistoryService,loadHistoryModule,memoryStorage,historySession}=require('./helpers/history-fixture.cjs');

async function fixture(count=61,{sameTime=false}={}) {
  const rows=new Map(),attachments=new Map(),calls=[],auth={currentUser:{uid:'history-owner'}},storage=memoryStorage();
  for(let index=0;index<count;index++){
    const id='s'+String(index).padStart(3,'0'),record=historySession(id,1,sameTime?1:index+1);
    record.separateAttachments=true;record.attachmentIds=[record.messages[0].id];rows.set(id,record);
    attachments.set(id,new Map([[record.messages[0].id,'data:image/png;base64,ZmFrZQ==']]));
  }
  const snapshot=id=>({id,exists:()=>rows.has(id),data:()=>rows.has(id)?structuredClone(rows.get(id)):undefined,ref:{path:'users/history-owner/chat_sessions/'+id}});
  const compare=(a,b)=>a.updatedAt===b.updatedAt?(a.id<b.id?1:a.id>b.id?-1:0):(a.updatedAt<b.updatedAt?1:-1);
  const firebase={
    db:{},collection:(_db,...parts)=>({kind:'collection',path:parts.join('/')}),doc:(_db,...parts)=>({kind:'document',path:parts.join('/')}),
    documentId:()=>'__name__',orderBy:(field,direction)=>({kind:'order',field,direction}),limit:count=>({kind:'limit',count}),startAfter:id=>({kind:'after',id}),
    query:(collection,...constraints)=>({...collection,constraints}),
    async getDocs(reference){
      calls.push({operation:'getDocs',...reference});
      if(reference.path.endsWith('/attachments')){
        const sessionId=reference.path.split('/').at(-2);
        return {docs:[...(attachments.get(sessionId)||new Map())].map(([id,data])=>({id,data:()=>({data}),ref:{path:reference.path+'/'+id}}))};
      }
      let list=[...rows.values()].sort(compare);
      if(reference.constraints){
        assert.deepEqual(reference.constraints.filter(item=>item.kind==='order'),[{kind:'order',field:'__name__',direction:'asc'}]);
        list.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
        const after=reference.constraints.find(item=>item.kind==='after'),limit=reference.constraints.find(item=>item.kind==='limit');
        if(after)list=list.filter(record=>record.id>after.id);
        if(limit)list=list.slice(0,limit.count);
      }
      return {docs:list.map(record=>snapshot(record.id))};
    },
    async getDoc(reference){calls.push({operation:'getDoc',...reference});return snapshot(reference.path.split('/').at(-1));},
    async updateDoc(reference,patch){calls.push({operation:'updateDoc',...reference,patch});const id=reference.path.split('/').at(-1);if(!rows.has(id))throw Error('not-found');rows.set(id,{...rows.get(id),...patch});},
    writeBatch(){
      const operations=[];
      return {set(reference,value){operations.push({operation:'set',reference,value});},delete(reference){operations.push({operation:'delete',reference});},async commit(){
        for(const operation of operations){
          calls.push(operation);const parts=operation.reference.path.split('/');
          if(parts.includes('attachments')){const id=parts.at(-3),messageId=parts.at(-1);if(operation.operation==='delete')attachments.get(id)?.delete(messageId);else{if(!attachments.has(id))attachments.set(id,new Map());attachments.get(id).set(messageId,operation.value.data);}}
          else if(operation.operation==='delete')rows.delete(parts.at(-1));else rows.set(parts.at(-1),structuredClone(operation.value));
        }
      }};
    },
  };
  return {rows,attachments,calls,auth,storage,firebase,service:await loadHistoryService({firebase,auth,storage})};
}

test('cloud history pages contain metadata only and never read attachments',async()=>{
  const f=await fixture(),first=await f.service.loadSessionPage('history-owner');
  assert.equal(first.sessions.length,25);assert.equal(first.hasMore,true);assert.equal(first.sessions[0].id,'s024');
  assert.ok(first.sessions.every(session=>!('messages' in session)&&!('attachmentIds' in session)));
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].constraints.at(-1).count,26);
  const all=await f.service.loadSessionSummaries('history-owner');
  assert.equal(all.length,61);assert.equal(new Set(all.map(session=>session.id)).size,61);
  assert.ok(f.calls.every(call=>!call.path?.endsWith('/attachments')));assert.equal(all.at(-1).id,'s000');
});

test('equal timestamps use a stable document-ID cursor without duplicates or dropped rows',async()=>{
  const f=await fixture(55,{sameTime:true});let cursor=null,seen=[],pages=0;
  do{const page=await f.service.loadSessionPage('history-owner',cursor,10);seen.push(...page.sessions.map(session=>session.id));cursor=page.cursor;pages++;}while(cursor);
  assert.equal(pages,6);assert.equal(seen.length,55);assert.equal(new Set(seen).size,55);assert.ok(seen.includes('s054'));assert.ok(seen.includes('s000'));
});

test('renaming an unseen row between pages cannot move it past the cursor',async()=>{
  const f=await fixture(35),first=await f.service.loadSessionPage('history-owner');
  await f.service.renameSession('s032','Renomeada entre páginas','history-owner');
  const second=await f.service.loadSessionPage('history-owner',first.cursor);
  assert.equal(first.sessions.length+second.sessions.length,35);assert.ok(second.sessions.some(session=>session.id==='s032'));
});

test('a legacy row without dates fails visibly instead of being excluded by an updatedAt index',async()=>{
  const f=await fixture(1),legacy=historySession('zz-legacy');delete legacy.updatedAt;f.rows.set(legacy.id,legacy);
  await assert.rejects(f.service.loadSessionPage('history-owner'),/Histórico inválido/);
  assert.ok(f.rows.has('zz-legacy'));assert.equal(f.calls.length,1);
});

test('opening one cloud conversation reads only its own attachment subcollection',async()=>{
  const f=await fixture(),session=await f.service.loadSession('s002','history-owner');
  assert.equal(session.messages[0].imageUrl,'data:image/png;base64,ZmFrZQ==');assert.ok(session.messages[0].timestamp instanceof Date);
  assert.deepEqual(f.calls.map(call=>call.path),['users/history-owner/chat_sessions/s002','users/history-owner/chat_sessions/s002/attachments']);
});

test('the explicit full-read contract still returns every image and accepts legacy inline attachments',async()=>{
  const f=await fixture(3),legacy=f.rows.get('s000');delete legacy.separateAttachments;delete legacy.attachmentIds;legacy.messages[0].imageUrl='data:image/png;base64,bGVnYWN5';f.attachments.delete('s000');
  const all=await f.service.loadSessions('history-owner');assert.equal(all.length,3);
  assert.ok(all.every(session=>session.messages[0].timestamp instanceof Date&&session.messages[0].imageUrl));
  assert.equal(all.find(session=>session.id==='s000').messages[0].imageUrl,'data:image/png;base64,bGVnYWN5');
  assert.equal(f.calls.filter(call=>call.path?.endsWith('/attachments')).length,2);
});

test('a missing attachment fails the opening without saving a partial conversation',async()=>{
  const f=await fixture(1);f.attachments.clear();const before=structuredClone(f.rows.get('s000'));
  await assert.rejects(f.service.loadSession('s000','history-owner'),/todos os anexos/);
  assert.deepEqual(f.rows.get('s000'),before);assert.ok(f.calls.every(call=>['getDoc','getDocs'].includes(call.operation)));
});

test('renaming an unloaded cloud row updates only metadata and preserves messages and images',async()=>{
  const f=await fixture(),before=structuredClone(f.rows.get('s060')),image=f.attachments.get('s060').get(before.messages[0].id);
  await f.service.loadSessionPage('history-owner');f.calls.length=0;
  const renamed=await f.service.renameSession('s060','Título novo','history-owner');
  assert.equal(renamed.title,'Título novo');assert.ok(!('messages' in renamed));
  assert.deepEqual(f.rows.get('s060').messages,before.messages);assert.deepEqual(f.rows.get('s060').attachmentIds,before.attachmentIds);
  assert.equal(f.attachments.get('s060').get(before.messages[0].id),image);
  assert.deepEqual(f.calls.map(call=>call.operation),['getDoc','updateDoc']);
  assert.deepEqual(Object.keys(f.calls[1].patch).sort(),['title','updatedAt']);
});

test('saving an opened conversation does not overwrite sessions outside the loaded page',async()=>{
  const f=await fixture(),unloaded=structuredClone(f.rows.get('s059'));
  await f.service.loadSessionPage('history-owner');const opened=await f.service.loadSession('s060','history-owner');
  opened.messages.push({id:'third-user',role:'user',content:'Mais uma pergunta',timestamp:new Date()});opened.updatedAt=new Date().toISOString();
  await f.service.saveSession(opened,'history-owner');
  assert.deepEqual(f.rows.get('s059'),unloaded);assert.equal(f.rows.size,61);assert.equal(f.rows.get('s060').messages.length,3);
  assert.equal((await f.service.loadSession('s060','history-owner')).messages[0].imageUrl,'data:image/png;base64,ZmFrZQ==');
});

test('delete-all enumerates every page, while single deletion touches only the selected ID',async()=>{
  const f=await fixture(32);await f.service.loadSessionPage('history-owner');await f.service.deleteSession('s030','history-owner');
  assert.equal(f.rows.size,31);assert.ok(f.rows.has('s000'));
  await f.service.deleteAllSessions('history-owner');assert.equal(f.rows.size,0);assert.ok([...f.attachments.values()].every(images=>images.size===0));
});

test('guest pagination retains all original messages and search metadata across pages',async()=>{
  const f=await fixture(0);f.auth.currentUser=null;
  const records=Array.from({length:58},(_,index)=>historySession('guest'+String(index).padStart(3,'0'),1,index+1));
  records[0].title='Alvo distante';f.storage.setItem('vigia_guest_chat_sessions_v1',JSON.stringify(records));
  const before=f.storage.getItem('vigia_guest_chat_sessions_v1'),first=await f.service.loadSessionPage();
  assert.equal(first.sessions.length,25);assert.ok(first.hasMore);
  const all=await f.service.loadSessionSummaries();assert.equal(all.length,58);assert.ok(all.find(session=>session.title.includes('Alvo distante')));
  assert.equal(f.storage.getItem('vigia_guest_chat_sessions_v1'),before);assert.equal(f.calls.length,0);
});

test('guest deletion consumes pending snapshots of its ID without restoring it or deleting another conversation',async()=>{
  const f=await fixture(0);f.auth.currentUser=null;
  f.storage.setItem('vigia_guest_chat_sessions_v1',JSON.stringify([historySession('deleted',1,1)]));
  f.service.stageGuestSession(historySession('deleted',2,2));f.service.stageGuestSession(historySession('other',1,3));
  await f.service.deleteSession('deleted');
  const saved=await f.service.loadSessions();assert.deepEqual(saved.map(session=>session.id),['other']);assert.equal(saved[0].messages.length,2);
  assert.ok(![...f.storage.data.keys()].some(key=>key.startsWith('vigia_guest_chat_recovery_v2:')));
});

test('failed guest outbox cleanup keeps the recovered canonical record for retry before deletion',async()=>{
  const f=await fixture(0);f.auth.currentUser=null;
  f.storage.setItem('vigia_guest_chat_sessions_v1',JSON.stringify([historySession('protected',1,1)]));
  f.service.stageGuestSession(historySession('protected',2,2));
  const remove=f.storage.removeItem;f.storage.removeItem=()=>{throw Error('Cleanup unavailable');};
  await assert.rejects(f.service.deleteSession('protected'),/Cleanup unavailable/);
  const remaining=JSON.parse(f.storage.getItem('vigia_guest_chat_sessions_v1'));
  assert.equal(remaining.length,1);assert.equal(remaining[0].id,'protected');assert.equal(remaining[0].messages.length,4);
  f.storage.removeItem=remove;await f.service.deleteSession('protected');assert.deepEqual(await f.service.loadSessions(),[]);
});

test('a page cursor cannot be reused by another account or the guest',async()=>{
  const f=await fixture(),first=await f.service.loadSessionPage('history-owner');
  f.auth.currentUser={uid:'other'};const calls=f.calls.length;
  await assert.rejects(f.service.loadSessionPage('other',first.cursor),/conta mudou/);
  f.auth.currentUser=null;await assert.rejects(f.service.loadSessionPage(undefined,first.cursor),/conta mudou/);assert.equal(f.calls.length,calls);
});

test('merging another page cannot replace a newer local rename with older metadata',async()=>{
  const history=await loadHistoryModule('src/lib/historyStore.ts'),old=historySession('same',1,1),newer={...historySession('same',2,2),title:'Título confirmado'};
  const merged=history.mergeHistorySummaries([newer],[old,historySession('other')]);
  assert.equal(merged.length,2);assert.equal(merged.find(session=>session.id==='same').title,'Título confirmado');assert.ok(merged.every(session=>!('messages' in session)));
});
