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
 * - Sem lançamento inicial (não manual, valor vazio) → "-"
 * - Apagado manualmente (manual, valor vazio) → ""
 * - Demais → valor armazenado
 */
export function displayFrequenciaCelula(cel: FrequenciaCelula | undefined | null): string {
  if (!cel) return "-";
  const raw = String(cel.valor ?? "");
  if (cel.editadoManualmente) return raw;
  if (!raw.trim()) return "-";
  return raw;
}

/** Classe de destaque de fim de semana (padrão Escala Semanal/Alteração). */
export function weekendCellClass(isWeekend: boolean): string {
  return isWeekend ? "border-2 border-gray-400" : "";
}
