/**
 * Índice Firestore auth_index/{email} → perfil/re.
 * Usado pelas security rules para autorização sem Cloud Functions.
 */
import { Usuario } from "../types";
import { normalizeEmail } from "./usuarioHelpers";
import { upsert as upsertAuthIndexDoc, remove as removeAuthIndexDoc } from "../repositories/authIndexRepository";

export const AUTH_INDEX_COLLECTION = "auth_index";

export function authIndexDocId(email: string | null | undefined): string | null {
  const e = normalizeEmail(email);
  return e || null;
}

/**
 * @param contaAutenticada e-mail exatamente como o Google devolveu. As rules
 * localizam o índice por `auth_index/{token.email}`, então o documento precisa
 * usar essa grafia — que pode diferir da cadastrada em contas Gmail.
 */
export async function upsertAuthIndex(
  usuario: Usuario,
  contaAutenticada?: string | null
): Promise<void> {
  const email = authIndexDocId(contaAutenticada) || authIndexDocId(usuario.email);
  if (!email) return;
  const payload = {
    email,
    re: String(usuario.re || "").trim(),
    perfil: usuario.perfil || "Operador",
    ativo: usuario.ativo !== false,
    secao: String(usuario.secao || "").trim(),
    secaoId: String(usuario.secaoId || "").trim(),
    secoesResponsaveisIds: (usuario.secoesResponsaveisIds || []).map((secaoId) =>
      String(secaoId || "").trim()
    ),
    divisaoId: String(usuario.divisaoId || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  await upsertAuthIndexDoc(email, payload);
}

export async function removeAuthIndex(email: string | null | undefined): Promise<void> {
  const id = authIndexDocId(email);
  if (!id) return;
  try {
    await removeAuthIndexDoc(id);
  } catch {
    /* ignore */
  }
}
