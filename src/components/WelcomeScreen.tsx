import React from 'react';
import {ArrowRight, BookOpen, MessageCircle, Sparkles} from 'lucide-react';
import {AvatarGender} from '../types';
import {adultAudience} from '../lib/audience';
import {avatarPreviewPath} from '../lib/avatarAnimation';
import {VigiaBrandMark} from './brand/VigiaBrandMark';
interface WelcomeScreenProps {
 onStart:()=>void;onLoginClick:()=>void;onContinueAsGuest:()=>void;
 avatarGender:AvatarGender;onSelectGender:(gender:AvatarGender)=>void;
}
export const WelcomeScreen:React.FC<WelcomeScreenProps> = ({onStart,onContinueAsGuest,avatarGender,onSelectGender}) => (
 <div className="welcome-shell vigia-entry">
  <section className="welcome-card vigia-entry-card" aria-label="Boas-vindas à Vigia">
   <div className="vigia-entry-brand">
    <div className="vigia-entry-emblem"><VigiaBrandMark animated/></div>
    <span className="vigia-entry-wordmark">VIGIA</span>
    <span className="vigia-entry-brandline">Aprender. Conversar. Cuidar.</span>
   </div>
   <div className="vigia-entry-copy">
    <span className="vigia-entry-kicker">O cuidado começa com você</span>
    <h1>Mais confiança<br/>para <span>cuidar.</span></h1>
    <p>Converse com a Vigia e transforme prevenção em atitudes do dia a dia.</p>
   </div>
   <div className="vigia-entry-features" aria-label="O que você encontra na Vigia">
    <span><MessageCircle size={17} aria-hidden="true"/>Converse</span>
    <span><BookOpen size={17} aria-hidden="true"/>Aprenda</span>
    <span><Sparkles size={17} aria-hidden="true"/>Pratique</span>
   </div>
   <div className="vigia-entry-actions">
    <button className="vigia-primary" onClick={onStart}>Entrar ou criar conta <ArrowRight size={18} aria-hidden="true"/></button>
    <button className="vigia-secondary" onClick={onContinueAsGuest}>Explorar como visitante</button>
   </div>
   <p className="small-label vigia-entry-local-note">No modo visitante, seu progresso fica neste aparelho.</p>
   <details className="welcome-options vigia-entry-options">
    <summary>Escolher a aparência da Vigia</summary>
    <div className="extra-actions">
     {(['female','male'] as const).map(gender => <button key={gender} className="vigia-secondary" aria-pressed={avatarGender === gender} onClick={() => onSelectGender(gender)}>
      <img src={avatarPreviewPath(gender,'sm')} alt="" loading="lazy" width="38" height="38"/>
      {gender === 'female' ? 'Vigia (Feminina)' : 'Vigia (Masculino)'}
     </button>)}
    </div>
   </details>
   <p className="vigia-entry-audience">{adultAudience ? 'Uma experiência de prevenção para maiores de 18 anos.' : 'Uma experiência de prevenção para crianças de 6 a 14 anos.'}</p>
  </section>
 </div>
);
