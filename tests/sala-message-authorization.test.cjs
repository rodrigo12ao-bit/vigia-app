const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');
const express=require('express');

// Exercise the real HTTP route with a transactional in-memory port. Security
// checks must happen inside the transaction; no Firebase/network/credentials.
const code=transformSync(readFileSync('server/sala.ts','utf8'),{loader:'ts',format:'cjs'}).code;
const chatId='a'.repeat(64),adultVersion='2026-10-13-18plus-v1';
const payload={chatId,messageId:'review-message-0001',text:'Mensagem fictícia'};
class PublicError extends Error{constructor(message,status=400){super(message);this.status=status;}}
async function fixture(t,{adult=true,mutate=()=>{}}={}){
  const records=new Map([
    ['users/a',{uid:'a',nickname:'Pessoa A',blockedUsers:[]}],
    ['users/b',{uid:'b',nickname:'Pessoa B',blockedUsers:[]}],
    ['sala_authorities/a',{role:'infantil'}],
    ['sala_authorities/b',{role:'infantil'}],
    ['adult_access/a',{version:adultVersion}],
    ['adult_access/b',{version:adultVersion}],
    ['chats/'+chatId,{participants:['a','b'],isApproved:true,unreadCount:{a:0,b:0},lastMessageText:'Anterior'}],
  ]);
  mutate(records);
  const reads=[],outsideReads=[],writes=[];
  const snapshot=path=>({exists:records.has(path),data:()=>structuredClone(records.get(path))});
  const ref=path=>({path,collection:name=>({doc:id=>ref(path+'/'+name+'/'+id)}),get:async()=>{outsideReads.push(path);return snapshot(path);}});
  const db={doc:ref,async runTransaction(action){
    const pending=[];
    const value=await action({
      get:async target=>{assert.equal(pending.length,0,'Firestore requires all reads before writes');reads.push(target.path);return snapshot(target.path);},
      create:(target,data)=>pending.push({kind:'create',path:target.path,data}),
      update:(target,data)=>pending.push({kind:'update',path:target.path,data}),
      set:(target,data)=>pending.push({kind:'set',path:target.path,data}),
    });
    for(const operation of pending){
      if(operation.kind==='create')assert.equal(records.has(operation.path),false);
      const target=operation.kind==='update'?structuredClone(records.get(operation.path)):{};
      for(const [key,value] of Object.entries(operation.data)){
        const parts=key.split('.');let owner=target;
        for(const part of parts.slice(0,-1))owner=owner[part]||(owner[part]={});
        const field=parts.at(-1);owner[field]=value?.increment!==undefined?(owner[field]||0)+value.increment:structuredClone(value);
      }
      records.set(operation.path,target);writes.push(operation);
    }
    return value;
  }};
  const dependencies={
    './security':{adminDb:()=>db,runtime:{adultAudience:adult},ADULT_ACCESS_VERSION:adultVersion},
    './learning':{PublicError},
    'firebase-admin/firestore':{FieldValue:{increment:increment=>({increment})}},
    'node:crypto':require('node:crypto'),
  };
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>{assert.ok(name in dependencies,'Unexpected import '+name);return dependencies[name];},module,module.exports);
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{res.locals.firebaseUser=req.headers['x-fixture-user']!=='guest';res.locals.uid=req.headers['x-fixture-user']||'a';next();});
  module.exports.installSalaRoutes(app);
  const server=await new Promise(resolve=>{const running=app.listen(0,'127.0.0.1',()=>resolve(running));});
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const call=async(body=payload,{uid='a',route='message'}={})=>{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/sala/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-User':uid},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  return {records,reads,outsideReads,writes,call};
}

test('adult message checks both participants transactionally and commits message/counter together',async t=>{
  const f=await fixture(t),response=await f.call();assert.equal(response.status,200);
  assert.deepEqual(f.outsideReads,[]);
  for(const uid of ['a','b'])for(const collection of ['users','account_tombstones','sala_authorities','adult_access'])assert.ok(f.reads.includes(collection+'/'+uid));
  assert.equal(f.reads.length,10);
  assert.equal(f.writes.length,2);
  const message=f.records.get('chats/'+chatId+'/messages/'+payload.messageId);
  assert.equal(message.senderUid,'a');assert.equal(message.senderNickname,'Pessoa A');
  assert.equal(message.text,payload.text);assert.deepEqual(message.readBy,['a']);assert.equal(message.status,'sent');
  assert.equal(f.records.get('chats/'+chatId).unreadCount.b,1);
});

test('retry is idempotent and reusing an identifier for different content never acknowledges unsent text',async t=>{
  const f=await fixture(t);assert.equal((await f.call()).status,200);
  const original=structuredClone(f.records.get('chats/'+chatId));
  assert.equal((await f.call({...payload,text:'  '+payload.text+'  '})).status,200);
  assert.equal(f.writes.length,2);
  assert.deepEqual(f.records.get('chats/'+chatId),original);
  assert.equal((await f.call({...payload,text:'Outro conteúdo'})).status,409);
  assert.equal((await f.call(payload,{uid:'b'})).status,409);
  assert.equal(f.writes.length,2);
});

