import type { Express } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb,runtime,ADULT_ACCESS_VERSION } from './security';
async function eligibleAdult(tx:FirebaseFirestore.Transaction,uid:string,authority:any){const record=await tx.get(adminDb().doc('adult_access/'+uid));return record.data()?.version===ADULT_ACCESS_VERSION&&!authority?.guardianUid;}

export function installSalaRoutes(app: Express) {
  app.use('/api/sala', (_req, res, next) => {
    if (!res.locals.firebaseUser) return res.status(401).json({ error: 'Entre na sua conta para usar a Sala Segura.' });
    next();
  });
  const route = (path: string, action: (uid: string, data: any) => Promise<any>) => app.post(`/api/sala/${path}`, async (req, res) => {
    try { res.json(await action(res.locals.uid, req.body)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'Operação indisponível.' }); }
  });
  route('profile', async (uid, data) => {
    const db = adminDb(), ref = db.doc(`users/${uid}`);
    return db.runTransaction(async tx => {
      const [snap, authority] = await Promise.all([tx.get(ref), tx.get(db.doc(`sala_authorities/${uid}`))]);
      const stored = snap.data() || {}, trusted = authority.data() || { role: 'infantil' };
      let code = /^VIGIA-[A-F0-9]{32}$/.test(stored.inviteCode || '') ? stored.inviteCode : `VIGIA-${randomBytes(16).toString('hex').toUpperCase()}`;
      // A client-created profile must never take another person's invite code.
      for (let attempt=0; attempt<5; attempt++) {
        const directory=await tx.get(db.doc(`invite_codes/${code}`));
        if (!directory.exists || directory.data()?.uid===uid) break;
        code=`VIGIA-${randomBytes(16).toString('hex').toUpperCase()}`;
        if(attempt===4)throw new Error('Não foi possível criar um código exclusivo.');
      }
      const now = new Date().toISOString();
      const profile = { uid, email: stored.email || '', nickname: stored.nickname || String(data.nickname || 'Super Protetor').slice(0,80), avatarId: stored.avatarId || 'default', role: trusted.role, guardianUid: trusted.guardianUid || null, inviteCode: code, blockedUsers: stored.blockedUsers || [], starsScore: stored.starsScore ?? 50, badges: stored.badges || [], createdAt: stored.createdAt || now, updatedAt: now };
      tx.set(ref, profile, { merge: true });
      tx.set(db.doc(`invite_codes/${code}`), { uid, nickname: profile.nickname, avatarId: profile.avatarId });
      return profile;
    });
  });
  route('invite', async (uid, data) => {
    if (typeof data.code !== 'string' || !/^VIGIA-[A-F0-9]{32}$/.test(data.code)) throw new Error('Código inválido. Use o código completo do contato.');
    const db = adminDb(), directory = await db.doc(`invite_codes/${data.code}`).get();
    const target = directory.data()?.uid;
    if (!target || target === uid) throw new Error('Contato indisponível.');
    const id = createHash('sha256').update(JSON.stringify([uid,target].sort())).digest('hex');
    return db.runTransaction(async tx => {
      const [from, to, a, b, previous, chat] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`users/${target}`)), tx.get(db.doc(`sala_authorities/${uid}`)), tx.get(db.doc(`sala_authorities/${target}`)), tx.get(db.doc(`invites/${id}`)), tx.get(db.doc(`chats/${id}`))]);
      const p1=from.data(), p2=to.data();
      if (!p1 || !p2 || p1.blockedUsers?.includes(target) || p2.blockedUsers?.includes(uid)) throw new Error('Contato indisponível.');
      if (chat.exists) return { success: true, message: 'Este contato já está aprovado.' };
      if (previous.exists && previous.data()?.status !== 'rejected') return {success:true,message:'O convite já está aguardando aprovação.'};
      const reviewers = [target];
      if(runtime.adultAudience){if(!await eligibleAdult(tx,uid,a.data())||!await eligibleAdult(tx,target,b.data()))throw new Error('O contato precisa acessar sua própria conta e confirmar que tem 18 anos ou mais.');}
      else for (const authority of [a.data(), b.data()]) {
        if (!authority || authority.role === 'infantil') {
          if (!authority?.guardianUid) throw new Error('Um responsável verificado precisa vincular as contas infantis antes do convite.');
          reviewers.push(authority.guardianUid);
        }
      }
      const reviewerUids=[...new Set(reviewers)];
      tx.set(db.doc(`invites/${id}`), { fromUid:uid,targetUid:target,fromNickname:p1.nickname,fromAvatarId:p1.avatarId,targetNickname:p2.nickname,status:'pending_guardian_approval',reviewerUids,approvals:[],visibleTo:[...new Set([uid,target,...reviewerUids])],createdAt:new Date().toISOString() });
      return {success:true,message:runtime.adultAudience?'Convite enviado. O contato precisa aceitar para iniciar a conversa.':'Convite enviado. O contato e todos os responsáveis indicados precisam aprovar.'};
    });
  });
  route('decision', async (uid, data) => {
    if (!/^[a-f0-9]{64}$/.test(data.id || '') || !['approve','reject'].includes(data.decision)) throw new Error('Decisão inválida.');
    const db=adminDb(), ref=db.doc(`invites/${data.id}`);
    return db.runTransaction(async tx => {
      const snap=await tx.get(ref), invite=snap.data();
      if (!invite || !invite.visibleTo.includes(uid)) throw new Error('Convite indisponível.');
      if (invite.status !== 'pending_guardian_approval') return {success:true};
      if (data.decision === 'reject') {tx.update(ref,{status:'rejected'});return {success:true};}
      if (!invite.reviewerUids.includes(uid)) throw new Error('Você não pode aprovar este convite.');
      const [from,to,a,b] = await Promise.all([tx.get(db.doc(`users/${invite.fromUid}`)),tx.get(db.doc(`users/${invite.targetUid}`)),tx.get(db.doc(`sala_authorities/${invite.fromUid}`)),tx.get(db.doc(`sala_authorities/${invite.targetUid}`))]);
      const p1=from.data(),p2=to.data();
      if (!p1 || !p2 || p1.blockedUsers?.includes(invite.targetUid) || p2.blockedUsers?.includes(invite.fromUid)) throw new Error('Contato indisponível.');
      const required=[invite.targetUid];
      if(runtime.adultAudience){if(!await eligibleAdult(tx,invite.fromUid,a.data())||!await eligibleAdult(tx,invite.targetUid,b.data()))throw new Error('Ambos os participantes precisam ter acesso adulto confirmado.');}
      else for (const authority of [a.data(),b.data()]) { if (!authority || authority.role==='infantil') { if(!authority?.guardianUid) throw new Error('Vínculo de responsável indisponível.'); required.push(authority.guardianUid); } }
      if (required.some(id=>!invite.reviewerUids.includes(id))) throw new Error('O vínculo mudou. Envie um novo convite.');
      const approvals=[...new Set([...invite.approvals,uid])], approved=required.every(id=>approvals.includes(id));
      tx.update(ref,{approvals,status:approved?'approved':'pending_guardian_approval'});
      if (approved) {
        const now=new Date().toISOString();
        tx.create(db.doc(`chats/${data.id}`), {participants:[invite.fromUid,invite.targetUid],inviteId:data.id,isApproved:true,participantProfiles:{[invite.fromUid]:{nickname:p1.nickname,avatarId:p1.avatarId,role:a.data()?.role || 'infantil'},[invite.targetUid]:{nickname:p2.nickname,avatarId:p2.avatarId,role:b.data()?.role || 'infantil'}},lastMessageText:'Conversa aprovada',lastMessageTimestamp:now,createdAt:now,updatedAt:now,unreadCount:{[invite.fromUid]:0,[invite.targetUid]:0}});
      }
      return {success:true};
    });
  });
  route('message', async (uid,data) => {
    if (!/^[a-f0-9]{64}$/.test(data.chatId || '') || !/^[a-zA-Z0-9-]{10,80}$/.test(data.messageId || '') || typeof data.text!=='string' || !data.text.trim() || data.text.length>2000) throw new Error('Mensagem inválida.');
    const db=adminDb(), ref=db.doc(`chats/${data.chatId}`), msg=ref.collection('messages').doc(data.messageId);
    return db.runTransaction(async tx=>{
      const chat=await tx.get(ref), c=chat.data();
      if (!c?.isApproved || c.participants.length!==2 || !c.participants.includes(uid)) throw new Error('Conversa indisponível.');
      const other=c.participants.find((p:string)=>p!==uid);
      const [from,to,existing]=await Promise.all([tx.get(db.doc(`users/${uid}`)),tx.get(db.doc(`users/${other}`)),tx.get(msg)]);
      if(from.data()?.blockedUsers?.includes(other)||to.data()?.blockedUsers?.includes(uid)) throw new Error('Este contato está bloqueado.');
      if(existing.exists) {if(existing.data()?.senderUid!==uid)throw new Error('Mensagem indisponível.');return {success:true};}
      const now=new Date().toISOString(), text=data.text.trim();
      tx.create(msg,{senderUid:uid,senderNickname:from.data()?.nickname || 'Contato',text,createdAt:now,status:'sent',readBy:[uid]});
      tx.update(ref,{lastMessageText:text,lastMessageTimestamp:now,updatedAt:now,[`unreadCount.${other}`]:FieldValue.increment(1)});
      return {success:true};
    });
  });
}
