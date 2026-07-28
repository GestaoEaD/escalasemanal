/**
 * Propaga rename de seção em escalas e controles de frequência.
 */
import { db, collection, getDocs, doc, setDoc, deleteDoc } from "../firebase";
import { ScheduleRow } from "../types";
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
  to: string
): Promise<number> {
  const snap = await getDocs(collection(db, collectionName));
  let updated = 0;
  for (const d of snap.docs) {
    const data = d.data() as { rows?: ScheduleRow[]; secao?: string };
    const mapped = mapRowsSecao(data.rows, from, to);
    if (!mapped.changed) continue;
    await setDoc(
      doc(db, collectionName, d.id),
      prepareFirestoreWrite(`${collectionName}/${d.id}`, {
        ...data,
        rows: mapped.rows,
      } as unknown as Record<string, unknown>),
      { merge: true }
    );
    updated += 1;
  }
  return updated;
}

async function cascadeControleFrequencia(from: string, to: string): Promise<number> {
  const snap = await getDocs(collection(db, "controle_frequencia"));
  let updated = 0;
  const fromKey = normalizeSecaoId(from);
  const toNome = normalizeSecaoNome(to);

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const secao = String(data.secao || "");
    const idMatches =
      d.id.includes(`_${fromKey}`) || secoesIguais(secao, from);
    if (!idMatches && !secoesIguais(secao, from)) continue;

    const ano = Number(data.ano);
    const mes = Number(data.mes);
    if (!Number.isFinite(ano) || !Number.isFinite(mes)) continue;

    const newId = buildControleFrequenciaId(ano, mes, toNome);
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

/** Aplica rename old→new em escalas e CF. Retorna contagem de docs tocados. */
export async function cascadeSecaoRename(from: string, to: string): Promise<{
  semanais: number;
  alteracao: number;
  frequencia: number;
}> {
  const fromN = normalizeSecaoNome(from);
  const toN = normalizeSecaoNome(to);
  if (!fromN || !toN || secoesIguais(fromN, toN)) {
    return { semanais: 0, alteracao: 0, frequencia: 0 };
  }
  const semanais = await cascadeCollectionRows("escalas_semanais", fromN, toN);
  const alteracao = await cascadeCollectionRows("escalas_alteracao", fromN, toN);
  const frequencia = await cascadeControleFrequencia(fromN, toN);
  return { semanais, alteracao, frequencia };
}
