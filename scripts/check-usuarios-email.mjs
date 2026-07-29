/**
 * Confere se a coleção usuarios do projeto escalaead tem e-mails preenchidos,
 * pré-requisito do login Google (findUsuarioByEmail).
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/check-usuarios-email.mjs
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection("usuarios").get();
console.log("TOTAL_USUARIOS", snap.size);

const semEmail = [];
for (const d of snap.docs) {
  const u = d.data();
  const email = (u.email || "").trim();
  if (!email) semEmail.push(d.id);
  console.log(
    `  ${d.id} | perfil=${u.perfil || "-"} | divisaoId=${u.divisaoId || "(vazio)"} | email=${
      email ? email.replace(/^(.{3}).*(@.*)$/, "$1***$2") : "(VAZIO)"
    }`
  );
}
console.log("SEM_EMAIL", semEmail.length ? semEmail : "nenhum");

const idx = await db.collection("auth_index").get();
console.log("AUTH_INDEX_DOCS", idx.size);
