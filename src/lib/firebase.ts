import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  writeBatch,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(import.meta.env.VITE_FIREBASE_MODE === 'cloud' ? firebaseConfig : { apiKey: 'demo-key', projectId: 'demo-vigia', authDomain: 'localhost' }) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// If custom firestoreDatabaseId is provided, use it
export const db = import.meta.env.VITE_FIREBASE_MODE === 'cloud' && firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

if (import.meta.env.VITE_FIREBASE_MODE !== 'cloud') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
export {
  writeBatch,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  getDocs,
  deleteDoc,
};

export type { User };
