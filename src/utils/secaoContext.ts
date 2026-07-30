/**
 * Contexto de Seção — seleção de documento e checagem de acesso.
 *
 * Escalas: dentro da própria Divisão, Op/Gestor/Admin acessam qualquer Seção.
 * Frequência: Operador só a própria lotação; Admin/Gestor a Divisão; Gerente todas.
 */
import { Usuario } from "../types";
import { isAdministrador, isGerente, isGestor, isOperador } from "./permissions";
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
 * Seções acessíveis em Escalas / navegação geral (por Divisão).
 */
export function accessibleSecaoIds(
  usuario: Usuario | null | undefined,
  allSecaoIdsInDivisao?: string[]
): string[] | "ALL" {
  if (!usuario?.re) return [];
  if (isGerente(usuario)) return "ALL";
  if (!allSecaoIdsInDivisao) return "ALL";
  return Array.from(new Set(allSecaoIdsInDivisao.map(normalizeSecaoId).filter(Boolean)));
}

/**
 * Seções acessíveis no Controle de Frequência.
 * Operador: só a própria lotação; Admin/Gestor: Divisão; Gerente: todas.
 */
export function accessibleSecaoIdsFrequencia(
  usuario: Usuario | null | undefined,
  allSecaoIdsInDivisao?: string[]
): string[] | "ALL" {
  if (!usuario?.re) return [];
  if (isGerente(usuario)) return "ALL";
  if (isAdministrador(usuario) || isGestor(usuario)) {
    if (!allSecaoIdsInDivisao) return "ALL";
    return Array.from(new Set(allSecaoIdsInDivisao.map(normalizeSecaoId).filter(Boolean)));
  }
  if (isOperador(usuario)) {
    const own = usuarioSecaoId(usuario);
    return own ? [own] : [];
  }
  return [];
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

  return true;
}

export function canAccessSecaoFrequenciaCtx(
  usuario: Usuario | null | undefined,
  secaoId: string,
  divisaoId?: string
): boolean {
  if (!usuario?.re) return false;
  const target = normalizeSecaoId(secaoId);
  if (!target) return false;
  if (isGerente(usuario)) return true;
  if (divisaoId && normalizeDivisaoId(usuario.divisaoId) !== normalizeDivisaoId(divisaoId)) {
    return false;
  }
  if (isAdministrador(usuario) || isGestor(usuario)) return true;
  return usuarioSecaoId(usuario) === target;
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
