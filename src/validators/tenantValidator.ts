/**
 * Validações de tenant (Divisão / Seção) — invariantes usadas por services.
 */
import { Usuario } from "../types";
import { normalizeDivisaoId } from "../utils/divisaoIds";
import { isGerente } from "../utils/permissions";
import { PermissionError } from "../utils/permissionGuards";

/** Garante um `divisaoId` não vazio (trim) e o retorna. */
export function assertDivisaoId(id: string): string {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) {
    throw new Error("divisaoId é obrigatório.");
  }
  return trimmed;
}

/** Garante um `secaoId` não vazio (trim) e o retorna. */
export function assertSecaoId(id: string): string {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) {
    throw new Error("secaoId é obrigatório.");
  }
  return trimmed;
}

/**
 * Garante que o usuário pertence à Divisão informada.
 * Gerente tem acesso a qualquer Divisão; demais perfis são restritos à própria.
 */
export function assertSameDivisao(
  usuario: Usuario | null | undefined,
  divisaoId: string
): void {
  if (isGerente(usuario)) return;
  if (normalizeDivisaoId(usuario?.divisaoId) !== normalizeDivisaoId(divisaoId)) {
    throw new PermissionError("Acesso negado a dados de outra Divisão.");
  }
}
