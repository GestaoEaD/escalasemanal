/**
 * Renomeia documentos de catálogo (postos, secoes, legendas) para IDs com
 * escopo de Divisão: `{divisaoId}__{slug}`.
 *
 * Sem isso, duas Divisões com um mesmo posto/seção/legenda colidem no mesmo
 * documento e uma sobrescreve a outra.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/migrate-tenant-doc-ids.mjs           (dry-run)
 *   node scripts/migrate-tenant-doc-ids.mjs --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const APLICAR = process.argv.includes("--apply");

const SEPARADOR = "__";
const COLECOES = [
  { nome: "postos", chave: (d) => d.sigla },
  { nome: "secoes", chave: (d) => d.nome },
  { nome: "legendas", chave: (d) => d.sigla },
];

function slug(value) {
  return String(value || "").trim().replace(/\s+/g, "_").replace(/[ºª]/g, "").replace(/\//g, "-");
}

let totalRenomear = 0;
let totalOk = 0;
const conflitos = [];

for (const col of COLECOES) {
  const snap = await db.collection(col.nome).get();
  const planos = [];

  for (const d of snap.docs) {
    const data = d.data();
    const divisaoId = String(data.divisaoId || "").trim();
    if (!divisaoId) {
      conflitos.push(`${col.nome}/${d.id}: sem divisaoId`);
      continue;
    }
    if (d.id.startsWith(`${divisaoId}${SEPARADOR}`)) {
      totalOk++;
      continue;
    }
    const novoId = `${divisaoId}${SEPARADOR}${slug(col.chave(data) || d.id)}`;
    if (novoId === d.id) {
      totalOk++;
      continue;
    }
    planos.push({ de: d.id, para: novoId, data });
  }

  console.log(`\n[${col.nome}] ${snap.size} doc(s) | a renomear: ${planos.length}`);
  for (const p of planos) {
    console.log(`   ${p.de}  ->  ${p.para}`);
    totalRenomear++;
  }

  if (APLICAR && planos.length) {
    for (const p of planos) {
      const destino = db.collection(col.nome).doc(p.para);
      if ((await destino.get()).exists) {
        conflitos.push(`${col.nome}/${p.para}: destino já existe, ${p.de} não foi movido`);
        continue;
      }
      await destino.set(p.data);
      await db.collection(col.nome).doc(p.de).delete();
    }
    console.log(`   aplicado: ${planos.length} renomeação(ões)`);
  }
}

console.log(`\nresumo: ${totalRenomear} a renomear | ${totalOk} já corretos`);
if (conflitos.length) {
  console.log("\nATENÇÃO:");
  for (const c of conflitos) console.log(`  - ${c}`);
}
if (!APLICAR) console.log("\n(dry-run — rode com --apply para executar)");
