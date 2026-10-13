import { auth } from './firebase';
import {isEmergency} from '../../server/safety';
import {adultAccessVersion,adultAudience} from './audience';
let guestSession: Promise<void> | undefined;
export interface AiStatus {demo:boolean;realAI:boolean;localDemo?:boolean;audience?:string;ai?:{mode:string;provider:string|null;blocked:string|null;consentVersion:string;voice:boolean};}
const adultSessions=new Map<string,Promise<void>>();
let statusPromise:Promise<AiStatus>|undefined;let statusReadAt=0;
export function getAiStatus():Promise<AiStatus>{
  if(!statusPromise||Date.now()-statusReadAt>3000){statusReadAt=Date.now();statusPromise=fetch('/api/status',{cache:'no-store',credentials:'same-origin'}).then(async r=>{if(!r.ok)throw Error('Não foi possível verificar a IA.');return r.json();}).catch(error=>{statusPromise=undefined;throw error;});}
  return statusPromise;
}
export async function getAiAccess(){const r=await apiFetch('/api/ai-access');const body=await r.json();if(!r.ok)throw Error(body.blocked||'Não foi possível verificar a voz.');return body as {allowed:boolean;voice:boolean;blocked:string|null};}
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const user = auth.currentUser;
  let emergency=false;
  if(['/api/chat','/api/analyze-scenario'].includes(path)&&typeof options.body==='string'){try{const body=JSON.parse(options.body);emergency=isEmergency(body.message||body.scenario||'');}catch{}}
  if(!emergency&&['/api/chat','/api/analyze-scenario','/api/generate-quiz','/api/transcribe','/api/tts','/api/live-ticket'].includes(path)) {
    const status=await getAiStatus();
    if(!status.demo&&status.ai?.blocked)throw new Error(status.ai.blocked);
    const consentVersion=status.demo?(import.meta.env.MODE==='publication'?'2026-10-12-preview':'2026-10-12'):status.ai?.consentVersion||'unavailable';
    const key='vigia_ai_consent:'+(user?.uid || 'guest');
    if(localStorage.getItem(key)!==consentVersion){
      const message=status.demo?'Use somente dados fictícios. Texto e imagens serão enviados ao servidor do Vigia. A IA é simulada, sem envio ao serviço de IA; transcrição e voz ao vivo estão indisponíveis. Deseja continuar?':status.ai?.provider==='gemini'?'Vigia 18+: texto, histórico recente, imagens escolhidas e voz serão enviados ao Google Gemini. Na modalidade gratuita, o Google pode usar o conteúdo para melhorar seus produtos e permitir revisão humana. Não envie informações pessoais, confidenciais, documentos ou conteúdo de menores. A voz é gerada por IA. A IA pode errar e não substitui os serviços de emergência. Deseja continuar?':status.ai?.provider==='local'?'IA gratuita neste computador: texto, imagens e voz serão processados localmente, sem envio a um fornecedor de IA. A voz de resposta é sintetizada pelo Windows. Nesta avaliação, use dados fictícios, ilustrações e fala de um adulto. O histórico pode ficar salvo neste aparelho ou nos emuladores. A IA pode errar; use com supervisão. Deseja continuar?':'Teste local exclusivo para adultos, com dados fictícios. Texto, histórico recente, imagens escolhidas e gravações de voz serão enviados à API OpenAI para resposta, verificação de segurança, transcrição e voz gerada por IA. Não envie dados pessoais, fotos ou vozes de crianças. Este teste não tem aprovação de retenção zero para dados infantis. Deseja continuar?';
      if(!window.confirm(message))throw new Error('Envio cancelado.');
      if(auth.currentUser?.uid!==user?.uid)throw new Error('A conta mudou. Tente novamente.');
      localStorage.setItem(key,consentVersion);
    }
    if(!status.demo)headers.set('X-Vigia-AI-Consent',consentVersion);
  }
  if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  else {
    guestSession ??= fetch('/api/session', { method: 'POST', credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error('Sessão indisponível.'); }).catch(e => { guestSession = undefined; throw e; });
    await guestSession;
  }
  if(auth.currentUser?.uid!==user?.uid)throw new Error('A conta mudou. Tente novamente.');
  if(adultAudience&&path!=='/api/status'&&path!=='/api/adult-access'&&path!=='/api/session'&&(await getAiStatus()).audience==='18plus'){
    if(sessionStorage.getItem('vigia_adult_access')!==adultAccessVersion)throw Error('O Vigia é exclusivo para pessoas de 18 anos ou mais.');
    const adultKey=user?.uid||'guest';
    if(!adultSessions.has(adultKey)){
      const adultHeaders=new Headers(headers);adultHeaders.set('Content-Type','application/json');
      adultSessions.set(adultKey,fetch('/api/adult-access',{method:'POST',headers:adultHeaders,credentials:'same-origin',body:JSON.stringify({confirmed:true,version:adultAccessVersion})}).then(async r=>{if(!r.ok){const b=await r.json();throw Error(b.error||'Acesso adulto indisponível.');}}).catch(e=>{adultSessions.delete(adultKey);throw e;}));
    }
    await adultSessions.get(adultKey);
  }
  if(auth.currentUser?.uid!==user?.uid)throw new Error('A conta mudou. Tente novamente.');
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) {guestSession = undefined;adultSessions.delete(user?.uid||'guest');}
  return response;
}
export async function salaRequest(path: string, data: unknown) {
  const r = await apiFetch(`/api/sala/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'Operação indisponível.');
  return body;
}
