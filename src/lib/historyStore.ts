import type { ChatSession } from '../types';
export interface HistoryPort {
  read(uid: string): Promise<any[]>;
  write(uid: string, session: any): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
}
export const guestHistoryKey = 'vigia_guest_chat_sessions_v1';
export function serializeSession(session: ChatSession) {
  if (session.messages.length > 200) throw new Error('Esta conversa atingiu o limite de 200 mensagens. Inicie uma nova conversa; o histórico anterior foi preservado.');
  const serialized=JSON.parse(JSON.stringify({ ...session, messages: session.messages.map(m=>({...m,timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp})) }));
  deserializeSession(serialized);
  return serialized;
}
export function deserializeSession(data: any): ChatSession {
  const invalid=()=>{throw new Error('Histórico inválido. O conteúdo original foi preservado.');};
  if (!data || typeof data.id !== 'string' || !data.id || typeof data.title!=='string' || data.title.length>120 || typeof data.createdAt!=='string' || !Number.isFinite(Date.parse(data.createdAt)) || typeof data.updatedAt!=='string' || !Number.isFinite(Date.parse(data.updatedAt)) || !Array.isArray(data.messages) || data.messages.length>200) invalid();
  const ids=new Set<string>();
  for(const message of data.messages){
    if(!message||typeof message.id!=='string'||!message.id||ids.has(message.id)||!['user','assistant'].includes(message.role)||typeof message.content!=='string'||!['string','number'].includes(typeof message.timestamp)||!Number.isFinite(new Date(message.timestamp).getTime()))invalid();
    ids.add(message.id);
    for(const field of ['emergencyTip','challengeOrQuestion','imageUrl'])if(message[field]!==undefined&&typeof message[field]!=='string')invalid();
    for(const field of ['suggestedFollowUps','interactiveOptions'])if(message[field]!==undefined&&(!Array.isArray(message[field])||message[field].some((value:unknown)=>typeof value!=='string')))invalid();
  }
  return { ...data, messages: data.messages.map((m:any)=>({...m,timestamp:new Date(m.timestamp)})) };
}
export function createHistoryStore(port: HistoryPort, storage: Pick<Storage,'getItem'|'setItem'>) {
  const queues = new Map<string,Promise<void>>();
  async function mutate(uid: string | undefined, action:()=>Promise<void>) {
    // Guest sessions share one storage record. Serialize their read/modify/write
    // operations together, while keeping different authenticated accounts independent.
    const key=uid ? `user:${uid}` : 'guest';
    const operation=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(action);
    queues.set(key,operation);
    try { await operation; } finally { if(queues.get(key)===operation) queues.delete(key); }
  }
  async function load(uid?: string): Promise<ChatSession[]> {
    const list = uid ? await port.read(uid) : JSON.parse(storage.getItem(guestHistoryKey) || '[]');
    if (!Array.isArray(list)) throw new Error('Histórico inválido.');
    return list.map(deserializeSession).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
  }
  async function save(session: ChatSession, uid?: string) {
    const data=serializeSession(session);
    await mutate(uid,async()=>{
      if (uid) return port.write(uid,data);
      const list=await load(); const index=list.findIndex(s=>s.id===session.id);
      if(index<0) list.push(data); else list[index]=data;
      storage.setItem(guestHistoryKey,JSON.stringify(list.map(serializeSession)));
    });
  }
  async function remove(id: string, uid?: string) {
    await mutate(uid,async()=>{
      if(uid) return port.remove(uid,id);
      storage.setItem(guestHistoryKey,JSON.stringify((await load()).filter(s=>s.id!==id).map(serializeSession)));
    });
  }
  return {load,save,remove};
}
