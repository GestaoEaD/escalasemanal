/**
 * Repository Firestore — Legendas (catálogo global).
 * Somente I/O; validações e permissões ficam na camada de services/validators.
 */
import { db, collection, doc, getDocs, setDoc, deleteDoc } from "../firebase";
import { Legenda } from "../types";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";
import { legendaDocId } from "../utils/legendaModel";

const COLLECTION = "legendas";

export async function listAll(): Promise<Legenda[]> {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => d.data() as Legenda);
}

export async function save(legenda: Legenda): Promise<void> {
  const id = legendaDocId(legenda.sigla);
  await setDoc(
    doc(db, COLLECTION, id),
    prepareFirestoreWrite(`${COLLECTION}/${id}`, legenda as unknown as Record<string, unknown>)
  );
}

export async function remove(sigla: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, legendaDocId(sigla)));
}
