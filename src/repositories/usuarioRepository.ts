/**
 * Repository Firestore — Usuários (cadastro/permissões).
 * Somente I/O; validações e permissões ficam na camada de services/validators.
 */
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
} from "../firebase";
import { Usuario } from "../types";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

const COLLECTION = "usuarios";

export async function listByDivisao(divisaoId: string): Promise<Usuario[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where("divisaoId", "==", divisaoId))
  );
  return snap.docs.map((d) => ({ ...(d.data() as Usuario), uid: d.id }));
}

export async function getByRe(re: string): Promise<Usuario | null> {
  const id = String(re || "").trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Usuario), uid: snap.id };
}

export async function save(usuario: Usuario): Promise<void> {
  const id = String(usuario.uid || usuario.re || "").trim();
  if (!id) throw new Error("usuario.re é obrigatório para gravar o documento.");
  await setDoc(
    doc(db, COLLECTION, id),
    prepareFirestoreWrite(`${COLLECTION}/${id}`, usuario as unknown as Record<string, unknown>)
  );
}

export async function remove(re: string): Promise<void> {
  const id = String(re || "").trim();
  if (!id) return;
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function updateFields(
  re: string,
  fields: Record<string, unknown>
): Promise<void> {
  const id = String(re || "").trim();
  if (!id) return;
  await updateDoc(
    doc(db, COLLECTION, id),
    prepareFirestoreWrite(`${COLLECTION}/${id}/update`, fields)
  );
}
