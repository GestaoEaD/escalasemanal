import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch,
  Timestamp,
  serverTimestamp,
  runTransaction,
  onSnapshot,
  FieldValue,
  GeoPoint,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

function requiredEnv(name: string, value: string | undefined): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(
      `Configuração Firebase ausente: ${name}. Defina-a no ambiente de build.`
    );
  }
  return normalized;
}

const firebaseConfig = {
  projectId: requiredEnv("VITE_FIREBASE_PROJECT_ID", import.meta.env.VITE_FIREBASE_PROJECT_ID),
  appId: requiredEnv("VITE_FIREBASE_APP_ID", import.meta.env.VITE_FIREBASE_APP_ID),
  apiKey: requiredEnv("VITE_FIREBASE_API_KEY", import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: requiredEnv("VITE_FIREBASE_AUTH_DOMAIN", import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  storageBucket: requiredEnv(
    "VITE_FIREBASE_STORAGE_BUCKET",
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: requiredEnv(
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  ),
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore (default database)
const db = getFirestore(app);

// Initialize Auth (Google Sign-In) and Storage
const auth = getAuth(app);
const storage = getStorage(app);

export {
  db,
  auth,
  storage,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  Timestamp,
  serverTimestamp,
  runTransaction,
  onSnapshot,
  FieldValue,
  GeoPoint,
};
