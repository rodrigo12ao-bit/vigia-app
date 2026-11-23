const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadHistoryModule,memoryStorage,historySession}=require('./helpers/history-fixture.cjs');
const helpers=Promise.all([loadHistoryModule('src/lib/conversationState.ts'),loadHistoryModule('src/lib/historyStore.ts')]).then(async([conversation,history])=>({conversation,history,voice:await loadHistoryModule('src/lib/voiceConversationState.ts',{'./conversationState':conversation})}));
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const noCloud={read:async()=>{throw Error('No cloud.');},write:async()=>{throw Error('No cloud.');},remove:async()=>{throw Error('No cloud.');}};

test('reopening the current text conversation flushes turn two, then preserves one + two + three',async()=>{
  const {conversation,history}=await helpers,memory=conversation.createConversationMemory();memory.historyReady=true;
  const store=history.createHistoryStore(noCloud,memoryStorage(),{locks:null});
  const content=turns=>history.deserializeSession(historySession('text',turns)).messages;
  const flush=async()=>{while(memory.pendingSave.current){const pending=memory.pendingSave.current;await store.save(pending.session);memory.savedSession=pending.session;if(memory.pendingSave.current===pending)memory.pendingSave.current=null;}};
  conversation.queueConversationSnapshot(memory,content(1));await flush();
  const oldListItem=history.summarizeSession(memory.savedSession),identity={...memory.metadata.current};
  conversation.queueConversationSnapshot(memory,content(2));
  const gate=deferred();let reads=0,resolved=false;
  const selectedPromise=conversation.resolveConversationSelection(memory,oldListItem,{flush:async()=>{await gate.promise;await flush();},load:async()=>{reads++;throw Error('The stale list must not be loaded.');},current:()=>true});
  selectedPromise.then(()=>{resolved=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(resolved,false);
  gate.resolve();const selected=await selectedPromise;
  assert.equal(reads,0);assert.equal(selected.messages.length,4);assert.equal(selected.messages.at(-1).content,'Resposta 2');
  assert.deepEqual(memory.metadata.current,identity);
  memory.restoredMessages.current=selected.messages;
  conversation.queueConversationSnapshot(memory,selected.messages);assert.equal(memory.pendingSave.current,null);
  conversation.queueConversationSnapshot(memory,[...selected.messages,...content(3).slice(-2)]);await flush();
  const [saved]=await store.load();assert.equal(saved.messages.length,6);assert.equal(saved.messages.at(-1).content,'Resposta 3');
  assert.equal(saved.id,identity.id);assert.equal(saved.title,identity.title);assert.equal(saved.createdAt,identity.createdAt);
});

test('reopening current voice history uses the confirmed final turn and keeps text independent',async()=>{
  const {conversation,history,voice}=await helpers,memory=voice.createVoiceConversationMemory();memory.historyReady=true;
  const text=conversation.createConversationMemory();text.draft.text='Rascunho de texto';
  const store=history.createHistoryStore(noCloud,memoryStorage(),{locks:null});
  const flush=()=>voice.flushVoiceConversation(memory,{current:()=>true,save:session=>store.save(session),stageGuest:()=>{}});
  voice.appendVoiceConversationTurn(memory,'Fala 1','Resposta 1');await flush();const stale=history.summarizeSession(memory.savedSession),id=stale.id;
  voice.appendVoiceConversationTurn(memory,'Fala 2','Resposta 2');
  const opened=await conversation.resolveConversationSelection(memory,stale,{flush,load:async()=>{throw Error('Unexpected stale read.');},current:()=>true});
  assert.equal(opened.messages.length,4);assert.equal(opened.messages.at(-1).content,'Resposta 2');assert.equal(text.draft.text,'Rascunho de texto');
  voice.appendVoiceConversationTurn(memory,'Fala 3','Resposta 3');await flush();
  const [saved]=await store.load();assert.equal(saved.id,id);assert.equal(saved.messages.length,6);assert.equal(saved.messages.at(-1).content,'Resposta 3');
});

test('a different selected session loads on demand, including its attachment',async()=>{
  const {conversation,history}=await helpers,memory=conversation.createConversationMemory();
  memory.savedSession=history.deserializeSession(historySession('current'));
  const target=history.deserializeSession(historySession('other'));target.messages[0].imageUrl='data:image/png;base64,ZmFrZQ==';
  const calls=[];
  const selected=await conversation.resolveConversationSelection(memory,history.summarizeSession(target),{flush:async()=>{calls.push('flush');},load:async id=>{calls.push(id);return target;},current:()=>true});
  assert.deepEqual(calls,['flush','other']);assert.equal(selected.messages[0].imageUrl,target.messages[0].imageUrl);
});

test('failed flush or changed account never returns another account’s selection',async()=>{
  const {conversation,history}=await helpers,memory=conversation.createConversationMemory('a'),target=history.deserializeSession(historySession('s'));
  memory.pendingSave.current={uid:'a',session:target};let reads=0;
  await assert.rejects(conversation.resolveConversationSelection(memory,target,{flush:async()=>{throw Error('offline');},load:async()=>{reads++;return target;},current:()=>true}),/offline/);
  assert.equal(reads,0);assert.equal(memory.pendingSave.current.session,target);
  let current=true;
  await assert.rejects(conversation.resolveConversationSelection(memory,target,{flush:async()=>{},load:async()=>{current=false;return target;},current:()=>current}),/conta mudou/);
});

test('deleting the current conversation detaches it before a different history row fails to open',async()=>{
  const {conversation,history}=await helpers,store=history.createHistoryStore(noCloud,memoryStorage(),{locks:null});
  const deleted=history.deserializeSession(historySession('deleted')),next=history.deserializeSession(historySession('next'));
  await store.save(deleted);await store.save(next);
  const memory=conversation.createConversationMemory();memory.historyReady=true;memory.metadata.current={id:deleted.id,title:deleted.title,createdAt:deleted.createdAt};memory.savedSession=deleted;
  memory.draft.text='Rascunho que ainda não enviei';memory.draft.image={data:'imagem preservada',mimeType:'image/png',previewUrl:'blob:fixture'};
  await store.remove(deleted.id);assert.equal(conversation.detachDeletedConversation(memory,deleted.id,deleted.messages),true);
  await assert.rejects(conversation.resolveConversationSelection(memory,next,{flush:async()=>{},load:async()=>{throw Error('Anexo indisponível');},current:()=>true}),/Anexo indisponível/);
  assert.equal(memory.metadata.current,null);assert.equal(memory.savedSession,undefined);assert.equal(memory.pendingSave.current,null);
  assert.equal(memory.draft.text,'Rascunho que ainda não enviei');assert.equal(memory.draft.image.data,'imagem preservada');
  conversation.queueConversationSnapshot(memory,deleted.messages);assert.equal(memory.pendingSave.current,null,'A stale render must not requeue the deleted conversation.');
  conversation.queueConversationSnapshot(memory,history.deserializeSession(historySession('new-content')).messages);
  assert.notEqual(memory.pendingSave.current.session.id,deleted.id);await store.save(memory.pendingSave.current.session);
  assert.ok(!(await store.load()).some(session=>session.id===deleted.id));
});

test('a partial delete-all failure cannot resurrect the current conversation already removed',async()=>{
  const {conversation,history}=await helpers,store=history.createHistoryStore(noCloud,memoryStorage(),{locks:null}),active=history.deserializeSession(historySession('active')),remaining=history.deserializeSession(historySession('remaining'));
  await store.save(active);await store.save(remaining);
  const memory=conversation.createConversationMemory();memory.historyReady=true;memory.metadata.current={id:active.id,title:active.title,createdAt:active.createdAt};memory.savedSession=active;memory.draft.text='Mantido';
  await assert.rejects((async()=>{
    for(const session of [active,remaining]){
      if(session.id===remaining.id)throw Error('Falha na segunda exclusão');
      await store.remove(session.id);conversation.detachDeletedConversation(memory,session.id,active.messages);
    }
  })(),/segunda exclusão/);
  conversation.queueConversationSnapshot(memory,active.messages);
  assert.equal(memory.metadata.current,null);assert.equal(memory.pendingSave.current,null);assert.equal(memory.draft.text,'Mantido');
  assert.deepEqual((await store.load()).map(session=>session.id),['remaining']);
});

test('deleting a different row leaves the open conversation and its draft untouched',async()=>{
  const {conversation,history}=await helpers,memory=conversation.createConversationMemory(),active=history.deserializeSession(historySession('active'));
  memory.metadata.current={id:active.id,title:active.title,createdAt:active.createdAt};memory.draft.text='Rascunho ativo';memory.pendingSave.current={session:active};
  const pending=memory.pendingSave.current,metadata=memory.metadata.current;
  assert.equal(conversation.detachDeletedConversation(memory,'different',active.messages),false);
  assert.equal(memory.metadata.current,metadata);assert.equal(memory.pendingSave.current,pending);assert.equal(memory.draft.text,'Rascunho ativo');
});
