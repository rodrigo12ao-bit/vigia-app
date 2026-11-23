import {auth} from './firebaseAuth';
import type {ChatSession} from '../types';
import {createHistoryStore,deserializeSession,summarizeSession,mergeHistorySummaries,compareHistorySummaries,type ChatSessionSummary} from './historyStore';
import {recoverGuestHistory,stageGuestHistory,deleteGuestHistory} from './guestHistoryRecovery';
export {supportsGuestHistoryLocks} from './historyStore';
export type {ChatSessionSummary} from './historyStore';

export interface SessionPageCursor {uid?:string;id:string;updatedAt:string;}
export interface SessionPage {sessions:ChatSessionSummary[];cursor:SessionPageCursor|null;hasMore:boolean;}
export const historyPageSize=25;

function requireHistoryAccount(uid:string) {
  if(auth.currentUser?.uid!==uid)throw new Error('A conta mudou. Reabra o histórico na sua conta.');
}
async function historyFirebase(uid:string) {
  requireHistoryAccount(uid);
  const firebase=await import('./firebase');
  requireHistoryAccount(uid);
  return firebase;
}
function readDocument(snapshot:{id:string;data:()=>any}):ChatSession {
  const session=deserializeSession(snapshot.data());
  if(session.id!==snapshot.id)throw new Error('Histórico inválido. O conteúdo original foi preservado.');
  return session;
}
async function hydrateSession(uid:string,session:ChatSession):Promise<ChatSession> {
  const record=session as ChatSession&{separateAttachments?:boolean;attachmentIds?:string[]};
  if(!record.separateAttachments||record.attachmentIds?.length===0)return session;
  const {db,collection,getDocs}=await historyFirebase(uid);
  const attachments=await getDocs(collection(db,'users',uid,'chat_sessions',session.id,'attachments'));
  requireHistoryAccount(uid);
  const images=new Map(attachments.docs.map(attachment=>[attachment.id,attachment.data().data]));
  for(const id of record.attachmentIds||[]){
    if(typeof images.get(id)!=='string')throw new Error('Não foi possível carregar todos os anexos. A conversa anterior foi preservada.');
  }
  return {...session,messages:session.messages.map(message=>{
    if(!images.has(message.id))return message;
    const imageUrl=images.get(message.id);
    if(typeof imageUrl!=='string')throw new Error('Anexo inválido. A conversa anterior foi preservada.');
    return {...message,imageUrl};
  })};
}

const store=createHistoryStore({
  async read(uid) {
    const {db,collection,getDocs}=await historyFirebase(uid);
    const snapshot=await getDocs(collection(db,'users',uid,'chat_sessions'));
    requireHistoryAccount(uid);
    const sessions=await Promise.all(snapshot.docs.map(snapshot=>hydrateSession(uid,readDocument(snapshot))));
    requireHistoryAccount(uid);
    return sessions.map(session=>({...session,messages:session.messages.map(message=>({...message,timestamp:message.timestamp.toISOString()}))}));
  },
  async write(uid,session) {
    const {db,doc,getDoc,writeBatch}=await historyFirebase(uid);
    const previous=await getDoc(doc(db,'users',uid,'chat_sessions',session.id));
    requireHistoryAccount(uid);
    const savedImages=new Set<string>(previous.data()?.attachmentIds||[]);
    const attachmentIds:string[]=[];
    const batch=writeBatch(db);
    const messages=session.messages.map((message:any)=>{
      const {imageUrl,...rest}=message;
      if(imageUrl){
        if(imageUrl.length>250000)throw new Error('Anexo grande demais. O histórico anterior foi preservado.');
        attachmentIds.push(message.id);
        if(!savedImages.has(message.id))batch.set(doc(db,'users',uid,'chat_sessions',session.id,'attachments',message.id),{data:imageUrl});
      }
      return rest;
    });
    const metadata={...session,messages,separateAttachments:true,attachmentIds};
    if(new TextEncoder().encode(JSON.stringify(metadata)).byteLength>800000)throw new Error('Histórico grande demais. Inicie uma nova conversa.');
    batch.set(doc(db,'users',uid,'chat_sessions',session.id),metadata);
    await batch.commit();
    requireHistoryAccount(uid);
  },
  async remove(uid,id) {
    const {db,doc,collection,getDocs,writeBatch}=await historyFirebase(uid);
    const attachments=await getDocs(collection(db,'users',uid,'chat_sessions',id,'attachments'));
    requireHistoryAccount(uid);
    const batch=writeBatch(db);
    for(const attachment of attachments.docs)batch.delete(attachment.ref);
    batch.delete(doc(db,'users',uid,'chat_sessions',id));
    await batch.commit();
    requireHistoryAccount(uid);
  },
},localStorage);

let guestRecovery:Promise<void>|undefined;
function requireGuestAccount(){if(auth.currentUser)throw Error('A conta mudou. Reabra o histórico na sua conta.');}
function recoverGuestSessions() {
  requireGuestAccount();
  if(!guestRecovery){
    const pending=recoverGuestHistory({load:()=>store.load(),save:session=>store.save(session)},localStorage,()=>!auth.currentUser).finally(()=>{if(guestRecovery===pending)guestRecovery=undefined;});
    guestRecovery=pending;
  }
  return guestRecovery;
}
export function stageGuestSession(session:ChatSession){requireGuestAccount();stageGuestHistory(session,localStorage);}

