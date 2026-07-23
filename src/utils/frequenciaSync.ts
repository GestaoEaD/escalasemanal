/**
 * Sincronização Escala Alteração > Escala Semanal → Controle de Frequência.
 */
import {
  Colaborador,
  ControleFrequenciaDocument,
  ControleFrequenciaObservacao,
  ControleFrequenciaRow,
  EscalaDocument,
  FrequenciaCelula,
  FrequenciaCelulaOrigem,
  Legenda,
  ScheduleRow,
  Usuario,
} from "../types";
import { getWeeksForYear, WeekInfo } from "./dateUtils";
import {
  buildLegendaLookup,
  convertEscalaValorToFrequencia,
  getValorAfastamentoControleFrequencia,
  recalcRowTotais,
} from "./frequenciaCalculo";
import {
  dayKey,
  daysInMonth,
  formatNowParts,
  jsDowToEscalaField,
} from "./frequenciaIds";
import { reEquals } from "./reUtils";

function emptyCelula(): FrequenciaCelula {
  return {
    valor: "",
    origem: "vazio",
    editadoManualmente: false,
  };
}

function emptyDias(ano: number, mes: number): Record<string, FrequenciaCelula> {
  const n = daysInMonth(ano, mes);
  const dias: Record<string, FrequenciaCelula> = {};
  for (let d = 1; d <= n; d++) {
    dias[dayKey(d)] = emptyCelula();
  }
  return dias;
}

