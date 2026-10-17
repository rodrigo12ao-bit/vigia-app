import { auth } from './firebaseAuth';
import {isEmergency} from '../../server/safety';
import {adultAccessVersion,adultAudience} from './audience';
let guestSession: Promise<void> | undefined;
export interface AiStatus {demo:boolean;realAI:boolean;localDemo?:boolean;audience?:string;ai?:{mode:string;provider:string|null;blocked:string|null;consentVersion:string;voice:boolean};}
interface AdultSession {promise:Promise<void>;guest?:Promise<void>;}
const adultSessions=new Map<string,AdultSession>();
const expiredSessionMessage='Entre novamente ou inicie uma sessão de visitante.';
class GuestSessionExpired extends Error {
  constructor(readonly session:Promise<void>){super(expiredSessionMessage);}
}
function checkRequest(uid:string|undefined,signal?:AbortSignal|null) {
  if(signal?.aborted)throw signal.reason||new DOMException('Operação cancelada.','AbortError');
  if(auth.currentUser?.uid!==uid)throw Error('A conta mudou. Tente novamente.');
}
// Cancelling one caller must not abort a shared status/session request needed
// by another screen. It only releases this caller and prevents its next step.
function waitForRequest<T>(pending:Promise<T>,uid:string|undefined,signal?:AbortSignal|null):Promise<T> {
  try{checkRequest(uid,signal);}catch(error){void pending.catch(()=>{});return Promise.reject(error);}
  return new Promise<T>((resolve,reject)=>{
    let finished=false;
    const finish=(action:()=>void)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',abort);action();};
    const abort=()=>finish(()=>reject(signal?.reason||new DOMException('Operação cancelada.','AbortError')));
    pending.then(value=>finish(()=>{try{checkRequest(uid,signal);resolve(value);}catch(error){reject(error);}}),error=>finish(()=>{try{checkRequest(uid,signal);reject(error);}catch(cancelled){reject(cancelled);}}));
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}
function ensureGuestSession():Promise<void> {
  if(!guestSession){
    const pending=fetch('/api/session',{method:'POST',credentials:'same-origin'}).then(response=>{if(!response.ok)throw Error('Sessão indisponível.');}).catch(error=>{if(guestSession===pending)guestSession=undefined;throw error;});
    guestSession=pending;
  }
  return guestSession;
}
function forgetGuestSession(expired:Promise<void>) {
  // A late 401 from an old request must not discard a newer shared renewal.
  if(guestSession===expired)guestSession=undefined;
  if(adultSessions.get('guest')?.guest===expired)adultSessions.delete('guest');
}
async function isExpiredSession(response:Response):Promise<boolean> {
  if(response.status!==401)return false;
  const body=await response.clone().json().catch(()=>null);
  return body?.error===expiredSessionMessage;
}
function ensureAdultSession(key:string,headers:Headers,guest?:Promise<void>):Promise<void> {
  let entry=adultSessions.get(key);
  if(!entry||entry.guest!==guest){
    const adultHeaders=new Headers(headers);adultHeaders.set('Content-Type','application/json');
    const next:AdultSession={guest,promise:Promise.resolve()};
    next.promise=fetch('/api/adult-access',{method:'POST',headers:adultHeaders,credentials:'same-origin',body:JSON.stringify({confirmed:true,version:adultAccessVersion})}).then(async response=>{
      if(!response.ok){
        const body=await response.json().catch(()=>null);
        if(guest&&response.status===401&&body?.error===expiredSessionMessage)throw new GuestSessionExpired(guest);
        throw Error(body?.error||'Acesso adulto indisponível.');
      }
    }).catch(error=>{if(adultSessions.get(key)===next)adultSessions.delete(key);throw error;});
    adultSessions.set(key,next);entry=next;
  }
  return entry.promise;
}
const statusFreshMs=30000,statusStaleMs=60000;
let statusPromise:Promise<AiStatus>|undefined,statusCachedPromise:Promise<AiStatus>|undefined;
let statusReadAt=0,statusPending=false;
function invalidateAiStatus(){statusCachedPromise=undefined;if(!statusPending)statusPromise=undefined;}
function refreshAiStatus():Promise<AiStatus>{
  if(statusPending&&statusPromise)return statusPromise;
  statusPending=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  const pending=fetch('/api/status',{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async r=>{
    if(!r.ok)throw Error('Não foi possível verificar a IA.');
    const status=await r.json();statusReadAt=Date.now();statusCachedPromise=pending;return status as AiStatus;
  }).catch(error=>{if(statusPromise===pending)statusPromise=undefined;throw error;}).finally(()=>{clearTimeout(timer);statusPending=false;});
  statusPromise=pending;return pending;
}
// This is a public configuration hint, never an authorization decision. Every
// POST still passes the server's current identity, adulthood and consent guards.
// A recent hint removes a serialized round trip; stale hints refresh in parallel.
export function getAiStatus(options:{fresh?:boolean}={}):Promise<AiStatus>{
  if(options.fresh)return refreshAiStatus();
  const age=Date.now()-statusReadAt;
  if(statusCachedPromise&&age<=statusFreshMs)return statusCachedPromise;
  if(statusCachedPromise&&age<=statusStaleMs){void refreshAiStatus().catch(()=>{});return statusCachedPromise;}
  return refreshAiStatus();
}
if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('online',invalidateAiStatus);
interface AiAccess {allowed:boolean;voice:boolean;blocked:string|null;}
interface AiAccessRequest {uid:string|undefined;promise:Promise<AiAccess>;}
let aiAccessRequest:AiAccessRequest|undefined;
export async function getAiAccess(){
  const uid=auth.currentUser?.uid;
  // Share concurrent checks for this identity only. Completed decisions are
  // never cached: the next action performs a fresh server authorization check.
  if(!aiAccessRequest||aiAccessRequest.uid!==uid){
    const next:AiAccessRequest={uid,promise:apiFetch('/api/ai-access').then(async r=>{
      const body=await r.json();if(!r.ok)throw Error(body.blocked||'Não foi possível verificar a voz.');return body as AiAccess;
    }).finally(()=>{if(aiAccessRequest===next)aiAccessRequest=undefined;})};
    aiAccessRequest=next;
  }
  return waitForRequest(aiAccessRequest.promise,uid);
}
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const user = auth.currentUser;
  const uid=user?.uid,signal=options.signal;
  checkRequest(uid,signal);
  let status:AiStatus|undefined;
  let emergency=false;
  if(['/api/chat','/api/analyze-scenario'].includes(path)&&typeof options.body==='string'){try{const body=JSON.parse(options.body);emergency=isEmergency(body.message||body.scenario||'');}catch{}}
  if(!emergency&&['/api/chat','/api/analyze-scenario','/api/generate-quiz','/api/transcribe','/api/tts','/api/live-ticket'].includes(path)) {
    status=await waitForRequest(getAiStatus(),uid,signal);
    checkRequest(uid,signal);
    if(!status.demo&&status.ai?.blocked)throw new Error(status.ai.blocked);
    const consentVersion=status.demo?(import.meta.env.MODE==='publication'?'2026-10-12-preview':'2026-10-12'):status.ai?.consentVersion||'unavailable';
    const key='vigia_ai_consent:'+(user?.uid || 'guest');
    if(localStorage.getItem(key)!==consentVersion){
      const message=status.demo?'Use somente dados fictícios. Texto e imagens serão enviados ao servidor do Vigia. A IA é simulada, sem envio ao serviço de IA; transcrição e voz ao vivo estão indisponíveis. Deseja continuar?':status.ai?.provider==='gemini'?'Vigia 18+: texto, histórico recente, imagens escolhidas e voz serão enviados ao Google Gemini. Na modalidade gratuita, o Google pode usar o conteúdo para melhorar seus produtos e permitir revisão humana. Não envie informações pessoais, confidenciais, documentos ou conteúdo de menores. A voz é gerada por IA. A IA pode errar e não substitui os serviços de emergência. Deseja continuar?':status.ai?.provider==='local'?'IA gratuita neste computador: texto, imagens e voz serão processados localmente, sem envio a um fornecedor de IA. A voz de resposta é sintetizada pelo Windows. Nesta avaliação, use dados fictícios, ilustrações e fala de um adulto. O histórico pode ficar salvo neste aparelho ou nos emuladores. A IA pode errar; use com supervisão. Deseja continuar?':'Teste local exclusivo para adultos, com dados fictícios. Texto, histórico recente, imagens escolhidas e gravações de voz serão enviados à API OpenAI para resposta, verificação de segurança, transcrição e voz gerada por IA. Não envie dados pessoais, fotos ou vozes de crianças. Este teste não tem aprovação de retenção zero para dados infantis. Deseja continuar?';
      if(!window.confirm(message))throw new Error('Envio cancelado.');
      checkRequest(uid,signal);
      localStorage.setItem(key,consentVersion);
    }
    if(!status.demo)headers.set('X-Vigia-AI-Consent',consentVersion);
  }
  if(user)headers.set('Authorization',`Bearer ${await waitForRequest(user.getIdToken(),uid,signal)}`);
  checkRequest(uid,signal);
  const requiresAdult=adultAudience&&!['/api/status','/api/adult-access','/api/session'].includes(path);
  if(requiresAdult&&!status)status=await waitForRequest(getAiStatus(),uid,signal);
  checkRequest(uid,signal);
  const confirmAdult=requiresAdult&&status?.audience==='18plus';
  if(confirmAdult&&sessionStorage.getItem('vigia_adult_access')!==adultAccessVersion)throw Error('O Vigia é exclusivo para pessoas de 18 anos ou mais.');
  for(let attempt=0;attempt<2;attempt++){
    let guest:Promise<void>|undefined;
    try{
      checkRequest(uid,signal);
      if(!user){guest=ensureGuestSession();await waitForRequest(guest,uid,signal);}
      checkRequest(uid,signal);
      if(confirmAdult)await waitForRequest(ensureAdultSession(uid||'guest',headers,guest),uid,signal);
      checkRequest(uid,signal);
      const response=await waitForRequest(fetch(path,{...options,headers,credentials:'same-origin'}),uid,signal);
      if([401,403,428,503].includes(response.status))invalidateAiStatus();
      if(response.status===401){
        if(user)adultSessions.delete(uid!);
        else if(guest&&await waitForRequest(isExpiredSession(response),uid,signal)){
          forgetGuestSession(guest);
          if(attempt===0)continue;
        }
      }
      checkRequest(uid,signal);
      return response;
    }catch(error){
      checkRequest(uid,signal);
      if(error instanceof GuestSessionExpired){forgetGuestSession(error.session);if(attempt===0)continue;}
      if(error instanceof TypeError)invalidateAiStatus();
      throw error;
    }
  }
  throw Error('Sessão indisponível. Tente novamente.');
}
export async function salaRequest(path: string, data: unknown) {
  const r = await apiFetch(`/api/sala/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'Operação indisponível.');
  return body;
}
