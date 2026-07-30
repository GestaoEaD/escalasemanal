/**
 * Migração one-shot: introduz tenant Divisão EaD e reescreve IDs de escala/CF.
 */
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from "../firebase";
import {
  DIVISAO_EAD_DESCRICAO,
  DIVISAO_EAD_ID,
  DIVISAO_EAD_NOME,
  GERENTE_INICIAL_RE,
} from "../types";
import { buildEscalaDocId } from "./divisaoIds";
import { buildControleFrequenciaId, parseControleFrequenciaId } from "./frequenciaIds";
import { prepareFirestoreWrite } from "./firestoreSanitize";
import { reEquals } from "./reUtils";
import { upsertAuthIndex } from "./authIndex";

const STATUS_FLAG = "divisaoTenantMigrated";

const STAMP_COLLECTIONS = [
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
] as const;

async function stampCollection(name: string, divisaoId: string): Promise<number> {
  const snap = await getDocs(collection(db, name));
  let n = 0;
  let batch = writeBatch(db);
  let ops = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.divisaoId === divisaoId) continue;
    batch.set(
      d.ref,
      prepareFirestoreWrite(`${name}/${d.id}`, { ...data, divisaoId }),
      { merge: true }
    );
    ops += 1;
    n += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return n;
}

async function rewriteEscalaCollection(
  collectionName: "escalas_semanais" | "escalas_alteracao",
  divisaoId: string
): Promise<number> {
  const snap = await getDocs(collection(db, collectionName));
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const ano = Number(data.ano);
    const semana = Number(data.semana);
    if (!Number.isFinite(ano) || !Number.isFinite(semana)) continue;
    const newId = buildEscalaDocId(divisaoId, ano, semana);
    if (d.id === newId && data.divisaoId === divisaoId) continue;
    const next = {
      ...data,
      id: newId,
      divisaoId,
    };
    delete (next as Record<string, unknown>).secaoId;
    await setDoc(
      doc(db, collectionName, newId),
      prepareFirestoreWrite(`${collectionName}/${newId}`, next)
    );
    if (d.id !== newId) {
      await deleteDoc(d.ref);
    }
    n += 1;
  }
  return n;
}

async function rewriteFrequencia(divisaoId: string): Promise<number> {
  const snap = await getDocs(collection(db, "controle_frequencia"));
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const parsed = parseControleFrequenciaId(d.id);
    const ano = Number(data.ano) || parsed?.ano;
    const mes = Number(data.mes) || parsed?.mes;
    const secao = String(data.secao || parsed?.secaoId || parsed?.secaoKey || "");
    if (!ano || !mes || !secao) continue;
    const newId = buildControleFrequenciaId(ano, mes, secao, divisaoId);
    if (d.id === newId && data.divisaoId === divisaoId) continue;
    const next = { ...data, id: newId, divisaoId, ano, mes, secao };
    await setDoc(
      doc(db, "controle_frequencia", newId),
      prepareFirestoreWrite(`controle_frequencia/${newId}`, next)
    );
    if (d.id !== newId) await deleteDoc(d.ref);
    n += 1;
  }
  return n;
}

async function rewriteSolicitacoes(divisaoId: string): Promise<number> {
  const snap = await getDocs(collection(db, "solicitacoes_aprovacao"));
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    let escalaId = String(data.escalaId || "");
    const tipo = String(data.tipoDocumento || data.tipo || "semanal");
    // Reescreve escalaId legado YYYY_WW → tenant_YYYY_WW
    if (/^\d{4}_\d{1,2}$/.test(escalaId)) {
      const [ano, sem] = escalaId.split("_");
      escalaId = buildEscalaDocId(
        divisaoId,
        Number(ano),
        Number(sem)
      );
    } else if (/^\d{4}_\d{1,2}_.+/.test(escalaId) && !escalaId.startsWith(divisaoId)) {
      // CF legado
      const p = parseControleFrequenciaId(escalaId);
      if (p) {
        escalaId = buildControleFrequenciaId(p.ano, p.mes, p.secaoId || p.secaoKey, divisaoId);
      }
    }
    await setDoc(
      d.ref,
      prepareFirestoreWrite(`solicitacoes_aprovacao/${d.id}`, {
        ...data,
        divisaoId,
        escalaId,
        tipoDocumento: tipo,
      }),
      { merge: true }
    );
    n += 1;
  }
  return n;
}

/**
 * Garante Divisão EaD, carimba tenant, reescreve IDs e promove Gerente inicial.
 * Idempotente via configuracoes/status.divisaoTenantMigrated.
 */
export async function ensureDivisaoTenantMigration(): Promise<void> {
  const statusRef = doc(db, "configuracoes", "status");
  const statusSnap = await getDoc(statusRef);
  if (statusSnap.exists() && statusSnap.data()?.[STATUS_FLAG] === true) {
    return;
  }

  console.log("[divisao] Iniciando migração multi-tenant…");

  const divisaoRef = doc(db, "divisoes", DIVISAO_EAD_ID);
  await setDoc(
    divisaoRef,
    prepareFirestoreWrite(`divisoes/${DIVISAO_EAD_ID}`, {
      codigo: DIVISAO_EAD_ID,
      nome: DIVISAO_EAD_NOME,
      descricao: DIVISAO_EAD_DESCRICAO,
      ativo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    { merge: true }
  );

  for (const name of STAMP_COLLECTIONS) {
    try {
      const c = await stampCollection(name, DIVISAO_EAD_ID);
      if (c > 0) console.log(`[divisao] stamp ${name}: ${c}`);
    } catch (e) {
      console.warn(`[divisao] stamp ${name} falhou:`, e);
    }
  }

  console.log(
    "[divisao] rewrite escalas_semanais:",
    await rewriteEscalaCollection("escalas_semanais", DIVISAO_EAD_ID)
  );
  console.log(
    "[divisao] rewrite escalas_alteracao:",
    await rewriteEscalaCollection("escalas_alteracao", DIVISAO_EAD_ID)
  );
  console.log("[divisao] rewrite CF:", await rewriteFrequencia(DIVISAO_EAD_ID));
  console.log(
    "[divisao] rewrite solicitacoes:",
    await rewriteSolicitacoes(DIVISAO_EAD_ID)
  );

  // Promove Gerente inicial + garante divisaoId em todos usuários
  const usersSnap = await getDocs(collection(db, "usuarios"));
  for (const d of usersSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const isAlex = reEquals(String(data.re || d.id), GERENTE_INICIAL_RE);
    const next: Record<string, unknown> = {
      ...data,
      re: String(data.re || d.id),
      divisaoId: DIVISAO_EAD_ID,
      ...(isAlex
        ? {
            perfil: "Gerente",
            nomeCompleto:
              String(data.nomeCompleto || "").trim() ||
              "Alex Herlemann Ventura",
          }
        : {}),
    };
    await setDoc(
      d.ref,
      prepareFirestoreWrite(`usuarios/${d.id}`, next),
      { merge: true }
    );
    if (next.email) {
      await upsertAuthIndex(next as never).catch(() => undefined);
    }
  }

  await setDoc(
    statusRef,
    prepareFirestoreWrite("configuracoes/status", {
      ...(statusSnap.exists() ? statusSnap.data() : {}),
      [STATUS_FLAG]: true,
      divisaoTenantMigratedAt: new Date().toISOString(),
      divisaoId: DIVISAO_EAD_ID,
    }),
    { merge: true }
  );

  console.log("[divisao] Migração multi-tenant concluída.");
}
