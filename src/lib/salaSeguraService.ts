import { salaRequest } from './api';
import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  getDocs,
  arrayUnion,
  arrayRemove,
  auth,
  limit,
} from './firebase';
import {
  UserProfile,
  UserRole,
  SalaSeguraInvite,
  SalaSeguraChat,
  SalaSeguraMessage,
  SalaSeguraReport,
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path,
  };
  window.dispatchEvent(new CustomEvent('vigia-error',{detail:'Operação da Sala Segura indisponível. Verifique sua conexão e permissões.'}));
  throw new Error('Operação da Sala Segura indisponível.');
}

function generateInviteCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `VIGIA-${num}`;
}

export async function fetchOrCreateUserProfile(uid: string, email: string | null, nickname: string): Promise<UserProfile> {
  if (auth.currentUser?.uid !== uid) throw new Error('Conta alterada.');
  return salaRequest('profile', { nickname });
}

export async function updateUserRole(_uid: string, _role: UserRole) { throw new Error('Papéis são atribuídos por uma verificação de responsável.'); }

export async function sendInviteByCode(_from: UserProfile, code: string) { return salaRequest('invite', {code: code.trim().toUpperCase()}); }
export async function approveInvite(invite: SalaSeguraInvite, _uid: string) { return salaRequest('decision', {id:invite.id,decision:'approve'}); }
export async function rejectInvite(id: string) { return salaRequest('decision', {id,decision:'reject'}); }

export function subscribeUserChats(uid: string, onUpdate: (chats: SalaSeguraChat[]) => void) {
  const path = 'chats';
  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const chatsList: SalaSeguraChat[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SalaSeguraChat, 'id'>),
      }));
      // Sort by updatedAt descending
      chatsList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onUpdate(chatsList);
    },
    (err) => {
      onUpdate([]); window.dispatchEvent(new CustomEvent('vigia-error',{detail:'Não foi possível carregar a Sala Segura.'}));
    }
  );
}

export function subscribePendingInvites(uid: string, onUpdate: (invites: SalaSeguraInvite[]) => void) {
  return onSnapshot(query(collection(db,'invites'),where('visibleTo','array-contains',uid)), snapshot => onUpdate(snapshot.docs.map(d=>({id:d.id,...d.data()} as SalaSeguraInvite)).filter(i=>i.status==='pending_guardian_approval')), () => { onUpdate([]); window.dispatchEvent(new CustomEvent('vigia-error',{detail:'Não foi possível carregar os convites.'})); });
}

export function subscribeChatMessages(chatId: string, onUpdate: (messages: SalaSeguraMessage[]) => void) {
  const path = `chats/${chatId}/messages`;
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: SalaSeguraMessage[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SalaSeguraMessage, 'id'>),
      }));
      onUpdate(msgs.reverse());
    },
    (err) => {
      onUpdate([]); window.dispatchEvent(new CustomEvent('vigia-error',{detail:'Não foi possível carregar a Sala Segura.'}));
    }
  );
}

export async function sendMessage(chatId: string, _sender: UserProfile, text: string, _recipient: string) { return salaRequest('message',{chatId,text,messageId:crypto.randomUUID()}); }

export async function markChatAsRead(chatId: string, currentUid: string, unreadMsgs: SalaSeguraMessage[]) {
  const path = `chats/${chatId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      [`unreadCount.${currentUid}`]: 0,
    });

    // Update messages read status
    for (const msg of unreadMsgs) {
      if (!msg.readBy?.includes(currentUid)) {
        const msgRef = doc(db, 'chats', chatId, 'messages', msg.id);
        await updateDoc(msgRef, {
          status: 'read',
          readBy: arrayUnion(currentUid),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function blockUser(currentUid: string, targetUid: string) {
  const path = `users/${currentUid}`;
  try {
    await updateDoc(doc(db, 'users', currentUid), {
      blockedUsers: arrayUnion(targetUid),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function unblockUser(currentUid: string, targetUid: string) {
  const path = `users/${currentUid}`;
  try {
    await updateDoc(doc(db, 'users', currentUid), {
      blockedUsers: arrayRemove(targetUid),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function submitReport(reporterUid: string, reportedUid: string, chatId: string, messageText: string, reason: string) {
  const path = 'reports';
  try {
    const report: Omit<SalaSeguraReport, 'id'> = {
      reporterUid,
      reportedUid,
      chatId,
      messageText,
      reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await addDoc(collection(db, 'reports'), report);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}
