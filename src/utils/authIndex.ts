/**
 * Índice Firestore auth_index/{email} → perfil/re.
 * Usado pelas security rules para autorização sem Cloud Functions.
 */
import { db, doc, setDoc, deleteDoc } from "../firebase";
import { Usuario } from "../types";
import { normalizeEmail } from "./usuarioHelpers";
import { prepareFirestoreWrite } from "./firestoreSanitize";

export const AUTH_INDEX_COLLECTION = "auth_index";

export function authIndexDocId(email: string | null | undefined): string | null {
  const e = normalizeEmail(email);
  return e || null;
}

export async function upsertAuthIndex(usuario: Usuario): Promise<void> {
  const email = authIndexDocId(usuario.email);
  if (!email) return;
  const payload = {
    email,
    re: String(usuario.re || "").trim(),
    perfil: usuario.perfil || "Operador",
    ativo: usuario.ativo !== false,
    secao: String(usuario.secao || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(
    doc(db, AUTH_INDEX_COLLECTION, email),
    prepareFirestoreWrite(`${AUTH_INDEX_COLLECTION}/${email}`, payload)
  );
}

export async function removeAuthIndex(email: string | null | undefined): Promise<void> {
  const id = authIndexDocId(email);
  if (!id) return;
  try {
    await deleteDoc(doc(db, AUTH_INDEX_COLLECTION, id));
  } catch {
    /* ignore */
  }
}
