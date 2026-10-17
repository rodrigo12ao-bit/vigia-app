const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');

// Real persistence helpers and account queue; storage/network ports are fake.
// No browser, Firebase SDK, cloud account or AI service is used.
async function loadModule(file,imports={}){
  const result=await transform(readFileSync(file,'utf8'),{loader:'ts',format:'cjs'}),module={exports:{}};
  new Function('module','exports','require',result.code)(module,module.exports,name=>{assert.ok(name in imports,`Unexpected import: ${name}`);return imports[name];});
  return module.exports;
}
const helpers=Promise.all([loadModule('src/lib/conversationState.ts'),loadModule('src/lib/historyStore.ts')]).then(async([conversation,history])=>({conversation,history,recovery:await loadModule('src/lib/guestHistoryRecovery.ts',{'./historyStore':history})}));
const messages=content=>[{id:'u',role:'user',content:'Pergunta fictícia',timestamp:new Date('2026-10-15T12:00:00Z')},{id:'a',role:'assistant',content,timestamp:new Date('2026-10-15T12:00:01Z')}];
const session=(id='one',content='Resposta fictícia',updatedAt='2026-10-15T12:01:00.000Z')=>({id,title:'Título preservado',createdAt:'2026-01-01T00:00:00.000Z',updatedAt,messages:messages(content)});
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
test('a remounted composer observes an older completed submission and its newer draft stays intact',async()=>{
  const {conversation}=await helpers,memory=conversation.createConversationMemory();
  conversation.updateConversationDraft(memory,{text:'Mensagem enviada'});
  let visible;const unsubscribe=conversation.subscribeConversationDraft(memory,()=>{visible=memory.draft.text;});
  assert.equal(visible,'Mensagem enviada');conversation.updateConversationDraft(memory,{text:''});assert.equal(visible,'');
  conversation.updateConversationDraft(memory,{text:'Próxima mensagem'});assert.equal(visible,'Próxima mensagem');
  unsubscribe();conversation.updateConversationDraft(memory,{text:'Após desmontagem'});assert.equal(visible,'Próxima mensagem');
});
async function fixture(){
  const h=await helpers,local=storage(),store=h.history.createHistoryStore({read:async()=>{throw Error('Cloud is not allowed.');},write:async()=>{throw Error('Cloud is not allowed.');},remove:async()=>{throw Error('Cloud is not allowed.');}},local);
  return {...h,local,store};
}

test('a completed response gets an ID and snapshot before any 500 ms debounce',async()=>{
  const {conversation}=await helpers,memory=conversation.createConversationMemory();memory.historyReady=true;
  const content=messages('Resposta completa');conversation.queueConversationSnapshot(memory,content);
  assert.ok(memory.metadata.current.id);assert.equal(memory.pendingSave.current.session.messages[1].content,'Resposta completa');
  content[1].content='Mutation outside the snapshot';assert.equal(memory.pendingSave.current.session.messages[1].content,'Resposta completa');
});

test('the same App-owned memory keeps ID, title and creation across Chat unmount/remount',async()=>{
  const {conversation}=await helpers,memory=conversation.createConversationMemory();memory.historyReady=true;
  conversation.queueConversationSnapshot(memory,messages('Primeiro turno'));
  const metadata={...memory.metadata.current};memory.pendingSave.current=null;
  memory.draft.text='Rascunho não enviado';
  // Changing tabs reuses memory but can mount an entirely new Chat component.
  conversation.queueConversationSnapshot(memory,messages('Segundo turno'));
  assert.deepEqual(memory.metadata.current,metadata);assert.equal(memory.pendingSave.current.session.id,metadata.id);
  assert.equal(memory.draft.text,'Rascunho não enviado');
});

test('opening a stored session does not overwrite it; its next turn keeps the original metadata',async()=>{
  const {conversation}=await helpers,memory=conversation.createConversationMemory('synthetic-account-a'),loaded=session();
  memory.historyReady=true;memory.metadata.current={id:loaded.id,title:loaded.title,createdAt:loaded.createdAt};memory.restoredMessages.current=loaded.messages;
  conversation.queueConversationSnapshot(memory,loaded.messages);assert.equal(memory.pendingSave.current,null);
  conversation.queueConversationSnapshot(memory,[...loaded.messages,...messages('Novo turno')]);
  assert.equal(memory.pendingSave.current.uid,'synthetic-account-a');assert.equal(memory.pendingSave.current.session.title,loaded.title);assert.equal(memory.pendingSave.current.session.createdAt,loaded.createdAt);
});

