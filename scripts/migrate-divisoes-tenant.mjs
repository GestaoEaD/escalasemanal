/**
 * Migração Admin SDK (opcional) — Divisão EaD + rewrite de IDs.
 * Preferencialmente a migração roda no boot do app (ensureDivisaoTenantMigration).
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "caminho\\para\\serviceAccount.json"
 *   node scripts/migrate-divisoes-tenant.mjs
 *
 * Ou:
 *   node scripts/migrate-divisoes-tenant.mjs --key "caminho\\para\\serviceAccount.json"
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DIVISAO_EAD_ID = "202002500";
const DIVISAO_EAD_NOME = "Divisão EaD";
const DIVISAO_EAD_DESCRICAO = "Divisão de Educação a Distância";
const GERENTE_RE = "124342-0";
const STATUS_FLAG = "divisaoTenantMigrated";

function resolveKeyPath() {
  const argIdx = process.argv.indexOf("--key");
  if (argIdx >= 0 && process.argv[argIdx + 1]) {
    return resolve(process.argv[argIdx + 1]);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  throw new Error(
    "Defina GOOGLE_APPLICATION_CREDENTIALS ou informe --key <caminho>."
  );
}

function buildEscalaDocId(divisaoId, secaoId, ano, semana) {
  return `${divisaoId}__${secaoId || ""}__${ano}__${String(semana).padStart(2, "0")}`;
}

function buildCfId(divisaoId, ano, mes, secao) {
  const secaoNorm = String(secao || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[ºª]/g, "");
  return `${divisaoId}_${ano}_${String(mes).padStart(2, "0")}_${secaoNorm}`;
}

function normalizeRe(re) {
  return String(re || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

async function stampCollection(db, name) {
  const snap = await db.collection(name).get();
  let n = 0;
  let batch = db.batch();
  let ops = 0;
  for (const d of snap.docs) {
    if (d.data().divisaoId === DIVISAO_EAD_ID) continue;
    batch.set(d.ref, { divisaoId: DIVISAO_EAD_ID }, { merge: true });
    ops += 1;
    n += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return n;
}

async function rewriteEscalas(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const ano = Number(data.ano);
    const semana = Number(data.semana);
    if (!Number.isFinite(ano) || !Number.isFinite(semana)) continue;
    const newId = buildEscalaDocId(DIVISAO_EAD_ID, data.secaoId || "", ano, semana);
    if (d.id === newId && data.divisaoId === DIVISAO_EAD_ID) continue;
    await db
      .collection(collectionName)
      .doc(newId)
      .set({ ...data, id: newId, divisaoId: DIVISAO_EAD_ID });
    if (d.id !== newId) await d.ref.delete();
    n += 1;
  }
  return n;
}

async function rewriteCf(db) {
  const snap = await db.collection("controle_frequencia").get();
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const ano = Number(data.ano);
    const mes = Number(data.mes);
    const secao = String(data.secao || "");
    if (!ano || !mes || !secao) continue;
    const newId = buildCfId(DIVISAO_EAD_ID, ano, mes, secao);
    if (d.id === newId && data.divisaoId === DIVISAO_EAD_ID) continue;
    await db
      .collection("controle_frequencia")
      .doc(newId)
      .set({ ...data, id: newId, divisaoId: DIVISAO_EAD_ID, ano, mes, secao });
    if (d.id !== newId) await d.ref.delete();
    n += 1;
  }
  return n;
}

async function main() {
  const keyPath = resolveKeyPath();
  if (!existsSync(keyPath)) {
    console.error("Service account não encontrado:", keyPath);
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(keyPath, "utf8"));
  if (!getApps().length) {
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  const db = getFirestore();

  const statusRef = db.collection("configuracoes").doc("status");
  const statusSnap = await statusRef.get();
  if (statusSnap.exists && statusSnap.data()?.[STATUS_FLAG] === true) {
    console.log("Já migrado (divisaoTenantMigrated=true). Nada a fazer.");
    return;
  }

  console.log("Criando Divisão EaD…");
  await db.collection("divisoes").doc(DIVISAO_EAD_ID).set(
    {
      codigo: DIVISAO_EAD_ID,
      nome: DIVISAO_EAD_NOME,
      descricao: DIVISAO_EAD_DESCRICAO,
      ativo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  for (const name of [
    "usuarios",
    "colaboradores",
    "secoes",
    "postos",
    "legendas",
    "logs",
    "presenca_online",
    "configuracoes",
    "auth_index",
    "counters",
  ]) {
    const c = await stampCollection(db, name);
    console.log(`stamp ${name}: ${c}`);
  }

  console.log("rewrite escalas_semanais:", await rewriteEscalas(db, "escalas_semanais"));
  console.log("rewrite escalas_alteracao:", await rewriteEscalas(db, "escalas_alteracao"));
  console.log("rewrite CF:", await rewriteCf(db));

  const users = await db.collection("usuarios").get();
  for (const d of users.docs) {
    const data = d.data();
    const isAlex =
      normalizeRe(data.re || d.id) === normalizeRe(GERENTE_RE);
    await d.ref.set(
      {
        ...data,
        re: String(data.re || d.id),
        divisaoId: DIVISAO_EAD_ID,
        ...(isAlex
          ? {
              perfil: "Gerente",
              nomeCompleto: data.nomeCompleto || "Alex Herlemann Ventura",
            }
          : {}),
      },
      { merge: true }
    );
  }

  await statusRef.set(
    {
      ...(statusSnap.exists ? statusSnap.data() : {}),
      [STATUS_FLAG]: true,
      divisaoTenantMigratedAt: new Date().toISOString(),
      divisaoId: DIVISAO_EAD_ID,
    },
    { merge: true }
  );

  console.log("Migração Divisão concluída.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
