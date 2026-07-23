/**
 * Helpers de identificação e calendário do Controle de Frequência.
 */
import { CONTROLE_FREQUENCIA_COLLECTION, MESES_NOMES } from "../types";

export function normalizeSecaoId(secao: string): string {
  return String(secao || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[ºª]/g, "");
}

/** ID Firestore: `{ano}_{mes}_{secaoNormalizada}` */
export function buildControleFrequenciaId(
  ano: number,
  mes: number,
  secao: string
): string {
  return `${ano}_${String(mes).padStart(2, "0")}_${normalizeSecaoId(secao)}`;
}

export function parseControleFrequenciaId(
  id: string
): { ano: number; mes: number; secaoKey: string } | null {
  const m = String(id || "").match(/^(\d{4})_(\d{1,2})_(.+)$/);
  if (!m) return null;
  return {
    ano: Number(m[1]),
    mes: Number(m[2]),
    secaoKey: m[3],
  };
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
