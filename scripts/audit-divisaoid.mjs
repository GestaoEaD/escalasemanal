/**
 * Audita a presença de divisaoId nas coleções gravadas pelo batch de Configurações.
 * Um único doc existente sem divisaoId reprova tenantUpdateOk() e derruba o batch inteiro.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/audit-divisaoid.mjs
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const COLLECTIONS = ["colaboradores", "usuarios", "postos", "secoes", "legendas", "divisoes"];

for (const col of COLLECTIONS) {
  const snap = await db.collection(col).get();
  const sem = [];
  const vazio = [];
  const valores = new Set();
  for (const d of snap.docs) {
    const v = d.data();
    if (!("divisaoId" in v)) sem.push(d.id);
    else if (!String(v.divisaoId || "").trim()) vazio.push(d.id);
    else valores.add(String(v.divisaoId));
  }
  console.log(
    `${col.padEnd(15)} total=${String(snap.size).padStart(4)} | sem campo=${sem.length} | vazio=${vazio.length} | divisoes=${[...valores].join(",") || "-"}`
  );
  if (sem.length) console.log(`   SEM CAMPO: ${sem.slice(0, 25).join(", ")}${sem.length > 25 ? ` …(+${sem.length - 25})` : ""}`);
  if (vazio.length) console.log(`   VAZIO:     ${vazio.slice(0, 25).join(", ")}${vazio.length > 25 ? ` …(+${vazio.length - 25})` : ""}`);
}
