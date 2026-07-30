/**
 * Repository Firestore — Seções.
 */
import { db, collection, doc, getDocs, query, where, setDoc, deleteDoc } from "../firebase";
import { Secao } from "../types";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

export async function listSecoesByDivisao(divisaoId: string): Promise<Secao[]> {
  const snap = await getDocs(
    query(collection(db, "secoes"), where("divisaoId", "==", divisaoId))
  );
  return snap.docs.map((d) => {
    const data = d.data() as Secao;
    return { ...data, id: String(data.id || d.id) };
  });
}

export async function saveSecao(secao: Secao): Promise<void> {
  const id = String(secao.id || "").trim();
  if (!id) throw new Error("secao.id é obrigatório.");
  const payload = { ...secao, id };
  delete (payload as { secaoId?: string }).secaoId;
  await setDoc(
    doc(db, "secoes", id),
    prepareFirestoreWrite(`secoes/${id}`, payload as unknown as Record<string, unknown>)
  );
}

export async function deleteSecao(id: string): Promise<void> {
  await deleteDoc(doc(db, "secoes", id));
}
