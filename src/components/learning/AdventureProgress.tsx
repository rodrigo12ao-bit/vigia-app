import {useState} from 'react';
import {Sparkles,Trophy,Zap,Volume2,Smartphone,PartyPopper} from 'lucide-react';
import {adventureLevel,type Adventure} from '../../lib/adventureModel';
import {feedbackPreferences,saveFeedbackPreferences,playActivityFeedback} from '../../lib/activityFeedback';
export function AdventureProgress({xp,state,badges,pending=0}:{xp:number;state:Adventure;badges:number;pending?:number}){
 const level=adventureLevel(xp);
 return <section className="adventure-progress" aria-label="Progresso da aventura"><div className="adventure-level-icon"><Sparkles size={27}/><span>{level.level}</span></div><div className="adventure-level-copy"><div className="adventure-level-title"><strong>Nível {level.level}</strong><span>{level.remaining} XP para o próximo</span></div><progress value={level.current} max={level.next} aria-label="Experiência para o próximo nível"/><p>{state.completed===0?'Toda aventura começa com um passo.':'Continue aprendendo, no seu ritmo.'}</p></div><div className="adventure-counters"><span><Zap size={17}/><strong>{xp}</strong> XP</span><span><Trophy size={17}/><strong>{badges}</strong> conquistas</span></div>{pending>0&&<p className="adventure-pending" role="status">{pending} recompensa(s) aguardando sincronização.</p>}</section>;
}
export function FeedbackSettings({uid}:{uid?:string}){
 const [prefs,setPrefs]=useState(()=>feedbackPreferences(uid));
 function change(key:keyof typeof prefs,value:boolean){const next={...prefs,[key]:value};setPrefs(next);try{saveFeedbackPreferences(uid,next);if(key==='sounds'&&value)playActivityFeedback('correct',uid);}catch{}}
 return <details className="learn-card preferences feedback-preferences"><summary>Sons, vibração e animações</summary><div className="feedback-options">{([['sounds','Sons das atividades',Volume2],['vibration','Vibração leve',Smartphone],['animations','Celebrações animadas',PartyPopper]] as const).map(([key,label,Icon])=><label key={key}><Icon size={19}/><span>{label}</span><input type="checkbox" checked={prefs[key]} onChange={e=>change(key,e.target.checked)}/></label>)}</div><p className="small-label">Os sons tocam ao interagir. A vibração depende do aparelho. Animações respeitam a preferência de movimento reduzido.</p></details>;
}
