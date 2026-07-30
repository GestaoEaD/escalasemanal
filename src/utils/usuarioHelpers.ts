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

/**
 * Chave de identidade da conta: no Gmail, pontos e sufixos "+alias" não fazem
 * parte do endereço, então `joao.silva@gmail.com` e `joaosilva@gmail.com` são a
 * mesma caixa. Serve para detectar duplicidade — nunca para gravar, porque o
 * login compara o e-mail literal devolvido pelo Google.
 */
export function contaEmailKey(email: string | null | undefined): string {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return normalized;
  if (domain !== "gmail.com" && domain !== "googlemail.com") return normalized;
  const base = local.split("+")[0].replace(/\./g, "");
  return `${base}@gmail.com`;
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
    emailKey: contaEmailKey(email),
    divisaoId: String(user.divisaoId || "").trim(),
    // secaoId permanece como lotação; ACL é por Divisão (campo legado não é mais fonte de autorização).
    secoesResponsaveisIds: [],
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
  const email = normalizeEmail(user.email);
  const payload = prepareFirestoreWrite(`usuarios/${id}`, {
    authProvider: "google",
    emailVerificado: true,
    ultimoLogin: new Date().toISOString(),
    email,
    // Preenche o campo em cadastros legados, que só tinham `email`.
    emailKey: contaEmailKey(email),
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
    const key = contaEmailKey(email);
    const conflito = options.existingUsers.find(
      (u) => u.re !== options.re && contaEmailKey(u.email) === key
    );
    if (conflito) {
      const mesmaEscrita = normalizeEmail(conflito.email) === email;
      return {
        ok: false,
        message: mesmaEscrita
          ? `Este e-mail já está vinculado à permissão de ${conflito.postoGrad} ${conflito.nome} (R.E. ${conflito.re}). Ajuste ou exclua aquela permissão antes.`
          : `Esta é a mesma conta Google de ${conflito.postoGrad} ${conflito.nome} (R.E. ${conflito.re}), que usa ${normalizeEmail(conflito.email)} — no Gmail pontos e "+alias" não diferenciam a caixa.`,
      };
    }
  }

  return { ok: true, email };
}
