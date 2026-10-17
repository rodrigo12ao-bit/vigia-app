import type {ChatMessage,ChatSession} from '../types';

export type ConversationMetadata=Pick<ChatSession,'id'|'title'|'createdAt'>;
export type ConversationImage={data:string;mimeType:string;previewUrl:string};
export function appendVoiceTurn(messages:ChatMessage[],input:string,reply:string):ChatMessage[] {
  if(messages.length+2>200)return messages;
  const timestamp=new Date();
  return [...messages,{id:crypto.randomUUID(),role:'user',content:input,timestamp},{id:crypto.randomUUID(),role:'assistant',content:reply,timestamp,emotion:'explaining'}];
}
export interface ConversationMemory {
  uid?:string;
  historyReady:boolean;
  metadata:{current:ConversationMetadata|null};
  restoredMessages:{current:ChatMessage[]|null};
  pendingSave:{current:{session:ChatSession;uid?:string}|null};
  queuedMessages:ChatMessage[]|null;
  updatedAt:number;
  draft:{text:string;image:ConversationImage|null};
  draftListeners?:Set<()=>void>;
  flush?:()=>Promise<void>;
  flushing?:Promise<void>;
  stageGuest?:(session:ChatSession)=>void;
  savedSession?:ChatSession;
  stopAudio?:()=>void;
}
export function createConversationMemory(uid?:string):ConversationMemory {
  return {uid,historyReady:false,metadata:{current:null},restoredMessages:{current:null},pendingSave:{current:null},queuedMessages:null,updatedAt:0,draft:{text:'',image:null}};
}
export function updateConversationDraft(memory:ConversationMemory,patch:Partial<ConversationMemory['draft']>){
  Object.assign(memory.draft,patch);
  for(const listener of memory.draftListeners||[])listener();
}
export function subscribeConversationDraft(memory:ConversationMemory,listener:()=>void){
  const listeners=memory.draftListeners||(memory.draftListeners=new Set());listeners.add(listener);listener();
  return ()=>{listeners.delete(listener);};
}
export function mergeSavedSession(sessions:ChatSession[],saved:ChatSession):ChatSession[] {
  return [...sessions.filter(session=>session.id!==saved.id),saved].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
}
// App owns this memory so changing tabs can tear down audio without losing the
// identity or latest unsaved snapshot of the conversation.
export function queueConversationSnapshot(memory:ConversationMemory,messages:ChatMessage[],loading=false) {
  if(!memory.historyReady||loading||memory.restoredMessages.current===messages||memory.queuedMessages===messages)return;
  const first=messages.find(message=>message.role==='user');
  if(!first)return;
  const metadata=memory.metadata.current||{id:crypto.randomUUID(),title:first.content.slice(0,30),createdAt:new Date().toISOString()};
  memory.metadata.current=metadata;
  memory.updatedAt=Math.max(Date.now(),memory.updatedAt+1);
  memory.pendingSave.current={uid:memory.uid,session:{...metadata,updatedAt:new Date(memory.updatedAt).toISOString(),lastMessagePreview:messages.at(-1)?.content.slice(0,50)||'',messages:messages.map(message=>({...message}))}};
  memory.queuedMessages=messages;
}
export function requireConversationReadyForUpdate(memory:ConversationMemory,messages:ChatMessage[],activity:{loading:boolean;mode:'text'|'live'},action='atualizar') {
  if(activity.loading)throw Error(`Aguarde a resposta terminar antes de ${action}.`);
  if(activity.mode==='live')throw Error(`Encerre a conversa por voz antes de ${action}.`);
  if(memory.draft.text.trim()||memory.draft.image)throw Error(`Há uma mensagem não enviada. Envie ou remova o rascunho antes de ${action}.`);
  if(!memory.historyReady&&messages.some(message=>message.role==='user'))throw Error(`O histórico está indisponível. Recarregue o histórico antes de ${action}; a conversa aberta permanece preservada.`);
}
export async function flushConversationForUpdate(flush:()=>Promise<void>,check:()=>void,timeoutMs=12000) {
  check();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await Promise.race([flush(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('O salvamento ainda não foi confirmado. Verifique a conexão e tente atualizar novamente.')),timeoutMs);})]);
    check();
  }finally{clearTimeout(timer);}
}
