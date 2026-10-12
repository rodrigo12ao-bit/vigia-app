import {useEscapeStore} from './escapeStore';
import React from 'react';
export const touchState: Record<string,boolean> = {};
export const touchEnabled=()=>typeof window!=='undefined' && window.matchMedia('(pointer: coarse)').matches;
export function TouchControls() {
  React.useEffect(()=>{const reset=()=>{Object.keys(touchState).forEach(k=>touchState[k]=false);};window.addEventListener('blur',reset);window.addEventListener('pointercancel',reset);return()=>{reset();window.removeEventListener('blur',reset);window.removeEventListener('pointercancel',reset);};},[]);
  if(!touchEnabled())return null;
  const hold=(key:string,label:string)=><button key={key} aria-label={label} className="rounded-xl bg-slate-800/90 text-white border border-white/40 px-3 py-3 touch-none select-none" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);touchState[key]=true;}} onPointerUp={()=>touchState[key]=false} onLostPointerCapture={()=>touchState[key]=false}>{label}</button>;
  const action=(label:string,button:number)=><button aria-label={label} className="p-3 rounded-xl bg-orange-700 text-white" onPointerDown={()=>window.dispatchEvent(new CustomEvent('escape-interact',{detail:button}))}>{label}</button>;
  return <div className="absolute bottom-3 inset-x-3 flex items-end justify-between gap-2 z-40 text-xs">
    <div className="grid grid-cols-3 gap-1">{hold('left','←')}{hold('forward','↑')}{hold('right','→')}{hold('crouch','Agachar')}{hold('backward','↓')}{hold('prone','Rastejar')}</div>
    <div className="grid grid-cols-2 gap-1">{hold('lookLeft','Olhar ←')}{hold('lookRight','Olhar →')}{hold('jump','Pular')}{hold('run','Correr')}{action('Pegar',0)}{action('Arremessar',2)}<button className="p-3 rounded bg-slate-800 text-white" onClick={()=>useEscapeStore.getState().toggleFlashlight()}>Lanterna</button></div>
  </div>;
}
