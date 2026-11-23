import type {ChatSession} from '../types';
import {deserializeSession,serializeSession,supportsGuestHistoryLocks,type HistoryLockPort} from './historyStore';

// v1 is read only by this version. Close tabs running the previous application
// before updating: concurrent writers of the old shared-array format cannot be
// made atomic by this reader. New snapshots always use independent v2 keys.
export const guestHistoryRecoveryKey='vigia_guest_chat_recovery_v1';
export const guestHistoryRecoveryPrefix='vigia_guest_chat_recovery_v2:';
export const guestHistoryRecoveryLockName='vigia:guest-chat-recovery:v2';
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'|'key'|'length'>;
type SessionStore={load:()=>Promise<ChatSession[]>;save:(session:ChatSession)=>Promise<void>};
type DeletableSessionStore=SessionStore&{remove:(id:string)=>Promise<void>};
type RecoveryOptions={locks?:HistoryLockPort|null};
type RecoveryEntry={record:ChatSession;key?:string;raw?:string};
const invalidRecovery=()=>Error('A recuperação do histórico precisa de revisão. O registro anterior foi preservado.');
const fingerprint=(session:ChatSession)=>JSON.stringify(serializeSession(session));

let recoveryQueue:Promise<unknown>|undefined;
function withRecoveryLock<T>(action:()=>Promise<T>,options:RecoveryOptions):Promise<T> {
 const operation=(recoveryQueue||Promise.resolve()).catch(()=>{}).then(()=>{
  const locks=options.locks===undefined?(supportsGuestHistoryLocks()?navigator.locks:null):options.locks;
  return locks?locks.request(guestHistoryRecoveryLockName,action):action();
 });
 recoveryQueue=operation;
 return operation.finally(()=>{if(recoveryQueue===operation)recoveryQueue=undefined;});
}

function readLegacy(storage:StoragePort):{raw:string|null;records:ChatSession[]} {
 const raw=storage.getItem(guestHistoryRecoveryKey);
 if(raw===null)return {raw,records:[]};
 const records=JSON.parse(raw);
 if(!Array.isArray(records))throw invalidRecovery();
 return {raw,records:records.map(deserializeSession)};
}
function readEntries(storage:StoragePort):RecoveryEntry[] {
 const keys=new Set<string>();
 // Enumerate first. A key staged after this snapshot is left for the next pass;
 // no completion of an older save can delete it by session ID.
 for(let index=0;index<storage.length;index++){
  const key=storage.key(index);
  if(key?.startsWith(guestHistoryRecoveryPrefix))keys.add(key);
 }
 const entries:RecoveryEntry[]=[];
 for(const key of keys){
  const raw=storage.getItem(key);
  if(raw===null)continue; // Another recovery may already have consumed this key.
  entries.push({key,raw,record:deserializeSession(JSON.parse(raw))});
 }
 return entries;
}
let fallbackSequence=0;
function snapshotNonce():string {
 if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
 if(typeof crypto!=='undefined'&&typeof crypto.getRandomValues==='function')return Array.from(crypto.getRandomValues(new Uint32Array(4)),value=>value.toString(16).padStart(8,'0')).join('');
 // Uniqueness is the only purpose; these identifiers are not authorization
 // tokens. The per-page sequence also distinguishes rapid legacy-browser saves.
 return Date.now().toString(36)+'-'+(++fallbackSequence).toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
}
function removeExact(entry:RecoveryEntry,storage:StoragePort):void {
 if(entry.key&&storage.getItem(entry.key)===entry.raw)storage.removeItem(entry.key);
}

export function stageGuestHistory(session:ChatSession,storage:StoragePort) {
 const raw=fingerprint(session);
 readLegacy(storage); // Preserve the previous conservative corruption check.
 // One atomic Storage.setItem, with no shared array read/modify/write. Existing
 // snapshots (including snapshots of this session) are immutable and retained.
 let key:string;
 do {key=guestHistoryRecoveryPrefix+encodeURIComponent(session.id)+':'+snapshotNonce();}while(storage.getItem(key)!==null);
 storage.setItem(key,raw);
}

// Only callers already holding the recovery lock may enumerate snapshots. The
// canonical store takes its own lock inside save/remove: recovery -> canonical
// is the only acquisition order; no canonical action calls recovery again.
async function recoverUnlocked(store:SessionStore,storage:StoragePort,isCurrent:()=>boolean) {
 if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
 const legacy=readLegacy(storage);
 const entries:RecoveryEntry[]=[...legacy.records.map(record=>({record})),...readEntries(storage)]
  .sort((a,b)=>Date.parse(a.record.updatedAt)-Date.parse(b.record.updatedAt));
 for(const entry of entries){
  const {record}=entry;
  if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
  const current=(await store.load()).find(session=>session.id===record.id);
  if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
  if(!current||Date.parse(current.updatedAt)<Date.parse(record.updatedAt))await store.save(record);
  else if(Date.parse(current.updatedAt)===Date.parse(record.updatedAt)&&fingerprint(current)!==fingerprint(record))throw Error('A recuperação do histórico precisa de revisão. As duas versões foram preservadas.');
  if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
  removeExact(entry,storage);
 }
 // Consume the entire unchanged v1 batch only after every record is confirmed.
 // There is no per-record rewrite that could revive another tab's consumed row,
 // and no permanent marker retaining copies of deleted conversation contents.
 if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
 if(legacy.raw!==null&&storage.getItem(guestHistoryRecoveryKey)===legacy.raw)storage.removeItem(guestHistoryRecoveryKey);
}

// Pagehide remains synchronous and only appends immutable keys. Recovery and
// deletion share this separate lock, including snapshot enumeration, so a
// suspended recovery cannot recreate an ID after its deletion has completed.
export function recoverGuestHistory(store:SessionStore,storage:StoragePort,isCurrent:()=>boolean=()=>true,options:RecoveryOptions={}) {
 return withRecoveryLock(()=>recoverUnlocked(store,storage,isCurrent),options);
}

export function deleteGuestHistory(store:DeletableSessionStore,storage:StoragePort,sessionId:string,isCurrent:()=>boolean=()=>true,options:RecoveryOptions={}) {
 return withRecoveryLock(async()=>{
  await recoverUnlocked(store,storage,isCurrent);
  if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
  discardGuestHistory(sessionId,storage);
  if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
  await store.remove(sessionId);
  if(!isCurrent())throw Error('A conta mudou. Reabra o histórico.');
 },options);
}

// A synchronous cleanup helper for observed entries. Application deletion must
// use deleteGuestHistory, which holds the recovery lock across this cleanup and
// canonical removal. This helper alone does not coordinate other recoveries.
export function discardGuestHistory(sessionId:string,storage:StoragePort):void {
 if(readLegacy(storage).records.some(record=>record.id===sessionId))throw Error('Recupere o histórico pendente antes de excluir esta conversa. O registro anterior foi preservado.');
 const entries=readEntries(storage).filter(entry=>entry.record.id===sessionId);
 for(const entry of entries)removeExact(entry,storage);
}
