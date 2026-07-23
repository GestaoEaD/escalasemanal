/**
 * Autenticação exclusiva via Google (Firebase Auth).
 * Mensagens amigáveis — nunca expor códigos técnicos do Firebase ao usuário.
 */
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../firebase";
import { normalizeEmail } from "./usuarioHelpers";

export type GoogleAuthErrorKind =
  | "cancelled"
  | "network"
  | "temporary"
  | "not_registered"
  | "provider_disabled"
  | "unauthorized_domain"
  | "unknown";

export interface FriendlyAuthMessage {
  kind: GoogleAuthErrorKind;
  title: string;
  body: string;
  /** CTA principal na UI */
  actionLabel: "Tentar novamente" | "Tentar com outra conta Google";
}

export function getGoogleAuthErrorMessage(kind: GoogleAuthErrorKind): FriendlyAuthMessage {
  switch (kind) {
    case "cancelled":
      return {
        kind,
        title: "Login cancelado",
        body: "O acesso não foi concluído. Você pode tentar novamente utilizando sua conta Google cadastrada.",
        actionLabel: "Tentar novamente",
      };
    case "network":
      return {
        kind,
        title: "Problema de conexão",
        body: "Não foi possível verificar seus dados neste momento. Verifique sua conexão com a internet e tente novamente.",
        actionLabel: "Tentar novamente",
      };
    case "provider_disabled":
      return {
        kind,
        title: "Login Google ainda não está disponível",
        body: "O provedor Google precisa ser habilitado no Firebase Authentication deste projeto. Peça ao administrador para ativar Sign-in method → Google e incluir o domínio do site em Authorized domains.",
        actionLabel: "Tentar novamente",
      };
    case "unauthorized_domain":
      return {
        kind,
        title: "Domínio não autorizado",
        body: "Este endereço do site ainda não está autorizado no Firebase Authentication. Inclua o domínio (por exemplo, escalasemanal.vercel.app) em Authentication → Settings → Authorized domains.",
        actionLabel: "Tentar novamente",
      };
    case "temporary":
      return {
        kind,
        title: "Não foi possível concluir o login",
        body: "Ocorreu um problema temporário ao autenticar sua conta Google. Verifique sua conexão com a internet e tente novamente.",
        actionLabel: "Tentar novamente",
      };
    case "not_registered":
      return {
        kind,
        title: "Acesso não autorizado",
        body: "Sua conta Google foi autenticada, mas este e-mail ainda não está cadastrado na plataforma. Entre em contato com o administrador responsável para solicitar o cadastro ou a atualização do seu e-mail de acesso.",
        actionLabel: "Tentar com outra conta Google",
      };
    default:
      return {
        kind: "unknown",
        title: "Conta Google não reconhecida",
        body: "Você entrou com uma conta Google que não está vinculada a um usuário cadastrado na plataforma. Tente utilizar a conta Google registrada no seu cadastro.",
        actionLabel: "Tentar com outra conta Google",
      };
  }
}

function mapFirebaseAuthError(err: unknown): GoogleAuthErrorKind {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code || "")
      : "";

  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/user-cancelled"
  ) {
    return "cancelled";
  }
  if (
    code === "auth/network-request-failed" ||
    code === "auth/timeout"
  ) {
    return "network";
  }
  if (code === "auth/operation-not-allowed") {
    return "provider_disabled";
  }
  if (code === "auth/unauthorized-domain") {
    return "unauthorized_domain";
  }
  if (
    code === "auth/popup-blocked" ||
    code === "auth/internal-error" ||
    code === "auth/too-many-requests"
  ) {
    return "temporary";
  }
  return "temporary";
}

export class GoogleAuthFlowError extends Error {
  readonly kind: GoogleAuthErrorKind;

  constructor(kind: GoogleAuthErrorKind) {
    const msg = getGoogleAuthErrorMessage(kind);
    super(msg.title);
    this.name = "GoogleAuthFlowError";
    this.kind = kind;
  }
}

/** Aguarda o estado inicial do Firebase Auth (útil no restore da sessão). */
export function waitForAuthUser(timeoutMs = 8000): Promise<User | null> {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      resolve(auth.currentUser);
    }, timeoutMs);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

export async function signInWithGoogle(): Promise<{
  email: string;
  firebaseUid: string;
  photoURL: string | null;
}> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  provider.addScope("email");
  provider.addScope("profile");

  try {
    const result = await signInWithPopup(auth, provider);
    const email = normalizeEmail(result.user.email);
    if (!email) {
      await signOutGoogle();
      throw new GoogleAuthFlowError("temporary");
    }
    return {
      email,
      firebaseUid: result.user.uid,
      photoURL: result.user.photoURL || null,
    };
  } catch (err) {
    if (err instanceof GoogleAuthFlowError) throw err;
    console.warn("Falha no login Google:", err);
    throw new GoogleAuthFlowError(mapFirebaseAuthError(err));
  }
}

export async function signOutGoogle(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("Falha ao encerrar sessão Firebase Auth:", err);
  }
}

export function getCurrentAuthEmail(): string | null {
  const email = normalizeEmail(auth.currentUser?.email);
  return email || null;
}

/** Foto do perfil Google autenticado (pode ser null). */
export function getCurrentAuthPhotoURL(): string | null {
  return auth.currentUser?.photoURL || null;
}
