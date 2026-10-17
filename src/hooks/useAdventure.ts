import {MODULES_DATA} from '../data/learningJourneyData';
import {useEffect,useRef,useState} from 'react';
import {auth} from '../lib/firebaseAuth';
import {learningRequest} from '../lib/learningApi';
import {ACTIVITY_LABELS,activityKey,advanceAdventure,adventureKey,emptyAdventure,earnedAdventureBadges,normalizeAdventure,type ActivityClaim,type AdventureCache} from '../lib/adventureModel';
import {announceReward,stopActivityFeedback} from '../lib/activityFeedback';
export function useAdventure(uid:string|undefined,stars:number,onGuestPoints:(n:number)=>void,onGuestBadge:(id:string)=>void){
 const [state,setState]=useState(emptyAdventure),[pending,setPending]=useState(0),[notice,setNotice]=useState('');const cache=useRef<AdventureCache>({state:emptyAdventure(),earned:[],pending:[]}),generation=useRef(0),busy=useRef(false),blocked=useRef(false),score=useRef(stars);score.current=stars;
 const guestPoints=useRef(onGuestPoints),guestBadge=useRef(onGuestBadge);guestPoints.current=onGuestPoints;guestBadge.current=onGuestBadge;
 function write(next:AdventureCache){cache.current=next;setState(next.state);setPending(next.pending.length);try{localStorage.setItem(adventureKey(uid),JSON.stringify(next));}catch{setNotice('O aparelho está sem espaço para salvar a aventura.');}}
 async function sync(){
  if(!uid||busy.current||auth.currentUser?.uid!==uid||!navigator.onLine)return;busy.current=true;const v=generation.current;
  try{for(const item of [...cache.current.pending]){const result=await learningRequest('/api/learning/reward',{claim:item.claim});if(v!==generation.current||auth.currentUser?.uid!==uid)return;write({...cache.current,state:normalizeAdventure(result.state),pending:cache.current.pending.filter(p=>activityKey(p.claim)!==activityKey(item.claim))});}setNotice('');}catch{if(v===generation.current)setNotice('Recompensa salva neste aparelho. Aguardando conexão com sua conta.');}finally{if(v===generation.current)busy.current=false;}
 }
 useEffect(()=>{
  const v=++generation.current;busy.current=false;blocked.current=false;setState(emptyAdventure());setPending(0);setNotice('');stopActivityFeedback();
  try{const raw=localStorage.getItem(adventureKey(uid));const saved=raw?JSON.parse(raw):{state:emptyAdventure(),earned:[],pending:[]};const state=normalizeAdventure(saved.state);if(!Array.isArray(saved.earned)||saved.earned.some((key:unknown)=>typeof key!=='string')||!Array.isArray(saved.pending)||saved.pending.length>100)throw Error();for(const p of saved.pending){activityKey(p.claim);if(!Number.isFinite(p.points)||p.points<0||p.points>100)throw Error();}cache.current={...saved,state};setState(state);setPending(saved.pending.length);}catch{blocked.current=true;cache.current={state:emptyAdventure(),earned:[],pending:[]};setNotice('O registro anterior da aventura foi preservado e precisa de revisão.');return ()=>{++generation.current;};}
  let unsubscribe=()=>{};
  if(uid){void import('../lib/firebase').then(({db,doc,onSnapshot})=>{
   if(v!==generation.current||auth.currentUser?.uid!==uid)return;
   unsubscribe=onSnapshot(doc(db,'users',uid,'adventure','main'),snapshot=>{if(v!==generation.current||auth.currentUser?.uid!==uid)return;if(snapshot.exists())try{write({...cache.current,state:normalizeAdventure(snapshot.data())});}catch{setNotice('Não foi possível ler o progresso da aventura.');}},()=>{if(v===generation.current)setNotice('Aventura disponível neste aparelho. A sincronização está sem conexão.');});
   void learningRequest('/api/learning/adventure').then(()=>{if(v===generation.current&&auth.currentUser?.uid===uid)return sync();}).catch(()=>{});
  }).catch(()=>{if(v===generation.current)setNotice('Aventura disponível neste aparelho. A sincronização está sem conexão.');});}
  else {try{const learning=JSON.parse(localStorage.getItem('vigia_learning_v2:guest')||'null')?.progress;for(const id of Object.keys(learning?.lessons||{})){if(cache.current.earned.includes('lesson_'+id))continue;cache.current.state=advanceAdventure(cache.current.state,'lesson',learning.lessons[id].completedAt.slice(0,10));cache.current.earned.push('lesson_'+id);}const journey=JSON.parse(localStorage.getItem('vigia_journey:guest')||'null');for(const level of MODULES_DATA.flatMap(m=>m.levels)){if(journey?.levelProgress?.[level.id]?.completed&&!cache.current.earned.includes('trail_'+level.id)){cache.current.earned.push('trail_'+level.id);cache.current.state={...cache.current.state,completed:cache.current.state.completed+1,counts:{...cache.current.state.counts,trail:(cache.current.state.counts.trail||0)+1}};}}write(cache.current);}catch{}}
  const online=()=>void sync();window.addEventListener('online',online);return()=>{++generation.current;unsubscribe();window.removeEventListener('online',online);stopActivityFeedback();};
 },[uid]);
 async function earn(claim:ActivityClaim,points:number){
  const v=generation.current,key=activityKey(claim);if(blocked.current)throw Error('O registro anterior precisa de revisão e foi preservado.');if((uid||undefined)!==(auth.currentUser?.uid||undefined))throw Error('A conta mudou. Reabra a atividade.');
  if(!uid){if(cache.current.earned.includes(key))return {awarded:false,xp:0};const next=advanceAdventure(cache.current.state,claim.kind,claim.day);const xp=Math.max(0,Math.min(100,Math.round(points)));const badges=earnedAdventureBadges(next,score.current+xp);write({state:next,earned:[...cache.current.earned,key].slice(-5000),pending:[]});guestPoints.current(xp);for(const id of badges)guestBadge.current(id);announceReward(undefined,{xp,title:ACTIVITY_LABELS[claim.kind],badges});return {awarded:true,xp};}
  try{const result=await learningRequest('/api/learning/reward',{claim});if(v!==generation.current)throw Error('A conta mudou.');write({...cache.current,state:normalizeAdventure(result.state),pending:cache.current.pending.filter(p=>activityKey(p.claim)!==key)});if(result.awarded)announceReward(uid,{xp:result.xp,title:ACTIVITY_LABELS[claim.kind],badges:result.badges});return result;}
  catch(e){if(v!==generation.current)throw e;if(e instanceof Error&&/inválid|expirou|Confira|mudou/.test(e.message))throw e;if(!cache.current.pending.some(p=>activityKey(p.claim)===key)){if(cache.current.pending.length>=100)throw Error('Sincronize as atividades pendentes antes de continuar.');write({...cache.current,pending:[...cache.current.pending,{claim,points}]});}setNotice('Recompensa salva neste aparelho. Aguardando conexão.');announceReward(uid,{xp:points,title:ACTIVITY_LABELS[claim.kind],pending:true});return {awarded:false,pending:true,xp:0};}
 }
 return {state,pending,notice,earn,sync};
}
