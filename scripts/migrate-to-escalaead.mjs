/**
 * One-shot: copia coleções do Firestore antigo (AI Studio) → escalaead.
 * Uso: GOOGLE_APPLICATION_CREDENTIALS=<sa.json> node scripts/migrate-to-escalaead.mjs
 * NÃO comitar service account.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { initializeApp as initClient } from "firebase/app";
import {
  getFirestore as getClientFs,
  collection,
  getDocs,
} from "firebase/firestore";

const COLLECTIONS = [
  "usuarios",
  "colaboradores",
  "secoes",
  "postos",
  "legendas",
  "escalas_semanais",
  "escalas_alteracao",
  "controle_frequencia",
  "solicitacoes_aprovacao",
  "logs",
  "counters",
  "presenca_online",
  "configuracoes",
  "auth_index",
];

const oldApiKey = String(process.env.OLD_FIREBASE_API_KEY || "").trim();
if (!oldApiKey) {
  throw new Error(
    "OLD_FIREBASE_API_KEY não definida. A migração não aceita chaves versionadas."
  );
}

const OLD_CONFIG = {
  projectId: "gen-lang-client-0610988869",
  appId: "1:1065970160388:web:c8e86475df7c1998183651",
  apiKey: oldApiKey,
  authDomain: "gen-lang-client-0610988869.firebaseapp.com",
  storageBucket: "gen-lang-client-0610988869.firebasestorage.app",
  messagingSenderId: "1065970160388",
};

const OLD_DB_ID = "ai-studio-27d48337-faf8-4a27-a402-a865ec6f3b72";

function isTimestampLike(v) {
  if (!v || typeof v !== "object") return false;
  if (typeof v.toDate === "function" && (typeof v.seconds === "number" || typeof v._seconds === "number")) {
    return true;
  }
  if (typeof v.seconds === "number" && typeof v.nanoseconds === "number") return true;
  if (typeof v._seconds === "number") return true;
  return false;
}

function toAdminTimestamp(v) {
  const seconds = typeof v.seconds === "number" ? v.seconds : v._seconds;
  const nanos =
    typeof v.nanoseconds === "number"
      ? v.nanoseconds
      : typeof v._nanoseconds === "number"
        ? v._nanoseconds
        : 0;
  if (typeof seconds === "number") {
    return new AdminTimestamp(seconds, nanos);
  }
  if (typeof v.toDate === "function") {
    return AdminTimestamp.fromDate(v.toDate());
  }
  return v;
}

function convertValue(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(convertValue);
  if (isTimestampLike(v)) return toAdminTimestamp(v);
  if (typeof v === "object") {
    // Detect GeoPoint / DocumentReference loosely — keep as plain if needed
    if (typeof v.latitude === "number" && typeof v.longitude === "number") return v;
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = convertValue(val);
    }
    return out;
  }
  return v;
}

async function copyCollection(srcDb, destDb, name) {
  const snap = await getDocs(collection(srcDb, name));
  if (snap.empty) {
    console.log(`  ${name}: 0 docs`);
    return 0;
  }
  let written = 0;
  let batch = destDb.batch();
  let ops = 0;
  for (const d of snap.docs) {
    const data = convertValue(d.data());
    batch.set(destDb.collection(name).doc(d.id), data, { merge: true });
    ops += 1;
    written += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = destDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`  ${name}: ${written} docs`);
  return written;
}

async function main() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    console.error("Defina GOOGLE_APPLICATION_CREDENTIALS");
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(keyPath, "utf8"));
  const firebaseTs = readFileSync(new URL("../src/firebase.ts", import.meta.url), "utf8");
  const m = firebaseTs.match(/apiKey:\s*"([^"]+)"/);
  if (m) OLD_CONFIG.apiKey = m[1];

  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const destDb = getFirestore();

  const clientApp = initClient(OLD_CONFIG, "migrate-src");
  const srcDb = getClientFs(clientApp, OLD_DB_ID);

  console.log(`Migrando ${OLD_CONFIG.projectId}/${OLD_DB_ID} → ${sa.project_id}/(default)`);
  let total = 0;
  for (const name of COLLECTIONS) {
    try {
      total += await copyCollection(srcDb, destDb, name);
    } catch (e) {
      console.error(`  ${name}: ERRO`, e.message || e);
    }
  }
  console.log(`Total documentos gravados: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
