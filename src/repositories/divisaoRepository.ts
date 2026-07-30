/**
 * Repository Firestore — Divisões (tenants).
 * Somente I/O; validações e permissões ficam na camada de services/validators.
 */
import { db, collection, doc, getDoc, getDocs, setDoc, deleteDoc } from "../firebase";
import { Divisao } from "../types";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";
import { divisaoDocId } from "../utils/divisaoIds";

const COLLECTION = "divisoes";

export async function listAll(): Promise<Divisao[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => d.data() as Divisao);
}

export async function getById(codigo: string): Promise<Divisao | null> {
  const snap = await getDoc(doc(db, COLLECTION, divisaoDocId(codigo)));
  if (!snap.exists()) return null;
  return snap.data() as Divisao;
}

export async function save(divisao: Divisao): Promise<void> {
  const id = divisaoDocId(divisao.codigo);
  await setDoc(
    doc(db, COLLECTION, id),
    prepareFirestoreWrite(`${COLLECTION}/${id}`, divisao as unknown as Record<string, unknown>)
  );
}

export async function remove(codigo: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, divisaoDocId(codigo)));
}
