import { useEffect, useRef } from 'react';
export function useDialog(open: boolean, close: () => void) {
  const ref=useRef<HTMLDivElement>(null), closeRef=useRef(close); closeRef.current=close;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement;
    const dialog=ref.current;
    if(!dialog)return;
    const selector='button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),a[href],summary,[tabindex]';
    const items=(element:HTMLElement=dialog)=>Array.from(element.querySelectorAll<HTMLElement>(selector)).filter(el=>el.tabIndex>=0&&el.getClientRects().length&&!el.closest('[hidden],[inert]'));
    const topDialog=()=>Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(el=>el.getClientRects().length&&!el.closest('[hidden],[inert]')).at(-1);
    const focusInside=(element:HTMLElement)=>{
      const candidates=items(element);
      const input=candidates.find(el=>el.matches('[data-autofocus],input,textarea,select'));
      (input || candidates[0] || element).focus();
    };
    const oldTabIndex=dialog.getAttribute('tabindex');
    if(oldTabIndex===null)dialog.tabIndex=-1;
    const frame=requestAnimationFrame(()=>{if(topDialog()===dialog)focusInside(dialog);});
    const key=(e:KeyboardEvent)=>{
      if(topDialog()!==dialog)return;
      if(e.key==='Escape'){e.preventDefault();closeRef.current();}
      if(e.key==='Tab') {
        const list=items(),first=list[0],last=list.at(-1);
        if(!first){e.preventDefault();dialog.focus();return;}
        if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}
      }
    };
    const focus=(event:FocusEvent)=>{if(topDialog()===dialog&&!dialog.contains(event.target as Node))focusInside(dialog);};
    document.addEventListener('keydown',key);document.addEventListener('focusin',focus);
    return()=>{
      cancelAnimationFrame(frame);document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);
      if(oldTabIndex===null)dialog.removeAttribute('tabindex');
      // Suspense may replace a loading dialog, or a lower dialog may disappear
      // during sign-in. Never move focus behind another remaining modal.
      requestAnimationFrame(()=>{
        const top=topDialog();
        if(previous?.isConnected&&previous.getClientRects().length&&(!top||top.contains(previous)))previous.focus();
        else if(top&&!top.contains(document.activeElement))focusInside(top);
      });
    };
  },[open]);
  return ref;
}
