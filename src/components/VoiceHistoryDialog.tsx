import React from 'react';
import type {ChatSession} from '../types';
import {useDialog} from '../hooks/useDialog';

export function VoiceHistoryDialog({session,onClose}:{session:ChatSession;onClose:()=>void}) {
  const dialog=useDialog(true,onClose);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Histórico da conversa por voz" className="flex flex-col max-h-[85dvh] w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 text-slate-100 p-4">
      <div className="flex items-center justify-between gap-3 mb-3"><div className="min-w-0"><p className="text-xs text-sky-300 font-bold">Conversa por voz</p><h3 className="font-bold truncate">{session.title}</h3></div><button className="rounded-xl px-3 py-2 bg-slate-800 hover:bg-slate-700" onClick={onClose}>Fechar</button></div>
      <div className="overflow-y-auto space-y-3 pr-1">{session.messages.map(message=><div key={message.id} className={`rounded-xl p-3 text-sm whitespace-pre-wrap break-words ${message.role==='user'?'bg-sky-950/60':'bg-slate-800'}`}><p className="text-xs font-bold text-sky-300 mb-1">{message.role==='user'?'Você':'Vigia'}</p><p>{message.content}</p></div>)}</div>
      <p className="mt-3 text-xs text-slate-400">Este registro fica no histórico de voz. Sua conversa e seu rascunho de texto continuam preservados.</p>
    </div>
  </div>;
}
