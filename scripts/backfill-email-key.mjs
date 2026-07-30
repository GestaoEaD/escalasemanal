/**
 * Preenche `usuarios.emailKey` em cadastros já existentes.
 *
 * O login localiza a permissão consultando `where('emailKey','==', chave)`,
 * porque o Google pode devolver o endereço em grafia diferente da cadastrada
 * (no Gmail, pontos e "+alias" não distinguem a caixa). Cadastros gravados
 * antes dessa mudança não têm o campo e não seriam encontrados por perfis que
 * não podem varrer a coleção.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/backfill-email-key.mjs           # simulação
 *   node scripts/backfill-email-key.mjs --aplicar # grava
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const aplicar = process.argv.includes("--aplicar");

const norm = (v) => String(v ?? "").trim().toLowerCase();

/** Mesma regra de `contaEmailKey` no app. */
function contaEmailKey(email) {
  const e = norm(email);
  const at = e.indexOf("@");
  if (at <= 0) return e;
  const dominio = e.slice(at + 1);
  if (dominio !== "gmail.com" && dominio !== "googlemail.com") return e;
  const local = e.slice(0, at).split("+")[0].replace(/\./g, "");
  return local ? `${local}@gmail.com` : e;
}

const snap = await db.collection("usuarios").get();

const pendentes = [];
const conflitos = new Map();

for (const doc of snap.docs) {
  const d = doc.data();
  const email = norm(d.email);
  const chave = email ? contaEmailKey(email) : "";
  if (chave) {
    const lista = conflitos.get(chave) || [];
    lista.push(`${doc.id} (${email})`);
    conflitos.set(chave, lista);
  }
  if (norm(d.emailKey) === chave) continue;
  pendentes.push({ id: doc.id, nome: d.nome || "", email, atual: norm(d.emailKey), chave });
}

console.log(`usuarios: ${snap.size} | a atualizar: ${pendentes.length}`);
for (const p of pendentes) {
  const de = p.atual || "(vazio)";
  console.log(`  ${p.id} ${p.nome} — email=${p.email || "(vazio)"} emailKey: ${de} -> ${p.chave || "(vazio)"}`);
}

const duplicados = [...conflitos.entries()].filter(([, l]) => l.length > 1);
if (duplicados.length) {
  console.log("\nATENÇÃO — mesma conta Google em mais de uma permissão (o login pega uma delas):");
  for (const [chave, lista] of duplicados) {
    console.log(`  ${chave}: ${lista.join(", ")}`);
  }
}

if (!aplicar) {
  console.log("\nSimulação. Rode com --aplicar para gravar.");
  process.exit(0);
}

let lote = db.batch();
let naLote = 0;
let gravados = 0;
for (const p of pendentes) {
  lote.update(db.collection("usuarios").doc(p.id), { emailKey: p.chave });
  naLote++;
  gravados++;
  if (naLote === 400) {
    await lote.commit();
    lote = db.batch();
    naLote = 0;
  }
}
if (naLote > 0) await lote.commit();

console.log(`\n${gravados} permissão(ões) atualizada(s).`);
