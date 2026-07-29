/**
 * Contexto de Divisão (tenant) — filtro automático e asserts de acesso.
 */
import {
  DIVISAO_EAD_ID,
  Divisao,
  Usuario,
} from "../types";
import {
  canAccessAnyDivisao,
  isGerente,
} from "./permissions";
import { normalizeDivisaoId } from "./divisaoIds";

export class DivisaoAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivisaoAccessError";
  }
}

/** Divisão efetiva da sessão (ativa ou cadastral). */
export function resolveActiveDivisaoId(
  usuario: Usuario | null | undefined,
  fallback: string = DIVISAO_EAD_ID
): string {
  const active = normalizeDivisaoId(usuario?.activeDivisaoId);
  if (active) return active;
  const cadastro = normalizeDivisaoId(usuario?.divisaoId);
  if (cadastro) return cadastro;
  return fallback;
}

export function usuarioDivisaoCadastro(
  usuario: Usuario | null | undefined
): string {
  return normalizeDivisaoId(usuario?.divisaoId) || DIVISAO_EAD_ID;
}

/** Pode entrar nesta Divisão (cartão / navegação). */
export function canEnterDivisao(
  usuario: Usuario | null | undefined,
  divisaoId: string
): boolean {
  if (!usuario?.re) return false;
  if (canAccessAnyDivisao(usuario)) return true;
  return normalizeDivisaoId(usuario.divisaoId) === normalizeDivisaoId(divisaoId);
}

export function assertDivisaoAccess(
  usuario: Usuario | null | undefined,
  divisaoId: string
): void {
  if (!canEnterDivisao(usuario, divisaoId)) {
    throw new DivisaoAccessError(
      "Acesso negado a dados de outra Divisão."
    );
  }
}

/** Aplica filtro de tenant em lista (client-side safety net). */
export function filterByDivisaoId<T extends { divisaoId?: string }>(
  items: T[],
  divisaoId: string,
  usuario?: Usuario | null
): T[] {
  const d = normalizeDivisaoId(divisaoId);
  void usuario;
  return items.filter((i) => normalizeDivisaoId(i.divisaoId) === d);
}

export function withDivisaoId<T extends Record<string, unknown>>(
  data: T,
  divisaoId: string
): T & { divisaoId: string } {
  return { ...data, divisaoId: normalizeDivisaoId(divisaoId) || DIVISAO_EAD_ID };
}

export function sortDivisoes(list: Divisao[]): Divisao[] {
  return list
    .slice()
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

export function isGerenteGlobal(usuario: Usuario | null | undefined): boolean {
  return isGerente(usuario);
}
