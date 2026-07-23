/**
 * Cálculos de 1/2 Diária e A.A. a partir da configuração de legendas.
 * Controle de Frequência só exibe/soma valores com representacoes.escalaConsolidada.
 */
import { ControleFrequenciaRow, FrequenciaCelula, Legenda } from "../types";
import {
  contaParaAA,
  getRepresentacaoConsolidada,
  getValorMeiaDiaria,
  normalizeLegenda,
} from "./legendaModel";

/** Índice de legendas por sigla, representação semanal e consolidada. */
export function buildLegendaLookup(legendas: Legenda[]): Map<string, Legenda> {
  const map = new Map<string, Legenda>();
  for (const raw of legendas) {
    const l = normalizeLegenda(raw);
    if (l.ativo === false) continue;
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
  let key = String(valor || "").trim();
  if (!key) return undefined;
  if (key === "-") key = "A";
  return lookup.get(key.toUpperCase()) || lookup.get(key);
}

/** True se a legenda tem representação válida para o Controle de Frequência. */
export function hasRepresentacaoControleFrequencia(
  legenda: Legenda | undefined | null
): boolean {
  if (!legenda) return false;
  return Boolean(getRepresentacaoConsolidada(legenda));
}

/**
 * Converte código da escala para representação do Controle de Frequência.
 * Sem representacoes.escalaConsolidada → string vazia (não reutiliza a sigla).
 */
export function convertEscalaValorToFrequencia(
  escalaValor: string,
  lookup: Map<string, Legenda>
): string {
  let raw = String(escalaValor || "").trim();
  if (!raw) return "";
  if (raw === "-") raw = "A";
  const legenda = findLegendaForValor(raw, lookup);
  if (!legenda) return "";
  return getRepresentacaoConsolidada(legenda) || "";
}

/**
 * Legenda de afastamento (identificador atual: sigla "A").
 * O valor exibido vem da representação configurada — não é hardcoded na célula.
 */
export function findLegendaAfastamento(legendas: Legenda[]): Legenda | undefined {
  const ativos = legendas
    .map((l) => normalizeLegenda(l))
    .filter((l) => l.ativo !== false && l.sigla);
  return ativos.find((l) => l.sigla.trim().toUpperCase() === "A");
}

/** Representação do afastamento no Controle de Frequência (ou "" se não configurada). */
export function getValorAfastamentoControleFrequencia(
  legendas: Legenda[]
): string {
  const leg = findLegendaAfastamento(legendas);
  if (!leg) return "";
  return getRepresentacaoConsolidada(leg) || "";
}

/** Lista valores permitidos no Controle (apenas consolidada configurada). */
export function listValoresControleFrequencia(legendas: Legenda[]): string[] {
  const set = new Set<string>();
  for (const raw of legendas) {
    const l = normalizeLegenda(raw);
    if (l.ativo === false) continue;
    const cons = getRepresentacaoConsolidada(l);
    if (cons) set.add(cons);
  }
  return Array.from(set).sort();
}

/**
 * Legenda válida para cálculo: célula deve exibir a representação consolidada.
 */
export function findLegendaParaCalculoFrequencia(
  valorCelula: string,
  lookup: Map<string, Legenda>
): Legenda | undefined {
  let raw = String(valorCelula || "").trim();
  if (!raw) return undefined;
  if (raw === "-") raw = "A";
  const legenda = findLegendaForValor(raw, lookup);
  if (!legenda) return undefined;
  const cons = getRepresentacaoConsolidada(legenda);
  if (!cons) return undefined;
  if (raw.toUpperCase() !== cons.toUpperCase()) return undefined;
  return legenda;
}

export function calcMeiaDiariaFromCelulas(
  dias: Record<string, FrequenciaCelula>,
  lookup: Map<string, Legenda>
): number {
  let total = 0;
  for (const cel of Object.values(dias)) {
    if (!cel?.valor?.trim()) continue;
    const legenda = findLegendaParaCalculoFrequencia(cel.valor, lookup);
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
    const legenda = findLegendaParaCalculoFrequencia(cel.valor, lookup);
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
