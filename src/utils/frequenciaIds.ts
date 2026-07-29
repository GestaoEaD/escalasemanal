/**
 * Helpers de identificação e calendário do Controle de Frequência.
 */
import { CONTROLE_FREQUENCIA_COLLECTION, DIVISAO_EAD_ID, MESES_NOMES } from "../types";
import { normalizeDivisaoId } from "./divisaoIds";

export function normalizeSecaoId(secao: string): string {
  return String(secao || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[ºª]/g, "");
}

/**
 * ID Firestore: `{divisaoId}_{ano}_{mes}_{secaoNormalizada}`
 * Legado (sem tenant): `{ano}_{mes}_{secao}`
 */
export function buildControleFrequenciaId(
  ano: number,
  mes: number,
  secao: string,
  divisaoId: string = DIVISAO_EAD_ID
): string {
  const d = normalizeDivisaoId(divisaoId) || DIVISAO_EAD_ID;
  return `${d}_${ano}_${String(mes).padStart(2, "0")}_${normalizeSecaoId(secao)}`;
}

export function parseControleFrequenciaId(
  id: string
): { divisaoId: string; ano: number; mes: number; secaoKey: string; legacy: boolean } | null {
  const raw = String(id || "").trim();
  // Tenant: divisao_YYYY_MM_secao...
  const tenant = raw.match(/^(.+)_(\d{4})_(\d{1,2})_(.+)$/);
  if (tenant) {
    const prefix = tenant[1];
    // Se prefixo for só 4 dígitos, é legado interpretado errado — tratar abaixo
    if (!/^\d{4}$/.test(prefix)) {
      return {
        divisaoId: normalizeDivisaoId(prefix),
        ano: Number(tenant[2]),
        mes: Number(tenant[3]),
        secaoKey: tenant[4],
        legacy: false,
      };
    }
  }
  // Legado: YYYY_MM_secao
  const legacy = raw.match(/^(\d{4})_(\d{1,2})_(.+)$/);
  if (legacy) {
    return {
      divisaoId: DIVISAO_EAD_ID,
      ano: Number(legacy[1]),
      mes: Number(legacy[2]),
      secaoKey: legacy[3],
      legacy: true,
    };
  }
  return null;
}

export function daysInMonth(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

export function dayKey(day: number): string {
  return String(day).padStart(2, "0");
}

export function mesLabel(mes: number): string {
  return MESES_NOMES[mes - 1] || `Mês ${mes}`;
}

export function controleFrequenciaDocPath(id: string): string {
  return `${CONTROLE_FREQUENCIA_COLLECTION}/${id}`;
}

/** Dow JS: 0=Dom … 6=Sáb → campo da escala (seg…dom, semana inicia na segunda). */
export type EscalaDayField = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export function jsDowToEscalaField(jsDow: number): EscalaDayField {
  const map: EscalaDayField[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  return map[jsDow] || "seg";
}

export function formatNowParts(date: Date = new Date()): {
  data: string;
  hora: string;
} {
  return {
    data:
      String(date.getDate()).padStart(2, "0") +
      "/" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "/" +
      date.getFullYear(),
    hora:
      String(date.getHours()).padStart(2, "0") +
      ":" +
      String(date.getMinutes()).padStart(2, "0"),
  };
}
