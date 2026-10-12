import { auth } from './firebase';
let guestSession: Promise<void> | undefined;
const onlinePreview=import.meta.env.MODE==='publication';
const consentVersion=onlinePreview?'2026-10-12-preview':'2026-10-12';
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if(['/api/chat','/api/analyze-scenario','/api/generate-quiz','/api/transcribe','/api/live-ticket'].includes(path)) {
    const key='vigia_ai_consent:'+(auth.currentUser?.uid || 'guest');
    if(localStorage.getItem(key)!==consentVersion){
      const message=onlinePreview?'Use somente informações fictícias e não envie dados pessoais de crianças. Nesta prévia online, texto e imagens escolhidos são enviados ao servidor do Vigia. A IA é simulada e não envia esse conteúdo ao Gemini. Voz ao vivo e transcrição estão indisponíveis. Deseja continuar?':'Use somente informações fictícias e não envie dados pessoais de crianças. Em ambiente conectado, texto, imagens e áudio escolhidos serão enviados ao serviço Gemini. Na demonstração local, a IA é simulada. Deseja continuar?';
      if(!window.confirm(message))throw new Error('Envio cancelado.');
      localStorage.setItem(key,consentVersion);
    }
  }
  const headers = new Headers(options.headers);
  const user = auth.currentUser;
  if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  else {
    guestSession ??= fetch('/api/session', { method: 'POST', credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error('Sessão indisponível.'); }).catch(e => { guestSession = undefined; throw e; });
    await guestSession;
  }
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) guestSession = undefined;
  return response;
}
export async function salaRequest(path: string, data: unknown) {
  const r = await apiFetch(`/api/sala/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'Operação indisponível.');
  return body;
}
