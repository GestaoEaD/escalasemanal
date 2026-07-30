/**
 * Repository Firestore — Colaboradores.
 * Somente I/O; validações e permissões ficam na camada de services/validators.
 */
import { db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where } from "../firebase";
import { Colaborador } from "../types";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";
import { colaboradorDocId } from "../utils/tenantDocIds";

const COLLECTION = "colaboradores";

export async function listColaboradoresByDivisao(divisaoId: string): Promise<Colaborador[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where("divisaoId", "==", divisaoId))
  );
  return snap.docs.map((d) => d.data() as Colaborador);
}

export async function listColaboradoresByDivisaoAndSecao(
  divisaoId: string,
  secaoId: string
): Promise<Colaborador[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where("divisaoId", "==", divisaoId),
      where("secaoId", "==", secaoId)
    )
  );
  return snap.docs.map((d) => d.data() as Colaborador);
}

export async function getColaboradorById(divisaoId: string, re: string): Promise<Colaborador | null> {
  const id = colaboradorDocId(divisaoId, re);
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return snap.data() as Colaborador;
}

export async function saveColaborador(
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, docId),
    prepareFirestoreWrite(`${COLLECTION}/${docId}`, data)
  );
}

export async function deleteColaborador(docId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, docId));
}

/**
 * Move um colaborador entre documentos (troca de Divisão ou de RE): o ID do
 * documento é `{divisaoId}__{re}`, portanto mudar qualquer um dos dois exige
 * apagar o documento antigo e gravar um novo.
 */
export async function moveColaborador(
  oldDocId: string,
  newDocId: string,
  data: Record<string, unknown>
): Promise<void> {
  await saveColaborador(newDocId, data);
  if (oldDocId !== newDocId) {
    await deleteColaborador(oldDocId);
  }
}
