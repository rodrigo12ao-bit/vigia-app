import {hydrateBadges} from './badges';
import type {Badge} from '../types';

// Older device caches store complete badges; the account API stores their IDs.
export function normalizeProfileProgress(value:unknown):{nickname:string;starsScore:number;avatarGender:'female'|'male';badges:Badge[]}{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Perfil salvo inválido.');
 const profile=value as Record<string,unknown>;
 if(profile.nickname!==undefined&&typeof profile.nickname!=='string')throw Error('Apelido salvo inválido.');
 if(profile.starsScore!==undefined&&(!Number.isSafeInteger(profile.starsScore)||(profile.starsScore as number)<0))throw Error('Pontuação salva inválida.');
 if(profile.badges!==undefined&&!Array.isArray(profile.badges))throw Error('Conquistas salvas inválidas.');
 const ids:string[]=[],dates=new Map<string,string>();
 for(const badge of (profile.badges||[]) as unknown[]){
  if(typeof badge==='string'){ids.push(badge);continue;}
  if(!badge||typeof badge!=='object'||Array.isArray(badge)||typeof (badge as Badge).id!=='string'||typeof (badge as Badge).unlocked!=='boolean')throw Error('Conquista salva inválida.');
  const cached=badge as Badge;if(cached.unlocked){ids.push(cached.id);if(typeof cached.unlockedAt==='string')dates.set(cached.id,cached.unlockedAt);}
 }
 return {nickname:(profile.nickname as string|undefined)?.trim().slice(0,80)||'Super Protetor',starsScore:(profile.starsScore as number|undefined)??0,avatarGender:profile.avatarGender==='male'?'male':'female',badges:hydrateBadges(ids).map(badge=>dates.has(badge.id)?{...badge,unlockedAt:dates.get(badge.id)}:badge)};
}
