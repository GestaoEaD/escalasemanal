/**
 * Semeia postos e legendas oficiais em Divisões que ainda não têm catálogo.
 * Uso: node scripts/seed-catalogo-divisoes.mjs
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const POSTOS = [
  { sigla: "SD PM", descricao: "SOLDADO", ordem: 1 },
  { sigla: "CB PM", descricao: "CABO", ordem: 2 },
  { sigla: "3º SGT PM", descricao: "3º SARGENTO", ordem: 3 },
  { sigla: "2º SGT PM", descricao: "2º SARGENTO", ordem: 4 },
  { sigla: "1º SGT PM", descricao: "1º SARGENTO", ordem: 5 },
  { sigla: "SUBTEN PM", descricao: "SUBTENENTE", ordem: 6 },
  { sigla: "2º TEN PM", descricao: "2º TENENTE", ordem: 7 },
  { sigla: "1º TEN PM", descricao: "1º TENENTE", ordem: 8 },
  { sigla: "CAP PM", descricao: "CAPITÃO", ordem: 9 },
  { sigla: "MAJ PM", descricao: "MAJOR", ordem: 10 },
  { sigla: "TEN CEL PM", descricao: "TENENTE-CORONEL", ordem: 11 },
  { sigla: "CEL PM", descricao: "CORONEL", ordem: 12 },
];

const LEGENDAS = [
  { ordem: 1, sigla: "EN", descricao: "EXPEDIENTE NORMAL", cor: "verde", ativo: true },
  { ordem: 2, sigla: "A", nome: "Afastamento", descricao: "AFASTAMENTO", cor: "cinza", ativo: true,
    representacoes: { escalaSemanal: "A", escalaConsolidada: "A" } },
  { ordem: 3, sigla: "F", descricao: "FOLGA", cor: "amarelo", ativo: true },
  { ordem: 4, sigla: "FC", descricao: "FOLGA COMPENSAÇÃO", cor: "laranja", ativo: true },
  { ordem: 5, sigla: "M", descricao: "FOLGA MANHÃ", cor: "azul-claro", ativo: true },
  { ordem: 6, sigla: "T", descricao: "FOLGA TARDE", cor: "azul-medio", ativo: true },
  { ordem: 7, sigla: "MC", descricao: "MANHÃ COMPENSAÇÃO", cor: "roxo-claro", ativo: true },
  { ordem: 8, sigla: "TC", descricao: "TARDE COMPENSAÇÃO", cor: "roxo-escuro", ativo: true },
  { ordem: 9, sigla: "FÉRIAS", descricao: "FÉRIAS", cor: "verde-escuro", ativo: true },
  { ordem: 10, sigla: "LP", descricao: "LICENÇA-PRÊMIO", cor: "cinza", ativo: true },
  { ordem: 11, sigla: "DS", descricao: "DISPENSA", cor: "vermelho-claro", ativo: true },
  { ordem: 12, sigla: "LT", descricao: "LICENÇA PARA TRATAMENTO", cor: "vermelho", ativo: true },
  { ordem: 13, sigla: "CONVAL", descricao: "CONVALESCENÇA", cor: "bordo", ativo: true },
  { ordem: 14, sigla: "EX", descricao: "ESCALA EXTRA", cor: "azul-escuro", ativo: true },
  { ordem: 15, sigla: "OBS", descricao: "OBSERVAÇÃO", cor: "cinza-escuro", ativo: true },
];

function slug(v) {
  return String(v || "").trim().replace(/\s+/g, "_").replace(/[ºª]/g, "").replace(/\//g, "-");
}

const divisoes = await db.collection("divisoes").get();
for (const d of divisoes.docs) {
  const codigo = d.id;
  const postos = await db.collection("postos").where("divisaoId", "==", codigo).get();
  const legendas = await db.collection("legendas").where("divisaoId", "==", codigo).get();
  console.log(`Divisão ${codigo}: ${postos.size} posto(s), ${legendas.size} legenda(s)`);

  const batch = db.batch();
  let n = 0;
  if (postos.empty) {
    for (const p of POSTOS) {
      batch.set(db.collection("postos").doc(`${codigo}__${slug(p.sigla)}`), {
        ...p, divisaoId: codigo, createdAt: Timestamp.now(),
      });
      n++;
    }
  }
  if (legendas.empty) {
    for (const l of LEGENDAS) {
      batch.set(db.collection("legendas").doc(`${codigo}__${slug(l.sigla)}`), {
        ...l, divisaoId: codigo, createdAt: Timestamp.now(),
      });
      n++;
    }
  }
  if (n) {
    await batch.commit();
    console.log(`  -> semeados ${n} documento(s)`);
  } else {
    console.log("  -> ok");
  }
}
