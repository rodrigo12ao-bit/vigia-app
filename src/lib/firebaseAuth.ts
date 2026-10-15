// Account identity is available without loading Firestore or feature modules.
import { initializeApp, getApps, getApp } from 'firebase/app';
import {getAuth,connectAuthEmulator,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut,onAuthStateChanged,type User} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const firebaseApp=!getApps().length?initializeApp(import.meta.env.VITE_FIREBASE_MODE==='cloud'?firebaseConfig:{apiKey:'demo-key',projectId:'demo-vigia',authDomain:'localhost'}):getApp();
export const auth=getAuth(firebaseApp);
export const googleProvider=new GoogleAuthProvider();
if(import.meta.env.VITE_FIREBASE_MODE!=='cloud')connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
export {signInWithPopup,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut,onAuthStateChanged};
export type {User};
