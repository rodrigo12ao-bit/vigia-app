import { db, doc, collection, getDocs, getDoc, writeBatch } from './firebase';
import { ChatSession } from '../types';
import { createHistoryStore } from './historyStore';
const store = createHistoryStore({
  async read(uid) {
    const snapshot=await getDocs(collection(db,'users',uid,'chat_sessions'));
    return Promise.all(snapshot.docs.map(async snapshot=>{
      const session=snapshot.data();
      if(session.separateAttachments) {
        const attachments=await getDocs(collection(db,'users',uid,'chat_sessions',snapshot.id,'attachments'));
        const images=new Map(attachments.docs.map(d=>[d.id,d.data().data]));
        session.messages=session.messages.map((m:any)=>({...m,...(images.has(m.id)?{imageUrl:images.get(m.id)}:{})}));
      }
      return session;
    }));
  },
  async write(uid,session) {
    const previous=await getDoc(doc(db,'users',uid,'chat_sessions',session.id));
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
  },
  async remove(uid,id) {
    const batch=writeBatch(db), attachments=await getDocs(collection(db,'users',uid,'chat_sessions',id,'attachments'));
    for(const attachment of attachments.docs)batch.delete(attachment.ref);
    batch.delete(doc(db,'users',uid,'chat_sessions',id));await batch.commit();
  }
},localStorage);
export const loadSessions=store.load;
export const saveSession=store.save;
export const deleteSession=store.remove;
export async function deleteAllSessions(uid?:string){for(const s of await store.load(uid))await store.remove(s.id,uid);}
export async function renameSession(id:string,title:string,uid?:string){const target=(await store.load(uid)).find(s=>s.id===id);if(!target)throw new Error('Conversa indisponível.');await store.save({...target,title:title.slice(0,120),updatedAt:new Date().toISOString()},uid);}
