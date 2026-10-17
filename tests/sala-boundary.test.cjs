const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
require('../scripts/register-test-typescript.cjs');
// No accounts, credentials or database requests: force an internal DB failure.
const securityPath=require.resolve('../server/security.ts');
require.cache[securityPath]={id:securityPath,filename:securityPath,loaded:true,exports:{runtime:{adultAudience:false},adminDb(){throw Error('private-database-project-and-stack');}}};
const {installSalaRoutes}=require('../server/sala.ts');
async function fixture(t){
 const app=express();app.use(express.json());app.use((request,response,next)=>{response.locals.firebaseUser=true;response.locals.uid='fixture-a';next();});installSalaRoutes(app);
 const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 return async(path,body)=>fetch('http://127.0.0.1:'+server.address().port+'/api/sala/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
}
test('erro interno da Sala Segura recebe 503 público sem revelar metadados',async t=>{
 const call=await fixture(t),response=await call('profile',{});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Operação indisponível. Tente novamente.'});
});
test('erros de entrada e troca de conta permanecem identificados antes de acessar o banco',async t=>{
 const call=await fixture(t);
 assert.equal((await call('profile',[])).status,400);
 const changed=await call('profile',{ownerUid:'fixture-b'});assert.equal(changed.status,403);assert.match((await changed.json()).error,/conta mudou/);
 const invalid=await call('invite',{code:'invalid'});assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/Código inválido/);
});
