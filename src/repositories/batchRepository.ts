/**
 * Repository Firestore — Batch atômico (Configurações e saves compostos).
 * Somente I/O; validações e permissões ficam na camada de services/validators.
 */
import { db, doc, writeBatch } from "../firebase";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

export type RepoWriteBatch = ReturnType<typeof writeBatch>;

export function createWriteBatch(): RepoWriteBatch {
  return writeBatch(db);
}

export function batchSet(
  batch: RepoWriteBatch,
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
  merge = false
): void {
  const ref = doc(db, collectionName, id);
  const payload = prepareFirestoreWrite(`${collectionName}/${id}`, data);
  if (merge) batch.set(ref, payload, { merge: true });
  else batch.set(ref, payload);
}

export function batchDelete(
  batch: RepoWriteBatch,
  collectionName: string,
  id: string
): void {
  batch.delete(doc(db, collectionName, id));
}

export async function commitBatch(batch: RepoWriteBatch): Promise<void> {
  await batch.commit();
}