/** Semanas do calendário do sistema que intersectam o mês. */
export function getWeeksOverlappingMonth(
  ano: number,
  mes: number
): WeekInfo[] {
  const monthStart = new Date(ano, mes - 1, 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(ano, mes, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const weeks: WeekInfo[] = [
    ...getWeeksForYear(ano - 1),
    ...getWeeksForYear(ano),
    ...getWeeksForYear(ano + 1),
  ];

  return weeks.filter((w) => {
    const start = new Date(w.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(w.endDate);
    end.setHours(23, 59, 59, 999);
    return start <= monthEnd && end >= monthStart;
  });
}

function findRowByRe(rows: ScheduleRow[] | undefined, re: string): ScheduleRow | undefined {
  if (!rows) return undefined;
  return rows.find((r) => reEquals(r.re, re));
}

function cellValueFromSchedule(
  row: ScheduleRow | undefined,
  field: ReturnType<typeof jsDowToEscalaField>
): string {
  if (!row) return "";
  const v = String((row as unknown as Record<string, string>)[field] || "").trim();
  if (!v) return "";
  if (v === "-") return "A";
  return v;
}

export type ScaleDocsByWeek = Record<
  string,
  { semanal?: EscalaDocument | null; alteracao?: EscalaDocument | null }
>;

/**
 * Monta/atualiza linhas sincronizadas preservando edições manuais.
 * - Conversão só via representacoes.escalaConsolidada
 * - Sáb/dom: afastamento configurado (legenda A → representação CF) se não houver valor válido
 */
export function syncFrequenciaRows(options: {
  ano: number;
  mes: number;
  secao: string;
  colaboradores: Colaborador[];
  legendas: Legenda[];
  scaleDocs: ScaleDocsByWeek;
  existingRows?: ControleFrequenciaRow[];
}): { rows: ControleFrequenciaRow[]; sourceWeeks: string[] } {
  const { ano, mes, secao, legendas, scaleDocs } = options;
  const lookup = buildLegendaLookup(legendas);
  const afastamentoValor = getValorAfastamentoControleFrequencia(legendas);
  const weeks = getWeeksOverlappingMonth(ano, mes);
  const sourceWeeks = weeks.map((w) => w.id);

  const existingByRe = new Map(
    (options.existingRows || []).map((r) => [r.re, r])
  );

  const cols = options.colaboradores
    .filter((c) => c.secao === secao && c.ativo !== false)
    .slice()
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  const nDays = daysInMonth(ano, mes);
  const rows: ControleFrequenciaRow[] = cols.map((col) => {
    const prev = existingByRe.get(col.re);
    const dias: Record<string, FrequenciaCelula> = prev
      ? { ...emptyDias(ano, mes), ...prev.dias }
      : emptyDias(ano, mes);

    for (let d = 1; d <= nDays; d++) {
      const key = dayKey(d);
      const existing = dias[key];
      if (existing?.editadoManualmente) {
        continue;
      }

      const date = new Date(ano, mes - 1, d);
      const jsDow = date.getDay();
      const isWeekend = jsDow === 0 || jsDow === 6;
      const field = jsDowToEscalaField(jsDow);
      const week = weeks.find((w) => {
        const start = new Date(w.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(w.endDate);
        end.setHours(23, 59, 59, 999);
        const cur = new Date(date);
        cur.setHours(12, 0, 0, 0);
        return cur >= start && cur <= end;
      });

      let valor = "";
      let origem: FrequenciaCelulaOrigem = "vazio";
      let valorEscalaOriginal: string | undefined;

      if (week) {
        const pair = scaleDocs[week.id] || {};
        const altRow = findRowByRe(pair.alteracao?.rows, col.re);
        const semRow = findRowByRe(pair.semanal?.rows, col.re);
        const altVal = cellValueFromSchedule(altRow, field);
        const semVal = cellValueFromSchedule(semRow, field);

        if (altVal) {
          const converted = convertEscalaValorToFrequencia(altVal, lookup);
          valorEscalaOriginal = altVal;
          if (converted) {
            valor = converted;
            origem = "escala_alteracao";
          }
        } else if (semVal) {
          const converted = convertEscalaValorToFrequencia(semVal, lookup);
          valorEscalaOriginal = semVal;
          if (converted) {
            valor = converted;
            origem = "escala_semanal";
          }
        }
      }

      // Fim de semana sem lançamento válido → afastamento configurado
      if (!valor && isWeekend && afastamentoValor) {
        dias[key] = {
          valor: afastamentoValor,
          origem: "padrao_fim_semana",
          editadoManualmente: false,
          ...(valorEscalaOriginal
            ? { valorEscalaOriginal }
            : {}),
        };
        continue;
      }

      if (!valor) {
        dias[key] = emptyCelula();
        continue;
      }

      dias[key] = {
        valor,
        origem,
        editadoManualmente: false,
        ...(valorEscalaOriginal ? { valorEscalaOriginal } : {}),
      };
    }

    const base: ControleFrequenciaRow = {
      re: col.re,
      postoGrad: col.postoGrad,
      nome: col.nome,
      secao: col.secao,
      ordem: col.ordem,
      dias,
      meiaDiaria: 0,
      aa: 0,
    };
    return recalcRowTotais(base, lookup);
  });

  return { rows, sourceWeeks };
}

/**
 * Observações sincronizadas por RE (Alteração > Semanal), preservando manuais/editadas.
 */
export function syncFrequenciaObservacoes(options: {
  colaboradores: Colaborador[];
  secao: string;
  scaleDocs: ScaleDocsByWeek;
  sourceWeeks: string[];
  existing?: ControleFrequenciaObservacao[];
  usuario: Usuario;
}): ControleFrequenciaObservacao[] {
  const { usuario } = options;
  const { data, hora } = formatNowParts();
  const stamp = `${data} ${hora}`;

  const existing = options.existing || [];
  const preserved = existing.filter(
    (o) =>
      o.excluido ||
      o.origem === "manual" ||
      Boolean(o.editadoPor) ||
      Boolean(o.editadoEm)
  );

  const cols = options.colaboradores.filter(
    (c) => c.secao === options.secao && c.ativo !== false
  );

  const synced: ControleFrequenciaObservacao[] = [];

  for (const col of cols) {
    // Já tem observação preservada para este RE?
    const hasPreserved = preserved.some(
      (o) => !o.excluido && o.re && reEquals(o.re, col.re)
    );
    if (hasPreserved) continue;

    let texto = "";
    let origem: ControleFrequenciaObservacao["origem"] = "escala_semanal";

    // Prioridade: última semana do mês com observação na alteração, senão semanal
    for (const weekId of [...options.sourceWeeks].reverse()) {
      const pair = options.scaleDocs[weekId];
      if (!pair) continue;
      const alt = findRowByRe(pair.alteracao?.rows, col.re);
      const altObs = alt?.observacao?.trim();
      if (altObs) {
        texto = altObs;
        origem = "escala_alteracao";
        break;
      }
    }
    if (!texto) {
      for (const weekId of [...options.sourceWeeks].reverse()) {
        const pair = options.scaleDocs[weekId];
        if (!pair) continue;
        const sem = findRowByRe(pair.semanal?.rows, col.re);
        const semObs = sem?.observacao?.trim();
        if (semObs) {
          texto = semObs;
          origem = "escala_semanal";
          break;
        }
      }
    }

    if (!texto) continue;

    // Evitar duplicar se já existe texto idêntico não excluído
    const dup = existing.some(
      (o) =>
        !o.excluido &&
        o.re &&
        reEquals(o.re, col.re) &&
        o.texto.trim() === texto &&
        o.origem !== "manual" &&
        !o.editadoPor
    );
    if (dup) continue;

    synced.push({
      id: `obs_${col.re}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      texto,
      origem,
      re: col.re,
      criadoPor: `${usuario.postoGrad} ${usuario.nome} (${usuario.re})`,
      criadoEm: stamp,
    });
  }

  // Remove sync antigas não preservadas do mesmo tipo (substituídas)
  const keptExisting = existing.filter((o) => {
    if (o.excluido || o.origem === "manual" || o.editadoPor || o.editadoEm) {
      return true;
    }
    // sync antiga: manter só se não houve novo sync para o mesmo RE
    if (o.re && synced.some((s) => reEquals(s.re || "", o.re || ""))) {
      return false;
    }
    return true;
  });

  return [...keptExisting, ...synced];
}

export function buildEmptyControleDocument(options: {
  id: string;
  ano: number;
  mes: number;
  secao: string;
}): ControleFrequenciaDocument {
  return {
    id: options.id,
    ano: options.ano,
    mes: options.mes,
    secao: options.secao,
    status: "em_edicao",
    versao: 1,
    aprovacao: null,
    historico: [],
    rows: [],
    observacoes: [],
    lastSaved: null,
    responsavelEdicao: null,
    responsavelAprovacao: null,
  };
}
