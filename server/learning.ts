import type {Express} from 'express';
import {applyAdventureAward} from './adventure';
import {adminDb,runtime} from './security';
import {emptyLearning,evaluateMission,missionById,normalizeLearning} from '../src/lib/learningModel';
import {FAMILY_MISSIONS} from '../src/data/learningMissions';
export class PublicError extends Error {constructor(message:string,public status=400){super(message);}}
export function apiRoute(app:Express,path:string,action:(uid:string,data:any,authTime:number)=>Promise<any>){
 app.post(path,async(req,res)=>{try{
  if(!res.locals.firebaseUser)throw new PublicError('Entre na sua conta para continuar.',401);
  if(req.body!==undefined&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)))throw new PublicError('Conteúdo inválido.');
  const uid=res.locals.uid;
  if(req.body?.ownerUid && req.body.ownerUid!==uid)throw new PublicError('A conta mudou. Reabra esta tela.',403);
  res.json(await action(uid,req.body||{},res.locals.authTime||0));
 }catch(e){res.status(e instanceof PublicError?e.status:503).json({error:e instanceof PublicError?e.message:'Operação indisponível. Seus dados anteriores foram preservados.'});}});
}
export async function authority(uid:string){return (await adminDb().doc('sala_authorities/'+uid).get()).data()||{role:'infantil'};}
export async function supervisedBy(viewer:string,child:string){
 if(!['educador','responsavel'].includes((await authority(viewer)).role))return false;const a=await authority(child);return a.guardianUid===viewer || (a.educatorUid===viewer && !!a.educationConsentAt);
}
export function installLearningRoutes(app:Express){
 apiRoute(app,'/api/learning/load',async uid=>{
  const db=adminDb();const [progress,a,requests]=await Promise.all([db.doc(`users/${uid}/learning/main`).get(),authority(uid),db.collection(`users/${uid}/family_requests`).limit(20).get()]);
  let assignments:any[]=[];
  if(a.classroomId&&a.educatorUid&&a.educationConsentAt){const c=await db.doc('classrooms/'+a.classroomId).get();if(c.data()?.studentUids?.includes(uid))assignments=(await c.ref.collection('assignments').limit(20).get()).docs.map(d=>({id:d.id,...d.data()}));}
  return {progress:normalizeLearning(progress.data()),assignments,familyRequests:requests.docs.map(d=>({id:d.id,...d.data()})),schoolLinked:!!a.educationConsentAt};
 });
 apiRoute(app,'/api/learning/preferences',async(uid,data)=>{
  if(!['basic','standard','advanced'].includes(data.reading)||!['normal','large'].includes(data.textSize))throw new PublicError('Escolha uma opção de leitura válida.');
  const ref=adminDb().doc(`users/${uid}/learning/main`);
  await adminDb().runTransaction(async tx=>{const snap=await tx.get(ref);const current=normalizeLearning(snap.data());tx.set(ref,{...current,reading:data.reading,textSize:data.textSize});});return {success:true};
 });
 apiRoute(app,'/api/learning/complete',async(uid,data)=>{
  let result,mission;try{mission=missionById(data.lessonId);result=evaluateMission(data.lessonId,data.answers);}catch{throw new PublicError('Respostas inválidas.');}
  if(!result.complete)throw new PublicError('Revise os passos antes de concluir.');
  const mistakes=data.mistakes;if(!Number.isInteger(mistakes)||mistakes<0||mistakes>50)throw new PublicError('Resultado inválido.');
  const db=adminDb(),ref=db.doc(`users/${uid}/learning/main`),userRef=db.doc('users/'+uid),award=db.doc(`users/${uid}/learning_awards/${mission.id}`);
  return db.runTransaction(async tx=>{
   const [snap,user,already,adventure]=await Promise.all([tx.get(ref),tx.get(userRef),tx.get(award),tx.get(db.doc(`users/${uid}/adventure/main`))]);
   if(!user.exists)throw new PublicError('Perfil indisponível.');
   const current=normalizeLearning(snap.data());
   const lesson=current.lessons[mission.id]||{completedAt:new Date().toISOString(),score:100,mistakes};
   const progress={...current,lessons:{...current.lessons,[mission.id]:lesson}};
   const reward=applyAdventureAward(tx,uid,{kind:'lesson',id:mission.id},mission.reward,user,adventure,already,current,['learning_'+mission.id]);
   tx.set(ref,progress);
   return {progress,...reward};
  });
 });
 apiRoute(app,'/api/family/request',async(uid,data)=>{
  const mission=FAMILY_MISSIONS.find(m=>m.id===data.missionId);if(!mission)throw new PublicError('Missão indisponível.');
  if(runtime.adultAudience){
    if(data.confirmed!==true||data.childUid&&data.childUid!==uid)throw new PublicError('Confirme a conclusão da sua própria preparação.');
    const db=adminDb(),ref=db.doc(`users/${uid}/family_requests/${mission.id}`);
    return db.runTransaction(async tx=>{
      const [request,user,state,award,learning]=await Promise.all([tx.get(ref),tx.get(db.doc('users/'+uid)),tx.get(db.doc(`users/${uid}/adventure/main`)),tx.get(db.doc(`users/${uid}/activity_awards/family_${mission.id}`)),tx.get(db.doc(`users/${uid}/learning/main`))]);
      if(!user.exists)throw new PublicError('Perfil indisponível.');
      if(request.data()?.guardianUid)throw new PublicError('Este registro anterior depende do vínculo original e foi preservado.');
      const reward=applyAdventureAward(tx,uid,{kind:'family',id:mission.id},15,user,state,award,learning.data());
      tx.set(ref,{ownerUid:uid,missionId:mission.id,status:'confirmed',selfDeclared:true,confirmedBy:uid,confirmedAt:request.data()?.confirmedAt||new Date().toISOString()},{merge:true});return {success:true,...reward};
    });
  }
  const a=await authority(uid);if(!a.guardianUid)throw new PublicError('Esta confirmação precisa de um responsável vinculado.');
  const ref=adminDb().doc(`users/${uid}/family_requests/${mission.id}`);
  await adminDb().runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists)return;tx.create(ref,{ownerUid:uid,guardianUid:a.guardianUid,missionId:mission.id,status:'pending',createdAt:new Date().toISOString()});});return {success:true};
 });
 apiRoute(app,'/api/family/confirm',async(uid,data)=>{
  if(typeof data.childUid!=='string'||!FAMILY_MISSIONS.some(m=>m.id===data.missionId))throw new PublicError('Missão inválida.');
  const db=adminDb(),ref=db.doc(`users/${data.childUid}/family_requests/${data.missionId}`);
  await db.runTransaction(async tx=>{
   const [a,request,reviewer]=await Promise.all([tx.get(db.doc('sala_authorities/'+data.childUid)),tx.get(ref),tx.get(db.doc('sala_authorities/'+uid))]);
   if(!['responsavel','educador'].includes(reviewer.data()?.role))throw new PublicError('Perfil de responsável verificado necessário.',403);
   if(a.data()?.guardianUid!==uid||request.data()?.guardianUid!==uid)throw new PublicError('Somente o responsável vinculado pode confirmar.',403);
   if(request.data()?.status==='confirmed')return;
   if(request.data()?.status!=='pending')throw new PublicError('Missão indisponível.');
   const childUid=data.childUid,claim={kind:'family' as const,id:data.missionId};
   const [user,state,award,learning]=await Promise.all([tx.get(db.doc('users/'+childUid)),tx.get(db.doc(`users/${childUid}/adventure/main`)),tx.get(db.doc(`users/${childUid}/activity_awards/family_${data.missionId}`)),tx.get(db.doc(`users/${childUid}/learning/main`))]);
   if(!user.exists)throw new PublicError('Perfil indisponível.');
   applyAdventureAward(tx,childUid,claim,15,user,state,award,learning.data());
   tx.update(ref,{status:'confirmed',confirmedBy:uid,confirmedAt:new Date().toISOString()});
  });return {success:true};
 });
}
