import type {ChatSession} from '../types';
import {deserializeSession,serializeSession} from './historyStore';

export const guestHistoryRecoveryKey='vigia_guest_chat_recovery_v1';
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
type SessionStore={load:()=>Promise<ChatSession[]>;save:(session:ChatSession)=>Promise<void>};
function read(storage:StoragePort):ChatSession[] {
  const records=JSON.parse(storage.getItem(guestHistoryRecoveryKey)||'[]');
  if(!Array.isArray(records))throw Error('A recuperação do histórico precisa de revisão. O registro anterior foi preservado.');
  return records.map(deserializeSession);
}
const fingerprint=(session:ChatSession)=>JSON.stringify(serializeSession(session));
export function stageGuestHistory(session:ChatSession,storage:StoragePort) {
  const snapshot=deserializeSession(serializeSession(session));
  const records=read(storage),index=records.findIndex(record=>record.id===snapshot.id);
  if(index<0)records.push(snapshot);
  else if(Date.parse(snapshot.updatedAt)>=Date.parse(records[index].updatedAt))records[index]=snapshot;
  storage.setItem(guestHistoryRecoveryKey,JSON.stringify(records.map(serializeSession)));
}
// A separate outbox makes pagehide synchronous without racing the canonical
// history store's asynchronous account queue. Never persist cloud sessions here.
export async function recoverGuestHistory(store:SessionStore,storage:StoragePort,isCurrent:()=>boolean=()=>true) {
  for(const record of read(storage)){
    if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
    const current=(await store.load()).find(session=>session.id===record.id);
    if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
    if(!current||Date.parse(current.updatedAt)<Date.parse(record.updatedAt))await store.save(record);
    else if(current.updatedAt===record.updatedAt&&fingerprint(current)!==fingerprint(record))throw Error('A recuperação do histórico precisa de revisão. As duas versões foram preservadas.');
    if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
    const remaining=read(storage).filter(session=>session.id!==record.id||fingerprint(session)!==fingerprint(record));
    storage.setItem(guestHistoryRecoveryKey,JSON.stringify(remaining.map(serializeSession)));
  }
}
