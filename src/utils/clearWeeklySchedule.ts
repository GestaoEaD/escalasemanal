import { EscalaStatus, ScheduleRow, Usuario } from "../types";
import { WeekInfo } from "./dateUtils";
import { canEditScale } from "./permissions";
import { cleanScheduleRow } from "./escalaPayload";
import { findUndefinedPaths } from "./firestoreSanitize";
import { registerAuditOperation } from "./auditService";

/** Valores iniciais dos campos editáveis da Escala Semanal (mesma regra de criação). */
export function getInitialWeeklyEditableFields(): Pick<
  ScheduleRow,
  "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom" | "observacao"
> {
  return {
    seg: "EN",
    ter: "EN",
    qua: "EN",
    qui: "EN",
    sex: "EN",
    sab: "A",
    dom: "A",
    observacao: "",
  };
}

/** Monta uma linha nova com identidade do colaborador + estado inicial editável. */
export function buildInitialWeeklyScheduleRow(identity: {
  re: string;
  postoGrad: string;
  nome: string;
  secao: string;
  observacao?: string;
}): ScheduleRow {
  return cleanScheduleRow({
    re: identity.re,
    postoGrad: identity.postoGrad,
    nome: identity.nome,
    secao: identity.secao,
    ...getInitialWeeklyEditableFields(),
    observacao: identity.observacao?.trim()
      ? identity.observacao
      : "",
  });
}

/**
 * Restaura campos editáveis ao estado inicial, preservando colaboradores.
 * Não grava no Firestore.
 */
export function resetWeeklyRowsToInitialState(rows: ScheduleRow[]): ScheduleRow[] {
  const initial = getInitialWeeklyEditableFields();
  return rows.map((row) =>
    cleanScheduleRow({
      re: row.re,
      postoGrad: row.postoGrad,
      nome: row.nome,
      secao: row.secao,
      ...initial,
    })
  );
}

export type ClearWeeklyScheduleResult =
  | { ok: true; rows: ScheduleRow[] }
  | { ok: false; reason: "sem_permissao" | "aprovada" | "nao_editavel" | "dados_invalidos"; message: string };

/**
 * Aplica limpeza em memória com proteção de permissão/status.
 * Bloqueia escalas aprovadas e qualquer status não editável (ex.: aguardando_aprovacao).
 */
export function clearWeeklySchedule(options: {
  usuario: Usuario;
  week: WeekInfo;
  status: EscalaStatus | null | undefined;
  rows: ScheduleRow[];
}): ClearWeeklyScheduleResult {
  const { usuario, week, status, rows } = options;
  const st = status === "rejeitada" ? "revisao_solicitada" : status || "em_edicao";

  if (st === "aprovada") {
    return {
      ok: false,
      reason: "aprovada",
      message: "Esta escala está aprovada e não pode ser alterada.",
    };
  }

  if (!canEditScale(usuario, week, status)) {
    return {
      ok: false,
      reason: st === "aguardando_aprovacao" ? "nao_editavel" : "sem_permissao",
      message:
        st === "aguardando_aprovacao"
          ? "Esta escala está aguardando aprovação e não pode ser alterada."
          : "Você não possui permissão para limpar esta escala.",
    };
  }

  const cleared = resetWeeklyRowsToInitialState(rows);
  const paths = findUndefinedPaths(cleared);
  if (paths.length > 0) {
    console.error("[clearWeeklySchedule] undefined após limpeza:", paths);
    return {
      ok: false,
      reason: "dados_invalidos",
      message: "Não foi possível limpar a escala devido a dados inválidos.",
    };
  }

  return { ok: true, rows: cleared };
}

export async function auditClearWeeklySchedule(options: {
  usuario: Usuario;
  year: number;
  weekNumber: number;
  resultado: "confirmado" | "cancelado" | "bloqueado" | "erro";
  detalhes?: string;
}): Promise<void> {
  try {
    await registerAuditOperation({
      tipo: "CLEAR_WEEKLY_SCHEDULE",
      escala: "SEMANAL",
      usuario: options.usuario,
      ano: options.year,
      semana: options.weekNumber,
      anoSemana: `${options.year}_${String(options.weekNumber).padStart(2, "0")}`,
      detalhes: [
        `Resultado: ${options.resultado}`,
        `Semana: ${options.weekNumber}/${options.year}`,
        options.detalhes || "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  } catch (err) {
    console.warn("[clearWeeklySchedule] falha ao auditar:", err);
  }
}
