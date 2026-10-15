import React from 'react';
import {Home,BookOpen,MessageCircle,Shield,User,Volume2,VolumeX,LifeBuoy} from 'lucide-react';
import type {User as FirebaseUser} from '../lib/firebaseAuth';
export type AppTab='home'|'learn'|'school'|'chat'|'games'|'topics'|'phones'|'sala_segura';
interface NavbarProps {
 activeTab:AppTab;setActiveTab:(tab:AppTab)=>void;starsScore:number;unlockedBadgesCount:number;totalBadgesCount:number;
 onOpenBadges:()=>void;onOpenDailyMission?:()=>void;onOpenScenarioAnalyzer?:()=>void;onOpenDynamicQuiz?:()=>void;
 onOpenProfile?:()=>void;onOpenAuth?:()=>void;currentUser:FirebaseUser|null;nickname:string;isGuest:boolean;
 isAudioMuted:boolean;setIsAudioMuted:(value:boolean)=>void;chatMode?:'text'|'live';
}
export const Navbar:React.FC<NavbarProps>=props=>{
 const entries:[AppTab,string,string,typeof Home][]=[['home','Início','Início',Home],['chat','Conversar','Conversa & Voz',MessageCircle],['learn','Aprender','Aprender com a Vigia',BookOpen],['phones','Ajuda','Emergência',LifeBuoy]];
 return <header className="app-navigation"><div className="navigation-brand-row"><button className="navigation-brand" onClick={()=>props.setActiveTab('home')} aria-label="Vigia — início"><span className="brand-symbol"><Shield size={23}/></span><span>Vigia</span></button><div className="navigation-account"><button className="navigation-icon" onClick={()=>props.setIsAudioMuted(!props.isAudioMuted)} title={props.isAudioMuted?'Ativar voz da Vigia':'Silenciar voz da Vigia'} aria-label={props.isAudioMuted?'Ativar som':'Silenciar'}>{props.isAudioMuted?<VolumeX size={19}/>:<Volume2 size={19}/>}</button><button className="navigation-profile" title={props.currentUser?'Meu Perfil':props.isGuest?'Perfil (Modo Visitante)':'Entrar ou Criar Conta'} aria-label={props.currentUser?'Meu Perfil':props.isGuest?'Perfil (Modo Visitante)':'Entrar ou Criar Conta'} onClick={props.currentUser||props.isGuest?props.onOpenProfile:props.onOpenAuth}><User size={18}/><span>{props.currentUser?props.nickname:props.isGuest?'Visitante':'Entrar'}</span></button></div></div><nav className="navigation-tabs" aria-label="Navegação principal">{entries.map(([id,label,title,Icon])=>{const active=props.activeTab===id || (id==='learn'&&['games','topics'].includes(props.activeTab)) || (id==='home'&&props.activeTab==='school') || (id==='phones'&&props.activeTab==='sala_segura');return <button key={id} title={title} aria-label={title} aria-current={active?'page':undefined} onClick={()=>props.setActiveTab(id)}><Icon size={20}/><span>{label}</span></button>})}</nav></header>;
};
