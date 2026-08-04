import { db, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from './firebase';
import { ChatMessage, ChatSession } from '../types';

const GUEST_STORAGE_KEY = 'vigia_guest_chat_sessions_v1';

// Helper to serialize ChatMessage dates for storage
function cleanUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      if (obj[key] !== undefined) {
        acc[key] = cleanUndefined(obj[key]);
      }
      return acc;
    }, {} as any);
  }
  return obj;
}

function serializeSession(session: ChatSession): any {
  const serialized = {
    ...session,
    messages: session.messages.map((m) => ({
      ...m,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
    })),
  };
  return cleanUndefined(serialized);
}

// Helper to deserialize ChatMessage dates after reading
function deserializeSession(data: any): ChatSession {
  return {
    id: data.id,
    title: data.title || 'Conversa sem título',
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    lastMessagePreview: data.lastMessagePreview || '',
    messages: (data.messages || []).map((m: any) => ({
      ...m,
      timestamp: typeof m.timestamp === 'string' ? new Date(m.timestamp) : new Date(m.timestamp || Date.now()),
    })),
  };
}

// Load all sessions for current user (or guest)
export async function loadSessions(userId?: string): Promise<ChatSession[]> {
  if (userId) {
    try {
      const userSessionsRef = collection(db, 'users', userId, 'chat_sessions');
      const snapshot = await getDocs(userSessionsRef);
      const sessions: ChatSession[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          sessions.push(deserializeSession(docSnap.data()));
        }
      });
      // Sort newest updated first
      sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return sessions;
    } catch (err) {
      console.error('Erro ao carregar sessões do Firestore:', err);
      // Fallback to local storage if Firestore fails
    }
  }

  // Guest / Fallback localStorage
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const sessions = (parsed || []).map(deserializeSession);
    sessions.sort((a: ChatSession, b: ChatSession) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return sessions;
  } catch (err) {
    console.error('Erro ao carregar do localStorage:', err);
    return [];
  }
}

// Save or update a session
export async function saveSession(session: ChatSession, userId?: string): Promise<void> {
  const serialized = serializeSession(session);

  if (userId) {
    try {
      const sessionDocRef = doc(db, 'users', userId, 'chat_sessions', session.id);
      await setDoc(sessionDocRef, serialized, { merge: true });
      return;
    } catch (err) {
      console.error('Erro ao salvar sessão no Firestore:', err);
    }
  }

  // Guest localStorage
  try {
    const existing = await loadSessions();
    const idx = existing.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      existing[idx] = session;
    } else {
      existing.unshift(session);
    }
    const serializedList = existing.map(serializeSession);
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(serializedList));
  } catch (err) {
    console.error('Erro ao salvar sessão no localStorage:', err);
  }
}

// Delete a session by ID
export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  if (userId) {
    try {
      const sessionDocRef = doc(db, 'users', userId, 'chat_sessions', sessionId);
      await deleteDoc(sessionDocRef);
    } catch (err) {
      console.error('Erro ao deletar sessão do Firestore:', err);
    }
  }

  // Local storage update
  try {
    const existing = await loadSessions();
    const filtered = existing.filter((s) => s.id !== sessionId);
    const serializedList = filtered.map(serializeSession);
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(serializedList));
  } catch (err) {
    console.error('Erro ao deletar do localStorage:', err);
  }
}

// Delete all sessions for user / guest
export async function deleteAllSessions(userId?: string): Promise<void> {
  if (userId) {
    try {
      const existing = await loadSessions(userId);
      for (const s of existing) {
        const sessionDocRef = doc(db, 'users', userId, 'chat_sessions', s.id);
        await deleteDoc(sessionDocRef);
      }
    } catch (err) {
      console.error('Erro ao deletar todas as sessões do Firestore:', err);
    }
  }

  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch (err) {
    console.error('Erro ao limpar localStorage:', err);
  }
}

// Rename a session
export async function renameSession(sessionId: string, newTitle: string, userId?: string): Promise<void> {
  const existingList = await loadSessions(userId);
  const target = existingList.find((s) => s.id === sessionId);
  if (target) {
    target.title = newTitle;
    target.updatedAt = new Date().toISOString();
    await saveSession(target, userId);
  }
}
