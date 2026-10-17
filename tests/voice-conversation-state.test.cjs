const {test}=require('node:test');
const assert=require('node:assert/strict');
const {transform}=require('esbuild');
const {readFileSync}=require('node:fs');
const source=['src/lib/conversationState.ts','src/lib/voiceConversationState.ts'].map(path=>readFileSync(path,'utf8').replace(/^import .*$/gm,'')).join('\n');
const bundle=transform(source,{loader:'ts',format:'cjs'}).then(result=>{
  const module={exports:{}};new Function('module','exports',result.code)(module,module.exports);return module.exports;
});

test('new spoken records never modify a text draft or a legacy conversation',async()=>{
  const {createVoiceConversationMemory,appendVoiceConversationTurn,isVoiceSession}=await bundle;
  const legacy={id:'old-mixed-chat',messages:[{role:'user',content:'registro antigo'}],draft:{text:'mensagem não enviada',image:{data:'preservada'}}};
  const original=JSON.stringify(legacy),voice=createVoiceConversationMemory('adult-test');voice.historyReady=true;
  appendVoiceConversationTurn(voice,'Pergunta de voz','Resposta de voz');
  assert.equal(JSON.stringify(legacy),original);assert.equal(voice.messages.length,2);
  assert.ok(isVoiceSession(voice.pendingSave.current.session));assert.equal(isVoiceSession(legacy),false);
  assert.equal(voice.pendingSave.current.uid,'adult-test');
});

test('a text conversation limit does not consume the independent voice limit',async()=>{
  const {createVoiceConversationMemory,appendVoiceConversationTurn}=await bundle;
  const text=Array.from({length:200},(_,i)=>({id:String(i),content:'texto'}));
  const voice=createVoiceConversationMemory();voice.historyReady=true;
  appendVoiceConversationTurn(voice,'fala','resposta');assert.equal(voice.messages.length,2);assert.equal(text.length,200);
  for(let i=1;i<100;i++)appendVoiceConversationTurn(voice,'fala '+i,'resposta '+i);
  const retained=voice.messages;
  assert.throws(()=>appendVoiceConversationTurn(voice,'excedente','excedente'),/conversa por voz atingiu/);
  assert.equal(voice.messages,retained);assert.equal(voice.messages.length,200);
});

test('voice captured while history loads remains in memory and saves when loading succeeds',async()=>{
  const {createVoiceConversationMemory,appendVoiceConversationTurn,queueVoiceConversationSnapshot}=await bundle;
  const voice=createVoiceConversationMemory();appendVoiceConversationTurn(voice,'fala mantida','resposta mantida');
  assert.equal(voice.pendingSave.current,null);assert.equal(voice.messages.length,2);
  const id=voice.metadata.current.id;voice.historyReady=true;queueVoiceConversationSnapshot(voice);
  assert.equal(voice.pendingSave.current.session.id,id);assert.equal(voice.pendingSave.current.session.messages[0].content,'fala mantida');
});

test('overlapping spoken turns save the latest snapshot without dropping or mixing earlier turns',async()=>{
  const {createVoiceConversationMemory,appendVoiceConversationTurn,flushVoiceConversation}=await bundle;
  const voice=createVoiceConversationMemory();voice.historyReady=true;
  appendVoiceConversationTurn(voice,'primeira fala','primeira resposta');
  let finishFirst;const writes=[],staged=[];
  const ports={current:()=>true,stageGuest:session=>staged.push(session),save:async session=>{writes.push(session);if(writes.length===1)await new Promise(resolve=>finishFirst=resolve);}};
  const saving=flushVoiceConversation(voice,ports);assert.equal(flushVoiceConversation(voice,ports),saving);
  appendVoiceConversationTurn(voice,'segunda fala','segunda resposta');finishFirst();await saving;
  assert.equal(writes.length,2);assert.equal(staged.length,2);assert.equal(writes[1].messages.length,4);
  assert.equal(voice.pendingSave.current,null);assert.equal(voice.savedSession.messages[2].content,'segunda fala');
});

test('failed save preserves the spoken record for retry and refuses writes after account changes',async()=>{
  const {createVoiceConversationMemory,appendVoiceConversationTurn,flushVoiceConversation}=await bundle;
  const voice=createVoiceConversationMemory('original-account');voice.historyReady=true;
  appendVoiceConversationTurn(voice,'fala protegida','resposta protegida');const pending=voice.pendingSave.current;
  await assert.rejects(flushVoiceConversation(voice,{current:()=>true,stageGuest:()=>{},save:async()=>{throw Error('offline');}}),/offline/);
  assert.equal(voice.pendingSave.current,pending);assert.equal(voice.messages.length,2);
  let writes=0;await assert.rejects(flushVoiceConversation(voice,{current:()=>false,stageGuest:()=>{},save:async()=>writes++}),/conta mudou/);
  assert.equal(writes,0);assert.equal(voice.pendingSave.current,pending);
});

test('a new voice session keeps the old saved record and uses a different identity',async()=>{
  const {createVoiceConversationMemory,appendVoiceConversationTurn}=await bundle;
  const before=createVoiceConversationMemory();before.historyReady=true;appendVoiceConversationTurn(before,'anterior','salva');
  const saved=before.pendingSave.current.session,original=JSON.stringify(saved);
  const next=createVoiceConversationMemory();next.historyReady=true;appendVoiceConversationTurn(next,'nova','independente');
  assert.notEqual(next.metadata.current.id,saved.id);assert.equal(JSON.stringify(saved),original);
});
