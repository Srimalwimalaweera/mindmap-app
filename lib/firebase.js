import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// TODO: Replace with your actual Firebase configuration keys
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBwPLsKB2ESYKS9uS4sDDyPXf4DRvKzl3A",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "visual-markmap-studio.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "visual-markmap-studio",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "visual-markmap-studio.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "404849457957",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:404849457957:web:78ef497b2fce4da94978cc"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const storage = getStorage(app);

export { auth, db, googleProvider, storage };
