/**
 * Contexto de Seção — seleção de documento e checagem de acesso.
 *
 * Matriz final: dentro da própria Divisão, Operador/Gestor/Admin acessam
 * qualquer Seção. Somente Gerente cruza Divisões.
 * `secaoId` identifica lotação e o documento ativo — não é ACL intra-Divisão.
 */
import { Usuario } from "../types";
import { isGerente } from "./permissions";
import { normalizeDivisaoId } from "./divisaoIds";

export class SecaoAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecaoAccessError";
  }
}

export function normalizeSecaoId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function usuarioSecaoId(usuario: Usuario | null | undefined): string {
  return normalizeSecaoId(usuario?.secaoId);
}

/** @deprecated Não é mais fonte de autorização — mantido para compatibilidade. */
export function usuarioSecoesResponsaveisIds(usuario: Usuario | null | undefined): string[] {
  const ids = (usuario?.secoesResponsaveisIds || []).map(normalizeSecaoId).filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * Seções acessíveis ao usuário.
 * - Gerente: "ALL" (todas as Divisões)
 * - Admin / Gestor / Operador: todas as Seções da própria Divisão
 *   (`allSecaoIdsInDivisao` se informado, senão "ALL" no escopo da Divisão)
 */
export function accessibleSecaoIds(
  usuario: Usuario | null | undefined,
  allSecaoIdsInDivisao?: string[]
): string[] | "ALL" {
  if (!usuario?.re) return [];
  if (isGerente(usuario)) return "ALL";

  // Op/Gestor/Admin: toda a Divisão.
  if (!allSecaoIdsInDivisao) return "ALL";
  return Array.from(new Set(allSecaoIdsInDivisao.map(normalizeSecaoId).filter(Boolean)));
}

export function canAccessSecao(
  usuario: Usuario | null | undefined,
  secaoId: string,
  divisaoId?: string
): boolean {
  if (!usuario?.re) return false;
  if (isGerente(usuario)) return true;

  if (divisaoId && normalizeDivisaoId(usuario.divisaoId) !== normalizeDivisaoId(divisaoId)) {
    return false;
  }

  const target = normalizeSecaoId(secaoId);
  if (!target) return false;

  // Dentro da própria Divisão, qualquer Seção é acessível.
  return true;
}

export function assertSecaoAccess(
  usuario: Usuario | null | undefined,
  secaoId: string,
  divisaoId?: string
): void {
  if (!canAccessSecao(usuario, secaoId, divisaoId)) {
    throw new SecaoAccessError(
      "Acesso negado a dados de outra Divisão ou Seção inválida."
    );
  }
}

/**
 * Filtra itens por Seção apenas quando o usuário não tem acesso à Divisão
 * do item. Dentro da própria Divisão, retorna todos os itens com secaoId.
 */
export function filterByAccessibleSecao<T extends { secaoId?: string; divisaoId?: string }>(
  items: T[],
  usuario: Usuario | null | undefined,
  divisaoId?: string
): T[] {
  if (!usuario?.re) return [];
  if (isGerente(usuario)) return items;

  const targetDiv = normalizeDivisaoId(divisaoId || usuario.divisaoId);
  return items.filter((item) => {
    const itemSecaoId = normalizeSecaoId(item.secaoId);
    if (!itemSecaoId) return false;
    const itemDiv = normalizeDivisaoId(item.divisaoId || targetDiv);
    return itemDiv === targetDiv;
  });
}

export function resolveActiveSecaoId(
  usuario: Usuario | null | undefined,
  preferred?: string
): string {
  const preferredId = normalizeSecaoId(preferred);
  if (preferredId && canAccessSecao(usuario, preferredId)) {
    return preferredId;
  }

  const active = normalizeSecaoId(usuario?.activeSecaoId);
  if (active && canAccessSecao(usuario, active)) {
    return active;
  }

  return usuarioSecaoId(usuario);
}
