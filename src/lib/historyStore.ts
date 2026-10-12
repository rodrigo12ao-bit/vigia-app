import type { ChatSession } from '../types';
export interface HistoryPort {
  read(uid: string): Promise<any[]>;
  write(uid: string, session: any): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
}
export const guestHistoryKey = 'vigia_guest_chat_sessions_v1';
export function serializeSession(session: ChatSession) {
  if (session.messages.length > 200) throw new Error('Esta conversa atingiu o limite de 200 mensagens. Inicie uma nova conversa; o histórico anterior foi preservado.');
  return JSON.parse(JSON.stringify({ ...session, messages: session.messages.map(m=>({...m,timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp})) }));
}
export function deserializeSession(data: any): ChatSession {
  if (!data || typeof data.id !== 'string' || !Array.isArray(data.messages)) throw new Error('Histórico inválido. O conteúdo original foi preservado.');
  return { ...data, messages: data.messages.map((m:any)=>({...m,timestamp:new Date(m.timestamp)})) };
}
export function createHistoryStore(port: HistoryPort, storage: Pick<Storage,'getItem'|'setItem'>) {
  const queues = new Map<string,Promise<void>>();
  async function load(uid?: string): Promise<ChatSession[]> {
    const list = uid ? await port.read(uid) : JSON.parse(storage.getItem(guestHistoryKey) || '[]');
    if (!Array.isArray(list)) throw new Error('Histórico inválido.');
    return list.map(deserializeSession).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
  }
  async function save(session: ChatSession, uid?: string) {
    const data=serializeSession(session), key=`${uid || 'guest'}:${session.id}`;
    const operation=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
      if (uid) return port.write(uid,data);
      const list=await load(); const index=list.findIndex(s=>s.id===session.id);
      if(index<0) list.push(session); else list[index]=session;
      storage.setItem(guestHistoryKey,JSON.stringify(list.map(serializeSession)));
    });
    queues.set(key,operation);
    try { await operation; } finally { if(queues.get(key)===operation) queues.delete(key); }
  }
  async function remove(id: string, uid?: string) {
    await queues.get(`${uid || 'guest'}:${id}`)?.catch(()=>{});
    if(uid) return port.remove(uid,id);
    storage.setItem(guestHistoryKey,JSON.stringify((await load()).filter(s=>s.id!==id).map(serializeSession)));
  }
  return {load,save,remove};
}
