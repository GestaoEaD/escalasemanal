/**
 * Repository Firestore — Controle de Frequência.
 * Somente I/O; validações, sincronização e fluxo de aprovação ficam nos services.
 */
import { db, collection, doc, getDoc, getDocs, setDoc, query, where } from "../firebase";
import { CONTROLE_FREQUENCIA_COLLECTION, ControleFrequenciaDocument } from "../types";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

export async function getById(id: string): Promise<ControleFrequenciaDocument | null> {
  const snap = await getDoc(doc(db, CONTROLE_FREQUENCIA_COLLECTION, id));
  if (!snap.exists()) return null;
  return snap.data() as ControleFrequenciaDocument;
}

export async function save(data: ControleFrequenciaDocument): Promise<void> {
  await setDoc(
    doc(db, CONTROLE_FREQUENCIA_COLLECTION, data.id),
    prepareFirestoreWrite(
      `${CONTROLE_FREQUENCIA_COLLECTION}/${data.id}`,
      data as unknown as Record<string, unknown>
    )
  );
}

/** Lista documentos de Controle de Frequência de uma Divisão em um dado ano. */
export async function listByDivisaoAnoMes(
  divisaoId: string,
  ano: number
): Promise<ControleFrequenciaDocument[]> {
  const snap = await getDocs(
    query(
      collection(db, CONTROLE_FREQUENCIA_COLLECTION),
      where("divisaoId", "==", divisaoId),
      where("ano", "==", ano)
    )
  );
  return snap.docs.map((d) => d.data() as ControleFrequenciaDocument);
}
