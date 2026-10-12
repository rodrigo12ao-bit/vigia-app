import {before,test} from 'node:test';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
import {initializeApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';import {getAuth} from 'firebase-admin/auth';
const app=initializeApp({projectId:'demo-vigia'},'school-tests'),db=getFirestore(app),auth=getAuth(app);const tokens:Record<string,string>={};
const uid=(name:string)=>'demo-school-'+name;
async function call(name:string,path:string,data:any={}){const id=uid(name),r=await fetch('http://localhost:3000'+path,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',Authorization:'Bearer '+tokens[name]},body:JSON.stringify({ownerUid:id,...data})});return {status:r.status,body:await r.json()};}
before(async()=>{
 const status=await(await fetch('http://localhost:3000/api/status')).json();assert.equal(status.demo,true);assert.equal(status.firebase,'emulator');
 for(const name of ['teacher','parent','student','stranger','delete-child']){
  try{await auth.createUser({uid:uid(name),email:uid(name)+'@example.invalid',password:'DemoLocal!123'});}catch(e:any){if(e.code!=='auth/uid-already-exists')throw e;}
  await db.recursiveDelete(db.doc('users/'+uid(name)));await db.doc('account_tombstones/'+uid(name)).delete();
  await db.doc('sala_authorities/'+uid(name)).set({role:name==='teacher'?'educador':name==='parent'?'responsavel':'infantil',...(['student','delete-child'].includes(name)?{guardianUid:uid('parent')}:{})});
  await db.doc('users/'+uid(name)).set({uid:uid(name),nickname:name,role:name==='teacher'?'educador':name==='parent'?'responsavel':'infantil',blockedUsers:[],badges:[],starsScore:0});
  const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:uid(name)+'@example.invalid',password:'DemoLocal!123',returnSecureToken:true})});const data=await r.json();assert.ok(data.idToken);tokens[name]=data.idToken;
 }
 const old=await db.collection('classrooms').where('teacherUid','==',uid('teacher')).get();for(const c of old.docs)await db.recursiveDelete(c.ref);
 const enrollments=await db.collection('school_enrollments').where('childUid','==',uid('student')).get();for(const row of enrollments.docs)await row.ref.delete();
});
let classId='',enrollmentId='';
test('turma exige educador verificado, e matrícula exige duas aprovações',async()=>{
 assert.equal((await call('student','/api/school/create',{name:'Forjada'})).status,403);
 assert.equal((await call('stranger','/api/school/dashboard')).status,403);
 const created=await call('teacher','/api/school/create',{name:'Turma fictícia de teste'});assert.equal(created.status,200);classId=created.body.id;
 assert.equal((await call('student','/api/school/join',{code:created.body.code})).status,200);
 const parent=(await call('parent','/api/school/dashboard')).body;const e=parent.enrollments.find((x:any)=>x.childUid===uid('student'));assert.ok(e);enrollmentId=e.id;
 assert.equal((await call('student','/api/school/decision',{id:e.id,decision:'approve'})).status,403);
 await call('teacher','/api/school/decision',{id:e.id,decision:'approve'});assert.equal((await call('teacher','/api/school/dashboard')).body.students.length,0);
 await call('parent','/api/school/decision',{id:e.id,decision:'approve'});assert.equal((await call('teacher','/api/school/dashboard')).body.students.length,1);
});
test('atividade indicada chega ao aluno; pontuação e conquista não duplicam em concorrência',async()=>{
 assert.equal((await call('stranger','/api/school/assign',{classroomId:classId,lessonId:'perigos'})).status,403);
 assert.equal((await call('teacher','/api/school/assign',{classroomId:classId,lessonId:'perigos'})).status,200);
 const load=await call('student','/api/learning/load');assert.equal(load.body.assignments[0].lessonId,'perigos');
 const data={lessonId:'perigos',answers:{choices:{water:0,wire:0,adult:1}},mistakes:1};
 const results=await Promise.all([call('student','/api/learning/complete',data),call('student','/api/learning/complete',data)]);
 assert.ok(results.every(r=>r.status===200));assert.equal(results.filter(r=>r.body.awarded).length,1);
 assert.equal((await db.doc('users/'+uid('student')).get()).data()?.starsScore,20);
 const panel=(await call('teacher','/api/school/dashboard')).body;assert.equal(panel.students[0].progress.lessons.perigos.score,100);assert.equal(panel.students[0].email,undefined);assert.equal(panel.students[0].chat_sessions,undefined);
});
test('resposta incorreta, conta trocada e aluno sem vínculo não recebem acessos',async()=>{
 assert.equal((await call('student','/api/learning/complete',{lessonId:'perigos',answers:{choices:{water:1,wire:0,adult:1}},mistakes:0})).status,400);
 assert.equal((await call('student','/api/learning/load',{ownerUid:uid('stranger')})).status,403);
 assert.equal((await call('stranger','/api/school/join',{code:'TURMA-'+'A'.repeat(32)})).status,400);
});
test('missão familiar só é confirmada pelo responsável; educador não vê o plano privado',async()=>{
 await call('student','/api/family/request',{missionId:'lanterna'});
 assert.equal((await call('teacher','/api/family/confirm',{childUid:uid('student'),missionId:'lanterna'})).status,403);
 assert.equal((await call('student','/api/family/confirm',{childUid:uid('student'),missionId:'lanterna'})).status,403);
 assert.equal((await call('parent','/api/family/confirm',{childUid:uid('student'),missionId:'lanterna'})).status,200);
 assert.equal((await call('parent','/api/family/confirm',{childUid:uid('student'),missionId:'lanterna'})).status,200);
 assert.equal((await db.doc('users/'+uid('student')).get()).data()?.starsScore,35);
 assert.equal((await db.doc(`users/${uid('student')}/adventure/main`).get()).data()?.counts.family,1);
 assert.equal((await call('student','/api/learning/load')).body.familyRequests[0].status,'confirmed');
 assert.deepEqual((await call('teacher','/api/school/dashboard')).body.students[0].familyRequests,[]);
});
test('denúncias somente dos perfis vinculados; revisão exige o vínculo',async()=>{
 await db.doc('reports/school-test-report').set({reporterUid:uid('student'),reportedUid:uid('stranger'),chatId:'ficticio',messageText:'Texto fictício',reason:'Teste de segurança',status:'pending',createdAt:new Date().toISOString()});
 assert.equal((await call('stranger','/api/school/report-review',{id:'school-test-report'})).status,403);
 const panel=(await call('teacher','/api/school/dashboard')).body;assert.ok(panel.reports.some((r:any)=>r.id==='school-test-report'));
 assert.equal((await call('teacher','/api/school/report-review',{id:'school-test-report'})).status,200);
 assert.equal((await db.doc('reports/school-test-report').get()).data()?.status,'reviewed');
});
test('exportação é própria; exclusão infantil exige responsável e bloqueia token anterior',async()=>{
 assert.equal((await call('teacher','/api/account/export',{targetUid:uid('student')})).status,403);
 const exported=await call('student','/api/account/export');assert.equal(exported.status,200);assert.ok(exported.body.documents.every((d:any)=>d.path.startsWith('users/'+uid('student'))));
 assert.equal((await call('teacher','/api/account/delete',{targetUid:uid('delete-child'),confirmation:'EXCLUIR'})).status,403);
 assert.equal((await call('delete-child','/api/account/delete',{confirmation:'EXCLUIR'})).status,403);
 assert.equal((await call('parent','/api/account/delete',{targetUid:uid('delete-child'),confirmation:'EXCLUIR'})).status,200);
 assert.equal((await db.doc('users/'+uid('delete-child')).get()).exists,false);
 assert.equal((await call('delete-child','/api/sala/profile')).status,401);
});