test('loading or unavailable history cannot queue an incomplete or speculative snapshot',async()=>{
  const {conversation}=await helpers,memory=conversation.createConversationMemory();
  conversation.queueConversationSnapshot(memory,messages('Completa'));assert.equal(memory.pendingSave.current,null);
  memory.historyReady=true;conversation.queueConversationSnapshot(memory,messages('Parcial'),true);assert.equal(memory.pendingSave.current,null);
});

test('new account and new conversation memory do not inherit ID, pending data or drafts',async()=>{
  const {conversation}=await helpers,old=conversation.createConversationMemory('a');old.historyReady=true;old.draft.text='Privado A';conversation.queueConversationSnapshot(old,messages('Conta A'));
  for(const uid of ['b',undefined,'a']){
    const next=conversation.createConversationMemory(uid);assert.equal(next.metadata.current,null);assert.equal(next.pendingSave.current,null);assert.equal(next.draft.text,'');assert.notEqual(next,old);
  }
});

test('successive completed snapshots have strictly increasing timestamps even within one millisecond',async()=>{
  const {conversation}=await helpers,memory=conversation.createConversationMemory();memory.historyReady=true;memory.updatedAt=Date.now()+10000;
  conversation.queueConversationSnapshot(memory,messages('Um'));const first=Date.parse(memory.pendingSave.current.session.updatedAt);
  conversation.queueConversationSnapshot(memory,messages('Dois'));assert.ok(Date.parse(memory.pendingSave.current.session.updatedAt)>first);
});

test('pagehide guest staging is synchronous and survives a new page before queued writes execute',async()=>{
  const {recovery,local,store}=await fixture(),snapshot=session();
  recovery.stageGuestHistory(snapshot,local);
  assert.equal(JSON.parse(local.getItem(recovery.guestHistoryRecoveryKey))[0].id,snapshot.id);
  assert.equal((await store.load()).length,0,'The outbox does not bypass the canonical account queue.');
  await recovery.recoverGuestHistory(store,local);
  assert.equal((await store.load())[0].messages[1].content,snapshot.messages[1].content);
  assert.deepEqual(JSON.parse(local.getItem(recovery.guestHistoryRecoveryKey)),[]);
});

test('recovery preserves multiple guest conversations and canonical history metadata',async()=>{
  const {recovery,local,store}=await fixture();await store.save(session('original'));
  recovery.stageGuestHistory(session('second'),local);recovery.stageGuestHistory(session('third'),local);
  await recovery.recoverGuestHistory(store,local);
  assert.deepEqual(new Set((await store.load()).map(s=>s.id)),new Set(['original','second','third']));
  assert.equal((await store.load()).find(s=>s.id==='second').title,'Título preservado');
});

test('an older outbox cannot overwrite a newer canonical conversation',async()=>{
  const {recovery,local,store}=await fixture();await store.save(session('one','Atual','2026-10-15T12:03:00.000Z'));
  recovery.stageGuestHistory(session('one','Antiga','2026-10-15T12:01:00.000Z'),local);
  await recovery.recoverGuestHistory(store,local);assert.equal((await store.load())[0].messages[1].content,'Atual');
});

test('a newer outbox staged during recovery is not cleared by completion of the older save',async()=>{
  const {recovery,local}=await fixture(),wait=deferred(),records=[];
  recovery.stageGuestHistory(session('one','Antiga','2026-10-15T12:01:00.000Z'),local);
  const pending=recovery.recoverGuestHistory({load:async()=>[],save:async value=>{records.push(value);await wait.promise;}},local);
  await new Promise(resolve=>setImmediate(resolve));
  recovery.stageGuestHistory(session('one','Nova','2026-10-15T12:02:00.000Z'),local);wait.resolve();await pending;
  const remaining=JSON.parse(local.getItem(recovery.guestHistoryRecoveryKey));assert.equal(remaining[0].messages[1].content,'Nova');assert.equal(records.length,1);
});

test('account changes during recovery do not write or remove the guest snapshot',async()=>{
  const {recovery,local}=await fixture(),wait=deferred();let current=true,writes=0;
  recovery.stageGuestHistory(session(),local);
  const pending=recovery.recoverGuestHistory({load:()=>wait.promise,save:async()=>{writes++;}},local,()=>current);
  current=false;wait.resolve([]);await assert.rejects(pending,/conta mudou/);
  assert.equal(writes,0);assert.equal(JSON.parse(local.getItem(recovery.guestHistoryRecoveryKey)).length,1);
});

