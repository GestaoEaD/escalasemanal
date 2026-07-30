/**
 * Repository Firestore — Auditoria (`logs` + contador `counters/logs`).
 * Somente I/O; formatação/regra de negócio do log ficam em auditService.
 */
import { db, doc, setDoc, runTransaction } from "../firebase";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

const COUNTERS_COLLECTION = "counters";
const LOGS_COLLECTION = "logs";

/** Aloca o próximo ID sequencial de log (`LOG-000123`) via transação atômica. */
export async function allocateLogId(): Promise<string> {
  const counterRef = doc(db, COUNTERS_COLLECTION, "logs");
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data()?.next || 1) : 1;
    const value = Number.isFinite(current) && current > 0 ? current : 1;
    tx.set(counterRef, { next: value + 1 }, { merge: true });
    return value;
  });
  return `LOG-${String(next).padStart(6, "0")}`;
}

export async function saveLog(id: string, payload: Record<string, unknown>): Promise<void> {
  await setDoc(
    doc(db, LOGS_COLLECTION, id),
    prepareFirestoreWrite(`${LOGS_COLLECTION}/${id}`, payload)
  );
}
