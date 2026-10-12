// Only synthetic accounts in the loopback emulators. Never accepts a project ID.
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
const app=initializeApp({projectId:'demo-vigia'}),auth=getAuth(app),db=getFirestore(app);
const rows=[['demo-ana','Aurora',20,'infantil'],['demo-bruno','Sol',70,'infantil'],['demo-responsavel','Responsável fictício',0,'responsavel'],['demo-terceiro','Visitante fictício',0,'infantil'],['demo-professor','Professor fictício',0,'educador']] as const;
for(const [uid,nickname,starsScore,role] of rows){
  try{await auth.createUser({uid,email:uid+'@example.invalid',password:'DemoLocal!123',displayName:nickname,emailVerified:true});}catch(e:any){if(e.code!=='auth/uid-already-exists'&&e.code!=='auth/email-already-exists')throw e;}
  const ref=db.doc('users/'+uid);
  if(!(await ref.get()).exists)await ref.set({uid,nickname,email:uid+'@example.invalid',avatarId:'default',role,starsScore,badges:[],blockedUsers:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  await db.doc('sala_authorities/'+uid).set({role,...(role==='infantil'&&uid!=='demo-terceiro'?{guardianUid:'demo-responsavel'}:{})},{merge:true});
}
console.log('Cinco contas fictícias preparadas somente nos emuladores locais.');
