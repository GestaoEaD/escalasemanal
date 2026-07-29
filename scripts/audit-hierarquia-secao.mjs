/**
 * Audit for section hierarchy migration.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function readServiceAccount() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function initDb() {
  const sa = readServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  return getFirestore();
}

function normalizeTexto(value) {
  return String(value || "").trim();
}

function looksLikeAutoId(value) {
  return /^[A-Za-z0-9]{20}$/.test(String(value || "").trim());
}

function splitNewScaleId(id) {
  const raw = normalizeTexto(id);
  const parts = raw.split("__");
  if (parts.length !== 4) return null;
  const ano = Number(parts[2]);
  const semana = Number(parts[3]);
  if (!Number.isFinite(ano) || !Number.isFinite(semana)) return null;
  if (ano < 2000 || ano > 2100 || semana < 1 || semana > 53) return null;
  return {
    divisaoId: normalizeTexto(parts[0]),
    secaoId: normalizeTexto(parts[1]),
    ano,
    semana,
  };
}

function splitLegacyScaleId(id) {
  const raw = normalizeTexto(id);
  if (!raw) return null;
  const shortLegacy = raw.match(/^(\d{4})_(\d{1,2})$/);
  if (shortLegacy) {
    return { ano: Number(shortLegacy[1]), semana: Number(shortLegacy[2]) };
  }
  if (raw.includes("__")) return null;
  const parts = raw.split("_");
  if (parts.length < 3) return null;
  const semana = Number(parts[parts.length - 1]);
  const ano = Number(parts[parts.length - 2]);
  if (!Number.isFinite(ano) || !Number.isFinite(semana)) return null;
  if (ano < 2000 || ano > 2100 || semana < 1 || semana > 53) return null;
  const divisaoId = parts.slice(0, -2).join("_").trim();
  if (!divisaoId) return null;
  return { divisaoId, ano, semana };
}

function splitControleFrequenciaId(id) {
  const raw = normalizeTexto(id);
  const parts = raw.split("_");
  if (parts.length < 4) return null;
  const divisaoId = normalizeTexto(parts[0]);
  const ano = Number(parts[1]);
  const mes = Number(parts[2]);
  const secaoId = normalizeTexto(parts.slice(3).join("_"));
  if (!divisaoId || !Number.isFinite(ano) || !Number.isFinite(mes) || !secaoId) return null;
  return { divisaoId, ano, mes, secaoId };
}

async function main() {
  const db = initDb();

  const issues = {
    secoes: [],
    colaboradores: [],
    usuarios: [],
    legacyScales: [],
    pendingSolicitacoes: [],
  };

  const secoesSnap = await db.collection("secoes").get();
  for (const doc of secaoSnapIterator(secoesSnap.docs)) {
    const data = doc.data() || {};
    if (normalizeTexto(data.id) !== doc.id) {
      issues.secoes.push(`secoes/${doc.id}: field id=${normalizeTexto(data.id) || "(empty)"}`);
    }
    if (!looksLikeAutoId(doc.id)) {
      issues.secoes.push(`secoes/${doc.id}: doc id is not Firestore auto-id`);
    }
  }

  const colaboradoresSnap = await db.collection("colaboradores").get();
  for (const doc of secaoSnapIterator(colaboradoresSnap.docs)) {
    const data = doc.data() || {};
    const divisaoId = normalizeTexto(data.divisaoId);
    const re = normalizeTexto(data.re || doc.id);
    const expectedId = `${divisaoId}__${re}`;
    if (!normalizeTexto(data.secaoId)) {
      issues.colaboradores.push(`colaboradores/${doc.id}: missing secaoId`);
    }
    if (doc.id !== expectedId) {
      issues.colaboradores.push(`colaboradores/${doc.id}: expected id ${expectedId}`);
    }
  }

  const usuariosSnap = await db.collection("usuarios").get();
  for (const doc of secaoSnapIterator(usuariosSnap.docs)) {
    const data = doc.data() || {};
    if (!normalizeTexto(data.secaoId)) {
      issues.usuarios.push(`usuarios/${doc.id}: missing secaoId`);
    }
  }

  const escalaCollections = ["escalas_semanais", "escalas_alteracao"];
  for (const collectionName of escalaCollections) {
    const snap = await db.collection(collectionName).get();
    for (const doc of secaoSnapIterator(snap.docs)) {
      const data = doc.data() || {};
      const current = splitNewScaleId(doc.id);
      const legacy = splitLegacyScaleId(doc.id);
      if (current && normalizeTexto(data.secaoId) === current.secaoId) {
        continue;
      }
      if (legacy) {
        issues.legacyScales.push(`${collectionName}/${doc.id}: legacy scale id still present`);
      } else if (doc.id.includes("__")) {
        issues.legacyScales.push(`${collectionName}/${doc.id}: unexpected id format`);
      }
    }
  }

  const cfSnap = await db.collection("controle_frequencia").get();
  for (const doc of secaoSnapIterator(cfSnap.docs)) {
    const data = doc.data() || {};
    const parsed = splitControleFrequenciaId(doc.id);
    if (!parsed) continue;
    if (doc.id.includes("__") || normalizeTexto(data.secaoId) === parsed.secaoId) {
      continue;
    }
  }

  const solicitacoesSnap = await db.collection("solicitacoes_aprovacao").get();
  for (const doc of secaoSnapIterator(solicitacoesSnap.docs)) {
    const data = doc.data() || {};
    const status = normalizeTexto(data.status);
    const escalaId = normalizeTexto(data.escalaId);
    if (status !== "AGUARDANDO") continue;
    if (splitLegacyScaleId(escalaId)) {
      issues.pendingSolicitacoes.push(`solicitacoes_aprovacao/${doc.id}: pending legacy escalaId ${escalaId}`);
    }
  }

  console.log("=== Audit: section hierarchy ===");
  console.log(`secoes checked: ${secoesSnap.size}`);
  console.log(`colaboradores checked: ${colaboradoresSnap.size}`);
  console.log(`usuarios checked: ${usuariosSnap.size}`);
  console.log(`escalas_semanais checked: ${await db.collection("escalas_semanais").get().then((s) => s.size)}`);
  console.log(`escalas_alteracao checked: ${await db.collection("escalas_alteracao").get().then((s) => s.size)}`);
  console.log(`solicitacoes_aprovacao checked: ${solicitacoesSnap.size}`);

  printIssueList("Secoes", issues.secoes);
  printIssueList("Colaboradores", issues.colaboradores);
  printIssueList("Usuarios", issues.usuarios);
  printIssueList("Legacy scales", issues.legacyScales);
  printIssueList("Pending solicitacoes", issues.pendingSolicitacoes);

  const exitCode =
    issues.secoes.length ||
    issues.colaboradores.length ||
    issues.usuarios.length ||
    issues.legacyScales.length ||
    issues.pendingSolicitacoes.length
      ? 1
      : 0;
  process.exit(exitCode);
}

function secaoSnapIterator(docs) {
  return docs || [];
}

function printIssueList(label, list) {
  console.log(`\n${label}: ${list.length}`);
  if (!list.length) {
    console.log("  none");
    return;
  }
  for (const item of list.slice(0, 80)) {
    console.log(`  - ${item}`);
  }
  if (list.length > 80) {
    console.log(`  ... and ${list.length - 80} more`);
  }
}

main().catch((error) => {
  console.error("Audit failed:", error);
  process.exit(1);
});

