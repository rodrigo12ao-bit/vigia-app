import { useEffect, useRef } from 'react';
export function useDialog(open: boolean, close: () => void) {
  const ref=useRef<HTMLDivElement>(null), closeRef=useRef(close); closeRef.current=close;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement;
    const items=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea,select,a[href],[tabindex="0"]') || []).filter(el=>el.getClientRects().length);
    const frame=requestAnimationFrame(()=>{const input=ref.current?.querySelector<HTMLElement>('input:not([disabled]),textarea,select');(input || items()[0])?.focus();});
    const key=(e:KeyboardEvent)=>{
      if(Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1)!==ref.current)return;
      if(e.key==='Escape'){e.preventDefault();closeRef.current();}
      if(e.key==='Tab') {const list=items(),first=list[0],last=list.at(-1);if(!first)return;if(e.shiftKey&&(document.activeElement===first||!ref.current?.contains(document.activeElement))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||!ref.current?.contains(document.activeElement))){e.preventDefault();first.focus();}}
    };
    document.addEventListener('keydown',key);return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key);previous?.focus();};
  },[open]);
  return ref;
}
