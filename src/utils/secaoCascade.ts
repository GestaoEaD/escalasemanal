/**
 * Propaga rename de seção em escalas e controles de frequência (escopo Divisão).
 */
import { db, collection, getDocs, doc, setDoc, deleteDoc, query, where } from "../firebase";
import { DIVISAO_EAD_ID, ScheduleRow } from "../types";
import { prepareFirestoreWrite } from "./firestoreSanitize";
import { buildControleFrequenciaId, normalizeSecaoId } from "./frequenciaIds";
import { normalizeSecaoNome, secoesIguais } from "./secaoMatch";

function mapRowsSecao(rows: ScheduleRow[] | undefined, from: string, to: string): {
  rows: ScheduleRow[];
  changed: boolean;
} {
  let changed = false;
  const next = (rows || []).map((r) => {
    if (!secoesIguais(r.secao, from)) return r;
    changed = true;
    return { ...r, secao: normalizeSecaoNome(to) };
  });
  return { rows: next, changed };
}

async function cascadeCollectionRows(
  collectionName: "escalas_semanais" | "escalas_alteracao",
  from: string,
  to: string,
  divisaoId: string,
  secaoId?: string
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, collectionName), where("divisaoId", "==", divisaoId))
  );
  let updated = 0;
  for (const d of snap.docs) {
    const data = d.data() as { rows?: ScheduleRow[]; secao?: string; secaoId?: string; divisaoId?: string };
    const mapped = mapRowsSecao(data.rows, from, to);
    const matchesSecaoId = secaoId ? String(data.secaoId || "").trim() === String(secaoId).trim() : false;
    if (!mapped.changed && !matchesSecaoId) continue;
    await setDoc(
      doc(db, collectionName, d.id),
      prepareFirestoreWrite(`${collectionName}/${d.id}`, {
        ...data,
        divisaoId: data.divisaoId || divisaoId,
        ...(secaoId ? { secaoId } : {}),
        rows: mapped.rows,
      } as unknown as Record<string, unknown>),
      { merge: true }
    );
    updated += 1;
  }
  return updated;
}

async function cascadeControleFrequencia(
  from: string,
  to: string,
  divisaoId: string,
  secaoId?: string
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "controle_frequencia"), where("divisaoId", "==", divisaoId))
  );
  let updated = 0;
  const fromKey = normalizeSecaoId(from);
  const toNome = normalizeSecaoNome(to);

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const secao = String(data.secao || "");
    const idMatches =
      d.id.includes(`_${fromKey}`) || secoesIguais(secao, from) || (secaoId ? String(data.secaoId || "").trim() === String(secaoId).trim() : false);
    if (!idMatches && !secoesIguais(secao, from)) continue;

    const ano = Number(data.ano);
    const mes = Number(data.mes);
    if (!Number.isFinite(ano) || !Number.isFinite(mes)) continue;

    const newId = buildControleFrequenciaId(ano, mes, toNome, divisaoId);
    const rows = Array.isArray(data.rows)
      ? (data.rows as ScheduleRow[]).map((r) =>
          secoesIguais(String((r as { secao?: string }).secao || ""), from)
            ? { ...r, secao: toNome }
            : r
        )
      : data.rows;

    const next = {
      ...data,
      id: newId,
      secao: toNome,
      divisaoId,
      rows,
    };

    if (newId !== d.id) {
      await setDoc(
        doc(db, "controle_frequencia", newId),
        prepareFirestoreWrite(`controle_frequencia/${newId}`, next)
      );
      await deleteDoc(doc(db, "controle_frequencia", d.id));
    } else {
      await setDoc(
        doc(db, "controle_frequencia", d.id),
        prepareFirestoreWrite(`controle_frequencia/${d.id}`, next),
        { merge: true }
      );
    }
    updated += 1;
  }
  return updated;
}

/** Aplica rename old→new em escalas e CF da Divisão. */
export async function cascadeSecaoRename(
  from: string,
  to: string,
  divisaoId: string = DIVISAO_EAD_ID,
  secaoId?: string
): Promise<{
  semanais: number;
  alteracao: number;
  frequencia: number;
}> {
  const fromN = normalizeSecaoNome(from);
  const toN = normalizeSecaoNome(to);
  if (!fromN || !toN || secoesIguais(fromN, toN)) {
    return { semanais: 0, alteracao: 0, frequencia: 0 };
  }
  const d = String(divisaoId || DIVISAO_EAD_ID).trim() || DIVISAO_EAD_ID;
  const semanais = await cascadeCollectionRows("escalas_semanais", fromN, toN, d, secaoId);
  const alteracao = await cascadeCollectionRows("escalas_alteracao", fromN, toN, d, secaoId);
  const frequencia = await cascadeControleFrequencia(fromN, toN, d, secaoId);
  return { semanais, alteracao, frequencia };
}
