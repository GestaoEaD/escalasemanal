/**
 * Repository Firestore — Postos/Graduações (catálogo por Divisão).
 * Somente I/O; validações e permissões ficam na camada de services/validators.
 */
import { db, collection, doc, getDocs, setDoc, deleteDoc, query, where } from "../firebase";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";
import { tenantDocId } from "../utils/tenantDocIds";

const COLLECTION = "postos";

/** Documento de Posto/Graduação — catálogo com escopo de Divisão. */
export interface PostoDocument {
  sigla: string;
  descricao?: string;
  ordem?: number;
  divisaoId: string;
  [key: string]: unknown;
}

export async function listByDivisao(divisaoId: string): Promise<PostoDocument[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where("divisaoId", "==", divisaoId))
  );
  return snap.docs.map((d) => d.data() as PostoDocument);
}

export async function save(posto: PostoDocument): Promise<void> {
  const divisaoId = String(posto.divisaoId || "").trim();
  const id = tenantDocId(divisaoId, posto.sigla);
  await setDoc(
    doc(db, COLLECTION, id),
    prepareFirestoreWrite(`${COLLECTION}/${id}`, posto as unknown as Record<string, unknown>)
  );
}

export async function remove(divisaoId: string, sigla: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, tenantDocId(divisaoId, sigla)));
}
