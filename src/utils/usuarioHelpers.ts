import { Usuario } from "../types";
import { db, doc, updateDoc } from "../firebase";
import { prepareFirestoreWrite } from "./firestoreSanitize";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normaliza e-mail: trim + minúsculas. */
export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return EMAIL_REGEX.test(normalized);
}

/** Exibe e-mail na UI; usuários antigos sem valor mostram placeholder. */
export function displayUserEmail(email?: string | null): string {
  const n = normalizeEmail(email);
  return n || "Não informado";
}

/**
 * Prepara documento de usuário para gravação no Firestore.
 * Normaliza e-mail e preserva authProvider / emailVerificado / ultimoLogin existentes.
 */
export function prepareUsuarioDocument(user: Usuario): Usuario {
  const email = normalizeEmail(user.email);
  return {
    ...user,
    email,
    authProvider: user.authProvider || (email ? "google" : "local"),
    ultimoLogin: user.ultimoLogin ?? null,
    emailVerificado: user.emailVerificado === true,
  };
}

/**
 * Após login Google bem-sucedido, atualiza metadados no cadastro (sem alterar perfil/RBAC).
 */
export async function markUsuarioGoogleLogin(user: Usuario): Promise<void> {
  const id = user.uid || user.re;
  if (!id) return;
  const payload = prepareFirestoreWrite(`usuarios/${id}`, {
    authProvider: "google",
    emailVerificado: true,
    ultimoLogin: new Date().toISOString(),
    email: normalizeEmail(user.email),
  });
  await updateDoc(doc(db, "usuarios", id), payload);
}

/**
 * Valida e-mail no cadastro.
 * - Novos usuários: e-mail obrigatório
 * - Edição: se informado, deve ser válido; vazio permitido só para legados
 */
export function validateUsuarioEmail(options: {
  email: string | null | undefined;
  re: string;
  isNew: boolean;
  existingUsers: Usuario[];
}): { ok: true; email: string } | { ok: false; message: string } {
  const email = normalizeEmail(options.email);

  if (options.isNew && !email) {
    return { ok: false, message: "Informe o E-mail Google (*). É o vínculo de acesso à plataforma." };
  }

  if (email && !isValidEmailFormat(email)) {
    return { ok: false, message: "Informe um e-mail válido (ex.: joao.silva@exemplo.com)." };
  }

  if (email) {
    const duplicated = options.existingUsers.some(
      (u) => u.re !== options.re && normalizeEmail(u.email) === email
    );
    if (duplicated) {
      return { ok: false, message: "Este e-mail já está vinculado a outro usuário." };
    }
  }

  return { ok: true, email };
}
