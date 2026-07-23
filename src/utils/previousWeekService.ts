import { db, doc, getDoc } from "../firebase";
import { EscalaDocument, ScheduleRow, Usuario } from "../types";
import { getPreviousWeekRef } from "./dateUtils";
import { applyWeekendDefault, cleanScheduleRow } from "./escalaPayload";
import { findUndefinedPaths } from "./firestoreSanitize";
import { registerAuditOperation } from "./auditService";

export type PreviousWeekLoadResult =
  | {
      status: "found";
      ref: ReturnType<typeof getPreviousWeekRef>;
      rows: ScheduleRow[];
    }
  | {
      status: "empty";
      ref: ReturnType<typeof getPreviousWeekRef>;
      rows: ScheduleRow[];
    }
  | {
      status: "error";
      message: string;
      ref?: ReturnType<typeof getPreviousWeekRef>;
    };

const AUTO_SYSTEM_USER_OBSERVACAO = /^usu[aá]rio do sistema$/i;

function sanitizeRowObservacao(observacao?: string): string {
  if (!observacao?.trim()) return "";
  return AUTO_SYSTEM_USER_OBSERVACAO.test(observacao.trim()) ? "" : observacao;
}

/** Prepara linhas da semana anterior para edição local da semana atual (sem gravar). */
export function preparePreviousWeeklyRowsForEditor(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.map((row) => {
    const cleaned = cleanScheduleRow({
      ...row,
      observacao: sanitizeRowObservacao(row.observacao),
    });
    return applyWeekendDefault(cleaned);
  });
}

/**
 * Resolve a referência e lê `escalas_semanais/{id}` apenas.
 * Nunca cria documento, nunca grava, nunca preenche EN fictício.
 */
export async function fetchPreviousWeeklyScale(
  currentYear: number,
  currentWeekNumber: number
): Promise<PreviousWeekLoadResult> {
  let ref: ReturnType<typeof getPreviousWeekRef>;
  try {
    ref = getPreviousWeekRef(currentYear, currentWeekNumber);
  } catch (e: any) {
    return {
      status: "error",
      message: e?.message || "Não foi possível calcular a semana anterior.",
    };
  }

  try {
    const snap = await getDoc(doc(db, "escalas_semanais", ref.id));
    if (!snap.exists()) {
      return { status: "empty", ref, rows: [] };
    }
    const data = snap.data() as EscalaDocument;
    const rawRows = Array.isArray(data.rows) ? data.rows : [];
    const rows = preparePreviousWeeklyRowsForEditor(rawRows);
    const undefinedPaths = findUndefinedPaths(rows);
    if (undefinedPaths.length > 0) {
      console.error("[previousWeek] undefined em linhas preparadas:", undefinedPaths);
      return {
        status: "error",
        ref,
        message: "Os dados da semana anterior contêm campos inválidos e não puderam ser carregados.",
      };
    }
    if (rows.length === 0) {
      return { status: "empty", ref, rows: [] };
    }
    return { status: "found", ref, rows };
  } catch (e: any) {
    console.error("[previousWeek] falha ao ler Firestore:", e);
    return {
      status: "error",
      ref,
      message: "Não foi possível consultar a semana anterior. Tente novamente.",
    };
  }
}

export async function auditLoadPreviousWeek(options: {
  usuario: Usuario;
  currentYear: number;
  currentWeek: number;
  previousYear: number;
  previousWeek: number;
  resultado: "carregado" | "cancelado" | "sem_dados" | "erro";
  detalhes?: string;
}): Promise<void> {
  try {
    await registerAuditOperation({
      tipo: "LOAD_PREVIOUS_WEEK_DATA",
      escala: "SEMANAL",
      usuario: options.usuario,
      ano: options.currentYear,
      semana: options.currentWeek,
      anoSemana: `${options.currentYear}_${String(options.currentWeek).padStart(2, "0")}`,
      detalhes: [
        `Resultado: ${options.resultado}`,
        `Semana atual: ${options.currentWeek}/${options.currentYear}`,
        `Semana anterior: ${options.previousWeek}/${options.previousYear}`,
        options.detalhes || "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  } catch (err) {
    console.warn("[previousWeek] falha ao auditar:", err);
  }
}
