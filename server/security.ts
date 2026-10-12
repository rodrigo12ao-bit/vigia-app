import { randomBytes } from 'node:crypto';
import type { Express, Request } from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {runtimeConfig} from './runtime';

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
const tickets = new Map<string, { uid: string; expires: number }>();
export function identity(req: Request): string { return req.res.locals.uid; }
export function allowedOrigin(origin?: string): boolean {
  return !!origin && runtime.origins.includes(origin);
}
export function consumeTicket(ticket: string) {
  const item = tickets.get(ticket); tickets.delete(ticket);
  return item && item.expires > Date.now() ? item.uid : null;
}
export function installSecurity(app: Express) {
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET' && !allowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Origem não permitida.' });
    next();
  });
  app.get('/api/status', (_req, res) => res.json({ demo: demoMode, localDemo:demoMode&&!runtime.preview, realAI: process.env.ENABLE_REAL_AI === 'true' && !demoMode, firebase: localFirebase ? 'emulator' : runtime.cloud?'cloud':'disabled' }));
  app.post('/api/session', (_req, res) => {
    for (const [key, item] of guests) if (item.expires < Date.now()) guests.delete(key);
    if (guests.size >= 1000) return res.status(503).json({ error: 'Sessões indisponíveis.' });
    const token = randomBytes(32).toString('hex');
    guests.set(token, { expires: Date.now() + 60 * 60 * 1000 });
    res.setHeader('Set-Cookie', `vigia_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({ expiresIn: 3600 });
  });
  app.use('/api', async (req, res, next) => {
    try {
      if (req.headers.authorization?.startsWith('Bearer ')) {
        const token = await trustedAuth().verifyIdToken(req.headers.authorization.slice(7));
        if((await adminDb().doc('account_tombstones/'+token.uid).get()).exists)throw Error('Conta encerrada.');
        res.locals.uid = token.uid; res.locals.authTime=token.auth_time||0;res.locals.firebaseUser = true;
      } else {
        const token = /(?:^|;\s*)vigia_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
        if (!token || !guests.has(token) || guests.get(token)!.expires < Date.now()) throw new Error();
        res.locals.uid = `guest:${token}`;
      }
      next();
    } catch { res.status(401).json({ error: 'Entre novamente ou inicie uma sessão de visitante.' }); }
  });
  app.post('/api/live-ticket', (req, res) => {
    for (const [key, item] of tickets) if (item.expires < Date.now()) tickets.delete(key);
    if (tickets.size >= 1000) return res.status(503).json({ error: 'Voz indisponível.' });
    const ticket = randomBytes(32).toString('hex');
    tickets.set(ticket, { uid: identity(req), expires: Date.now() + 30000 });
    res.json({ ticket });
  });
}
