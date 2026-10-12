// Synthetic identities, fixed loopback hosts and a demo-only server guard.
const root='http://localhost:3000';
const status=await (await fetch(root+'/api/status')).json();if(!status.demo||status.firebase!=='emulator')throw Error('Use o servidor demonstrativo com emuladores locais.');
const tokens:Record<string,string>={};
for(const uid of ['demo-ana','demo-bruno','demo-responsavel','demo-professor']){
 const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:uid+'@example.invalid',password:'DemoLocal!123',returnSecureToken:true})});
 const data=await response.json();if(!data.idToken)throw Error('Execute demo:seed antes de preparar a turma.');tokens[uid]=data.idToken;
}
async function call(uid:string,path:string,data:any={}){const r=await fetch(root+path,{method:'POST',headers:{Origin:root,'Content-Type':'application/json',Authorization:'Bearer '+tokens[uid]},body:JSON.stringify({...data,ownerUid:uid})});const body=await r.json();if(!r.ok)throw Error(body.error||'Preparação indisponível.');return body;}
await call('demo-professor','/api/sala/profile');
let dashboard=await call('demo-professor','/api/school/dashboard');let classroom=dashboard.classes.find((c:any)=>c.name==='Turma demonstrativa');
if(!classroom)classroom=await call('demo-professor','/api/school/create',{name:'Turma demonstrativa'});
for(const uid of ['demo-ana','demo-bruno']){
 await call(uid,'/api/school/join',{code:classroom.code});
 const parent=await call('demo-responsavel','/api/school/dashboard');const enrollment=parent.enrollments.find((r:any)=>r.childUid===uid&&r.classroomId===classroom.id);
 if(enrollment){await call('demo-responsavel','/api/school/decision',{id:enrollment.id,decision:'approve'});await call('demo-professor','/api/school/decision',{id:enrollment.id,decision:'approve'});}
}
await call('demo-professor','/api/school/assign',{classroomId:classroom.id,lessonId:'perigos'});
console.log('Turma fictícia preparada com aprovação do professor e do responsável. Nenhum vínculo de produção foi alterado.');
