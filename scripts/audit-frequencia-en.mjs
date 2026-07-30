/**
 * Diagnóstico: EN → 1 no Controle de Frequência (ago/2026, Gest Educ).
 * Uso: node scripts/audit-frequencia-en.mjs
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const DIV = "202002500";
const ANO = 2026;
const MES = 8;

console.log("=== LEGENDA EN ===");
const legs = await db.collection("legendas").get();
for (const d of legs.docs) {
  const data = d.data();
  const sigla = String(data.sigla || "");
  if (sigla.toUpperCase() === "EN" || sigla.toUpperCase() === "A") {
    console.log(JSON.stringify({ id: d.id, sigla, representacoes: data.representacoes, ativo: data.ativo }, null, 2));
  }
}

console.log("\n=== ESCALAS SEMANAIS (ago/2026 overlap) ===");
// semanas que tocam ago/2026: tipicamente ~31..35
const semSnap = await db.collection("escalas_semanais").get();
const relevant = [];
for (const d of semSnap.docs) {
  const data = d.data();
  const id = d.id;
  if (!id.includes(DIV) && data.divisaoId !== DIV) continue;
  // sample rows with EN
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const withEn = rows.filter((r) =>
    ["seg", "ter", "qua", "qui", "sex"].some((f) => String(r[f] || "").toUpperCase() === "EN")
  );
  if (withEn.length || id.includes("2026")) {
    relevant.push({
      id,
      divisaoId: data.divisaoId,
      weekStart: data.weekStart || data.startDate || data.dataInicio,
      weekEnd: data.weekEnd || data.endDate || data.dataFim,
      status: data.status,
      rowsTotal: rows.length,
      rowsComEN: withEn.length,
      sample: withEn.slice(0, 2).map((r) => ({
        re: r.re,
        nome: r.nome,
        seg: r.seg,
        ter: r.ter,
        sab: r.sab,
        dom: r.dom,
        secao: r.secao,
      })),
    });
  }
}
relevant.sort((a, b) => a.id.localeCompare(b.id));
for (const r of relevant) {
  if (r.rowsComEN > 0 || String(r.id).includes("_2026_3")) {
    console.log(JSON.stringify(r, null, 2));
  }
}

console.log("\n=== CONTROLE FREQUENCIA Gest Educ ago/2026 ===");
const cfSnap = await db.collection("controle_frequencia").get();
for (const d of cfSnap.docs) {
  if (!d.id.includes("2026_08") && !d.id.includes("2026_8")) continue;
  const data = d.data();
  console.log(`id=${d.id} secao=${data.secao} secaoId=${data.secaoId} status=${data.status}`);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  for (const row of rows.slice(0, 5)) {
    const dias = row.dias || {};
    const sample = {};
    for (let i = 1; i <= 10; i++) {
      const k = String(i).padStart(2, "0");
      const c = dias[k] || dias[String(i)];
      sample[k] = c ? `${c.valor || "(vazio)"}[${c.origem || "?"}]` : "(ausente)";
    }
    console.log(`  ${row.postoGrad} ${row.re} ${row.nome}`, sample);
  }
  console.log("  syncMeta:", data.syncMeta || null);
}
