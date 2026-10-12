const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {initializeApp,cert}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const project='vigia-aplicativo-7ba1a',origin='https://vigia-app.onrender.com',root=process.env.VIGIA_TEST_URL||'http://127.0.0.1:3100';
const temp=path.join(os.tmpdir(),'vigia-publication'),accountsFile=path.join(temp,root===origin?'test-accounts-public.json':'test-accounts.json');
const output=path.resolve('artifacts',root===origin?'publication-public-cloud-tests.json':'publication-predeploy-cloud-tests.json');
const report={url:root,project,onlySyntheticData:true,checks:[],errors:[],startedAt:new Date().toISOString()};
const config=require('../firebase-applet-config.json');const tokens={};let db,accounts;
const encode=value=>value===null?{nullValue:null}:typeof value==='string'?{stringValue:value}:typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:Array.isArray(value)?{arrayValue:{values:value.map(encode)}}:{mapValue:{fields:fields(value)}};
const fields=value=>Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]));
async function direct(name,method,document,data,mask){
 const url=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${document}`+(mask?'?updateMask.fieldPaths='+mask:'');
 const r=await fetch(url,{method,headers:{Authorization:'Bearer '+tokens[name],'Content-Type':'application/json'},...(data?{body:JSON.stringify({fields:fields(data)})}:{}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,body:await r.json()};
}
async function api(name,route,data={}){const r=await fetch(root+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+tokens[name]},body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
const uid=name=>accounts[name].uid;
async function check(name,action){try{await action();report.checks.push({name,status:'passed'});console.log('PASS '+name);}catch(e){report.checks.push({name,status:'failed',error:String(e.message).slice(0,500)});throw e;}}
async function main(){
 if(!['http://127.0.0.1:3100',origin].includes(root)||config.projectId!==project)throw Error('Teste restrito ao novo Firebase e aos dois servidores autorizados.');
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Teste online não usa emuladores.');
 const credential=JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(temp,'firebase-service-account.json'),'utf8'));
 if(credential.project_id!==project||credential.client_email!==`vigia-render@${project}.iam.gserviceaccount.com`)throw Error('Identidade do servidor diferente da autorizada.');
 db=getFirestore(initializeApp({projectId:project,credential:cert(credential)},'publication-cloud-tests'));
 await check('servidor online: Firebase cloud, IA simulada e emuladores ausentes',async()=>{const s=await(await fetch(root+'/api/status')).json();assert.deepEqual(s,{demo:true,localDemo:false,realAI:false,firebase:'cloud'});});
 if(fs.existsSync(accountsFile))accounts=JSON.parse(fs.readFileSync(accountsFile,'utf8'));
 else {
  accounts={};const suffix=crypto.randomBytes(5).toString('hex');
  for(const name of ['parent','teacher','child','friend','stranger']){
   const email=`vigia-test-${suffix}-${name}@example.invalid`,password=crypto.randomBytes(24).toString('base64url');
   const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+config.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const a=await r.json();if(!r.ok||!a.localId)throw Error('Não foi possível criar a conta fictícia: '+name);accounts[name]={email,password,uid:a.localId};
  }
  fs.mkdirSync(temp,{recursive:true});fs.writeFileSync(accountsFile,JSON.stringify(accounts),{flag:'wx',mode:0o600});
 }
 for(const [name,account] of Object.entries(accounts)){
  const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+config.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password,returnSecureToken:true})});const auth=await r.json();if(!r.ok||auth.localId!==account.uid)throw Error('Login da conta fictícia não confirmado: '+name);tokens[name]=auth.idToken;
  if(!(await db.doc('users/'+account.uid).get()).exists){await db.doc('users/'+account.uid).set({uid:account.uid,nickname:'TESTE FICTÍCIO '+name,role:'infantil',starsScore:0,badges:[],blockedUsers:[],avatarId:'default'});}
 }
 // These operator records are only for the random synthetic accounts above.
 for(const name of Object.keys(accounts))await db.doc('sala_authorities/'+uid(name)).set({role:name==='parent'?'responsavel':name==='teacher'?'educador':'infantil',...(['child','friend'].includes(name)?{guardianUid:uid('parent')}:{})},{merge:true});
 await check('cinco contas fictícias autenticam; servidor sincroniza papéis verificados',async()=>{for(const name of Object.keys(accounts)){const p=await api(name,'/api/sala/profile',{nickname:'TESTE FICTÍCIO '+name});assert.equal(p.status,200);assert.equal(p.body.uid,uid(name));assert.equal(p.body.role,name==='parent'?'responsavel':name==='teacher'?'educador':'infantil');}});
 await check('perfis privados, lista de usuários e autoaprovação são negados',async()=>{
  assert.equal((await direct('stranger','GET','users/'+uid('child'))).status,403);
  assert.equal((await direct('stranger','GET','users')).status,403);
  assert.equal((await direct('child','PATCH','sala_authorities/'+uid('child'),{role:'educador'})).status,403);
  assert.equal((await direct('child','PATCH','users/'+uid('child'),{role:'educador'},'role')).status,403);
 });
 await check('histórico e anexo persistem somente na conta proprietária',async()=>{
  const id='publication-'+crypto.randomBytes(6).toString('hex'),document=`users/${uid('child')}/chat_sessions/${id}`;
  const now=new Date().toISOString(),session={id,title:'Conversa fictícia de teste',messages:[{id:'msg-1',role:'user',content:'Mochila fictícia'}],createdAt:now,updatedAt:now};
  assert.equal((await direct('child','PATCH',document,session)).status,200);
  const before=await direct('child','GET',document),after=await direct('child','GET',document);assert.equal(before.status,200);assert.deepEqual(before.body,after.body);
  assert.equal((await direct('stranger','GET',document)).status,403);assert.equal((await direct('stranger','PATCH',document,session)).status,403);
  assert.equal((await direct('child','PATCH',document+'/attachments/synthetic',{data:'data:image/png;base64,AA=='})).status,200);
  assert.equal((await direct('stranger','GET',document+'/attachments/synthetic')).status,403);
 });
 await check('troca de conta e permissão escolar forjada são rejeitadas',async()=>{
  assert.equal((await api('child','/api/learning/load',{ownerUid:uid('stranger')})).status,403);
  assert.equal((await api('stranger','/api/school/dashboard')).status,403);
  assert.equal((await api('child','/api/school/create',{name:'Forjada'})).status,403);
 });
 let classroom,enrollment;
 await check('turma exige aprovação do educador e responsável',async()=>{
  classroom=(await api('teacher','/api/school/create',{name:'TESTE FICTÍCIO de publicação'})).body;assert.ok(classroom.id&&classroom.code);
  assert.equal((await api('child','/api/school/join',{code:classroom.code})).status,200);
  const panel=await api('parent','/api/school/dashboard');enrollment=panel.body.enrollments.find(e=>e.childUid===uid('child')&&e.classroomId===classroom.id);assert.ok(enrollment);
  assert.equal((await api('child','/api/school/decision',{id:enrollment.id,decision:'approve'})).status,403);
  assert.equal((await api('teacher','/api/school/decision',{id:enrollment.id,decision:'approve'})).status,200);
  assert.ok(!(await api('teacher','/api/school/dashboard')).body.students.some(s=>s.uid===uid('child')));
  assert.equal((await api('parent','/api/school/decision',{id:enrollment.id,decision:'approve'})).status,200);
  assert.ok((await api('teacher','/api/school/dashboard')).body.students.some(s=>s.uid===uid('child')));
 });
 await check('atividade escolar sincroniza; cliques concorrentes não duplicam XP',async()=>{
  assert.equal((await api('teacher','/api/school/assign',{classroomId:classroom.id,lessonId:'perigos'})).status,200);
  assert.ok((await api('child','/api/learning/load')).body.assignments.some(a=>a.lessonId==='perigos'));
  const before=(await db.doc('users/'+uid('child')).get()).data().starsScore;
  const already=(await db.doc(`users/${uid('child')}/learning_awards/perigos`).get()).exists;
  const data={lessonId:'perigos',answers:{choices:{water:0,wire:0,adult:1}},mistakes:0};
  const results=await Promise.all([api('child','/api/learning/complete',data),api('child','/api/learning/complete',data)]);assert.ok(results.every(r=>r.status===200));assert.equal(results.filter(r=>r.body.awarded).length,already?0:1);
  assert.equal((await db.doc('users/'+uid('child')).get()).data().starsScore,before+(already?0:20));
  const student=(await api('teacher','/api/school/dashboard')).body.students.find(s=>s.uid===uid('child'));assert.equal(student.progress.lessons.perigos.score,100);assert.equal(student.email,undefined);assert.equal(student.chat_sessions,undefined);
 });
 let inviteId;
 await check('Sala Segura depende do contato e responsável; terceiro não aprova',async()=>{
  // Restore only the test account's blocked list for an independent rerun.
  await db.doc('users/'+uid('child')).update({blockedUsers:[]});
  const friend=(await api('friend','/api/sala/profile')).body;
  assert.equal((await api('stranger','/api/sala/invite',{code:friend.inviteCode})).status,400);
  assert.equal((await api('child','/api/sala/invite',{code:friend.inviteCode})).status,200);
  inviteId=crypto.createHash('sha256').update(JSON.stringify([uid('child'),uid('friend')].sort())).digest('hex');
  assert.equal((await api('stranger','/api/sala/decision',{id:inviteId,decision:'approve'})).status,400);
  const existing=(await db.doc('chats/'+inviteId).get()).exists;
  assert.equal((await api('friend','/api/sala/decision',{id:inviteId,decision:'approve'})).status,200);
  if(!existing)assert.equal((await db.doc('chats/'+inviteId).get()).exists,false);
  assert.equal((await api('parent','/api/sala/decision',{id:inviteId,decision:'approve'})).status,200);
  assert.equal((await direct('child','GET','chats/'+inviteId)).status,200);assert.equal((await direct('stranger','GET','chats/'+inviteId)).status,403);
 });
 await check('mensagem duplicada é idempotente; autoria e participantes são protegidos',async()=>{
  const messageId=crypto.randomUUID(),data={chatId:inviteId,messageId,text:'Mensagem fictícia de teste'};
  const sent=await Promise.all([api('child','/api/sala/message',data),api('child','/api/sala/message',data)]);assert.ok(sent.every(r=>r.status===200));assert.equal((await db.doc(`chats/${inviteId}/messages/${messageId}`).get()).data().senderUid,uid('child'));
  assert.equal((await direct('child','PATCH',`chats/${inviteId}/messages/${messageId}`,{text:'Texto sobrescrito'},'text')).status,403);
  assert.equal((await direct('child','PATCH','chats/'+inviteId,{participants:[uid('child'),uid('stranger')]},'participants')).status,403);
  assert.equal((await api('stranger','/api/sala/message',{...data,messageId:crypto.randomUUID()})).status,400);
 });
 await check('bloqueio impede envio e denúncia permanece privada',async()=>{
  assert.equal((await direct('child','PATCH','users/'+uid('child'),{blockedUsers:[uid('friend')]},'blockedUsers')).status,200);
  assert.equal((await api('friend','/api/sala/message',{chatId:inviteId,messageId:crypto.randomUUID(),text:'Envio bloqueado'})).status,400);
  const id='publication-'+crypto.randomBytes(8).toString('hex'),document='reports/'+id;
  assert.equal((await direct('child','PATCH',document,{reporterUid:uid('child'),reportedUid:uid('friend'),chatId:inviteId,messageText:'Texto fictício',reason:'TESTE FICTÍCIO de publicação',status:'pending',createdAt:new Date().toISOString()})).status,200);
  assert.equal((await direct('stranger','GET',document)).status,403);assert.equal((await direct('parent','GET',document)).status,200);
 });
 await check('exclusão online não executa operação incompleta',async()=>{assert.equal((await api('parent','/api/account/delete',{confirmation:'EXCLUIR'})).status,403);assert.ok((await db.doc('users/'+uid('parent')).get()).exists);});
 await check('código, credencial e arquivos privados não são publicados',async()=>{for(const file of ['/server.ts','/server.cjs','/firestore.rules','/.env','/firebase-service-account.json','/artifacts/publication-private/credential-state.json'])assert.equal((await fetch(root+file)).status,404,file);});
 // Leave the random approved test contacts usable for the following UI validation.
 await db.doc('users/'+uid('child')).update({blockedUsers:[]});
 report.syntheticAccounts=Object.fromEntries(Object.entries(accounts).map(([name,a])=>[name,a.uid]));
}
main().then(()=>{report.completedAt=new Date().toISOString();}).catch(e=>{report.errors.push(String(e.message).slice(0,500));console.error('Validação não concluída:',String(e.message).slice(0,500));process.exitCode=1;}).finally(async()=>{fs.writeFileSync(output,JSON.stringify(report,null,2));if(db)await db.terminate();});
