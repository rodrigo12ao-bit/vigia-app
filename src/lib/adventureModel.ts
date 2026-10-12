export type ActivityKind='lesson'|'quiz'|'scenario'|'daily'|'trail'|'family';
export interface ActivityClaim {kind:ActivityKind;id:string;answer?:number;day?:string;stars?:number;score?:number;}
export interface Adventure {version:1;completed:number;counts:Partial<Record<ActivityKind,number>>;days:string[];lastActivity:string;}
export interface AdventureCache {state:Adventure;earned:string[];pending:{claim:ActivityClaim;points:number}[];}
export const ACTIVITY_LABELS:Record<ActivityKind,string>={lesson:'Missão',quiz:'Desafio com a Vigia',scenario:'Explorar uma situação',daily:'Missão diária',trail:'Trilha de aventura',family:'Missão em família'};
export const ADVENTURE_BADGES=[
 {id:'adventure_first',title:'A aventura começou',description:'Conclua sua primeira atividade.',icon:'🚀',minActivities:1,minXp:0},
 {id:'adventure_100',title:'Centelha de proteção',description:'Junte 100 XP em sua jornada.',icon:'⚡',minActivities:1,minXp:100},
 {id:'adventure_five',title:'Mão na massa',description:'Conclua 5 atividades.',icon:'🏅',minActivities:5,minXp:0},
 {id:'adventure_variety',title:'Explorador de ideias',description:'Experimente 3 tipos de atividade.',icon:'🧭',minActivities:1,minXp:0,minKinds:3},
 {id:'adventure_250',title:'Guardião em ação',description:'Junte 250 XP.',icon:'🛡️',minActivities:1,minXp:250},
 {id:'adventure_days',title:'Aprender é uma aventura',description:'Pratique em 3 dias diferentes, no seu ritmo.',icon:'🌟',minActivities:1,minXp:0,minDays:3},
 {id:'adventure_ten',title:'Super preparado',description:'Conclua 10 atividades.',icon:'🏆',minActivities:10,minXp:0},
 {id:'adventure_500',title:'Brilha, guardião!',description:'Junte 500 XP.',icon:'💎',minActivities:1,minXp:500},
];
export const emptyAdventure=():Adventure=>({version:1,completed:0,counts:{},days:[],lastActivity:''});
export const adventureKey=(uid?:string)=>'vigia_adventure_v1:'+(uid||'guest');
export const learningDay=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function normalizeAdventure(value:unknown):Adventure {
 if(value==null)return emptyAdventure();const v=value as Adventure;
 if(v.version!==1||!Number.isSafeInteger(v.completed)||v.completed<0||!v.counts||typeof v.counts!=='object'||Array.isArray(v.counts)||!Array.isArray(v.days)||v.days.length>31||v.days.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d))||typeof v.lastActivity!=='string')throw Error('Progresso da aventura inválido. O registro anterior foi preservado.');
 for(const [kind,n] of Object.entries(v.counts))if(!Object.hasOwn(ACTIVITY_LABELS,kind)||!Number.isSafeInteger(n)||n<0)throw Error('Atividades inválidas.');return v;
}
export function activityKey(claim:ActivityClaim){
 if(!claim||!Object.hasOwn(ACTIVITY_LABELS,claim.kind)||typeof claim.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(claim.id))throw Error('Atividade inválida.');
 if(claim.kind==='daily'&&!/^\d{4}-\d{2}-\d{2}$/.test(claim.day||''))throw Error('Data inválida.');
 return claim.kind+'_'+(claim.kind==='daily'?claim.day:claim.id);
}
export function advanceAdventure(previous:Adventure,kind:ActivityKind,day=learningDay()):Adventure {
 return {...previous,completed:previous.completed+1,counts:{...previous.counts,[kind]:(previous.counts[kind]||0)+1},days:[...new Set([...previous.days,day])].sort().slice(-31),lastActivity:ACTIVITY_LABELS[kind]};
}
export function earnedAdventureBadges(state:Adventure,xp:number){return ADVENTURE_BADGES.filter(b=>state.completed>=b.minActivities&&xp>=b.minXp&&(!('minKinds' in b)||Object.values(state.counts).filter(n=>n&&n>0).length>=b.minKinds!)&&(!('minDays' in b)||state.days.length>=b.minDays!)).map(b=>b.id);}
export function adventureLevel(xp:number){const safe=Math.max(0,Math.floor(Number.isFinite(xp)?xp:0));return {level:Math.floor(safe/100)+1,current:safe%100,next:100,remaining:100-safe%100};}
