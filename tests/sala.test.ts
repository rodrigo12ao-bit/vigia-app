import { test, before } from 'node:test';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const db=getFirestore(initializeApp({projectId:'demo-vigia'},'sala-tests'));
const tokens:Record<string,string>={};
const call=async(uid:string,path:string,data:any)=>{const response=await fetch('http://localhost:3000/api/sala/'+path,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',Authorization:'Bearer '+tokens[uid]},body:JSON.stringify(data)});return {status:response.status,body:await response.json()};};
before(async()=>{
  for(const uid of ['demo-ana','demo-bruno','demo-responsavel','demo-terceiro']){const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:uid+'@example.invalid',password:'DemoLocal!123',returnSecureToken:true})});const data=await r.json();assert.ok(data.idToken);tokens[uid]=data.idToken;}
});
test('Sala Segura: convite exige contato e responsável; mensagem é idempotente; bloqueio impede envio',async()=>{
  const a=await call('demo-ana','profile',{nickname:'Aurora'}),b=await call('demo-bruno','profile',{nickname:'Sol'});
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.role,'infantil');
  assert.equal((await call('demo-ana','invite',{code:b.body.inviteCode})).status,200);
  let invite=(await db.collection('invites').where('fromUid','==','demo-ana').get()).docs.find(d=>d.data().targetUid==='demo-bruno');assert.ok(invite);
  const id=invite.id;
  assert.equal((await call('demo-ana','decision',{id,decision:'approve'})).status,400);
  assert.equal((await call('demo-terceiro','decision',{id,decision:'approve'})).status,400);
  assert.equal((await call('demo-responsavel','decision',{id,decision:'approve'})).status,200);assert.equal((await db.doc('chats/'+id).get()).exists,false);
  assert.equal((await call('demo-bruno','decision',{id,decision:'approve'})).status,200);assert.equal((await db.doc('chats/'+id).get()).exists,true);
  const payload={chatId:id,text:'Mensagem fictícia do teste',messageId:'message-demo-repeat-001'};
  assert.equal((await call('demo-terceiro','message',payload)).status,400);
  assert.equal((await call('demo-ana','message',payload)).status,200);assert.equal((await call('demo-ana','message',payload)).status,200);
  const messages=await db.collection('chats/'+id+'/messages').get();assert.equal(messages.size,1);assert.equal(messages.docs[0].data().senderUid,'demo-ana');
  await db.doc('users/demo-bruno').update({blockedUsers:['demo-ana']});
  assert.equal((await call('demo-ana','message',{...payload,messageId:'message-demo-blocked-002'})).status,400);
  await db.doc('users/demo-bruno').update({blockedUsers:[]});
  assert.equal((await call('demo-ana','message',{...payload,messageId:'message-demo-unblocked-003'})).status,200);
});
test('Sala Segura: conta infantil sem responsável verificado não cria contato',async()=>{
  const c=await call('demo-terceiro','profile',{nickname:'Fictício'});
  assert.equal((await call('demo-ana','invite',{code:c.body.inviteCode})).status,400);
});
test('código de convite de outra pessoa não pode ser apropriado pelo próprio perfil',async()=>{
  const victim=await call('demo-bruno','profile',{});
  await db.doc('users/demo-terceiro').update({inviteCode:victim.body.inviteCode});
  const attacker=await call('demo-terceiro','profile',{});
  assert.equal(attacker.status,200);
  assert.notEqual(attacker.body.inviteCode,victim.body.inviteCode);
  assert.equal((await db.doc('invite_codes/'+victim.body.inviteCode).get()).data()?.uid,'demo-bruno');
});
