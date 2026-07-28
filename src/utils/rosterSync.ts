/**
 * Sincronização do roster de escalas com o cadastro de colaboradores.
 */
import { Colaborador, EscalaStatus, ScheduleRow } from "../types";
import { isColaboradorAtivo, normalizeAtivoFlag } from "./ativoFlag";
import { buildInitialWeeklyScheduleRow } from "./clearWeeklySchedule";
import { cleanScheduleRow } from "./escalaPayload";
import { normalizeEscalaStatus } from "./approvalService";
import { normalizeRe, reEquals } from "./reUtils";
import { normalizeSecaoNome } from "./secaoMatch";

export function normalizeColaboradorCadastro(raw: Colaborador): Colaborador {
  return {
    ...raw,
    re: String(raw.re || "").trim(),
    postoGrad: String(raw.postoGrad || "").trim(),
    nome: String(raw.nome || "").trim(),
    secao: normalizeSecaoNome(raw.secao),
    observacao: raw.observacao || "",
    ativo: normalizeAtivoFlag(raw.ativo),
    ordem: typeof raw.ordem === "number" ? raw.ordem : Number(raw.ordem) || 0,
  };
}

export function isScheduleRosterEditable(
  status: EscalaStatus | null | undefined
): boolean {
  const s = normalizeEscalaStatus(status);
  return s === "em_edicao" || s === "revisao_solicitada";
}

/** Atualiza posto/nome/seção a partir do cadastro. */
export function applyCadastroToScheduleRows(
  rows: ScheduleRow[],
  pool: Colaborador[]
): ScheduleRow[] {
  return rows.map((row) => {
    const col = pool.find((c) => reEquals(c.re, row.re));
    if (!col) return row;
    return cleanScheduleRow({
      ...row,
      postoGrad: col.postoGrad,
      nome: col.nome,
      secao: normalizeSecaoNome(col.secao),
    });
  });
}

export type RosterSyncResult = {
  rows: ScheduleRow[];
  added: ScheduleRow[];
  removedRes: string[];
  changed: boolean;
};

/**
 * Alinha a escala editável ao cadastro:
 * - inclui colaboradores ativos ausentes
 * - remove inativos (fora das escalas)
 * - atualiza identidade (posto/nome/seção)
 */
export function syncScheduleRosterWithCadastro(
  existing: ScheduleRow[],
  pool: Colaborador[]
): RosterSyncResult {
  const normalizedPool = pool.map(normalizeColaboradorCadastro);
  const activePool = normalizedPool
    .filter((c) => isColaboradorAtivo(c))
    .slice()
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  const removedRes: string[] = [];
  const kept: ScheduleRow[] = [];

  for (const row of existing) {
    const col = normalizedPool.find((c) => reEquals(c.re, row.re));
    if (col && !isColaboradorAtivo(col)) {
      removedRes.push(row.re);
      continue;
    }
    if (col) {
      kept.push(
        cleanScheduleRow({
          ...row,
          postoGrad: col.postoGrad,
          nome: col.nome,
          secao: normalizeSecaoNome(col.secao),
        })
      );
    } else {
      // Mantém linha órfã (RE sumiu do cadastro) para não perder dados sem confirmação.
      kept.push(row);
    }
  }

  const presentKeys = new Set(
    kept.map((r) => normalizeRe(r.re) || String(r.re || "").trim())
  );

  const added: ScheduleRow[] = [];
  for (const col of activePool) {
    const key = normalizeRe(col.re) || col.re;
    if (!key || presentKeys.has(key)) continue;
    if (kept.some((r) => reEquals(r.re, col.re))) continue;
    const row = buildInitialWeeklyScheduleRow({
      re: col.re,
      postoGrad: col.postoGrad,
      nome: col.nome,
      secao: normalizeSecaoNome(col.secao),
      observacao: col.observacao,
    });
    added.push(row);
    kept.push(row);
    presentKeys.add(key);
  }

  const rows = kept;
  const changed =
    added.length > 0 ||
    removedRes.length > 0 ||
    JSON.stringify(rows.map(cleanScheduleRow)) !==
      JSON.stringify(existing.map(cleanScheduleRow));

  return { rows, added, removedRes, changed };
}
