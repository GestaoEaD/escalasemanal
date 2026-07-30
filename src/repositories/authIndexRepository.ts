/**
 * Repository Firestore — Índice de autenticação (`auth_index/{email}`).
 * Somente I/O; normalização do payload fica em utils/authIndex.ts.
 */
import { db, doc, setDoc, deleteDoc } from "../firebase";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

const COLLECTION = "auth_index";

export async function upsert(id: string, payload: Record<string, unknown>): Promise<void> {
  await setDoc(doc(db, COLLECTION, id), prepareFirestoreWrite(`${COLLECTION}/${id}`, payload));
}

export async function remove(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
