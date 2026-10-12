import {useEffect,useState} from 'react';
import {Sparkles,X,Zap} from 'lucide-react';
import {feedbackPreferences} from '../../lib/activityFeedback';
export function RewardCelebration({uid}:{uid?:string}){
 const [reward,setReward]=useState<{xp:number;title:string;pending?:boolean}|null>(null);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const receive=(e:Event)=>{const d=(e as CustomEvent).detail;if((d.uid||'guest')!==(uid||'guest'))return;clearTimeout(timer);setReward(d);timer=setTimeout(()=>setReward(null),4500);};window.addEventListener('vigia-reward',receive);return()=>{clearTimeout(timer);window.removeEventListener('vigia-reward',receive);setReward(null);};},[uid]);
 if(!reward)return null;const animations=feedbackPreferences(uid).animations;
 return <aside className={'reward-toast '+(animations?'reward-animated':'')} role="status"><div className="reward-star"><Sparkles size={25}/></div><div><strong>{reward.pending?'Atividade salva!':'Aventura avançando!'}</strong><p>{reward.pending?'XP será confirmado ao sincronizar.':<><Zap size={15}/> +{reward.xp} XP · {reward.title}</>}</p></div><button aria-label="Fechar recompensa" onClick={()=>setReward(null)}><X size={17}/></button>{animations&&!reward.pending&&<div className="reward-sparks" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} style={{'--spark':i} as React.CSSProperties}/>)}</div>}</aside>;
}
