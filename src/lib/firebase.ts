import {firebaseApp} from './firebaseAuth';
export {auth,googleProvider,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut,onAuthStateChanged} from './firebaseAuth';
export type {User} from './firebaseAuth';
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

// If custom firestoreDatabaseId is provided, use it
export const db = import.meta.env.VITE_FIREBASE_MODE === 'cloud' && firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
  : getFirestore(firebaseApp);

if (import.meta.env.VITE_FIREBASE_MODE !== 'cloud') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
export {
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
};
