/**
 * Sessão local (localStorage) + restauração via Firebase Auth + Firestore.
 * Firebase Auth é a fonte de “está autenticado”; localStorage cacheia o perfil.
 */
import { Usuario } from "../types";
import { findUsuarioByEmail } from "./approvalService";
import {
  getCurrentAuthEmail,
  getCurrentAuthPhotoURL,
  signOutGoogle,
  waitForAuthUser,
} from "./googleAuthService";
import { clearPendenciasAvisoDismiss } from "./pendingApprovalsService";
import { normalizeEmail } from "./usuarioHelpers";

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
  const authPhoto = getCurrentAuthPhotoURL();
  const divisaoId = String(user.divisaoId || "").trim();
  const activeRaw = user.activeDivisaoId;
  const active =
    activeRaw === undefined || activeRaw === null
      ? undefined
      : String(activeRaw).trim();
  return {
    uid: user.uid || user.re,
    re: user.re,
    nome: user.nome,
    nomeCompleto: user.nomeCompleto,
    postoGrad: user.postoGrad,
    secao: user.secao,
    divisaoId,
    // Só mantém Divisão ativa se foi escolhida explicitamente (não copia cadastro).
    ...(active ? { activeDivisaoId: active } : { activeDivisaoId: "" }),
    perfil: user.perfil || "Operador",
    ativo: user.ativo,
    email: normalizeEmail(user.email) || undefined,
    authProvider: user.authProvider || "google",
    photoURL: user.photoURL || authPhoto || null,
  };
}

export function writeSession(user: Usuario): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSessionUser(user)));
}

/** Define a Divisão ativa na sessão (Gerente ou entrada na própria). */
export function setActiveDivisaoInSession(
  user: Usuario,
  divisaoId: string
): Usuario {
  const next = toSessionUser({
    ...user,
    activeDivisaoId: String(divisaoId || "").trim(),
  });
  writeSession(next);
  return next;
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  clearPendenciasAvisoDismiss();
}

/**
 * Revalida a sessão: exige usuário Firebase Auth + cadastro por e-mail no Firestore.
 * Inativos com e-mail cadastrado permanecem autenticados (status é independente do login).
 * Em falha de rede após Auth OK, mantém snapshot local se o e-mail bater.
 */
export async function restoreSession(): Promise<{
  phase: AuthPhase;
  usuario: Usuario | null;
}> {
  const firebaseUser = await waitForAuthUser();
  if (!firebaseUser) {
    clearSession();
    return { phase: "unauthenticated", usuario: null };
  }

  const authEmail = normalizeEmail(firebaseUser.email) || getCurrentAuthEmail();
  if (!authEmail) {
    await signOutGoogle();
    clearSession();
    return { phase: "unauthenticated", usuario: null };
  }

  const photoURL = firebaseUser.photoURL || null;

  try {
    const fresh = await findUsuarioByEmail(authEmail);
    if (!fresh) {
      await signOutGoogle();
      clearSession();
      return { phase: "unauthenticated", usuario: null };
    }
    const usuario = toSessionUser({ ...fresh, photoURL });
    writeSession(usuario);
    return { phase: "authenticated", usuario };
  } catch (err) {
    console.warn("Falha ao revalidar sessão; tentando snapshot local:", err);
    const provisional = readSession();
    if (provisional?.re && normalizeEmail(provisional.email) === authEmail) {
      return {
        phase: "authenticated",
        usuario: toSessionUser({ ...provisional, photoURL: provisional.photoURL || photoURL }),
      };
    }
    await signOutGoogle();
    clearSession();
    return { phase: "unauthenticated", usuario: null };
  }
}
