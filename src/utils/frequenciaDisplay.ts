/**
 * Apresentação do Controle de Frequência (sem alterar regras de sync).
 */
import { FrequenciaCelula } from "../types";

/** Sábado (6) ou domingo (0) no calendário local. */
export function isWeekendDay(ano: number, mes: number, day: number): boolean {
  const dow = new Date(ano, mes - 1, day).getDay();
  return dow === 0 || dow === 6;
}

/**
 * Valor exibido na célula.
 * - Sem lançamento inicial (não manual, valor vazio) → "A" (Afastamento)
 * - Apagado manualmente (manual, valor vazio) → ""
 * - Hífen legado → "A"
 * - Demais → valor armazenado
 */
export function displayFrequenciaCelula(cel: FrequenciaCelula | undefined | null): string {
  if (!cel) return "A";
  const raw = String(cel.valor ?? "");
  if (cel.editadoManualmente) {
    return raw.trim() === "-" ? "A" : raw;
  }
  if (!raw.trim() || raw.trim() === "-") return "A";
  return raw;
}

/** Classe de destaque de fim de semana (padrão Escala Semanal/Alteração). */
export function weekendCellClass(isWeekend: boolean): string {
  return isWeekend ? "border-2 border-gray-400" : "";
}
