import {AdventureProgress} from './learning/AdventureProgress';
import type {Adventure} from '../lib/adventureModel';
import {useContext} from 'react';
import {AvatarGenderContext} from '../lib/avatarSettings';
import {ArrowRight,BookOpen,MessageCircle,ShieldCheck} from 'lucide-react';
import {avatarPreviewPath} from '../lib/avatarAnimation';
import {VigiaBrandMark} from './brand/VigiaBrandMark';
import {useLearning} from '../hooks/useLearning';
import {recommendMission} from '../lib/learningModel';
import {LEARNING_MISSIONS} from '../data/learningMissions';
export default function HomeTab({uid,nickname,role,onLearn,onChat,onSchool,xp,badgesCount,adventure}:{uid?:string;nickname:string;role:string;onLearn:(id?:string)=>void;onChat:()=>void;onSchool:()=>void;xp:number;badgesCount:number;adventure:Adventure}){
 const gender=useContext(AvatarGenderContext);const learning=useLearning(uid);const assigned=learning.assignments.find(a=>!learning.progress.lessons[a.lessonId]);const mission=LEARNING_MISSIONS.find(m=>m.id===assigned?.lessonId)||recommendMission(learning.progress);const educator=role==='educador',guardian=role==='responsavel';
 return <div className="learn-shell home-shell vigia-home">
  <header className="page-heading vigia-home-heading">
   <div><span className="eyebrow">Aprender e cuidar, juntos</span><h1>Olá, {nickname}.</h1><p>{educator?'Prepare uma atividade e acompanhe sua turma.':guardian?'Acompanhe o aprendizado e participe das missões.':'Seu próximo passo para cuidar melhor começa aqui.'}</p></div>
   <VigiaBrandMark className="vigia-home-brand"/>
  </header>
  {!educator&&!guardian&&<AdventureProgress xp={xp} state={adventure} badges={badgesCount}/>}
  <section className="home-hero learn-card vigia-home-mission">
   <div>
    <span className="eyebrow">{educator?'Sua escola':guardian?'Em família':'Sua próxima missão'}</span>
    <h2>{educator?'Aprendizado que você pode acompanhar':guardian?'Preparem-se juntos':mission.title}</h2>
    <p className="learning-copy">{educator?'Organize turmas, indique atividades e veja o progresso dos alunos vinculados.':guardian?'Confirme atividades feitas em conjunto e acompanhe os pedidos pendentes.':mission.simple}</p>
    <button className="vigia-primary" onClick={()=>educator||guardian?onSchool():onLearn(mission.id)}>{educator?'Abrir painel escolar':guardian?'Abrir acompanhamento':'Começar missão'} <ArrowRight size={18} aria-hidden="true"/></button>
   </div>
   <div className="vigia-home-avatar-stage"><img src={avatarPreviewPath(gender,'md')} alt="Vigia, sua tutora de prevenção" className="home-avatar" width="260" height="260" decoding="async"/></div>
  </section>
  <div className="home-actions">
   <button className="learn-card home-action home-chat-action" onClick={onChat}>
    <span className="vigia-home-action-icon"><MessageCircle size={25} aria-hidden="true"/></span><span className="vigia-home-action-label">Texto e voz</span>
    <h2>Conversar</h2><p>Abra espaço para suas dúvidas. A Vigia conversa com você.</p><ArrowRight size={19} aria-hidden="true"/>
   </button>
   <button className="learn-card home-action home-learning-action" onClick={()=>onLearn()}>
    <span className="vigia-home-action-icon"><BookOpen size={25} aria-hidden="true"/></span><span className="vigia-home-action-label">Descobertas e missões</span>
    <h2>Aprender com a Vigia</h2><p>Entre na aventura. Descubra, pratique e conquiste.</p><ArrowRight size={19} aria-hidden="true"/>
   </button>
  </div>
  {!educator&&!guardian&&Object.keys(learning.progress.lessons).length>0&&<p className="home-progress"><ShieldCheck size={18} aria-hidden="true"/>{Object.keys(learning.progress.lessons).length} habilidades praticadas. Continue no seu ritmo.</p>}
  {learning.notice&&<p className="quiet-notice" role="status">{learning.notice}</p>}
 </div>;
}
