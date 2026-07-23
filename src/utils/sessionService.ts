/**
 * Sessão local (localStorage) + restauração com revalidação no Firestore.
 * Não altera regras de RBAC — apenas garante perfil atualizado antes dos guards.
 */
import { Usuario } from "../types";
import { findUsuarioByRe } from "./approvalService";
import { clearPendenciasAvisoDismiss } from "./pendingApprovalsService";

export const SESSION_STORAGE_KEY = "escala_sessao_usuario";

export type AuthPhase = "loading" | "unauthenticated" | "authenticated";

export function readSession(): Usuario | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Usuario;
    if (!parsed?.re) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function toSessionUser(user: Usuario): Usuario {
  return {
    uid: user.uid || user.re,
    re: user.re,
    nome: user.nome,
    nomeCompleto: user.nomeCompleto,
    postoGrad: user.postoGrad,
    secao: user.secao,
    perfil: user.perfil || "Operador",
    ativo: user.ativo,
  };
}

export function writeSession(user: Usuario): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSessionUser(user)));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  clearPendenciasAvisoDismiss();
}

/**
 * Revalida o usuário no Firestore a partir da sessão local.
 * Em falha de rede, mantém a sessão provisória (não força logout).
 */
export async function restoreSession(): Promise<{
  phase: AuthPhase;
  usuario: Usuario | null;
}> {
  const provisional = readSession();
  if (!provisional?.re) {
    clearSession();
    return { phase: "unauthenticated", usuario: null };
  }

  try {
    const fresh = await findUsuarioByRe(provisional.re);
    if (!fresh || fresh.ativo === false) {
      clearSession();
      return { phase: "unauthenticated", usuario: null };
    }
    const usuario = toSessionUser(fresh);
    writeSession(usuario);
    return { phase: "authenticated", usuario };
  } catch (err) {
    console.warn("Falha ao revalidar sessão; mantendo snapshot local:", err);
    return { phase: "authenticated", usuario: toSessionUser(provisional) };
  }
}
