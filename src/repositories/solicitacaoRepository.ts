/**
 * Repository Firestore — Solicitações de Aprovação (`solicitacoes_aprovacao`).
 * Somente I/O; regras de token/expiração ficam em solicitacaoAprovacaoService.
 */
import { db, doc, getDoc, setDoc } from "../firebase";
import { SolicitacaoAprovacao } from "../types";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

const COLLECTION = "solicitacoes_aprovacao";

export async function getById(token: string): Promise<SolicitacaoAprovacao | null> {
  const id = String(token || "").trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as SolicitacaoAprovacao), token: snap.id };
}

export async function save(sol: SolicitacaoAprovacao): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, sol.token),
    prepareFirestoreWrite(`${COLLECTION}/${sol.token}`, sol as unknown as Record<string, unknown>)
  );
}

export async function saveMerge(
  token: string,
  partial: Record<string, unknown>
): Promise<void> {
  const id = String(token || "").trim();
  if (!id) return;
  await setDoc(
    doc(db, COLLECTION, id),
    prepareFirestoreWrite(`${COLLECTION}/${id}/merge`, partial),
    { merge: true }
  );
}
