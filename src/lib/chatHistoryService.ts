import {auth} from './firebaseAuth';
import type { ChatSession } from '../types';
import { createHistoryStore } from './historyStore';
import {recoverGuestHistory,stageGuestHistory} from './guestHistoryRecovery';
function requireHistoryAccount(uid:string) {
  if(auth.currentUser?.uid!==uid)throw new Error('A conta mudou. Reabra o histórico na sua conta.');
}
async function historyFirebase(uid:string) {
  requireHistoryAccount(uid);
  const firebase=await import('./firebase');
  requireHistoryAccount(uid);
  return firebase;
}
const store = createHistoryStore({
  async read(uid) {
    const {db,collection,getDocs}=await historyFirebase(uid);
    requireHistoryAccount(uid);
    const snapshot=await getDocs(collection(db,'users',uid,'chat_sessions'));
    requireHistoryAccount(uid);
    const sessions=await Promise.all(snapshot.docs.map(async snapshot=>{
      const session=snapshot.data();
      if(session.separateAttachments) {
        const attachments=await getDocs(collection(db,'users',uid,'chat_sessions',snapshot.id,'attachments'));
        requireHistoryAccount(uid);
        const images=new Map(attachments.docs.map(d=>[d.id,d.data().data]));
        session.messages=session.messages.map((m:any)=>({...m,...(images.has(m.id)?{imageUrl:images.get(m.id)}:{})}));
      }
      return session;
    }));
    requireHistoryAccount(uid);
    return sessions;
  },
  async write(uid,session) {
    const {db,doc,getDoc,writeBatch}=await historyFirebase(uid);
    requireHistoryAccount(uid);
    const previous=await getDoc(doc(db,'users',uid,'chat_sessions',session.id));
    requireHistoryAccount(uid);
    const savedImages=new Set<string>(previous.data()?.attachmentIds || []);
    const attachmentIds:string[]=[];
    const batch=writeBatch(db);
    const messages=session.messages.map((m:any)=>{
      const {imageUrl,...rest}=m;
      if(imageUrl){
        if(imageUrl.length>250000)throw new Error('Anexo grande demais. O histórico anterior foi preservado.');
        attachmentIds.push(m.id);
        if(!savedImages.has(m.id))batch.set(doc(db,'users',uid,'chat_sessions',session.id,'attachments',m.id),{data:imageUrl});
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
    requireHistoryAccount(uid);
    const batch=writeBatch(db), attachments=await getDocs(collection(db,'users',uid,'chat_sessions',id,'attachments'));
    requireHistoryAccount(uid);
    for(const attachment of attachments.docs)batch.delete(attachment.ref);
    batch.delete(doc(db,'users',uid,'chat_sessions',id));await batch.commit();
    requireHistoryAccount(uid);
  }
},localStorage);
let guestRecovery:Promise<void>|undefined;
function recoverGuestSessions() {
  if(auth.currentUser)throw Error('A conta mudou. Reabra o histórico na sua conta.');
  if(!guestRecovery){
    const pending=recoverGuestHistory({load:()=>store.load(),save:session=>store.save(session)},localStorage,()=>!auth.currentUser).finally(()=>{if(guestRecovery===pending)guestRecovery=undefined;});
    guestRecovery=pending;
  }
  return guestRecovery;
}
export function stageGuestSession(session:ChatSession){if(auth.currentUser)throw Error('A conta mudou.');stageGuestHistory(session,localStorage);}
function requireGuestAccount(){if(auth.currentUser)throw Error('A conta mudou. Reabra o histórico na sua conta.');}
export async function loadSessions(uid?:string){if(!uid){await recoverGuestSessions();requireGuestAccount();}return store.load(uid);}
export async function saveSession(session:ChatSession,uid?:string){if(!uid){await recoverGuestSessions();requireGuestAccount();}return store.save(session,uid);}
export async function deleteSession(id:string,uid?:string){if(!uid){await recoverGuestSessions();requireGuestAccount();}return store.remove(id,uid);}
export async function deleteAllSessions(uid?:string){for(const s of await loadSessions(uid))await deleteSession(s.id,uid);}
export async function renameSession(id:string,title:string,uid?:string){const target=(await loadSessions(uid)).find(s=>s.id===id);if(!target)throw new Error('Conversa indisponível.');const renamed={...target,title:title.slice(0,120),updatedAt:new Date().toISOString()};await saveSession(renamed,uid);return renamed;}
