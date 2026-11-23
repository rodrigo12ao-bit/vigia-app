// Run with scripts/with-review-services.cjs. This script intentionally refuses
// production, real AI and every Firebase project except the local demo-vigia.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomBytes}=require('node:crypto');
const origin='http://localhost:3000';
const firestoreHost='127.0.0.1:8080',authHost='127.0.0.1:9099';
for(const [key,value] of [['FIRESTORE_EMULATOR_HOST',firestoreHost],['FIREBASE_AUTH_EMULATOR_HOST',authHost]]){
  assert.ok(!process.env[key]||process.env[key]===value,'Use only the local Firebase emulators');process.env[key]=value;
}
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const runId=Date.now()+'-'+randomBytes(4).toString('hex');
const adultVersion=fs.readFileSync('server/security.ts','utf8').match(/ADULT_ACCESS_VERSION\s*=\s*['"]([^'"]+)/)?.[1];
assert.ok(adultVersion);
const report={scope:'Local adult API, Firebase Auth and Firestore emulators; synthetic accounts only, no real AI or publication.',checks:[],status:'running'};
const accounts=[],app=initializeApp({projectId:'demo-vigia'},'review-sala-'+runId),db=getFirestore(app),auth=getAuth(app);
let chatId;
async function check(name,run){await run();report.checks.push({name,status:'passed'});console.log('PASS '+name);}
async function call(account,endpoint,body){
  const response=await fetch(origin+'/api/'+endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+account.token},body:JSON.stringify(body)});
  const value=await response.json();return {status:response.status,body:value};
}
async function createAccount(label){
  const response=await fetch('http://'+authHost+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'sala-'+runId+'-'+label+'@example.invalid',password:'LocalReview!12345',returnSecureToken:true})});
  const value=await response.json();assert.equal(response.status,200);assert.ok(value.idToken&&value.localId);
  const account={uid:value.localId,token:value.idToken};accounts.push(account);
  assert.equal((await call(account,'adult-access',{confirmed:true,version:adultVersion})).status,200);
  const profile=await call(account,'sala/profile',{nickname:'Pessoa fictícia '+label});assert.equal(profile.status,200);account.profile=profile.body;
  return account;
}
async function conversationState(){
  const chat=(await db.doc('chats/'+chatId).get()).data();
  const messages=(await db.collection('chats/'+chatId+'/messages').get()).docs.map(doc=>({id:doc.id,...doc.data()}));
  return {chat,messages};
}
async function refuseWithoutWrites(account,messageId,status){
  const before=await conversationState();
  const response=await call(account,'sala/message',{chatId,messageId,text:'Não deve ser enviada'});
  assert.equal(response.status,status,JSON.stringify(response.body));
  assert.deepEqual(await conversationState(),before);
}
async function main(){
  const response=await fetch(origin+'/api/status');assert.equal(response.status,200);
  const status=await response.json();assert.equal(status.firebase,'emulator');assert.equal(status.audience,'18plus');assert.equal(status.demo,true);assert.equal(status.realAI,false);
  const [a,b,other]=await Promise.all(['A','B','C'].map(createAccount));
  chatId=createHash('sha256').update(JSON.stringify([a.uid,b.uid].sort())).digest('hex');
  await check('adult accounts can invite and accept a private conversation',async()=>{
    assert.equal((await call(a,'sala/invite',{code:b.profile.inviteCode})).status,200);
    assert.equal((await call(a,'sala/decision',{id:chatId,decision:'approve'})).status,400);
    assert.equal((await call(b,'sala/decision',{id:chatId,decision:'approve'})).status,200);
    assert.equal((await db.doc('chats/'+chatId).get()).data().isApproved,true);
  });
  await check('concurrent retries create one message and increment unread count once',async()=>{
    const payload={chatId,messageId:'concurrent-review-message-001',text:'Mensagem fictícia da revisão'};
    const responses=await Promise.all([call(a,'sala/message',payload),call(a,'sala/message',payload)]);
    assert.deepEqual(responses.map(result=>result.status),[200,200]);
    const current=await conversationState();assert.equal(current.messages.length,1);assert.equal(current.chat.unreadCount[b.uid],1);
    assert.equal(current.messages[0].senderUid,a.uid);
    assert.equal((await call(a,'sala/message',{...payload,text:'Outro texto'})).status,409);
    assert.deepEqual(await conversationState(),current);
  });
  await check('an outsider cannot write to the private conversation',()=>refuseWithoutWrites(other,'outsider-review-message-001',400));
  await check('recipient revocation blocks delivery and leaves metadata unchanged',async()=>{
    const ref=db.doc('adult_access/'+b.uid),original=(await ref.get()).data();await ref.delete();
    try{await refuseWithoutWrites(a,'revoked-review-message-001',403);}finally{await ref.set(original);}
  });
  await check('missing recipient profile blocks delivery',async()=>{
    const ref=db.doc('users/'+b.uid),original=(await ref.get()).data();await ref.delete();
    try{await refuseWithoutWrites(a,'missing-profile-message-001',403);}finally{await ref.set(original);}
  });
  await check('closed recipient is rejected even if its profile still exists',async()=>{
    const ref=db.doc('account_tombstones/'+b.uid);await ref.set({deletedAt:new Date().toISOString()});
    try{await refuseWithoutWrites(a,'closed-account-message-001',403);}finally{await ref.delete();}
  });
  await check('a prior child relationship cannot reuse an approved adult chat',async()=>{
    const ref=db.doc('sala_authorities/'+b.uid),original=(await ref.get()).data();await ref.set({role:'infantil',guardianUid:other.uid});
    try{await refuseWithoutWrites(a,'prior-child-message-001',403);}finally{if(original)await ref.set(original);else await ref.delete();}
  });
  await check('blocking a sender immediately prevents another message',async()=>{
    const ref=db.doc('users/'+b.uid);await ref.update({blockedUsers:[a.uid]});
    try{await refuseWithoutWrites(a,'blocked-contact-message-001',400);}finally{await ref.update({blockedUsers:[]});}
  });
  await check('after an explicit unblock the legitimate message works again',async()=>{
    assert.equal((await call(a,'sala/message',{chatId,messageId:'unblocked-contact-message-001',text:'Mensagem após desbloqueio'})).status,200);
    const current=await conversationState();assert.equal(current.messages.length,2);assert.equal(current.chat.unreadCount[b.uid],2);
  });
  await check('sender access is rechecked for the next request',async()=>{
    const ref=db.doc('adult_access/'+a.uid),original=(await ref.get()).data();await ref.delete();
    try{await refuseWithoutWrites(a,'sender-revoked-message-001',403);}finally{await ref.set(original);}
  });
}
(async()=>{try{await main();report.status='passed';}catch(error){report.status='failed';report.error=error.message;console.error(error.stack);process.exitCode=1;}finally{
  try{
    if(chatId){await db.recursiveDelete(db.doc('chats/'+chatId));await db.doc('invites/'+chatId).delete();}
    for(const account of accounts){
      if(account.profile?.inviteCode)await db.doc('invite_codes/'+account.profile.inviteCode).delete();
      await db.recursiveDelete(db.doc('users/'+account.uid));
      for(const collection of ['adult_access','sala_authorities','account_tombstones'])await db.doc(collection+'/'+account.uid).delete();
      await auth.deleteUser(account.uid);
    }
  }catch(error){report.cleanupError=error.message;process.exitCode=1;}
  await deleteApp(app);
  const directory=path.resolve('artifacts/review-20261123');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'sala-adult-integration.json'),JSON.stringify(report,null,2));
  console.log(report.status.toUpperCase()+' '+report.checks.length+' local adult Sala Segura integration checks');
}})();
