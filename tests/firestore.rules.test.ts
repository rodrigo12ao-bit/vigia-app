import { before, after, beforeEach, test as nodeTest } from 'node:test';
import { readFileSync } from 'node:fs';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs,query,where}=require('firebase/firestore');
const test=(name:string,fn:()=>Promise<void>)=>nodeTest(name,{timeout:15000},fn);
let env: RulesTestEnvironment;
const chat='chat';
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-vigia-rules',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    for(const uid of ['a','b','c','guardian'])await setDoc(doc(db,'users',uid),{uid,nickname:uid,role:'infantil',starsScore:0,blockedUsers:[]});
    await setDoc(doc(db,'sala_authorities','a'),{role:'infantil',guardianUid:'guardian'});
    await setDoc(doc(db,'chats',chat),{participants:['a','b'],isApproved:true,unreadCount:{a:0,b:1}});
    await setDoc(doc(db,'chats',chat,'messages','m'),{senderUid:'a',senderNickname:'a',text:'Mensagem original',createdAt:'2026-10-12',readBy:['a'],status:'sent'});
    await setDoc(doc(db,'invites','i'),{fromUid:'a',targetUid:'b',visibleTo:['a','b','guardian'],status:'pending_guardian_approval'});
  });
});
const db=(uid:string)=>env.authenticatedContext(uid).firestore();
test('perfis privados: anônimo e terceiro não leem; dono lê',async()=>{
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'users','a')));
  await assertFails(getDoc(doc(db('b'),'users','a')));
  await assertSucceeds(getDoc(doc(db('a'),'users','a')));
});
test('papéis, vínculo e fonte de autoridade não podem ser elevados pelo cliente',async()=>{
  await assertFails(updateDoc(doc(db('a'),'users','a'),{role:'responsavel'}));
  await assertFails(updateDoc(doc(db('a'),'users','a'),{guardianUid:'a'}));
  await assertFails(setDoc(doc(db('a'),'sala_authorities','a'),{role:'educador'}));
  await assertFails(setDoc(doc(db('c'),'users','d'),{uid:'d',role:'responsavel'}));
  await assertSucceeds(updateDoc(doc(db('a'),'users','a'),{nickname:'Apelido fictício',starsScore:10}));
});
test('invites: consultas restritas ao envolvido, sem autoaprovação',async()=>{
  await assertFails(getDoc(doc(db('c'),'invites','i')));
  await assertSucceeds(getDoc(doc(db('guardian'),'invites','i')));
  await assertFails(getDocs(collection(db('a'),'invites')));
  await assertSucceeds(getDocs(query(collection(db('a'),'invites'),where('visibleTo','array-contains','a'))));
  await assertFails(updateDoc(doc(db('a'),'invites','i'),{status:'approved'}));
  await assertFails(setDoc(doc(db('a'),'chats','unauthorized'),{participants:['a','c'],isApproved:true}));
});
test('participantes e mensagens: terceiro não lê, autor não é falsificado, evidência não é apagada',async()=>{
  await assertSucceeds(getDocs(query(collection(db('a'),'chats'),where('participants','array-contains','a'))));
  await assertFails(getDocs(collection(db('c'),'chats')));
  await assertFails(getDoc(doc(db('c'),'chats',chat,'messages','m')));
  await assertFails(updateDoc(doc(db('a'),'chats',chat),{participants:['a','b','c']}));
  const message={senderUid:'a',senderNickname:'a',text:'Olá',createdAt:'2026-10-12',readBy:['a'],status:'sent'};
  await assertFails(setDoc(doc(db('b'),'chats',chat,'messages','forged'),message));
  await assertSucceeds(setDoc(doc(db('a'),'chats',chat,'messages','valid'),message));
  await assertFails(updateDoc(doc(db('b'),'chats',chat,'messages','m'),{text:'Alteração'}));
  await assertFails(deleteDoc(doc(db('a'),'chats',chat,'messages','m')));
});
test('leitura altera apenas confirmação do próprio participante e seu contador',async()=>{
  await assertSucceeds(updateDoc(doc(db('b'),'chats',chat,'messages','m'),{readBy:['a','b'],status:'read'}));
  await assertFails(updateDoc(doc(db('b'),'chats',chat,'messages','m'),{readBy:['b','c'],status:'read'}));
  await assertSucceeds(updateDoc(doc(db('b'),'chats',chat),{'unreadCount.b':0}));
  await assertFails(updateDoc(doc(db('b'),'chats',chat),{'unreadCount.a':0,'unreadCount.b':99}));
});
test('bloqueio imposto nas regras, inclusive para cliente direto; desbloqueio retoma envio',async()=>{
  const message={senderUid:'a',senderNickname:'a',text:'Olá',createdAt:'2026-10-12',readBy:['a'],status:'sent'};
  await assertSucceeds(updateDoc(doc(db('b'),'users','b'),{blockedUsers:['a']}));
  await assertFails(setDoc(doc(db('a'),'chats',chat,'messages','blocked'),message));
  await assertSucceeds(updateDoc(doc(db('b'),'users','b'),{blockedUsers:[]}));
  await assertSucceeds(setDoc(doc(db('a'),'chats',chat,'messages','unblocked'),message));
});
test('histórico e anexos: nunca cruzam contas',async()=>{
  const ref=doc(db('a'),'users','a','chat_sessions','s');
  await assertSucceeds(setDoc(ref,{id:'s',title:'Fictício',messages:[]}));
  await assertFails(getDoc(doc(db('b'),'users','a','chat_sessions','s')));
  await assertSucceeds(setDoc(doc(db('a'),'users','a','chat_sessions','s','attachments','m'),{data:'data:image/jpeg;base64,AA=='}));
  await assertFails(getDoc(doc(db('b'),'users','a','chat_sessions','s','attachments','m')));
});
test('denúncia: autor e responsável vinculado podem ler; terceiro não; só responsável revisa',async()=>{
  const data={reporterUid:'a',reportedUid:'b',chatId:chat,messageText:'Fictício',reason:'Teste',status:'pending',createdAt:'2026-10-12'};
  await assertSucceeds(setDoc(doc(db('a'),'reports','r'),data));
  await assertFails(getDoc(doc(db('c'),'reports','r')));
  await assertSucceeds(getDoc(doc(db('guardian'),'reports','r')));
  await assertFails(updateDoc(doc(db('a'),'reports','r'),{status:'reviewed'}));
  await assertSucceeds(updateDoc(doc(db('guardian'),'reports','r'),{status:'reviewed'}));
});

