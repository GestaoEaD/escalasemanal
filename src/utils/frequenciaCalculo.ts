/**
 * Cálculos de 1/2 Diária e A.A. a partir da configuração de legendas.
 */
import { ControleFrequenciaRow, FrequenciaCelula, Legenda } from "../types";
import {
  contaParaAA,
  getValorMeiaDiaria,
  normalizeLegenda,
} from "./legendaModel";

/** Índice de legendas por sigla, representação semanal e consolidada. */
export function buildLegendaLookup(legendas: Legenda[]): Map<string, Legenda> {
  const map = new Map<string, Legenda>();
  for (const raw of legendas) {
    const l = normalizeLegenda(raw);
    if (l.sigla) map.set(l.sigla.trim().toUpperCase(), l);
    const sem = l.representacoes?.escalaSemanal?.trim();
    if (sem) map.set(sem.toUpperCase(), l);
    const cons = l.representacoes?.escalaConsolidada?.trim();
    if (cons) map.set(cons.toUpperCase(), l);
  }
  return map;
}

export function findLegendaForValor(
  valor: string,
  lookup: Map<string, Legenda>
): Legenda | undefined {
  const key = String(valor || "").trim();
  if (!key || key === "-") return undefined;
  return lookup.get(key.toUpperCase()) || lookup.get(key);
}

/** Converte código da escala para representação do Controle de Frequência. */
export function convertEscalaValorToFrequencia(
  escalaValor: string,
  lookup: Map<string, Legenda>
): string {
  const raw = String(escalaValor || "").trim();
  if (!raw || raw === "-") return "";
  const legenda = findLegendaForValor(raw, lookup);
  const cons = legenda?.representacoes?.escalaConsolidada?.trim();
  if (cons) return cons;
  return raw;
}

export function calcMeiaDiariaFromCelulas(
  dias: Record<string, FrequenciaCelula>,
  lookup: Map<string, Legenda>
): number {
  let total = 0;
  for (const cel of Object.values(dias)) {
    if (!cel?.valor?.trim()) continue;
    const legenda = findLegendaForValor(cel.valor, lookup);
    if (!legenda) continue;
    total += getValorMeiaDiaria(legenda);
  }
  return total;
}

export function calcAAFromCelulas(
  dias: Record<string, FrequenciaCelula>,
  lookup: Map<string, Legenda>
): number {
  let total = 0;
  for (const cel of Object.values(dias)) {
    if (!cel?.valor?.trim()) continue;
    const legenda = findLegendaForValor(cel.valor, lookup);
    if (!legenda) continue;
    if (contaParaAA(legenda)) total += 1;
  }
  return total;
}

export function recalcRowTotais(
  row: ControleFrequenciaRow,
  lookup: Map<string, Legenda>
): ControleFrequenciaRow {
  return {
    ...row,
    meiaDiaria: calcMeiaDiariaFromCelulas(row.dias, lookup),
    aa: calcAAFromCelulas(row.dias, lookup),
  };
}

export function recalcAllRows(
  rows: ControleFrequenciaRow[],
  legendas: Legenda[]
): ControleFrequenciaRow[] {
  const lookup = buildLegendaLookup(legendas);
  return rows.map((r) => recalcRowTotais(r, lookup));
}
