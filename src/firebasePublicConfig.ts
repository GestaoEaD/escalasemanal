/**
 * Configuração pública do Firebase Web SDK (cliente).
 *
 * Estes valores NÃO são segredos de servidor: o navegador precisa deles.
 * A proteção real é Firestore Rules, Auth e restrições da API key por domínio.
 * Preferir override via VITE_FIREBASE_* quando disponível.
 */
export const FIREBASE_PUBLIC_CONFIG = {
  apiKey: "AIzaSyAuAZO0L8ifpGDFqybvIlsuzNxMclW79o0",
  authDomain: "escalaead.firebaseapp.com",
  projectId: "escalaead",
  storageBucket: "escalaead.firebasestorage.app",
  messagingSenderId: "273620416234",
  appId: "1:273620416234:web:6cca13b7fbcf941bd7c993",
} as const;
