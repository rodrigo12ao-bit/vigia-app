import {auth} from './firebase';
import confetti from 'canvas-confetti';
export interface FeedbackPreferences {sounds:boolean;vibration:boolean;animations:boolean;}
export const feedbackKey=(uid?:string)=>'vigia_feedback_v1:'+(uid||'guest');
let context:AudioContext|null=null;const oscillators=new Set<OscillatorNode>();
export function feedbackPreferences(uid=auth.currentUser?.uid):FeedbackPreferences {
 try{const p=JSON.parse(localStorage.getItem(feedbackKey(uid))||'{}');return {sounds:p.sounds!==false,vibration:p.vibration!==false,animations:p.animations!==false};}catch{return {sounds:true,vibration:true,animations:true};}
}
export function saveFeedbackPreferences(uid:string|undefined,p:FeedbackPreferences){localStorage.setItem(feedbackKey(uid),JSON.stringify(p));window.dispatchEvent(new CustomEvent('vigia-feedback-settings',{detail:{uid}}));if(!p.sounds||!p.vibration)stopActivityFeedback();if(!p.animations)confetti.reset();}
export function stopActivityFeedback(){for(const o of oscillators){try{o.stop();}catch{}}oscillators.clear();try{navigator.vibrate?.(0);}catch{}if(context){void context.close().catch(()=>{});context=null;}}
export function playActivityFeedback(type:'tap'|'correct'|'retry'|'complete',uid=auth.currentUser?.uid){
 const p=feedbackPreferences(uid),reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(p.vibration&&!reduced)try{navigator.vibrate?.(type==='complete'?[35,35,65]:type==='correct'?25:type==='tap'?8:15);}catch{}
 if(!p.sounds)return;
 try{
  const Audio=window.AudioContext||(window as any).webkitAudioContext;if(!Audio)return;context ||=new Audio();const ctx=context!;if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
  const notes=type==='complete'?[523.25,659.25,783.99,1046.5]:type==='correct'?[659.25,880]:type==='retry'?[392,440]:[540];
  for(const [i,f] of notes.entries()){const o=ctx.createOscillator(),g=ctx.createGain(),start=ctx.currentTime+i*.085;oscillators.add(o);o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.055,start+.015);g.gain.exponentialRampToValueAtTime(.001,start+.16);o.connect(g);g.connect(ctx.destination);o.onended=()=>{oscillators.delete(o);o.disconnect();g.disconnect();};o.start(start);o.stop(start+.18);}
 }catch{/* Sound support is optional; learning always remains available. */}
}
export function announceReward(uid:string|undefined,detail:{xp:number;title:string;pending?:boolean;badges?:string[]}){window.dispatchEvent(new CustomEvent('vigia-reward',{detail:{uid,...detail}}));playActivityFeedback('complete',uid);}
