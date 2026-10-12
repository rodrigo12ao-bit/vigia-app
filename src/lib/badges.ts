import {LEARNING_MISSIONS} from '../data/learningMissions';
import {ADVENTURE_BADGES} from './adventureModel';
import { INITIAL_BADGES } from '../data/quizzes';
import type { Badge } from '../types';
export const defaultBadges:Badge[]=[...INITIAL_BADGES,...ADVENTURE_BADGES.map(b=>({...b,unlocked:false,category:'general' as const})),...LEARNING_MISSIONS.map(m=>({id:'learning_'+m.id,title:m.skill,description:'Concluiu a missão '+m.title,icon:m.icon,unlocked:false,category:'general' as const}))];
export function hydrateBadges(ids:unknown):Badge[]{
  const saved=Array.isArray(ids)?[...new Set(ids.filter((id):id is string=>typeof id==='string'))]:[];
  const known=new Set(defaultBadges.map(b=>b.id));
  return [...defaultBadges.map(b=>({...b,unlocked:saved.includes(b.id)})),...saved.filter(id=>!known.has(id)).map(id=>({id,title:id==='primeiros_passos'?'Primeiros passos':'Conquista salva',description:'Conquista registrada no seu progresso.',icon:'🛡️',unlocked:true,category:'general' as const}))];
}
