import {AvatarGenderContext} from '../lib/avatarSettings';
import React, { Suspense, useState } from 'react';
import type { AvatarState, AvatarGender } from '../types';
const Avatar3D=React.lazy(()=>import('./Avatar3D').then(m=>({default:m.Avatar})));
interface Props {interactive3D?:boolean;state?:AvatarState;isSpeaking?:boolean;isListening?:boolean;size?:'sm'|'md'|'lg';onClick?:()=>void;showSubtitle?:boolean;onStateChange?:(state:AvatarState)=>void;gender?:AvatarGender;}
class AvatarBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<p role="status">Avatar 3D indisponível</p>:this.props.children;}}
export const Avatar=React.memo((props:Props)=>{
  const [active,setActive]=useState(false);
  const contextGender=React.useContext(AvatarGenderContext);
  const gender=props.gender || contextGender;
  return <div className="absolute inset-0 flex items-center justify-center">
    {active?<AvatarBoundary><Suspense fallback={<span role="status">Carregando avatar…</span>}><Avatar3D {...props} gender={gender}/></Suspense></AvatarBoundary>:<img src={'/model/avatar-preview-'+gender+'.png'} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src='/icons/icon.svg';}} alt="Vigia, assistente de prevenção" className="w-3/4 h-3/4 object-contain"/>}
    {!active&&props.interactive3D!==false&&<button type="button" onClick={()=>setActive(true)} aria-label="Ativar avatar 3D" className="absolute bottom-0 right-0 rounded bg-slate-700 text-white text-xs px-2 py-1">3D</button>}
  </div>;
});
