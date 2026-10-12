import {LEARNING_MISSIONS,type Mission,type ReadingLevel} from '../data/learningMissions';
export interface MissionAnswers {choices?:Record<string,number>;items?:string[];order?:string[];}
export interface LessonResult {completedAt:string;score:number;mistakes:number;}
export interface LearningProgress {version:1;lessons:Record<string,LessonResult>;reading:ReadingLevel;textSize:'normal'|'large';}
export const emptyLearning=():LearningProgress=>({version:1,lessons:{},reading:'basic',textSize:'normal'});
export function missionById(id:string):Mission {const mission=LEARNING_MISSIONS.find(m=>m.id===id);if(!mission)throw Error('Atividade indisponível.');return mission;}
export function evaluateMission(id:string,answers:MissionAnswers){
 const m=missionById(id);
 if(!answers || typeof answers!=='object' || Object.keys(answers).some(k=>!['choices','items','order'].includes(k)))throw Error('Respostas inválidas.');
 let correct=0,total=0;
 if(m.questions){const choices=answers.choices;if(!choices||typeof choices!=='object'||Array.isArray(choices)||Object.keys(choices).some(k=>!m.questions!.some(q=>q.id===k)))throw Error('Respostas inválidas.');total=m.questions.length;for(const q of m.questions){const v=choices[q.id];if(!Number.isInteger(v)||v<0||v>=q.options.length)throw Error('Responda todos os passos.');if(v===q.correctIndex)correct++;}}
 if(m.items){const ids=answers.items;if(!Array.isArray(ids)||ids.length>m.items.length||new Set(ids).size!==ids.length||ids.some(id=>!m.items!.some(i=>i.id===id)))throw Error('Itens inválidos.');total=m.items.length;correct=m.items.filter(i=>ids.includes(i.id)===i.essential).length;}
 if(m.steps){const ids=answers.order;if(!Array.isArray(ids)||ids.length!==m.steps.length||new Set(ids).size!==ids.length||ids.some(id=>!m.steps!.some(s=>s.id===id)))throw Error('Organize todos os passos.');total=m.steps.length;correct=m.steps.filter((s,i)=>ids[i]===s.id).length;}
 return {complete:correct===total,score:Math.round(100*correct/total),correct,total};
}
export function normalizeLearning(value:unknown):LearningProgress {
 if(value===undefined||value===null)return emptyLearning();const d=value as LearningProgress;
 if(d.version!==1 || !d.lessons || typeof d.lessons!=='object'||Array.isArray(d.lessons)||!['basic','standard','advanced'].includes(d.reading)||!['normal','large'].includes(d.textSize))throw Error('O progresso salvo precisa de revisão. O conteúdo anterior foi preservado.');
 for(const [id,r] of Object.entries(d.lessons)){missionById(id);if(!r||typeof r.completedAt!=='string'||!Number.isFinite(Date.parse(r.completedAt))||r.score!==100||!Number.isInteger(r.mistakes)||r.mistakes<0||r.mistakes>50)throw Error('Progresso inválido. O conteúdo anterior foi preservado.');}
 return d;
}
export function recommendMission(progress:LearningProgress){return LEARNING_MISSIONS.find(m=>!progress.lessons[m.id]) || [...LEARNING_MISSIONS].sort((a,b)=>(progress.lessons[b.id]?.mistakes||0)-(progress.lessons[a.id]?.mistakes||0))[0];}
export const learningStorageKey=(uid?:string)=>'vigia_learning_v2:'+(uid||'guest');
export interface PendingLesson {lessonId:string;answers:MissionAnswers;mistakes:number;}
export interface LearningCache {progress:LearningProgress;pending:PendingLesson[];preferencesDirty?:boolean;}
export function readLearningCache(storage:Pick<Storage,'getItem'>,uid?:string):LearningCache {
 const raw=storage.getItem(learningStorageKey(uid));if(!raw)return {progress:emptyLearning(),pending:[]};
 const parsed=JSON.parse(raw);if(!Array.isArray(parsed.pending)||parsed.pending.length>LEARNING_MISSIONS.length)throw Error('Fila de progresso inválida.');
 for(const p of parsed.pending){if(!Number.isInteger(p.mistakes)||p.mistakes<0||p.mistakes>50||!evaluateMission(p.lessonId,p.answers).complete)throw Error('Resposta pendente inválida.');}
 return {progress:normalizeLearning(parsed.progress),pending:parsed.pending,preferencesDirty:parsed.preferencesDirty===true};
}