test('aprendizado e confirmações: cliente não altera resultado, recompensa ou confirmação',async()=>{
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users','a','learning','main'),{version:1,reading:'basic',textSize:'normal',lessons:{}});await setDoc(doc(c.firestore(),'users','a','family_requests','lanterna'),{ownerUid:'a',guardianUid:'guardian',status:'pending'});});
 await assertSucceeds(getDoc(doc(db('a'),'users','a','learning','main')));
 await assertFails(getDoc(doc(db('b'),'users','a','learning','main')));
 await assertFails(updateDoc(doc(db('a'),'users','a','learning','main'),{lessons:{perigos:{score:100}}}));
 await assertFails(setDoc(doc(db('a'),'users','a','learning_awards','perigos'),{reward:999}));
 await assertSucceeds(getDoc(doc(db('guardian'),'users','a','family_requests','lanterna')));
 await assertFails(updateDoc(doc(db('a'),'users','a','family_requests','lanterna'),{status:'confirmed'}));
});
test('turmas e matrículas não são acessíveis pelo cliente direto',async()=>{
 await assertFails(setDoc(doc(db('a'),'classrooms','forged'),{teacherUid:'a',studentUids:['b']}));
 await assertFails(setDoc(doc(db('a'),'school_enrollments','forged'),{status:'approved'}));
 await assertFails(getDocs(collection(db('a'),'classroom_codes')));
});
test('conta encerrada perde acesso mesmo com token anterior e não pode remover o bloqueio',async()=>{
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'account_tombstones','a'),{deletedAt:'2026-10-12'});});
 await assertFails(getDoc(doc(db('a'),'users','a')));
 await assertFails(updateDoc(doc(db('a'),'users','a'),{nickname:'Reativado'}));
 await assertFails(deleteDoc(doc(db('a'),'account_tombstones','a')));
});

test('aventura privada: apenas dono lê; cliente não altera XP, prêmios ou comprovantes',async()=>{
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users','a','adventure','main'),{version:1,completed:1,counts:{lesson:1},days:[],lastActivity:'Missão'});});
 await assertSucceeds(getDoc(doc(db('a'),'users','a','adventure','main')));
 await assertFails(getDoc(doc(db('b'),'users','a','adventure','main')));
 await assertFails(updateDoc(doc(db('a'),'users','a','adventure','main'),{completed:999}));
 await assertFails(setDoc(doc(db('a'),'users','a','activity_awards','fake'),{points:999}));
 await assertFails(setDoc(doc(db('a'),'users','a','practice_receipts','fake'),{correctIndex:0,points:999}));
});
