/**
 * Consolida o catálogo de legendas em documentos globais `legendas/{siglaSlug}`.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "caminho\\para\\serviceAccount.json"
 *   node scripts/migrate-legendas-globais.mjs
 *   node scripts/migrate-legendas-globais.mjs --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DIVISAO_EAD_ID = "202002500";
const APPLY = process.argv.includes("--apply");
const SEP = "__";

function readServiceAccount() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  }
  return JSON.parse(readFileSync(keyPath, "utf8"));
}

function initDb() {
  const sa = readServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  return getFirestore();
}

function legendaDocId(sigla) {
  return String(sigla || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[ºª]/g, "");
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function isTimestampLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.toDate === "function" &&
      typeof value.toMillis === "function"
  );
}

function normalizeValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (isTimestampLike(value)) return value;
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const next = normalizeValue(item);
      if (next !== undefined) out.push(next);
    }
    return out;
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const next = normalizeValue(item);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

function cleanLegendaPayload(data, fallbackSigla) {
  const payload = normalizeValue(data) || {};
  const sigla = String(payload.sigla || payload.codigo || fallbackSigla || "").trim();
  const cleaned = {
    ...payload,
    sigla,
  };
  delete cleaned.divisaoId;
  return cleaned;
}

function splitTenantDocId(id) {
  const raw = String(id || "").trim();
  const idx = raw.indexOf(SEP);
  if (idx <= 0) return null;
  const divisaoId = raw.slice(0, idx).trim();
  const suffix = raw.slice(idx + SEP.length).trim();
  if (!divisaoId || !suffix) return null;
  return { divisaoId, suffix };
}

function scoreLegendDocument(data) {
  const walk = (value, depth = 0) => {
    if (value === undefined || value === null) return 0;
    if (isTimestampLike(value) || value instanceof Date) return 1;
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + walk(item, depth + 1), 0);
    }
    if (isPlainObject(value)) {
      let total = 0;
      for (const [key, item] of Object.entries(value)) {
        if (key === "divisaoId" || key === "createdAt" || key === "updatedAt") continue;
        total += 1 + walk(item, depth + 1);
      }
      return total;
    }
    return 1;
  };

  const base = walk(data);
  const representacoes = isPlainObject(data?.representacoes)
    ? walk(data.representacoes)
    : 0;
  const regras = isPlainObject(data?.regras) ? walk(data.regras) : 0;
  return base + representacoes + regras;
}

function pickWinner(entries) {
  const eadEntries = entries.filter((entry) => entry.divisaoId === DIVISAO_EAD_ID);
  const pool = eadEntries.length > 0 ? eadEntries : entries;
  return pool
    .slice()
    .sort((a, b) => {
      if (a.isTargetDoc !== b.isTargetDoc) return a.isTargetDoc ? -1 : 1;
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) return scoreDelta;
      return String(a.doc.id).localeCompare(String(b.doc.id));
    })[0];
}

async function main() {
  const db = initDb();
  const snap = await db.collection("legendas").get();
  const groups = new Map();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const tenant = splitTenantDocId(doc.id);
    const fallbackSigla = tenant?.suffix || doc.id;
    const sigla = String(data.sigla || data.codigo || fallbackSigla || "").trim();
    const targetId = legendaDocId(sigla || fallbackSigla);
    if (!targetId) continue;

    const entry = {
      doc,
      data,
      divisaoId: String(data.divisaoId || tenant?.divisaoId || "").trim(),
      targetId,
      isTenantDoc: Boolean(tenant),
      isTargetDoc: doc.id === targetId,
      score: scoreLegendDocument(data),
      sigla,
    };
    if (!groups.has(targetId)) groups.set(targetId, []);
    groups.get(targetId).push(entry);
  }

  const report = {
    totalDocs: snap.size,
    groups: groups.size,
    targetsToWrite: 0,
    tenantDocsToDelete: 0,
    targetDocsAlreadyGlobal: 0,
    preferredEad: 0,
    preferredRicher: 0,
    conflictingTargets: [],
    actions: [],
  };

  for (const [targetId, entries] of groups.entries()) {
    const winner = pickWinner(entries);
    const winnerIsEad = winner.divisaoId === DIVISAO_EAD_ID;
    if (winnerIsEad) report.preferredEad += 1;
    else report.preferredRicher += 1;

    const cleaned = cleanLegendaPayload(winner.data, winner.sigla || targetId);
    // Sempre grava em legendas/{sigla} e remove qualquer doc tenant (`div__sigla`),
    // inclusive o vencedor quando ele ainda estiver no ID particionado.
    const deletes = entries.filter(
      (entry) => entry.isTenantDoc || entry.doc.id !== targetId
    );
    const targetExists = entries.some((entry) => entry.doc.id === targetId);

    report.targetsToWrite += 1;
    report.tenantDocsToDelete += deletes.length;
    if (targetExists) report.targetDocsAlreadyGlobal += 1;
    if (entries.length > 1 || deletes.length > 0) {
      report.conflictingTargets.push({
        targetId,
        winner: winner.doc.id,
        docs: entries.map((entry) => `${entry.doc.id}${entry.divisaoId ? ` (${entry.divisaoId})` : ""}`),
      });
    }

    report.actions.push({
      targetId,
      winner: winner.doc.id,
      winnerScore: winner.score,
      winnerDivisaoId: winner.divisaoId || "global/unknown",
      write: cleaned,
      delete: deletes.map((entry) => entry.doc.id),
    });

    if (APPLY) {
      const batch = db.batch();
      batch.set(db.collection("legendas").doc(targetId), cleaned);
      for (const entry of deletes) {
        batch.delete(entry.doc.ref);
      }
      await batch.commit();
    }
  }

  console.log("=== Migração de legendas globais ===");
  console.log(`Modo: ${APPLY ? "apply" : "dry-run"}`);
  console.log(`Documentos lidos: ${report.totalDocs}`);
  console.log(`Grupos alvo: ${report.groups}`);
  console.log(`Docs globais a escrever: ${report.targetsToWrite}`);
  console.log(`Docs de tenant a remover: ${report.tenantDocsToDelete}`);
  console.log(`Preferidos por DIVISAO_EAD_ID: ${report.preferredEad}`);
  console.log(`Preferidos por riqueza: ${report.preferredRicher}`);
  console.log(`Alvos já globais: ${report.targetDocsAlreadyGlobal}`);

  if (report.conflictingTargets.length) {
    console.log("\nConflitos/resoluções:");
    for (const item of report.conflictingTargets.slice(0, 80)) {
      console.log(`- ${item.targetId}: winner=${item.winner}`);
      for (const docId of item.docs) console.log(`  • ${docId}`);
    }
    if (report.conflictingTargets.length > 80) {
      console.log(`... e mais ${report.conflictingTargets.length - 80} conflito(s)`);
    }
  }

  if (!APPLY) {
    console.log("\nDry-run concluído. Reexecute com --apply para persistir.");
  } else {
    console.log("\nAplicação concluída.");
  }
}

main().catch((error) => {
  console.error("Migração falhou:", error);
  process.exit(1);
});
