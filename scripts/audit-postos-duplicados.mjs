/**
 * Audita duplicidade na coleção `postos`.
 *
 * Duas causas possíveis: docs legados com ID sem prefixo de Divisão, ou o
 * mesmo catálogo replicado em várias Divisões (o Gerente lê a coleção inteira
 * e vê a mesma sigla repetida).
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/audit-postos-duplicados.mjs
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const divSnap = await db.collection("divisoes").get();
console.log(`divisoes: ${divSnap.size}`);
for (const d of divSnap.docs) {
  const data = d.data();
  console.log(`   id=${d.id} codigo=${data.codigo ?? "-"} nome="${data.nome ?? ""}" ativa=${data.ativa ?? "-"}`);
}

const snap = await db.collection("postos").get();
console.log(`\npostos: ${snap.size} documento(s)`);
const porDivisao = new Map();
for (const d of snap.docs) {
  const data = d.data();
  const divisaoId = String(data.divisaoId || "").trim();
  if (!porDivisao.has(divisaoId)) porDivisao.set(divisaoId, []);
  porDivisao.get(divisaoId).push({ id: d.id, sigla: String(data.sigla || ""), ordem: data.ordem ?? null });
}
for (const [divisaoId, docs] of porDivisao) {
  console.log(`\n   divisaoId=${divisaoId} -> ${docs.length} posto(s)`);
  for (const d of docs.sort((a, b) => (a.ordem || 0) - (b.ordem || 0))) {
    console.log(`      ordem=${d.ordem} sigla="${d.sigla}" id=${d.id}`);
  }
}

// Uso real das siglas — evita apagar algo em uso.
const colSnap = await db.collection("colaboradores").get();
console.log(`\ncolaboradores: ${colSnap.size}`);
if (colSnap.size) {
  console.log(`campos do 1o doc: ${Object.keys(colSnap.docs[0].data()).join(", ")}`);
}
const uso = new Map();
for (const d of colSnap.docs) {
  const data = d.data();
  const divisaoId = String(data.divisaoId || "").trim();
  const posto = String(data.posto ?? data.postoGraduacao ?? data.graduacao ?? "").trim();
  const chave = `${divisaoId}|${posto || "(vazio)"}`;
  uso.set(chave, (uso.get(chave) || 0) + 1);
}
console.log("uso por colaboradores (divisao|posto = qtd):");
for (const [chave, qtd] of [...uso.entries()].sort()) console.log(`   ${chave} = ${qtd}`);

const usuSnap = await db.collection("usuarios").get();
console.log(`\nusuarios: ${usuSnap.size}`);
const usoU = new Map();
for (const d of usuSnap.docs) {
  const data = d.data();
  const divisaoId = String(data.divisaoId || "").trim();
  const posto = String(data.posto ?? data.postoGraduacao ?? data.graduacao ?? "").trim();
  const chave = `${divisaoId}|${posto || "(vazio)"}`;
  usoU.set(chave, (usoU.get(chave) || 0) + 1);
}
console.log("uso por usuarios (divisao|posto = qtd):");
for (const [chave, qtd] of [...usoU.entries()].sort()) console.log(`   ${chave} = ${qtd}`);
