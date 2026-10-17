import type {Express} from 'express';
import {FieldValue} from 'firebase-admin/firestore';
import {adminDb,localFirebase,trustedAuth} from './security';
import {apiRoute,authority,PublicError} from './learning';
export function installPrivacyRoutes(app:Express){
 apiRoute(app,'/api/account/export',async(uid,data)=>{
  if(data.targetUid&&data.targetUid!==uid)throw new PublicError('Você só pode exportar seus próprios dados.',403);
  const db=adminDb(),profile=await db.doc('users/'+uid).get();const documents:any[]=[];let bytes=0;
  async function walk(ref:FirebaseFirestore.DocumentReference,snapshot?:FirebaseFirestore.DocumentSnapshot){
   const snap=snapshot||await ref.get();if(snap.exists){const row={path:ref.path,data:snap.data()};bytes+=Buffer.byteLength(JSON.stringify(row));if(documents.length>=500||bytes>8000000)throw new PublicError('O volume de dados exige uma exportação assistida. Nenhum arquivo incompleto foi gerado.');documents.push(row);}
   // Bound each read before fetching it. Checking the limit only after an
   // unbounded collection.get() already spent memory and billed every document.
   for(const collection of await ref.listCollections()){
    let cursor:FirebaseFirestore.QueryDocumentSnapshot|undefined;
    while(true){
     let query:FirebaseFirestore.Query=collection.limit(10);
     if(cursor)query=query.startAfter(cursor);
     const page=await query.get();if(page.empty)break;
     for(const doc of page.docs)await walk(doc.ref,doc);
     cursor=page.docs.at(-1);if(page.size<10)break;
    }
   }
  }
  await walk(profile.ref,profile);
  return {format:'vigia-data-v1',exportedAt:new Date().toISOString(),ownerUid:uid,documents};
 });
 apiRoute(app,'/api/account/delete',async(uid,data,authTime)=>{
  if(!localFirebase)throw new PublicError('A exclusão de conta está disponível somente na demonstração local. A operação real exige o processo de retenção aprovado.',403);
  if(data.confirmation!=='EXCLUIR'||!Number.isFinite(authTime)||Date.now()/1000-authTime>300)throw new PublicError('Entre novamente e confirme a exclusão para continuar.',403);
  const target=data.targetUid||uid;if(typeof target!=='string'||target.includes('/')||target.length>128)throw new PublicError('Conta inválida.');
  const db=adminDb(),a=await authority(uid),targetAuthority=await authority(target);
  if(target!==uid){if(!['responsavel','educador'].includes(a.role)||targetAuthority.guardianUid!==uid)throw new PublicError('Somente o responsável vinculado pode excluir esta conta.',403);}
  else if(a.role==='infantil')throw new PublicError('A exclusão da conta infantil precisa ser feita pelo responsável vinculado.',403);
  if((await db.collection('sala_authorities').where('guardianUid','==',target).limit(1).get()).size)throw new PublicError('Este perfil tem crianças vinculadas. Os vínculos precisam ser revisados antes da exclusão.');
  const classes=await db.collection('classrooms').where('teacherUid','==',target).get();if(classes.docs.some(c=>c.data().studentUids?.length))throw new PublicError('Este educador possui alunos vinculados. Revise os vínculos antes da exclusão.');
  // A tombstone immediately rejects existing tokens and direct Firestore access.
  await db.doc('account_tombstones/'+target).set({deletedAt:new Date().toISOString()});
  const chats=await db.collection('chats').where('participants','array-contains',target).get();
  for(const chat of chats.docs){
   const peers={...chat.data().participantProfiles,[target]:{nickname:'Conta excluída',avatarId:'default',role:'infantil'}};
   await chat.ref.update({isApproved:false,participantProfiles:peers,lastMessageText:'Contato encerrado',updatedAt:new Date().toISOString()});
   const messages=await chat.ref.collection('messages').where('senderUid','==',target).get();for(const message of messages.docs)await message.ref.update({senderNickname:'Conta excluída',text:'[Mensagem da conta excluída]'});
  }
  const codes=await db.collection('invite_codes').where('uid','==',target).get();for(const code of codes.docs)await code.ref.delete();
  if(targetAuthority.classroomId){const c=db.doc('classrooms/'+targetAuthority.classroomId);if((await c.get()).exists)await c.update({studentUids:FieldValue.arrayRemove(target)});}
  for(const c of classes.docs){await db.recursiveDelete(c.ref);const code=db.doc('classroom_codes/'+c.data().code);await code.delete();}
  for(const collection of ['invites','school_enrollments']){const field=collection==='invites'?'visibleTo':'reviewerUids';const involved=await db.collection(collection).where(field,'array-contains',target).get();for(const row of involved.docs)await row.ref.delete();}
  // Requests initiated by this child also need removal (the child is not a reviewer).
  const requests=await db.collection('school_enrollments').where('childUid','==',target).get();for(const r of requests.docs)await r.ref.delete();
  await db.recursiveDelete(db.doc('users/'+target));await db.doc('sala_authorities/'+target).delete();
  try{await trustedAuth().deleteUser(target);}catch(e:any){if(e.code!=='auth/user-not-found')throw e;}
  return {success:true,deletedUid:target,retained:'Conversas de outros participantes ficam encerradas, com mensagens desta conta redigidas. Denúncias privadas podem permanecer para revisão.'};
 });
}
