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
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "gen-lang-client-0610988869",
  appId: "1:1065970160388:web:c8e86475df7c1998183651",
  apiKey: "AIzaSyA53oNdbcKh8pAkpPpSGS-bUoXgZju__-8",
  authDomain: "gen-lang-client-0610988869.firebaseapp.com",
  storageBucket: "gen-lang-client-0610988869.firebasestorage.app",
  messagingSenderId: "1065970160388",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID
const db = getFirestore(app, "ai-studio-27d48337-faf8-4a27-a402-a865ec6f3b72");

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
};
