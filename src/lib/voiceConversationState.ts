import type {ChatSession} from '../types';
import {appendVoiceTurn,createConversationMemory,queueConversationSnapshot,type ConversationMemory} from './conversationState';

export interface VoiceConversationMemory extends ConversationMemory {
  messages: ChatSession['messages'];
}

// Keep the existing history schema and old records. Only new voice sessions use
// this ID namespace, so selecting a spoken record never replaces a text draft.
export const isVoiceSession=(session:Pick<ChatSession,'id'>)=>session.id.startsWith('voice:');

export function createVoiceConversationMemory(uid?:string):VoiceConversationMemory {
  return {...createConversationMemory(uid),messages:[]};
}

export function queueVoiceConversationSnapshot(memory:VoiceConversationMemory) {
  if(!memory.metadata.current&&memory.messages.some(message=>message.role==='user')){
    const first=memory.messages.find(message=>message.role==='user')!;
    memory.metadata.current={id:'voice:'+crypto.randomUUID(),title:first.content.slice(0,30),createdAt:new Date().toISOString()};
  }
  queueConversationSnapshot(memory,memory.messages);
}

export function appendVoiceConversationTurn(memory:VoiceConversationMemory,input:string,reply:string) {
  if(!input.trim()||!reply.trim())return;
  if(memory.messages.length>198)throw Error('Esta conversa por voz atingiu o limite. Inicie uma nova conversa por voz; o histórico foi preservado.');
  memory.messages=appendVoiceTurn(memory.messages,input,reply);
  queueVoiceConversationSnapshot(memory);
}

export function flushVoiceConversation(memory:VoiceConversationMemory,ports:{
  current:()=>boolean;
  save:(session:ChatSession,uid?:string)=>Promise<void>;
  stageGuest:(session:ChatSession)=>void;
}):Promise<void> {
  if(memory.flushing)return memory.flushing;
  const run=async()=>{while(memory.pendingSave.current){
    if(!ports.current())throw Error('A conta mudou. Reabra o histórico de voz na sua conta.');
    const pending=memory.pendingSave.current;
    if(!pending.uid)ports.stageGuest(pending.session);
    await ports.save(pending.session,pending.uid);
    if(!ports.current())throw Error('A conta mudou. Reabra o histórico de voz na sua conta.');
    memory.savedSession=pending.session;
    if(memory.pendingSave.current===pending)memory.pendingSave.current=null;
  }};
  const flushing=run().finally(()=>{if(memory.flushing===flushing)memory.flushing=undefined;});
  memory.flushing=flushing;
  return flushing;
}