// Keep the full-read contract for exports and callers that explicitly need all
// messages. The drawer uses loadSessionPage instead and never reads attachments.
export async function loadSessions(uid?:string):Promise<ChatSession[]> {
  if(!uid){await recoverGuestSessions();requireGuestAccount();}
  return store.load(uid);
}
export async function loadSession(id:string,uid?:string):Promise<ChatSession> {
  if(!uid){
    const session=(await loadSessions()).find(session=>session.id===id);
    requireGuestAccount();
    if(!session)throw new Error('Conversa indisponível.');
    return session;
  }
  const {db,doc,getDoc}=await historyFirebase(uid);
  const snapshot=await getDoc(doc(db,'users',uid,'chat_sessions',id));
  requireHistoryAccount(uid);
  if(!snapshot.exists())throw new Error('Conversa indisponível.');
  return hydrateSession(uid,readDocument(snapshot));
}
export async function loadSessionPage(uid?:string,cursor:SessionPageCursor|null=null,size=historyPageSize):Promise<SessionPage> {
  const pageSize=Math.max(1,Math.min(100,Math.floor(size)||historyPageSize));
  if(cursor&&cursor.uid!==uid)throw new Error('A conta mudou. Reabra o histórico na sua conta.');
  let sessions:ChatSessionSummary[];
  if(!uid){
    sessions=(await loadSessions()).map(summarizeSession).sort(compareHistorySummaries);
    requireGuestAccount();
    if(cursor)sessions=sessions.filter(session=>compareHistorySummaries(session,{...session,id:cursor.id,updatedAt:cursor.updatedAt})>0);
    sessions=sessions.slice(0,pageSize+1);
  }else{
    const {db,collection,getDocs,query,orderBy,limit}=await historyFirebase(uid);
    const {documentId,startAfter}=await import('firebase/firestore');
    requireHistoryAccount(uid);
    // The document ID is stable across renames/saves and includes legacy rows
    // without dates. Ordering by updatedAt would silently hide those records.
    // The UI sorts the loaded summaries by date and marks incomplete lists.
    const constraints=[orderBy(documentId(),'asc'),...(cursor?[startAfter(cursor.id)]:[]),limit(pageSize+1)];
    const snapshot=await getDocs(query(collection(db,'users',uid,'chat_sessions'),...constraints));
    requireHistoryAccount(uid);
    sessions=snapshot.docs.map(snapshot=>summarizeSession(readDocument(snapshot)));
  }
  const hasMore=sessions.length>pageSize,page=sessions.slice(0,pageSize),last=page.at(-1);
  return {sessions:page.sort(compareHistorySummaries),hasMore,cursor:hasMore&&last?{uid,id:last.id,updatedAt:last.updatedAt}:null};
}
export async function loadSessionSummaries(uid?:string):Promise<ChatSessionSummary[]> {
  let cursor:SessionPageCursor|null=null,sessions:ChatSessionSummary[]=[];
  do{
    const page=await loadSessionPage(uid,cursor);
    sessions=mergeHistorySummaries(sessions,page.sessions);cursor=page.cursor;
  }while(cursor);
  return sessions;
}
export async function saveSession(session:ChatSession,uid?:string) {
  if(!uid){await recoverGuestSessions();requireGuestAccount();}
  return store.save(session,uid);
}
export async function deleteSession(id:string,uid?:string) {
  if(!uid){
    requireGuestAccount();
    // Recovery, outbox cleanup and deletion form one recovery critical section.
    // Do not call recoverGuestSessions from inside it: that would be reentrant.
    return deleteGuestHistory({load:()=>store.load(),save:session=>store.save(session),remove:sessionId=>store.remove(sessionId)},localStorage,id,()=>!auth.currentUser);
  }
  return store.remove(id,uid);
}
export async function deleteAllSessions(uid?:string) {
  for(const session of await loadSessionSummaries(uid))await deleteSession(session.id,uid);
}
export async function renameSession(id:string,title:string,uid?:string):Promise<ChatSessionSummary> {
  if(!uid){
    await recoverGuestSessions();requireGuestAccount();
    return summarizeSession(await store.renameGuest(id,title));
  }
  const {db,doc,getDoc,updateDoc}=await historyFirebase(uid),reference=doc(db,'users',uid,'chat_sessions',id);
  const snapshot=await getDoc(reference);
  requireHistoryAccount(uid);
  if(!snapshot.exists())throw new Error('Conversa indisponível.');
  const previous=readDocument(snapshot);
  const patch={title:title.slice(0,120),updatedAt:new Date(Math.max(Date.now(),Date.parse(previous.updatedAt)+1)).toISOString()};
  // A title change must never rewrite messages from an unloaded list item.
  await updateDoc(reference,patch);
  requireHistoryAccount(uid);
  return summarizeSession({...previous,...patch});
}
