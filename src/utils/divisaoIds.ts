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

export function divisaoDocId(codigo: string): string {
  return normalizeDivisaoId(codigo);
}

/** ID de escala: `{divisaoId}_{ano}_{semana2}` */
export function buildEscalaDocId(
  divisaoId: string,
  ano: number,
  semana: number | string
): string {
  const d = normalizeDivisaoId(divisaoId) || DIVISAO_EAD_ID;
  const w = String(semana).padStart(2, "0");
  return `${d}_${ano}_${w}`;
}

/**
 * Aceita ID novo `{divisaoId}_{ano}_{semana}` ou legado `{ano}_{semana}`.
 * Divisão EaD usa código numérico — prioriza padrão de 3 segmentos.
 */
export function parseEscalaDocId(id: string): {
  divisaoId: string;
  ano: number;
  semana: number;
  legacy: boolean;
} | null {
  const raw = String(id || "").trim();
  // Tenant: qualquer_prefixo_YYYY_WW (3+ segmentos; últimos dois = ano/semana)
  const parts = raw.split("_");
  if (parts.length >= 3) {
    const semana = Number(parts[parts.length - 1]);
    const ano = Number(parts[parts.length - 2]);
    if (
      Number.isFinite(ano) &&
      ano >= 2000 &&
      ano <= 2100 &&
      Number.isFinite(semana) &&
      semana >= 1 &&
      semana <= 53
    ) {
      const divisaoId = normalizeDivisaoId(parts.slice(0, -2).join("_"));
      if (divisaoId) {
        return { divisaoId, ano, semana, legacy: false };
      }
    }
  }
  // Legado: YYYY_WW
  if (parts.length === 2) {
    const ano = Number(parts[0]);
    const semana = Number(parts[1]);
    if (
      Number.isFinite(ano) &&
      ano >= 2000 &&
      Number.isFinite(semana) &&
      semana >= 1
    ) {
      return { divisaoId: DIVISAO_EAD_ID, ano, semana, legacy: true };
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
