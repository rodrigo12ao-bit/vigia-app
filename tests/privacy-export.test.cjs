const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
require('../scripts/register-test-typescript.cjs');
let currentDb;
const securityPath=require.resolve('../server/security.ts');
require.cache[securityPath]={id:securityPath,filename:securityPath,loaded:true,exports:{runtime:{adultAudience:false},localFirebase:false,adminDb:()=>currentDb}};
const {installPrivacyRoutes}=require('../server/privacy.ts');
async function fixture(t,count=23,text='fictício'){
 const pageLimits=[];let reads=0,individualGets=0;
 const snapshot=index=>{const ref={path:'users/fixture-a/chat_sessions/session-'+index,listCollections:async()=>[],get:async()=>{individualGets++;return snapshot(index);}};return {exists:true,ref,id:String(index),data:()=>({text}),index};};
 const query=(size,cursor=-1)=>({startAfter:document=>query(size,document.index),get:async()=>{pageLimits.push(size);const docs=Array.from({length:Math.min(size,count-cursor-1)},(_,index)=>snapshot(cursor+index+1));reads+=docs.length;return {docs,empty:!docs.length,size:docs.length};}});
 const collection={limit:size=>query(size)};
 const profile={path:'users/fixture-a',listCollections:async()=>[collection],get:async()=>{individualGets++;return {exists:true,ref:profile,data:()=>({nickname:'Fictício'})};}};
 currentDb={doc:path=>{assert.equal(path,'users/fixture-a');return profile;}};
 const app=express();app.use(express.json());app.use((request,response,next)=>{response.locals.uid='fixture-a';response.locals.firebaseUser=true;next();});installPrivacyRoutes(app);
 const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 return {pageLimits,get reads(){return reads;},get individualGets(){return individualGets;},call:()=>fetch('http://127.0.0.1:'+server.address().port+'/api/account/export',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})};
}
test('exportação percorre páginas pequenas sem repetir leitura de cada documento',async t=>{
 const f=await fixture(t),response=await f.call();assert.equal(response.status,200);assert.equal((await response.json()).documents.length,24);assert.deepEqual(f.pageLimits,[10,10,10]);assert.equal(f.reads,23);assert.equal(f.individualGets,1);
});
test('volume excessivo interrompe leituras e recusa arquivo parcial',async t=>{
 const f=await fixture(t,600),response=await f.call();assert.equal(response.status,400);const body=await response.json();assert.match(body.error,/exportação assistida/);assert.equal(body.documents,undefined);assert.equal(f.reads,500);assert.ok(f.pageLimits.every(size=>size===10));
});
test('limite de bytes interrompe após uma página, sem consultar toda coleção',async t=>{
 const f=await fixture(t,1000,'x'.repeat(900000)),response=await f.call();assert.equal(response.status,400);assert.equal(f.reads,10);assert.equal((await response.json()).documents,undefined);
});
