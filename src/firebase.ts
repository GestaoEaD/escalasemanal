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
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "escalaead",
  appId: "1:273620416234:web:6cca13b7fbcf941bd7c993",
  apiKey: "AIzaSyAuAZO0L8ifpGDFqybvIlsuzNxMclW79o0",
  authDomain: "escalaead.firebaseapp.com",
  storageBucket: "escalaead.firebasestorage.app",
  messagingSenderId: "273620416234",
  measurementId: ""
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
};
