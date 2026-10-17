import React from 'react';
import {motion,useMotionValueEvent,type MotionValue} from 'motion/react';

function ActivityBar({level,min,scale,speaking,index}:{level:MotionValue<number>;min:number;scale:number;speaking:boolean;index:number}) {
  const bar=React.useRef<HTMLSpanElement>(null);
  const update=(value:number)=>{if(!speaking&&bar.current)bar.current.style.height=Math.max(min,Math.min(1,Math.max(0,value))*scale)+'px';};
  useMotionValueEvent(level,'change',update);
  React.useEffect(()=>{update(level.get());},[level,min,scale,speaking]);
  if(speaking)return <motion.span animate={{height:[min,scale*0.6,min]}} transition={{repeat:Infinity,duration:0.4+index*0.06}} className="w-1 rounded-full bg-sky-300"/>;
  return <span ref={bar} className="w-1 rounded-full bg-emerald-300"/>;
}

// Audio meter changes stay in Motion's DOM subscription, not React's entire
// conversation tree. The avatar and the message feed only receive turn changes.
export const AudioActivityMeter=React.memo(function AudioActivityMeter({level,speaking=false,compact=false}:{level:MotionValue<number>;speaking?:boolean;compact?:boolean}) {
  const bars=compact?[[6,24],[10,36],[6,20]]:[[6,20],[10,30],[14,40],[8,25],[5,15]];
  return <div aria-hidden="true" className="flex items-center justify-center gap-1.5 h-6">{bars.map(([min,scale],index)=><ActivityBar key={index} level={level} min={min} scale={scale} speaking={speaking} index={index}/>)}</div>;
});
