/**
 * IDs e normalização de Divisão (tenant).
 */
import { DIVISAO_EAD_ID } from "../types";

export function normalizeDivisaoId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Normaliza secaoId sem alterar maiúsculas (IDs gerados pelo Firestore). */
export function normalizeSecaoIdForDoc(value: unknown): string {
  return String(value ?? "").trim();
}

export function divisaoDocId(codigo: string): string {
  return normalizeDivisaoId(codigo);
}

/**
 * ID canônico de escala (Semanal / Alteração): `{divisaoId}__{ano}__{semana2}`.
 * Escalas pertencem à Divisão — não à Seção.
 */
export function buildEscalaDocId(
  divisaoId: string,
  ano: number,
  semana: number | string
): string {
  const d = normalizeDivisaoId(divisaoId) || DIVISAO_EAD_ID;
  const w = String(semana).padStart(2, "0");
  return `${d}__${ano}__${w}`;
}

/**
 * Aceita:
 * - canônico `{divisaoId}__{ano}__{semana}`
 * - legado por seção `{divisaoId}__{secaoId}__{ano}__{semana}`
 * - legado tenant `{divisaoId}_{ano}_{semana}`
 * - legado curto `{ano}_{semana}`
 */
export function parseEscalaDocId(id: string): {
  divisaoId: string;
  secaoId: string | null;
  ano: number;
  semana: number;
  legacy: boolean;
} | null {
  const raw = String(id || "").trim();
  const parts = raw.split("__");

  // Canônico: divisao__ano__semana
  if (parts.length === 3) {
    const ano = Number(parts[1]);
    const semana = Number(parts[2]);
    if (
      Number.isFinite(ano) &&
      ano >= 2000 &&
      ano <= 2100 &&
      Number.isFinite(semana) &&
      semana >= 1 &&
      semana <= 53
    ) {
      const divisaoId = normalizeDivisaoId(parts[0]);
      if (divisaoId) {
        return { divisaoId, secaoId: null, ano, semana, legacy: false };
      }
    }
  }

  // Legado por seção: divisao__secao__ano__semana
  if (parts.length === 4) {
    const ano = Number(parts[2]);
    const semana = Number(parts[3]);
    if (
      Number.isFinite(ano) &&
      ano >= 2000 &&
      ano <= 2100 &&
      Number.isFinite(semana) &&
      semana >= 1 &&
      semana <= 53
    ) {
      const divisaoId = normalizeDivisaoId(parts[0]);
      const secaoId = normalizeSecaoIdForDoc(parts[1]);
      if (divisaoId && secaoId) {
        return { divisaoId, secaoId, ano, semana, legacy: true };
      }
    }
  }

  // Legado tenant: qualquer_prefixo_YYYY_WW
  const legacyTenantParts = raw.split("_");
  if (legacyTenantParts.length >= 3) {
    const semana = Number(legacyTenantParts[legacyTenantParts.length - 1]);
    const ano = Number(legacyTenantParts[legacyTenantParts.length - 2]);
    if (
      Number.isFinite(ano) &&
      ano >= 2000 &&
      ano <= 2100 &&
      Number.isFinite(semana) &&
      semana >= 1 &&
      semana <= 53
    ) {
      const divisaoId = normalizeDivisaoId(legacyTenantParts.slice(0, -2).join("_"));
      if (divisaoId) {
        return { divisaoId, secaoId: null, ano, semana, legacy: true };
      }
    }
  }

  // Legado: YYYY_WW
  if (legacyTenantParts.length === 2) {
    const ano = Number(legacyTenantParts[0]);
    const semana = Number(legacyTenantParts[1]);
    if (
      Number.isFinite(ano) &&
      ano >= 2000 &&
      ano <= 2100 &&
      Number.isFinite(semana) &&
      semana >= 1 &&
      semana <= 53
    ) {
      return {
        divisaoId: DIVISAO_EAD_ID,
        secaoId: null,
        ano,
        semana,
        legacy: true,
      };
    }
  }
  return null;
}

/** Extrai week key local `YYYY_WW` a partir do id completo ou legado. */
export function escalaWeekKeyFromDocId(id: string): string | null {
  const p = parseEscalaDocId(id);
  if (!p) return null;
  return `${p.ano}_${String(p.semana).padStart(2, "0")}`;
}
