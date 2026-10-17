import { randomBytes } from 'node:crypto';
import type { Express, Request, RequestHandler } from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {runtimeConfig} from './runtime';
import {canUseRealAi,realAiConfig} from './realAi';
import {apiResponseHeaders} from './apiBoundary';
import {isEmergency} from './safety';

export const runtime = runtimeConfig();
export const demoMode = runtime.demo;
export const localFirebase = runtime.localFirebase;
const projectId = localFirebase ? 'demo-vigia' : process.env.FIREBASE_PROJECT_ID;
function adminApp() {
  if (!localFirebase && process.env.ENABLE_CLOUD_FIREBASE !== 'true') throw new Error('Firebase externo não habilitado.');
  if (!projectId) throw new Error('Projeto Firebase não configurado.');
  return getApps()[0] || initializeApp({ projectId });
}
export function adminDb() { return getFirestore(adminApp(), localFirebase ? '(default)' : (process.env.FIREBASE_DATABASE_ID || '(default)')); }
export function trustedAuth() { return getAuth(adminApp()); }
const guests = new Map<string, { expires: number }>();
const adultGuests=new Set<string>();
export const ADULT_ACCESS_VERSION='2026-10-13-18plus-v1';
export async function adultAccess(uid:string){
  if(uid.startsWith('guest:'))return adultGuests.has(uid)&&!!guests.get(uid.slice(6))&&guests.get(uid.slice(6))!.expires>Date.now();
  const [record,authority]=await Promise.all([adminDb().doc('adult_access/'+uid).get(),adminDb().doc('sala_authorities/'+uid).get()]);
  return record.data()?.version===ADULT_ACCESS_VERSION&&!authority.data()?.guardianUid;
}
const tickets = new Map<string, { uid: string; expires: number }>();
export function identity(req: Request): string { return req.res.locals.uid; }
export function allowedOrigin(origin?: string): boolean {
  return !!origin && runtime.origins.includes(origin);
}
export function consumeTicket(ticket: string) {
  const item = tickets.get(ticket); tickets.delete(ticket);
  return item && item.expires > Date.now() ? item.uid : null;
}
export const apiOriginGuard:RequestHandler=(req,res,next)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'&&!allowedOrigin(req.headers.origin))return void res.status(403).json({error:'Origem não permitida.'});
  next();
};
export async function authenticateApiRequest(req:Request){
  if(req.headers.authorization?.startsWith('Bearer ')){
    const token=await trustedAuth().verifyIdToken(req.headers.authorization.slice(7));
    if((await adminDb().doc('account_tombstones/'+token.uid).get()).exists)throw Error('Conta encerrada.');
    return {uid:token.uid,authTime:token.auth_time||0,firebaseUser:true};
  }
  const token=/(?:^|;\s*)vigia_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  if(!token||!guests.has(token)||guests.get(token)!.expires<Date.now())throw Error('Sessão inválida.');
  return {uid:`guest:${token}`,authTime:0,firebaseUser:false};
}
export function installSecurity(app: Express,options:{skipApiHeaders?:boolean;skipAuthentication?:boolean;skipOriginCheck?:boolean}={}) {
  app.disable('x-powered-by');
  if(!options.skipApiHeaders)app.use('/api',apiResponseHeaders);
  if(!options.skipOriginCheck)app.use('/api',apiOriginGuard);
  app.get('/api/status', (_req, res) => { const ai=realAiConfig(); res.json({ demo: demoMode, audience:runtime.adultAudience?'18plus':'legacy',localDemo:demoMode&&!runtime.preview, realAI:!demoMode&&ai.enabled, firebase: localFirebase ? 'emulator' : runtime.cloud?'cloud':'disabled', ai:{mode:demoMode?'simulation':runtime.localReal||runtime.adultLive?ai.scope:'unavailable',provider:demoMode?null:ai.provider,blocked:demoMode?null:ai.blocked,consentVersion:ai.consentVersion,voice:!demoMode&&ai.enabled} }); });
  app.post('/api/session', (_req, res) => {
    for (const [key, item] of guests) if (item.expires < Date.now()) {guests.delete(key);adultGuests.delete('guest:'+key);}
    if (guests.size >= 1000) return res.status(503).json({ error: 'Sessões indisponíveis.' });
    const token = randomBytes(32).toString('hex');
    guests.set(token, { expires: Date.now() + 60 * 60 * 1000 });
    res.setHeader('Set-Cookie', `vigia_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({ expiresIn: 3600 });
  });
  if(!options.skipAuthentication)app.use('/api', async (req, res, next) => {
    try {
      Object.assign(res.locals,await authenticateApiRequest(req));
      next();
    } catch { res.status(401).json({ error: 'Entre novamente ou inicie uma sessão de visitante.' }); }
  });
  app.post('/api/adult-access',async(req,res)=>{
    if(!runtime.adultAudience)return res.status(404).end();
    if(req.body?.confirmed!==true||req.body?.version!==ADULT_ACCESS_VERSION)return res.status(403).json({error:'O Vigia é exclusivo para pessoas de 18 anos ou mais.'});
    const uid=identity(req);
    try{
      if(uid.startsWith('guest:'))adultGuests.add(uid);
      else{const a=await adminDb().doc('sala_authorities/'+uid).get();if(a.data()?.guardianUid)return res.status(403).json({error:'Este perfil possui vínculo infantil anterior. Use sua própria conta adulta; os dados anteriores foram preservados.'});await adminDb().doc('adult_access/'+uid).set({version:ADULT_ACCESS_VERSION,ageThreshold:18,confirmedAt:new Date().toISOString()},{merge:true});}
      res.json({allowed:true});
    }catch{res.status(503).json({error:'Não foi possível confirmar o acesso adulto. Tente novamente.'});}
  });
  app.use('/api',async(req,res,next)=>{
    if(!runtime.adultAudience)return next();
    try{if(!await adultAccess(identity(req)))return res.status(403).json({error:'Confirme que tem 18 anos ou mais para acessar o Vigia.'});next();}catch{res.status(503).json({error:'Não foi possível verificar o acesso adulto.'});}
  });
  installRealAiAccess(app);
  app.post('/api/live-ticket', (req, res) => {
    for (const [key, item] of tickets) if (item.expires < Date.now()) tickets.delete(key);
    if (tickets.size >= 1000) return res.status(503).json({ error: 'Voz indisponível.' });
    const ticket = randomBytes(32).toString('hex');
    tickets.set(ticket, { uid: identity(req), expires: Date.now() + 30000 });
    res.json({ ticket });
  });
}

export async function realAiAccess(uid:string,firebaseUser:boolean) {
  const config=realAiConfig();
  if(config.provider==='gemini')return config.enabled&&runtime.adultAudience&&(runtime.localReal||runtime.adultLive)&&await adultAccess(uid);
  if(!runtime.localReal)return false;
  if(uid.startsWith('guest:'))return config.enabled&&canUseRealAi(uid,false);
  if(!firebaseUser)return false;
  const [profile,user]=await Promise.all([adminDb().doc('sala_authorities/'+uid).get(),trustedAuth().getUser(uid)]);
  return canUseRealAi(uid,firebaseUser,profile.data()?.role,user.email) && config.enabled;
}

export function installRealAiAccess(app:Express) {
  app.get('/api/ai-access',async(req,res)=>{try{const config=realAiConfig();const allowed=await realAiAccess(identity(req),!!res.locals.firebaseUser);res.json({allowed,voice:allowed,provider:demoMode?null:config.provider,blocked:demoMode?'Voz indisponível no modo de simulação.':config.blocked||(!allowed?config.provider==='local'?'Use uma conta fictícia ou a opção visitante nesta avaliação local.':'Entre com a conta adulta fictícia autorizada para este teste.':null)});}catch{res.status(503).json({allowed:false,voice:false,blocked:'Não foi possível verificar a conta de teste.'});}});
  app.use('/api',async(req,res,next)=>{
    const path=req.path.toLowerCase().replace(/\/$/,'');
    if(demoMode || !['/chat','/analyze-scenario','/generate-quiz','/transcribe','/tts','/live-ticket'].includes(path))return next();
    try {
      // Public emergency directions remain available without sending data to a provider.
      if(['/chat','/analyze-scenario'].includes(path)&&isEmergency(req.body?.message||req.body?.scenario||''))return next();
      const config=realAiConfig();
      if(!config.enabled)return res.status(503).json({status:'unavailable',code:'configuration_blocked',error:config.blocked});
      if(!await realAiAccess(identity(req),!!res.locals.firebaseUser))return res.status(403).json({status:'unavailable',code:'audience_blocked',error:config.provider==='local'?'Use uma conta fictícia nesta avaliação local.':'IA real restrita à conta adulta fictícia autorizada. O uso infantil ainda não foi liberado.'});
      if(req.headers['x-vigia-ai-consent']!==config.consentVersion)return res.status(428).json({status:'unavailable',code:'consent_required',error:config.provider==='local'?'Confirme o processamento local de dados fictícios.':config.provider==='gemini'?'Confirme o processamento de dados pelo Gemini gratuito.':'Confirme o envio de dados fictícios ao serviço OpenAI.'});
      next();
    } catch {res.status(503).json({status:'unavailable',error:'Não foi possível verificar o acesso à IA.'});}
  });
}
