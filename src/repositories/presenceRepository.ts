/**
 * Repository Firestore — Presença online (`presenca_online/{re}`).
 * Somente I/O; heartbeat/timers ficam em utils/presenceService.ts.
 */
import { db, collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from "../firebase";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

const COLLECTION = "presenca_online";

export async function setPresence(id: string, payload: Record<string, unknown>): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, id),
    prepareFirestoreWrite(`${COLLECTION}/${id}`, payload),
    { merge: true }
  );
}

export async function clearPresence(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Assina documentos de presença de uma Divisão. Retorna unsubscribe. */
export function subscribeByDivisao(
  divisaoId: string,
  onChange: (docs: Record<string, unknown>[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const q = query(collection(db, COLLECTION), where("divisaoId", "==", divisaoId));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data())),
    (err) => onError?.(err)
  );
}
