/**
 * Repository Firestore — Escalas (Semanal / Alteração) por Divisão.
 */
import { db, doc, getDoc, getDocs, setDoc, collection, query, where } from "../firebase";
import { EscalaDocument } from "../types";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

export type EscalaCollection = "escalas_semanais" | "escalas_alteracao";

export async function getEscalaDoc(
  collectionName: EscalaCollection,
  id: string
): Promise<EscalaDocument | null> {
  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) return null;
  return snap.data() as EscalaDocument;
}

export async function listEscalasByDivisaoAno(
  collectionName: EscalaCollection,
  divisaoId: string,
  ano: number
): Promise<EscalaDocument[]> {
  const snap = await getDocs(
    query(
      collection(db, collectionName),
      where("divisaoId", "==", divisaoId),
      where("ano", "==", ano)
    )
  );
  return snap.docs.map((d) => d.data() as EscalaDocument);
}

export async function saveEscalaDoc(
  collectionName: EscalaCollection,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  const payload: Record<string, unknown> = { ...data, id };
  delete payload.secaoId;
  await setDoc(
    doc(db, collectionName, id),
    prepareFirestoreWrite(`${collectionName}/${id}`, payload)
  );
}

export async function saveEscalaMerge(
  collectionName: EscalaCollection,
  id: string,
  partial: Record<string, unknown>
): Promise<void> {
  const payload: Record<string, unknown> = { ...partial, id };
  delete payload.secaoId;
  await setDoc(
    doc(db, collectionName, id),
    prepareFirestoreWrite(`${collectionName}/${id}`, payload),
    { merge: true }
  );
}
