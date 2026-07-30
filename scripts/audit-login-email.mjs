/**
 * Diagnóstico de acesso por conta Google.
 *
 * O login exige três coisas alinhadas: uma permissão em `usuarios` com o e-mail,
 * o espelho em `auth_index/{email}` (usado pelas security rules) e a conta
 * Google correspondente. Este script mostra onde a corrente arrebenta —
 * inclusive o caso mais comum: e-mail informado só no colaborador, sem permissão.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/audit-login-email.mjs
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const norm = (v) => String(v ?? "").trim().toLowerCase();
const reBase = (re) => String(re ?? "").replace(/\D/g, "").slice(0, 6);

const [usuarios, authIndex, colaboradores] = await Promise.all([
  db.collection("usuarios").get(),
  db.collection("auth_index").get(),
  db.collection("colaboradores").get(),
]);

const idx = new Map(authIndex.docs.map((d) => [d.id, d.data()]));
const emailsComPermissao = new Set(
  usuarios.docs.map((d) => norm(d.data().email)).filter(Boolean)
);

console.log(
  `usuarios: ${usuarios.size} | auth_index: ${authIndex.size} | colaboradores: ${colaboradores.size}\n`
);

console.log("=== PERMISSÕES (usuarios) ===");
for (const d of usuarios.docs) {
  const u = d.data();
  const email = norm(u.email);
  console.log(
    `usuarios/${d.id} perfil="${u.perfil ?? ""}" divisaoId="${u.divisaoId ?? ""}" secaoId="${u.secaoId ?? ""}" ativo=${u.ativo}`
  );
  console.log(`   email="${email || "(vazio)"}" idDocIgualRe=${d.id === String(u.re ?? "").trim()}`);

  if (!email) {
    console.log("   -> SEM E-MAIL: não consegue entrar\n");
    continue;
  }

  const ai = idx.get(email);
  if (!ai) {
    console.log(`   -> FALTA auth_index/${email}: autentica mas não lê nada\n`);
    continue;
  }

  // Espelho exigido por authIndexMirrorsUsuario() nas security rules.
  const problemas = [];
  if (norm(ai.email) !== email) problemas.push(`email difere ("${ai.email}")`);
  if (String(ai.re ?? "").trim() !== String(u.re ?? "").trim()) {
    problemas.push(`re difere ("${ai.re}" vs "${u.re}")`);
  }
  if (String(ai.perfil ?? "") !== String(u.perfil ?? "")) {
    problemas.push(`perfil difere ("${ai.perfil}" vs "${u.perfil}")`);
  }
  if (String(ai.divisaoId ?? "") !== String(u.divisaoId ?? "")) {
    problemas.push(`divisaoId difere ("${ai.divisaoId}" vs "${u.divisaoId}")`);
  }
  if (String(ai.secaoId ?? "") !== String(u.secaoId ?? "")) {
    problemas.push(`secaoId difere ("${ai.secaoId}" vs "${u.secaoId}")`);
  }
  console.log(
    problemas.length
      ? `   -> auth_index/${email} DIVERGENTE: ${problemas.join("; ")}\n`
      : `   -> auth_index/${email} OK\n`
  );
}

console.log("=== COLABORADORES COM E-MAIL E SEM PERMISSÃO ===");
let semPermissao = 0;
for (const d of colaboradores.docs) {
  const c = d.data();
  const email = norm(c.email);
  if (!email) continue;
  const permissao = usuarios.docs.find(
    (u) => String(u.data().re ?? "").trim() === String(c.re ?? "").trim()
  );
  if (!permissao) {
    semPermissao += 1;
    console.log(`   ${c.postoGrad ?? ""} ${c.nome ?? ""} (RE ${c.re}) — ${email}`);
    continue;
  }
  const emailPermissao = norm(permissao.data().email);
  if (emailPermissao !== email) {
    semPermissao += 1;
    console.log(
      `   ${c.postoGrad ?? ""} ${c.nome ?? ""} (RE ${c.re}) — cadastro "${email}" ≠ login "${emailPermissao || "(vazio)"}"`
    );
  }
}
if (!semPermissao) console.log("   nenhum");

console.log("\n=== RE DUPLICADO (mesmo policial em dois registros) ===");
let duplicados = 0;
for (const nome of ["usuarios", "colaboradores"]) {
  const snap = nome === "usuarios" ? usuarios : colaboradores;
  const grupos = new Map();
  for (const d of snap.docs) {
    const k = reBase(d.data().re ?? d.id);
    if (!k) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  for (const [k, itens] of grupos) {
    if (itens.length < 2) continue;
    duplicados += 1;
    console.log(`   ${nome} — RE base ${k}:`);
    for (const d of itens) {
      console.log(`      ${nome}/${d.id} email="${norm(d.data().email) || "(vazio)"}"`);
    }
  }
}
if (!duplicados) console.log("   nenhum");

console.log("\n=== CONTAS GOOGLE QUE JÁ AUTENTICARAM ===");
const contas = await getAuth().listUsers(1000);
for (const u of contas.users) {
  const email = norm(u.email);
  const autorizada = emailsComPermissao.has(email);
  console.log(
    `   ${email || "(sem e-mail)"} ${autorizada ? "OK" : "SEM PERMISSÃO"} · último login ${u.metadata.lastSignInTime ?? "nunca"}${u.disabled ? " · DESABILITADA" : ""}`
  );
}
