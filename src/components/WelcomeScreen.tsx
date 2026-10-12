import React from 'react';
import {ArrowRight,Shield} from 'lucide-react';
import {Avatar} from './Avatar';
import {AvatarGender} from '../types';
interface WelcomeScreenProps {
 onStart:()=>void;onLoginClick:()=>void;onContinueAsGuest:()=>void;
 avatarGender:AvatarGender;onSelectGender:(gender:AvatarGender)=>void;
}
export const WelcomeScreen:React.FC<WelcomeScreenProps>=({onStart,onContinueAsGuest,avatarGender,onSelectGender})=><div className="welcome-shell"><section className="welcome-card" aria-label="Boas-vindas à Vigia"><div className="navigation-brand"><span className="brand-symbol"><Shield size={23}/></span><span>Vigia</span></div><div className="welcome-avatar"><Avatar interactive3D={false} size="md" state="idle" gender={avatarGender} showSubtitle={false}/></div><h1>Aprender a cuidar,<br/>um passo de cada vez.</h1><p>Missões e conversas sobre prevenção para crianças de 6 a 14 anos.</p><button className="vigia-primary" onClick={onStart}>Entrar ou criar conta <ArrowRight size={18}/></button><button className="vigia-secondary" onClick={onContinueAsGuest}>Explorar como visitante</button><p className="small-label">No modo visitante, seu progresso fica neste aparelho.</p><details className="welcome-options"><summary>Escolher a aparência da Vigia</summary><div className="extra-actions"><button className="vigia-secondary" aria-pressed={avatarGender==='female'} onClick={()=>onSelectGender('female')}>Vigia (Feminina)</button><button className="vigia-secondary" aria-pressed={avatarGender==='male'} onClick={()=>onSelectGender('male')}>Vigia (Masculino)</button></div></details></section></div>;
