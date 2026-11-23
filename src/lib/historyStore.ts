import type { ChatSession } from '../types';
export type ChatSessionSummary = Pick<ChatSession,'id'|'title'|'createdAt'|'updatedAt'|'lastMessagePreview'>;
export function summarizeSession(session:ChatSessionSummary):ChatSessionSummary {
  const {id,title,createdAt,updatedAt,lastMessagePreview}=session;
  return {id,title,createdAt,updatedAt,...(lastMessagePreview!==undefined?{lastMessagePreview}:{})};
}
export function compareHistorySummaries(a:ChatSessionSummary,b:ChatSessionSummary) {
  return Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||(a.id<b.id?1:a.id>b.id?-1:0);
}
export function mergeHistorySummaries(current:ChatSessionSummary[],incoming:ChatSessionSummary[]):ChatSessionSummary[] {
  const byId=new Map(current.map(session=>[session.id,summarizeSession(session)]));
  for(const session of incoming){
    const previous=byId.get(session.id);
    if(!previous||Date.parse(session.updatedAt)>=Date.parse(previous.updatedAt))byId.set(session.id,summarizeSession(session));
  }
  return [...byId.values()].sort(compareHistorySummaries);
}
export interface HistoryPort {
  read(uid: string): Promise<any[]>;
  write(uid: string, session: any): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
}
export const guestHistoryKey = 'vigia_guest_chat_sessions_v1';
export const guestHistoryLockName = 'vigia:guest-chat-history:v1';
type HistoryStorage = Pick<Storage,'getItem'|'setItem'>;
export interface HistoryLockPort {
  request<T>(name:string, action:()=>Promise<T>):Promise<T>;
}
// All store instances in this page share the fallback queue. Web Locks extends
// the same critical section to other tabs/windows on this origin.
let guestQueue:Promise<unknown>|undefined;
export function supportsGuestHistoryLocks() {
  return typeof navigator!=='undefined'&&typeof navigator.locks?.request==='function';
}
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
export function createHistoryStore(port: HistoryPort, storage: HistoryStorage, options:{locks?:HistoryLockPort|null}={}) {
  const queues = new Map<string,Promise<unknown>>();
  async function mutate<T>(uid: string | undefined, action:()=>Promise<T>):Promise<T> {
    const key=uid ? `user:${uid}` : 'guest';
    const previous=uid?queues.get(key):guestQueue;
    const operation=(previous||Promise.resolve()).catch(()=>{}).then(()=>{
      const locks=options.locks===undefined?(supportsGuestHistoryLocks()?navigator.locks:null):options.locks;
      return !uid&&locks?locks.request(guestHistoryLockName,action):action();
    });
    if(uid)queues.set(key,operation);else guestQueue=operation;
    try { return await operation; } finally {
      if(uid&&queues.get(key)===operation)queues.delete(key);
      if(!uid&&guestQueue===operation)guestQueue=undefined;
    }
  }
  function readGuest():ChatSession[] {
    const list=JSON.parse(storage.getItem(guestHistoryKey)||'[]');
    if(!Array.isArray(list))throw new Error('Histórico inválido.');
    return list.map(deserializeSession);
  }
  async function load(uid?: string): Promise<ChatSession[]> {
    if(!uid)return readGuest().sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
    const list = await port.read(uid);
    if (!Array.isArray(list)) throw new Error('Histórico inválido.');
    return list.map(deserializeSession).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
  }
  async function save(session: ChatSession, uid?: string) {
    const data=serializeSession(session);
    await mutate(uid,async()=>{
      if (uid) return port.write(uid,data);
      // No await between the guest read and write: the fallback protects this
      // page, while browsers with Web Locks also serialize other tabs.
      const list=readGuest(); const index=list.findIndex(s=>s.id===session.id);
      if(index<0) list.push(data); else list[index]=data;
      storage.setItem(guestHistoryKey,JSON.stringify(list.map(serializeSession)));
    });
  }
  async function remove(id: string, uid?: string) {
    await mutate(uid,async()=>{
      if(uid) return port.remove(uid,id);
      storage.setItem(guestHistoryKey,JSON.stringify(readGuest().filter(s=>s.id!==id).map(serializeSession)));
    });
  }
  async function renameGuest(id:string,title:string):Promise<ChatSession> {
    return mutate(undefined,async()=>{
      const list=readGuest(),index=list.findIndex(session=>session.id===id);
      if(index<0)throw new Error('Conversa indisponível.');
      const previous=list[index];
      const renamed={...previous,title:title.slice(0,120),updatedAt:new Date(Math.max(Date.now(),Date.parse(previous.updatedAt)+1)).toISOString()};
      list[index]=renamed;
      storage.setItem(guestHistoryKey,JSON.stringify(list.map(serializeSession)));
      return renamed;
    });
  }
  return {load,save,remove,renameGuest};
}
