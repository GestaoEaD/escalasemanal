/**
 * Apresentação do Controle de Frequência (sem alterar regras de sync).
 */
import { FrequenciaCelula } from "../types";

/** Sábado (6) ou domingo (0) no calendário local. */
export function isWeekendDay(ano: number, mes: number, day: number): boolean {
  const dow = new Date(ano, mes - 1, day).getDay();
  return dow === 0 || dow === 6;
}

export type DisplayFrequenciaOptions = {
  /**
   * Valor de afastamento configurado nas legendas (ex.: consolidada da legenda A).
   * Usado só quando a célula está vazia (não manual) — tipicamente fim de semana
   * ainda não sincronizado. Sem fallback inventado além do valor passado.
   */
  emptyFallback?: string;
};

/**
 * Valor exibido na célula a partir do que está persistido / sincronizado.
 * - Edição manual vazia → ""
 * - Vazio não-manual → `emptyFallback` (afastamento da legenda) ou ""
 * - Hífen legado → `emptyFallback` ou ""
 * - Demais → valor armazenado (escalaConsolidada vinda do sync)
 */
export function displayFrequenciaCelula(
  cel: FrequenciaCelula | undefined | null,
  options: DisplayFrequenciaOptions = {}
): string {
  const fallback = String(options.emptyFallback ?? "").trim();
  if (!cel) return fallback;
  const raw = String(cel.valor ?? "");
  const trimmed = raw.trim();
  if (cel.editadoManualmente) {
    if (!trimmed || trimmed === "-") return "";
    return raw;
  }
  if (!trimmed || trimmed === "-") return fallback;
  return raw;
}

/** Classe de destaque de fim de semana (padrão Escala Semanal/Alteração). */
export function weekendCellClass(isWeekend: boolean): string {
  return isWeekend ? "border-2 border-gray-400" : "";
}