test('storage failure and conflicting snapshots preserve the previous data instead of forcing an overwrite',async()=>{
  const {recovery,local,store}=await fixture();await store.save(session('one','Versão canônica'));
  recovery.stageGuestHistory(session('one','Outra versão no mesmo instante'),local);
  const before=local.getItem(recovery.guestHistoryRecoveryKey);
  await assert.rejects(recovery.recoverGuestHistory(store,local),/duas versões/);
  assert.equal((await store.load())[0].messages[1].content,'Versão canônica');assert.equal(local.getItem(recovery.guestHistoryRecoveryKey),before);
  assert.throws(()=>recovery.stageGuestHistory(session('two'),{getItem:()=>null,setItem:()=>{throw Error('Storage full');}}),/Storage full/);
});

test('malformed recovery data is retained and fails honestly',async()=>{
  const {recovery,local,store}=await fixture();local.setItem(recovery.guestHistoryRecoveryKey,'{broken');
  await assert.rejects(recovery.recoverGuestHistory(store,local));assert.equal(local.getItem(recovery.guestHistoryRecoveryKey),'{broken');
});

test('PWA preparation blocks active voice, pending answers, drafts and unavailable history',async()=>{
  const {conversation}=await helpers,memory=conversation.createConversationMemory();memory.historyReady=true;
  assert.throws(()=>conversation.requireConversationReadyForUpdate(memory,[],{mode:'live',loading:false}),/voz/);
  assert.throws(()=>conversation.requireConversationReadyForUpdate(memory,[],{mode:'text',loading:true}),/resposta/);
  memory.draft.text='Não enviada';assert.throws(()=>conversation.requireConversationReadyForUpdate(memory,[],{mode:'text',loading:false}),/rascunho/);
  memory.draft.text='';memory.draft.image={data:'synthetic',mimeType:'image/png',previewUrl:'synthetic'};
  assert.throws(()=>conversation.requireConversationReadyForUpdate(memory,[],{mode:'text',loading:false}),/rascunho/);
  memory.draft.image=null;memory.historyReady=false;
  assert.throws(()=>conversation.requireConversationReadyForUpdate(memory,messages('Salva?'),{mode:'text',loading:false}),/histórico/);
});

test('PWA preparation waits for cloud confirmation and rechecks account/state afterwards',async()=>{
  const {conversation}=await helpers,wait=deferred();let current=true,checks=0,done=false;
  const pending=conversation.flushConversationForUpdate(()=>wait.promise,()=>{checks++;if(!current)throw Error('A conta mudou.');});
  pending.then(()=>{done=true;},()=>{});await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);
  current=false;wait.resolve();await assert.rejects(pending,/conta mudou/);assert.equal(checks,2);assert.equal(done,false);
});

test('an offline cloud write cannot keep the update button waiting forever or force a reload',async()=>{
  const {conversation}=await helpers,wait=deferred();let checks=0;
  await assert.rejects(conversation.flushConversationForUpdate(()=>wait.promise,()=>{checks++;},15),/ainda não foi confirmado/);
  assert.equal(checks,1);wait.resolve();
});

test('confirmed autosave updates the history list without reading unrelated conversations again',async()=>{
  const {conversation}=await helpers,older=session('a','Antiga','2026-10-15T12:01:00.000Z'),other=session('b','Outra','2026-10-15T12:02:00.000Z'),saved=session('a','Nova','2026-10-15T12:03:00.000Z');
  const list=conversation.mergeSavedSession([other,older],saved);
  assert.deepEqual(list.map(value=>value.id),['a','b']);assert.equal(list[0],saved);assert.equal(list[1],other);
  assert.equal(list[0].createdAt,older.createdAt);assert.equal(list[0].messages[1].content,'Nova');
});

test('a long voice conversation preserves its final complete turn and cannot exceed the storage limit',async()=>{
  const {conversation}=await helpers;
  const previous=Array.from({length:197},(_,index)=>({id:String(index),role:index%2?'user':'assistant',content:'Conteúdo fictício '+index,timestamp:new Date()}));
  const completed=conversation.appendVoiceTurn(previous,'Última pergunta','Última resposta verificada');
  assert.equal(completed.length,199);assert.deepEqual(completed.slice(0,197),previous);assert.equal(completed.at(-1).content,'Última resposta verificada');
  assert.equal(conversation.appendVoiceTurn(completed,'Excedente','Não adicionar'),completed);
  const at198=[...previous,previous[0]],at200=conversation.appendVoiceTurn(at198,'Permitida','Inteira');assert.equal(at200.length,200);assert.equal(conversation.appendVoiceTurn(at200,'Não','Adicionar'),at200);
});
