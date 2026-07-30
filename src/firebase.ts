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
import { FIREBASE_PUBLIC_CONFIG } from "./firebasePublicConfig";

function envOrDefault(value: string | undefined, fallback: string): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

const viteEnv: Record<string, string | undefined> =
  (typeof import.meta !== "undefined" &&
    ((import.meta as ImportMeta & { env?: Record<string, string | undefined> })
      .env ||
      {})) ||
  {};

const firebaseConfig = {
  projectId: envOrDefault(
    viteEnv["VITE_FIREBASE_PROJECT_ID"],
    FIREBASE_PUBLIC_CONFIG.projectId
  ),
  appId: envOrDefault(viteEnv["VITE_FIREBASE_APP_ID"], FIREBASE_PUBLIC_CONFIG.appId),
  apiKey: envOrDefault(viteEnv["VITE_FIREBASE_API_KEY"], FIREBASE_PUBLIC_CONFIG.apiKey),
  authDomain: envOrDefault(
    viteEnv["VITE_FIREBASE_AUTH_DOMAIN"],
    FIREBASE_PUBLIC_CONFIG.authDomain
  ),
  storageBucket: envOrDefault(
    viteEnv["VITE_FIREBASE_STORAGE_BUCKET"],
    FIREBASE_PUBLIC_CONFIG.storageBucket
  ),
  messagingSenderId: envOrDefault(
    viteEnv["VITE_FIREBASE_MESSAGING_SENDER_ID"],
    FIREBASE_PUBLIC_CONFIG.messagingSenderId
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
