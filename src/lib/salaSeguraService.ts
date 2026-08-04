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
  console.error('SalaSegura Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function generateInviteCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `VIGIA-${num}`;
}

export async function fetchOrCreateUserProfile(uid: string, email: string | null, defaultNickname: string): Promise<UserProfile> {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();
      let inviteCode = data.inviteCode;
      if (!inviteCode) {
        inviteCode = generateInviteCode();
        await updateDoc(userRef, { inviteCode });
      }

      return {
        uid,
        email: data.email || email || '',
        nickname: data.nickname || defaultNickname || 'Super Protetor',
        avatarId: data.avatarId || 'default',
        role: data.role || 'infantil',
        guardianUid: data.guardianUid,
        inviteCode,
        blockedUsers: Array.isArray(data.blockedUsers) ? data.blockedUsers : [],
        starsScore: typeof data.starsScore === 'number' ? data.starsScore : 50,
        badges: Array.isArray(data.badges) ? data.badges : [],
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    } else {
      const newInviteCode = generateInviteCode();
      const newProfile: UserProfile = {
        uid,
        email: email || '',
        nickname: defaultNickname || 'Super Protetor',
        avatarId: 'default',
        role: 'infantil',
        inviteCode: newInviteCode,
        blockedUsers: [],
        starsScore: 50,
        badges: ['primeiros_passos'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(userRef, newProfile);
      return newProfile;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    throw err;
  }
}

export async function updateUserRole(uid: string, role: UserRole, guardianEmail?: string) {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const updates: any = {
      role,
      updatedAt: new Date().toISOString(),
    };

    if (guardianEmail) {
      updates.guardianEmail = guardianEmail;
    }

    await updateDoc(userRef, updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function sendInviteByCode(fromUser: UserProfile, inviteCode: string): Promise<{ success: boolean; message: string }> {
  const path = 'invites';
  try {
    const trimmedCode = inviteCode.trim().toUpperCase();
    if (!trimmedCode.startsWith('VIGIA-')) {
      return { success: false, message: 'Código inválido. O código deve ter o formato VIGIA-1234.' };
    }

    const q = query(collection(db, 'users'), where('inviteCode', '==', trimmedCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      return { success: false, message: 'Nenhum usuário encontrado com este código de convite.' };
    }

    const targetDoc = snap.docs[0];
    const targetData = targetDoc.data();
    const targetUid = targetDoc.id;

    if (targetUid === fromUser.uid) {
      return { success: false, message: 'Você não pode adicionar seu próprio código de convite.' };
    }

    // Check if already blocked
    if (fromUser.blockedUsers?.includes(targetUid)) {
      return { success: false, message: 'Este contato está na sua lista de bloqueados.' };
    }

    // Check if a chat already exists
    const chatId = [fromUser.uid, targetUid].sort().join('_');
    const chatSnap = await getDoc(doc(db, 'chats', chatId));
    if (chatSnap.exists()) {
      return { success: false, message: 'Você já possui uma conversa com este contato!' };
    }

    // Status is pending guardian approval if fromUser or target is 'infantil'
    const needsGuardian = fromUser.role === 'infantil' || targetData.role === 'infantil';
    const status = needsGuardian ? 'pending_guardian_approval' : 'approved';

    const newInvite: Omit<SalaSeguraInvite, 'id'> = {
      code: trimmedCode,
      fromUid: fromUser.uid,
      fromNickname: fromUser.nickname,
      fromAvatarId: fromUser.avatarId,
      targetUid,
      targetNickname: targetData.nickname || 'Amigo Vigia',
      status,
      guardianUid: fromUser.guardianUid || targetData.guardianUid || (fromUser.role === 'responsavel' ? fromUser.uid : undefined),
      createdAt: new Date().toISOString(),
    };

    const docRef = await addDoc(collection(db, 'invites'), newInvite);

    // If status is approved directly (e.g. between educators/guardians), create chat immediately
    if (status === 'approved') {
      await createOrApproveChat(fromUser.uid, targetUid, {
        [fromUser.uid]: { nickname: fromUser.nickname, avatarId: fromUser.avatarId, role: fromUser.role },
        [targetUid]: { nickname: targetData.nickname || 'Amigo', avatarId: targetData.avatarId || 'default', role: targetData.role || 'infantil' },
      });
    }

    return {
      success: true,
      message: needsGuardian
        ? 'Convite enviado! O contato estará disponível assim que o responsável aprovar.'
        : 'Contato adicionado com sucesso!',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    return { success: false, message: 'Erro ao enviar convite.' };
  }
}

export async function createOrApproveChat(uid1: string, uid2: string, profilesMap: Record<string, any>) {
  const chatId = [uid1, uid2].sort().join('_');
  const chatRef = doc(db, 'chats', chatId);

  const newChat: SalaSeguraChat = {
    id: chatId,
    participants: [uid1, uid2],
    participantProfiles: profilesMap,
    lastMessageText: 'Conversa iniciada na Sala Segura',
    lastMessageTimestamp: new Date().toISOString(),
    unreadCount: { [uid1]: 0, [uid2]: 0 },
    isApproved: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(chatRef, newChat, { merge: true });
}

export async function approveInvite(invite: SalaSeguraInvite, guardianUid: string) {
  const path = `invites/${invite.id}`;
  try {
    const inviteRef = doc(db, 'invites', invite.id);
    await updateDoc(inviteRef, {
      status: 'approved',
      guardianUid,
    });

    // Fetch user profiles to attach metadata
    const user1Snap = await getDoc(doc(db, 'users', invite.fromUid));
    const user2Snap = await getDoc(doc(db, 'users', invite.targetUid));

    const p1 = user1Snap.exists() ? user1Snap.data() : { nickname: invite.fromNickname, avatarId: 'default', role: 'infantil' };
    const p2 = user2Snap.exists() ? user2Snap.data() : { nickname: invite.targetNickname, avatarId: 'default', role: 'infantil' };

    await createOrApproveChat(invite.fromUid, invite.targetUid, {
      [invite.fromUid]: { nickname: p1.nickname || invite.fromNickname, avatarId: p1.avatarId || 'default', role: p1.role || 'infantil' },
      [invite.targetUid]: { nickname: p2.nickname || invite.targetNickname, avatarId: p2.avatarId || 'default', role: p2.role || 'infantil' },
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function rejectInvite(inviteId: string) {
  const path = `invites/${inviteId}`;
  try {
    await updateDoc(doc(db, 'invites', inviteId), {
      status: 'rejected',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

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
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribePendingInvites(uid: string, onUpdate: (invites: SalaSeguraInvite[]) => void) {
  const path = 'invites';
  const q = query(
    collection(db, 'invites'),
    where('status', '==', 'pending_guardian_approval')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const invites: SalaSeguraInvite[] = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SalaSeguraInvite, 'id'>) }))
        .filter((inv) => inv.targetUid === uid || inv.fromUid === uid || inv.guardianUid === uid);
      onUpdate(invites);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeChatMessages(chatId: string, onUpdate: (messages: SalaSeguraMessage[]) => void) {
  const path = `chats/${chatId}/messages`;
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: SalaSeguraMessage[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SalaSeguraMessage, 'id'>),
      }));
      onUpdate(msgs);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function sendMessage(chatId: string, sender: UserProfile, text: string, recipientUid: string) {
  const path = `chats/${chatId}/messages`;
  try {
    const trimmed = text.trim();
    if (!trimmed) return;

    const msgData: Omit<SalaSeguraMessage, 'id'> = {
      senderUid: sender.uid,
      senderNickname: sender.nickname,
      text: trimmed,
      createdAt: new Date().toISOString(),
      status: 'sent',
      readBy: [sender.uid],
    };

    await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);

    // Update parent chat metadata
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    const currentUnread = chatSnap.exists() ? chatSnap.data().unreadCount || {} : {};
    const recipientUnread = (currentUnread[recipientUid] || 0) + 1;

    await updateDoc(chatRef, {
      lastMessageText: trimmed,
      lastMessageTimestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      [`unreadCount.${recipientUid}`]: recipientUnread,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

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
