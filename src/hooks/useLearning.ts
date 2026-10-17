import {useCallback,useEffect,useRef,useState} from 'react';
import {auth} from '../lib/firebaseAuth';
import {announceReward} from '../lib/activityFeedback';
import {learningRequest} from '../lib/learningApi';
import {emptyLearning,evaluateMission,learningStorageKey,missionById,normalizeLearning,readLearningCache,type LearningCache,type MissionAnswers,type LearningProgress} from '../lib/learningModel';
export function useLearning(uid?:string,onGuestReward?:(points:number,badge:string)=>void){
 const [progress,setProgress]=useState<LearningProgress>(emptyLearning),[ready,setReady]=useState(false),[notice,setNotice]=useState(''),[syncing,setSyncing]=useState(false);
 const [assignments,setAssignments]=useState<any[]>([]),[familyRequests,setFamilyRequests]=useState<any[]>([]);
 const cache=useRef<LearningCache>({progress:emptyLearning(),pending:[]}),disposed=useRef(false),busy=useRef(false),generation=useRef(0),revision=useRef(0),preferenceRevision=useRef(0),reward=useRef(onGuestReward);reward.current=onGuestReward;
 const validAccount=useCallback((version=generation.current)=>!disposed.current&&version===generation.current&&(auth.currentUser?.uid||undefined)===uid,[uid]);
 const write=useCallback((next:LearningCache)=>{cache.current=next;revision.current++;setProgress(next.progress);try{localStorage.setItem(learningStorageKey(uid),JSON.stringify(next));}catch{setNotice('O armazenamento deste aparelho está cheio. Verifique a sincronização antes de sair.');}window.dispatchEvent(new CustomEvent('vigia-reading',{detail:{uid,reading:next.progress.reading,textSize:next.progress.textSize}}));},[uid]);
 const load=useCallback(async()=>{
  const version=generation.current,startedRevision=revision.current;
  if(!uid||!validAccount(version))return;
  try{
   const data=await learningRequest('/api/learning/load');if(!validAccount(version))return;
   // A delayed read must not roll back a lesson or preference saved meanwhile.
   if(startedRevision===revision.current){
   const remote=normalizeLearning(data.progress),lessons={...remote.lessons};for(const p of cache.current.pending){const own=cache.current.progress.lessons[p.lessonId];if(own)lessons[p.lessonId]=own;}
   write({progress:{...remote,lessons,...(cache.current.preferencesDirty?{reading:cache.current.progress.reading,textSize:cache.current.progress.textSize}:{})},pending:cache.current.pending,preferencesDirty:cache.current.preferencesDirty});
   }
   setAssignments(Array.isArray(data.assignments)?data.assignments:[]);setFamilyRequests(Array.isArray(data.familyRequests)?data.familyRequests:[]);setNotice(cache.current.pending.length?'Atividades salvas neste aparelho. Aguardando sincronização.':'');
  }catch(e){if(validAccount(version))setNotice('Sem conexão com sua conta. As atividades continuam disponíveis; o progresso fica neste aparelho até sincronizar.');}
 },[uid,write,validAccount]);
 const sync=useCallback(async()=>{
  const version=generation.current;
  if(!uid||busy.current||!validAccount(version)||!navigator.onLine)return;busy.current=true;setSyncing(true);
  const results:Record<string,any>={};
  try{
   // Serialize writes and drain changes made while a request is pending.
   while(validAccount(version)&&(cache.current.preferencesDirty||cache.current.pending.length)){
    if(cache.current.preferencesDirty){
     const preferenceVersion=preferenceRevision.current,{reading,textSize}=cache.current.progress;
     await learningRequest('/api/learning/preferences',{reading,textSize});if(!validAccount(version))return;
     if(preferenceVersion===preferenceRevision.current)write({...cache.current,preferencesDirty:false});
    }
    const pending=cache.current.pending[0];if(!pending)continue;
    const data=await learningRequest('/api/learning/complete',pending as any);if(!validAccount(version))return;results[pending.lessonId]=data;
    const remaining=cache.current.pending.filter(p=>p!==pending),remote=normalizeLearning(data.progress),lessons={...remote.lessons};for(const p of remaining){const own=cache.current.progress.lessons[p.lessonId];if(own)lessons[p.lessonId]=own;}
    write({progress:{...remote,lessons,reading:cache.current.progress.reading,textSize:cache.current.progress.textSize},pending:remaining,preferencesDirty:cache.current.preferencesDirty});
   }
   if(validAccount(version)&&cache.current.pending.length===0)setNotice('');return results;
  }catch(e){if(validAccount(version))setNotice('Atividade salva neste aparelho. As estrelas serão confirmadas quando a conexão voltar.');}
  finally{if(version===generation.current){busy.current=false;if(validAccount(version))setSyncing(false);}}
 },[uid,write,validAccount]);
 useEffect(()=>{++generation.current;disposed.current=false;busy.current=false;setSyncing(false);setReady(false);setProgress(emptyLearning());setAssignments([]);setFamilyRequests([]);setNotice('');
  try{cache.current=readLearningCache(localStorage,uid);setProgress(cache.current.progress);setReady(true);window.dispatchEvent(new CustomEvent('vigia-reading',{detail:{uid,...cache.current.progress}}));}
  catch{setNotice('O progresso deste aparelho está inválido. O conteúdo anterior foi preservado.');return()=>{disposed.current=true;++generation.current;};}
  void load().then(()=>sync());const online=()=>{void load().then(()=>sync());};window.addEventListener('online',online);
  return()=>{disposed.current=true;++generation.current;window.removeEventListener('online',online);};
 },[uid,load,sync]);
 async function complete(lessonId:string,answers:MissionAnswers,mistakes:number){
  const version=generation.current;
  if(!validAccount(version)||!ready)throw Error('A conta mudou. Reabra a atividade.');
  if(!Number.isInteger(mistakes)||mistakes<0||mistakes>50)throw Error('Número de tentativas inválido.');
  if(!evaluateMission(lessonId,answers).complete)throw Error('Revise os passos antes de concluir.');
  const first=!cache.current.progress.lessons[lessonId];
  const next={...cache.current.progress,lessons:{...cache.current.progress.lessons,[lessonId]:cache.current.progress.lessons[lessonId]||{completedAt:new Date().toISOString(),score:100,mistakes}}};
  const pending=uid?[...cache.current.pending.filter(p=>p.lessonId!==lessonId),{lessonId,answers,mistakes}]:[];
  write({progress:next,pending,preferencesDirty:cache.current.preferencesDirty});
  if(!uid&&first){const m=missionById(lessonId);reward.current?.(m.reward,'learning_'+m.id);}
  const results=uid?await sync():undefined;if(!validAccount(version))throw Error('A conta mudou. Reabra a atividade.');
  const confirmed=results?.[lessonId],offline=!!uid&&cache.current.pending.some(p=>p.lessonId===lessonId);if(uid&&(confirmed?.awarded||offline))announceReward(uid,{xp:missionById(lessonId).reward,title:missionById(lessonId).title,pending:offline,badges:confirmed?.badges});return {first:confirmed?confirmed.awarded:first,offline,xp:confirmed?.xp??(first?missionById(lessonId).reward:0)};
 }
 async function preferences(reading:LearningProgress['reading'],textSize:LearningProgress['textSize']){
  if(!validAccount()||!ready)return;
  preferenceRevision.current++;
  const next={...cache.current.progress,reading,textSize};write({...cache.current,progress:next,preferencesDirty:!!uid});
  if(uid)await sync();
 }
 return {progress,ready,notice,syncing,assignments,familyRequests,complete,preferences,reload:load,sync,pending:cache.current.pending.length};
}
