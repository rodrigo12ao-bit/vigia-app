import {randomBytes} from 'node:crypto';
import type {Express} from 'express';
import {FieldValue,type Transaction,type DocumentSnapshot} from 'firebase-admin/firestore';
import {adminDb} from './security';
import {apiRoute,PublicError} from './learning';
import {activityKey,advanceAdventure,emptyAdventure,earnedAdventureBadges,learningDay,normalizeAdventure,type ActivityClaim} from '../src/lib/adventureModel';
import {getTodayMission} from '../src/data/dailyMissionsData';
import {MODULES_DATA} from '../src/data/learningJourneyData';
export function initialAdventure(progress:any){const ids=Object.keys(progress?.lessons||{});const state=emptyAdventure();state.completed=ids.length;if(ids.length)state.counts.lesson=ids.length;state.days=[...new Set<string>(ids.map(id=>progress.lessons[id].completedAt?.slice(0,10)).filter(Boolean))].sort().slice(-31);return state;}
export function applyAdventureAward(tx:Transaction,uid:string,claim:ActivityClaim,points:number,user:DocumentSnapshot,stateDoc:DocumentSnapshot,already:DocumentSnapshot,learning?:any,extraBadges:string[]=[]){
 const state=stateDoc.exists?normalizeAdventure(stateDoc.data()):initialAdventure(learning);const historical=claim.kind==='lesson'&&!!learning?.lessons?.[claim.id],seen=already.exists||historical;const next=seen?state:advanceAdventure(state,claim.kind,claim.day||learningDay());const oldScore=user.data()?.starsScore||0,score=oldScore+(seen?0:points),badges=earnedAdventureBadges(next,score);
 tx.set(adminDb().doc(`users/${uid}/adventure/main`),next);
 if(!already.exists){tx.create(already.ref,{kind:claim.kind,activityId:claim.id,points:seen?0:points,completedAt:new Date().toISOString()});tx.update(user.ref,{starsScore:FieldValue.increment(seen?0:points),badges:FieldValue.arrayUnion(...new Set([...badges,...extraBadges]))});}
 return {state:next,awarded:!seen,xp:seen?0:points,badges,starsScore:score};
}
export async function issuePracticeReceipt(uid:string,firebaseUser:boolean,kind:'quiz'|'scenario',correctIndex:number,points:number){
 const id=randomBytes(16).toString('hex');if(firebaseUser)await adminDb().doc(`users/${uid}/practice_receipts/${id}`).create({kind,correctIndex,points,expiresAt:Date.now()+86400000});return id;
}
export function installAdventureRoutes(app:Express){
 apiRoute(app,'/api/learning/adventure',async uid=>adminDb().runTransaction(async tx=>{
  const db=adminDb(),ref=db.doc(`users/${uid}/adventure/main`);const [state,learning,user]=await Promise.all([tx.get(ref),tx.get(db.doc(`users/${uid}/learning/main`)),tx.get(db.doc('users/'+uid))]);if(!user.exists)throw new PublicError('Perfil indisponível.');
  const initial=state.exists?normalizeAdventure(state.data()):initialAdventure(learning.data());if(state.data()?.legacyImported)return initial;
  const levels=MODULES_DATA.flatMap(m=>m.levels).filter(level=>user.data()?.gameJourney?.levelProgress?.[level.id]?.completed===true);
  const ledgers=await Promise.all(levels.map(level=>tx.get(db.doc(`users/${uid}/activity_awards/trail_${level.id}`))));const missing=ledgers.filter(ledger=>!ledger.exists);
  if(missing.length){initial.completed+=missing.length;initial.counts={...initial.counts,trail:(initial.counts.trail||0)+missing.length};}
  for(const ledger of missing)tx.create(ledger.ref,{kind:'trail',points:0,imported:true,completedAt:new Date().toISOString()});
  tx.set(ref,{...initial,legacyImported:true});const badges=earnedAdventureBadges(initial,user.data()?.starsScore||0);if(badges.length)tx.update(user.ref,{badges:FieldValue.arrayUnion(...badges)});return initial;
 }));
 apiRoute(app,'/api/learning/reward',async(uid,data)=>{
  const claim=data.claim as ActivityClaim;let key:string;try{key=activityKey(claim);}catch{throw new PublicError('Atividade inválida.');}
  if(!['quiz','scenario','daily','trail'].includes(claim.kind))throw new PublicError('A conclusão precisa ser validada pela atividade correspondente.');
  const db=adminDb();return db.runTransaction(async tx=>{
   const [user,state,award,learning]=await Promise.all([tx.get(db.doc('users/'+uid)),tx.get(db.doc(`users/${uid}/adventure/main`)),tx.get(db.doc(`users/${uid}/activity_awards/${key}`)),tx.get(db.doc(`users/${uid}/learning/main`))]);if(!user.exists)throw new PublicError('Perfil indisponível.');
   let points=0;
   if(claim.kind==='quiz'||claim.kind==='scenario'){
    if(!/^[a-f0-9]{32}$/.test(claim.id))throw new PublicError('Desafio inválido.');const receipt=await tx.get(db.doc(`users/${uid}/practice_receipts/${claim.id}`)),r=receipt.data();
    if(!r||r.kind!==claim.kind||r.correctIndex!==claim.answer)throw new PublicError('Confira a resposta antes de concluir.');if(!award.exists&&r.expiresAt<Date.now())throw new PublicError('Este desafio expirou. Gere uma nova pergunta.');points=r.points;
   }else if(claim.kind==='daily'){
    const stamp=Date.parse(claim.day+'T12:00:00-03:00'),age=Date.now()-stamp;if(!Number.isFinite(stamp)||age< -86400000||age>31*86400000||claim.day!>learningDay())throw new PublicError('Missão diária inválida.');
    const daily=getTodayMission(claim.day);if(claim.id!==daily.id||claim.answer!==daily.question.correctIndex)throw new PublicError('Resposta diária inválida.');points=daily.starReward;
   }else{
    const level=MODULES_DATA.flatMap(m=>m.levels).find(l=>l.id===claim.id);if(!level||!Number.isInteger(claim.stars)||claim.stars!<1||claim.stars!>3||!Number.isFinite(claim.score)||claim.score!<0||claim.score!>100)throw new PublicError('Resultado da trilha inválido.');points=claim.stars!*10;
   }
   return applyAdventureAward(tx,uid,claim,points,user,state,award,learning.data());
  });
 });
}
