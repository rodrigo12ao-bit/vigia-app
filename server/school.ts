import type {Express} from 'express';
import {randomBytes,createHash} from 'node:crypto';
import {adminDb,runtime,ADULT_ACCESS_VERSION} from './security';
import {apiRoute,authority,PublicError,supervisedBy} from './learning';
import {LEARNING_MISSIONS} from '../src/data/learningMissions';
import {emptyLearning} from '../src/lib/learningModel';
export function installSchoolRoutes(app:Express){
 apiRoute(app,'/api/school/dashboard',async uid=>{
  const db=adminDb(),a=await authority(uid);if(!['educador','responsavel'].includes(a.role))throw new PublicError('Este painel exige um perfil verificado.',403);
  const childField=a.role==='educador'?'educatorUid':'guardianUid';
  const [classes,children,invites,enrollments]=await Promise.all([
   a.role==='educador'?db.collection('classrooms').where('teacherUid','==',uid).limit(10).get():Promise.resolve(null),
   db.collection('sala_authorities').where(childField,'==',uid).limit(60).get(),
   db.collection('invites').where('visibleTo','array-contains',uid).limit(50).get(),
   db.collection('school_enrollments').where('reviewerUids','array-contains',uid).limit(50).get()
  ]);
  const students=[];const reports=new Map();
  for(const child of children.docs){
   if(a.role==='educador'&&!child.data().educationConsentAt)continue;
   const [profile,learning,requests,outgoing,incoming]=await Promise.all([db.doc('users/'+child.id).get(),db.doc(`users/${child.id}/learning/main`).get(),a.role==='responsavel'?db.collection(`users/${child.id}/family_requests`).limit(20).get():Promise.resolve(null),db.collection('reports').where('reporterUid','==',child.id).limit(30).get(),db.collection('reports').where('reportedUid','==',child.id).limit(30).get()]);
   if(!profile.exists)continue;
   students.push({uid:child.id,nickname:profile.data()?.nickname||'Aluno',classroomId:child.data().classroomId||null,progress:learning.data()||emptyLearning(),familyRequests:requests?.docs.map(d=>({id:d.id,...d.data()}))||[]});
   for(const r of [...outgoing.docs,...incoming.docs])if(r.data().status==='pending')reports.set(r.id,{id:r.id,...r.data()});
  }
  const classList=[];
  for(const c of classes?.docs||[])classList.push({id:c.id,...c.data(),assignments:(await c.ref.collection('assignments').limit(20).get()).docs.map(d=>({id:d.id,...d.data()}))});
  const pendingEnrollments=await Promise.all(enrollments.docs.filter(d=>d.data().status==='pending').map(async d=>{const r=d.data();const [child,teacher]=await Promise.all([db.doc('users/'+r.childUid).get(),db.doc('users/'+r.teacherUid).get()]);return {id:d.id,...r,childNickname:child.data()?.nickname||'Aluno',teacherNickname:teacher.data()?.nickname||'Educador verificado'};}));
  return {role:a.role,classes:classList,students,reports:[...reports.values()],invites:invites.docs.map(d=>({id:d.id,...d.data()})).filter(i=>(i as any).status==='pending_guardian_approval'),enrollments:pendingEnrollments};
 });
 apiRoute(app,'/api/school/create',async(uid,data)=>{
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>60)throw new PublicError('Use um nome curto para a turma.');
  const db=adminDb();
  const ref=db.collection('classrooms').doc();const code='TURMA-'+randomBytes(16).toString('hex').toUpperCase();
  const row={name:data.name.trim(),teacherUid:uid,code,studentUids:[],createdAt:new Date().toISOString()};
  await db.runTransaction(async tx=>{
   // Updating the same authority document serializes parallel creations even
   // when the classrooms query is initially empty; all reads precede writes.
   const teacher=await tx.get(db.doc('sala_authorities/'+uid));
   if(teacher.data()?.role!=='educador')throw new PublicError('Somente um educador verificado pode criar turmas.',403);
   const classes=await tx.get(db.collection('classrooms').where('teacherUid','==',uid).limit(10));
   if(classes.size>=10)throw new PublicError('Limite de turmas atingido.');
   tx.update(teacher.ref,{classroomUpdatedAt:new Date().toISOString()});
   tx.create(ref,row);tx.create(db.doc('classroom_codes/'+code),{classroomId:ref.id});
  });return {id:ref.id,...row};
 });
 apiRoute(app,'/api/school/join',async(uid,data)=>{
  const db=adminDb(),a=await authority(uid);if(!runtime.adultAudience&&(a.role!=='infantil'||!a.guardianUid))throw new PublicError('A entrada na turma precisa de um responsável vinculado.');
  if(typeof data.code!=='string'||!/^TURMA-[A-F0-9]{32}$/.test(data.code))throw new PublicError('Código de turma inválido.');
  const directory=await db.doc('classroom_codes/'+data.code).get();const classId=directory.data()?.classroomId;if(!classId)throw new PublicError('Turma indisponível.');
  const c=await db.doc('classrooms/'+classId).get();if(!c.exists)throw new PublicError('Turma indisponível.');
  if(a.classroomId&&a.classroomId!==classId)throw new PublicError('Peça ao responsável uma revisão do vínculo atual antes de mudar de turma.');
  const id=createHash('sha256').update(JSON.stringify([uid,classId])).digest('hex');const ref=db.doc('school_enrollments/'+id);
  await db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists&&old.data()?.status!=='rejected')return;tx.set(ref,{childUid:uid,...(!runtime.adultAudience?{guardianUid:a.guardianUid}:{}),teacherUid:c.data()!.teacherUid,classroomId:classId,className:c.data()!.name,reviewerUids:runtime.adultAudience?[c.data()!.teacherUid]:[a.guardianUid,c.data()!.teacherUid],approvals:[],status:'pending',consentVersion:runtime.adultAudience?'school-progress-adult-v1':'school-progress-v1',createdAt:new Date().toISOString()});});return {success:true};
 });
 apiRoute(app,'/api/school/decision',async(uid,data)=>{
  if(!/^[a-f0-9]{64}$/.test(data.id||'')||!['approve','reject'].includes(data.decision))throw new PublicError('Decisão inválida.');
  const db=adminDb(),ref=db.doc('school_enrollments/'+data.id);
  await db.runTransaction(async tx=>{
   const request=await tx.get(ref),r=request.data();if(!r||!r.reviewerUids.includes(uid))throw new PublicError('Você não pode decidir sobre este vínculo.',403);
   if(r.status!=='pending')return;
   const adultEnrollment=runtime.adultAudience&&r.consentVersion==='school-progress-adult-v1';
   const [a,c,t,g,access]=await Promise.all([tx.get(db.doc('sala_authorities/'+r.childUid)),tx.get(db.doc('classrooms/'+r.classroomId)),tx.get(db.doc('sala_authorities/'+r.teacherUid)),adultEnrollment?Promise.resolve(null):tx.get(db.doc('sala_authorities/'+r.guardianUid)),adultEnrollment?tx.get(db.doc('adult_access/'+r.childUid)):Promise.resolve(null)]);
   if(c.data()?.teacherUid!==r.teacherUid||t.data()?.role!=='educador'||(adultEnrollment?access?.data()?.version!==ADULT_ACCESS_VERSION||!!a.data()?.guardianUid||r.reviewerUids.length!==1||r.reviewerUids[0]!==r.teacherUid:a.data()?.guardianUid!==r.guardianUid||!['responsavel','educador'].includes(g?.data()?.role)))throw new PublicError('Os vínculos mudaram. Solicite uma revisão.');
   if(data.decision==='reject'){tx.update(ref,{status:'rejected'});return;}
   const approvals=[...new Set([...r.approvals,uid])];const approved=r.reviewerUids.every((id:string)=>approvals.includes(id));
   if(approved){if((c.data()?.studentUids||[]).length>=30)throw new PublicError('Esta turma atingiu o limite de alunos.');if(a.data()?.classroomId&&a.data()?.classroomId!==r.classroomId)throw new PublicError('Vínculo escolar atual precisa de revisão.');const now=new Date().toISOString();tx.set(a.ref,{role:a.data()?.role||'infantil',educatorUid:r.teacherUid,classroomId:r.classroomId,educationConsentAt:now,educationConsentVersion:r.consentVersion},{merge:true});tx.update(c.ref,{studentUids:[...new Set([...(c.data()?.studentUids||[]),r.childUid])]});}
   tx.update(ref,{approvals,status:approved?'approved':'pending'});
  });return {success:true};
 });
 apiRoute(app,'/api/school/assign',async(uid,data)=>{
  if(!LEARNING_MISSIONS.some(m=>m.id===data.lessonId)||(typeof data.classroomId!=='string'||data.classroomId.includes('/')))throw new PublicError('Atividade inválida.');
  const db=adminDb(),c=await db.doc('classrooms/'+data.classroomId).get();
  if((await authority(uid)).role!=='educador'||c.data()?.teacherUid!==uid)throw new PublicError('Esta turma não está vinculada ao seu perfil.',403);
  await c.ref.collection('assignments').doc(data.lessonId).set({lessonId:data.lessonId,teacherUid:uid,assignedAt:new Date().toISOString()});return {success:true};
 });
 apiRoute(app,'/api/school/report-review',async(uid,data)=>{
  if(typeof data.id!=='string'||data.id.includes('/'))throw new PublicError('Denúncia inválida.');
  const ref=adminDb().doc('reports/'+data.id),r=await ref.get();const row=r.data();
  if(!row||!(await supervisedBy(uid,row.reporterUid)||await supervisedBy(uid,row.reportedUid)))throw new PublicError('Esta denúncia não está vinculada ao seu perfil.',403);
  await ref.update({status:'reviewed'});return {success:true};
 });
}
