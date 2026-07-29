/**
 * Auditoria de consistência divisão → seção → colaborador.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/audit-divisao-secao-colaborador.mjs
 *   node scripts/audit-divisao-secao-colaborador.mjs --fix   (corrige o que for seguro)
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const FIX = process.argv.includes("--fix");
const SEPARADOR = "__";

function normalizarSecao(nome) {
  return String(nome || "").trim().replace(/\s+/g, " ");
}

const problemas = [];
const correcoes = [];

const divisoesSnap = await db.collection("divisoes").get();
const divisoes = new Map();
divisoesSnap.forEach((d) => divisoes.set(d.id, d.data()));
console.log(`Divisões: ${divisoes.size}`);
for (const [id, d] of divisoes) {
  console.log(`  - ${id}  ${d.nome}  ativo=${d.ativo !== false}`);
}

const secoesSnap = await db.collection("secoes").get();
const secoesPorDivisao = new Map();
let secoesSemDivisao = 0;
let secoesIdIncorreto = 0;

for (const d of secoesSnap.docs) {
  const data = d.data();
  const divisaoId = String(data.divisaoId || "").trim();
  const nome = normalizarSecao(data.nome);
  if (!divisaoId) {
    secoesSemDivisao++;
    problemas.push(`seção ${d.id}: sem divisaoId`);
    continue;
  }
  if (!divisoes.has(divisaoId)) {
    problemas.push(`seção ${d.id}: divisaoId ${divisaoId} não existe em divisoes`);
  }
  const esperado = `${divisaoId}${SEPARADOR}`;
  if (!d.id.startsWith(esperado)) {
    secoesIdIncorreto++;
    problemas.push(`seção ${d.id}: ID sem prefixo da Divisão (esperado ${esperado}*)`);
  }
  if (!secoesPorDivisao.has(divisaoId)) secoesPorDivisao.set(divisaoId, new Set());
  secoesPorDivisao.get(divisaoId).add(nome.toLowerCase());
}
console.log(`\nSeções: ${secoesSnap.size} | sem divisaoId: ${secoesSemDivisao} | ID legado: ${secoesIdIncorreto}`);
for (const [div, set] of secoesPorDivisao) {
  console.log(`  Divisão ${div}: ${set.size} seção(ões)`);
}

for (const colNome of ["postos", "legendas"]) {
  const snap = await db.collection(colNome).get();
  let semDiv = 0;
  let idLegado = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const divisaoId = String(data.divisaoId || "").trim();
    if (!divisaoId) {
      semDiv++;
      problemas.push(`${colNome}/${d.id}: sem divisaoId`);
      continue;
    }
    if (!d.id.startsWith(`${divisaoId}${SEPARADOR}`)) {
      idLegado++;
      problemas.push(`${colNome}/${d.id}: ID sem prefixo da Divisão`);
    }
  }
  console.log(`${colNome}: ${snap.size} | sem divisaoId: ${semDiv} | ID legado: ${idLegado}`);
}

const colsSnap = await db.collection("colaboradores").get();
let colSemDiv = 0;
let colSecaoInvalida = 0;
let colSecaoVazia = 0;

for (const d of colsSnap.docs) {
  const data = d.data();
  const divisaoId = String(data.divisaoId || "").trim();
  const secao = normalizarSecao(data.secao);
  if (!divisaoId) {
    colSemDiv++;
    problemas.push(`colaborador ${d.id}: sem divisaoId`);
    continue;
  }
  if (!divisoes.has(divisaoId)) {
    problemas.push(`colaborador ${d.id}: divisaoId ${divisaoId} inexistente`);
  }
  if (!secao) {
    colSecaoVazia++;
    problemas.push(`colaborador ${d.id} (${data.nome}): sem seção`);
    continue;
  }
  const secoesDaDiv = secoesPorDivisao.get(divisaoId) || new Set();
  if (!secoesDaDiv.has(secao.toLowerCase())) {
    colSecaoInvalida++;
    problemas.push(
      `colaborador ${d.id} (${data.nome}): seção "${secao}" não existe na Divisão ${divisaoId}`
    );
  }
}
console.log(
  `\nColaboradores: ${colsSnap.size} | sem divisaoId: ${colSemDiv} | seção vazia: ${colSecaoVazia} | seção inexistente na Divisão: ${colSecaoInvalida}`
);

const usersSnap = await db.collection("usuarios").get();
let userSemDiv = 0;
let userSecaoInvalida = 0;
for (const d of usersSnap.docs) {
  const data = d.data();
  const divisaoId = String(data.divisaoId || "").trim();
  const secao = normalizarSecao(data.secao);
  const perfil = String(data.perfil || "");
  if (perfil === "Gerente") continue; // Gerente pode não ter seção fixa
  if (!divisaoId) {
    userSemDiv++;
    problemas.push(`usuário ${d.id}: sem divisaoId`);
    continue;
  }
  if (secao) {
    const secoesDaDiv = secoesPorDivisao.get(divisaoId) || new Set();
    if (!secoesDaDiv.has(secao.toLowerCase())) {
      userSecaoInvalida++;
      problemas.push(
        `usuário ${d.id} (${data.nome}): seção "${secao}" não existe na Divisão ${divisaoId}`
      );
    }
  }
}
console.log(
  `Usuários: ${usersSnap.size} | sem divisaoId: ${userSemDiv} | seção inexistente: ${userSecaoInvalida}`
);

// Divisões sem nenhuma seção
for (const [id, d] of divisoes) {
  const qtd = secoesPorDivisao.get(id)?.size || 0;
  if (qtd === 0 && d.ativo !== false) {
    problemas.push(`Divisão ativa ${id} (${d.nome}) sem seções cadastradas`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`${problemas.length} problema(s) encontrado(s)`);
for (const p of problemas.slice(0, 40)) console.log(`  - ${p}`);
if (problemas.length > 40) console.log(`  ... e mais ${problemas.length - 40}`);

if (FIX && correcoes.length) {
  console.log(`\n${correcoes.length} correção(ões) aplicadas`);
}

process.exit(problemas.length === 0 ? 0 : 1);
