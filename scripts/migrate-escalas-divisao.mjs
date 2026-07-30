/**
 * Consolida escalas por Seção em um documento por Divisão.
 *
 * Legado: `{divisaoId}__{secaoId}__{ano}__{semana}`
 * Canônico: `{divisaoId}__{ano}__{semana}`
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\service-account.json"
 *   node scripts/migrate-escalas-divisao.mjs
 *   node scripts/migrate-escalas-divisao.mjs --apply
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const COLLECTIONS = ["escalas_semanais", "escalas_alteracao"];

const STATUS_RANK = {
  aprovada: 4,
  aguardando_aprovacao: 3,
  revisao_solicitada: 2,
  rejeitada: 2,
  em_edicao: 1,
};

function initDb() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS não definida.");
  const sa = JSON.parse(readFileSync(keyPath, "utf8"));
  if (!getApps().length) {
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  return getFirestore();
}

function parseLegacyId(id) {
  const parts = String(id || "").split("__");
  if (parts.length !== 4) return null;
  const [divisaoId, secaoId, anoRaw, semanaRaw] = parts;
  const ano = Number(anoRaw);
  const semana = Number(semanaRaw);
  if (!divisaoId || !secaoId) return null;
  if (!Number.isFinite(ano) || !Number.isFinite(semana)) return null;
  return { divisaoId, secaoId, ano, semana };
}

function canonicalId(divisaoId, ano, semana) {
  return `${divisaoId}__${ano}__${String(semana).padStart(2, "0")}`;
}

function statusRank(status) {
  return STATUS_RANK[String(status || "em_edicao")] || 0;
}

function mergeDocs(docs) {
  const byRe = new Map();
  let bestStatus = "em_edicao";
  let bestVersao = 1;
  let bestAprovacao = null;
  let bestHistorico = [];
  let bestLastSaved = null;
  let periodo = "";
  let observacoes = "";

  for (const { id, data } of docs) {
    const st = data.status || "em_edicao";
    if (statusRank(st) > statusRank(bestStatus)) {
      bestStatus = st;
      bestAprovacao = data.aprovacao || null;
    }
    if ((data.versao || 1) > bestVersao) bestVersao = data.versao || 1;
    if (Array.isArray(data.historico) && data.historico.length > bestHistorico.length) {
      bestHistorico = data.historico;
    }
    if (data.lastSaved && (!bestLastSaved || String(data.lastSaved.timestamp) > String(bestLastSaved.timestamp))) {
      bestLastSaved = data.lastSaved;
    }
    if (data.periodo) periodo = data.periodo;
    if (data.observacoes) observacoes = data.observacoes;

    for (const row of data.rows || []) {
      const re = String(row.re || "").trim();
      if (!re) continue;
      const existing = byRe.get(re);
      if (!existing || statusRank(st) >= statusRank(existing.status)) {
        byRe.set(re, {
          status: st,
          row: {
            ...row,
            secaoId: row.secaoId || parseLegacyId(id)?.secaoId || "",
          },
        });
      }
    }
  }

  const rows = [...byRe.values()].map((x) => x.row);
  rows.sort((a, b) => {
    const sa = String(a.secao || "").localeCompare(String(b.secao || ""));
    if (sa !== 0) return sa;
    return String(a.nome || "").localeCompare(String(b.nome || ""));
  });

  return {
    rows,
    status: bestStatus,
    versao: bestVersao,
    aprovacao: bestAprovacao,
    historico: bestHistorico,
    lastSaved: bestLastSaved,
    periodo,
    observacoes,
  };
}

async function migrateCollection(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  const groups = new Map();
  const alreadyCanonical = [];
  const unknown = [];

  for (const docSnap of snap.docs) {
    const parsed = parseLegacyId(docSnap.id);
    if (!parsed) {
      const parts = docSnap.id.split("__");
      if (parts.length === 3) alreadyCanonical.push(docSnap.id);
      else unknown.push(docSnap.id);
      continue;
    }
    const key = canonicalId(parsed.divisaoId, parsed.ano, parsed.semana);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: docSnap.id, data: docSnap.data() || {}, parsed });
  }

  console.log(`\n=== ${collectionName} ===`);
  console.log(`Docs: ${snap.size} | grupos a consolidar: ${groups.size} | já canônicos: ${alreadyCanonical.length} | desconhecidos: ${unknown.length}`);

  for (const [targetId, docs] of groups) {
    const { divisaoId, ano, semana } = docs[0].parsed;
    const merged = mergeDocs(docs);
    const payload = {
      id: targetId,
      divisaoId,
      ano,
      semana,
      periodo: merged.periodo || "",
      rows: merged.rows,
      lastSaved: merged.lastSaved,
      observacoes: merged.observacoes || "",
      status: merged.status,
      versao: merged.versao,
      aprovacao: merged.aprovacao,
      historico: merged.historico,
    };
    // Garante ausência de secaoId no documento canônico.
    delete payload.secaoId;

    console.log(
      `- ${targetId} <= ${docs.map((d) => d.id).join(", ")} | rows=${merged.rows.length} | status=${merged.status}`
    );

    if (APPLY) {
      await db.collection(collectionName).doc(targetId).set(payload, { merge: false });
      for (const d of docs) {
        if (d.id !== targetId) {
          await db.collection(collectionName).doc(d.id).delete();
        }
      }
    }
  }
}

async function cancelLegacySolicitacoes(db) {
  const snap = await db.collection("solicitacoes_aprovacao").get();
  let updated = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (String(data.status || "") !== "AGUARDANDO") continue;
    const escalaId = String(data.escalaId || "");
    const parsed = parseLegacyId(escalaId);
    if (!parsed) continue;
    const nextId = canonicalId(parsed.divisaoId, parsed.ano, parsed.semana);
    console.log(`solicitacao ${docSnap.id}: ${escalaId} -> ${nextId} (cancelar pendência legada)`);
    if (APPLY) {
      await docSnap.ref.set(
        {
          status: "FINALIZADA",
          resultado: "CANCELADA",
          utilizado: true,
          motivo: "Migração de escala Seção→Divisão",
          escalaId: nextId,
          secaoId: "",
        },
        { merge: true }
      );
      updated += 1;
    }
  }
  console.log(`Solicitações legadas tratadas: ${updated}`);
}

async function main() {
  const db = initDb();
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  for (const name of COLLECTIONS) {
    await migrateCollection(db, name);
  }
  await cancelLegacySolicitacoes(db);
  if (!APPLY) {
    console.log("\nDry-run concluído. Reexecute com --apply para persistir.");
  }
}

main().catch((error) => {
  console.error("Migração falhou:", error);
  process.exit(1);
});