for(const uid of ['a','b']){
  test('missing profile '+uid+' refuses delivery without touching message or counter',async t=>{
    const f=await fixture(t,{mutate:rows=>rows.delete('users/'+uid)});
    assert.equal((await f.call()).status,403);assert.deepEqual(f.writes,[]);
  });
  test('closed account '+uid+' refuses delivery even while its profile still exists',async t=>{
    const f=await fixture(t,{mutate:rows=>rows.set('account_tombstones/'+uid,{deletedAt:'2026-11-23'})});
    assert.equal((await f.call()).status,403);assert.deepEqual(f.writes,[]);
  });
  test('revoked adult declaration '+uid+' refuses delivery without writes',async t=>{
    const f=await fixture(t,{mutate:rows=>rows.delete('adult_access/'+uid)});
    assert.equal((await f.call()).status,403);assert.deepEqual(f.writes,[]);
  });
  test('previous child link '+uid+' cannot reuse an adult chat',async t=>{
    const f=await fixture(t,{mutate:rows=>rows.set('sala_authorities/'+uid,{role:'infantil',guardianUid:'guardian'})});
    assert.equal((await f.call()).status,403);assert.deepEqual(f.writes,[]);
  });
  test('block by '+uid+' refuses delivery without changing the conversation',async t=>{
    const f=await fixture(t,{mutate:rows=>rows.get('users/'+uid).blockedUsers=[uid==='a'?'b':'a']});
    assert.equal((await f.call()).status,400);assert.deepEqual(f.writes,[]);
  });
}

test('a stale adult version and a revoked permission on retry cannot reuse a previous decision',async t=>{
  const f=await fixture(t);assert.equal((await f.call()).status,200);
  f.records.set('adult_access/b',{version:'obsolete'});
  assert.equal((await f.call()).status,403);assert.equal(f.writes.length,2);
});

test('legacy approved chats retain their existing access without granting adult privileges',async t=>{
  const f=await fixture(t,{adult:false,mutate:rows=>{for(const uid of ['a','b']){rows.delete('adult_access/'+uid);rows.set('sala_authorities/'+uid,{role:'infantil',guardianUid:'guardian'});}}});
  assert.equal((await f.call()).status,200);
  assert.equal(f.reads.some(path=>path.startsWith('adult_access/')),false);
  f.records.set('account_tombstones/b',{deletedAt:'2026-11-23'});
  assert.equal((await f.call({...payload,messageId:'legacy-closed-0001'})).status,403);assert.equal(f.writes.length,2);
});

test('outsider, guest and malformed participant arrays cannot cause a write',async t=>{
  const f=await fixture(t);
  assert.equal((await f.call(payload,{uid:'c'})).status,400);
  assert.equal((await f.call(payload,{uid:'guest'})).status,401);
  for(const participants of [undefined,'ab',['a','a'],['a','b','c'],['a',42],['a','bad/uid']]){
    f.records.set('chats/'+chatId,{participants,isApproved:true,unreadCount:{a:0,b:0}});
    assert.equal((await f.call()).status,400);
  }
  assert.deepEqual(f.writes,[]);
});

test('a closed account cannot recreate a profile through an in-flight request',async t=>{
  const f=await fixture(t,{mutate:rows=>rows.set('account_tombstones/a',{deletedAt:'2026-11-23'})});
  assert.equal((await f.call({nickname:'Recriado'},{route:'profile'})).status,403);
  assert.deepEqual(f.writes,[]);
});

for(const uid of ['a','b']){
  test('invite refuses a closed participant '+uid+' even before its profile is removed',async t=>{
    const invitationCode='VIGIA-'+'B'.repeat(32);
    const f=await fixture(t,{mutate:rows=>{rows.set('invite_codes/'+invitationCode,{uid:'b'});rows.set('account_tombstones/'+uid,{deletedAt:'2026-11-23'});}});
    assert.equal((await f.call({code:invitationCode},{route:'invite'})).status,400);
    assert.deepEqual(f.writes,[]);
  });
  test('accepting an earlier invite cannot reopen closed participant '+uid,async t=>{
    const f=await fixture(t,{mutate:rows=>{
      rows.set('invites/'+chatId,{fromUid:'a',targetUid:'b',visibleTo:['a','b'],reviewerUids:['b'],approvals:[],status:'pending_guardian_approval'});
      rows.set('account_tombstones/'+uid,{deletedAt:'2026-11-23'});
    }});
    assert.equal((await f.call({id:chatId,decision:'approve'},{route:'decision',uid:'b'})).status,400);
    assert.deepEqual(f.writes,[]);
  });
}
