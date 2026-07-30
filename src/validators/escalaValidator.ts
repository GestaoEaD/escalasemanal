/**
 * Validações de conteúdo/status de documentos de Escala (Semanal / Alteração).
 */
import { EscalaStatus, ScheduleRow } from "../types";
import { normalizeEscalaStatus } from "../utils/approvalService";
import { PermissionError } from "../utils/permissionGuards";

/** Garante que o documento está em um status que permite edição de conteúdo. */
export function assertEscalaEditable(status: EscalaStatus | null | undefined): void {
  const st = normalizeEscalaStatus(status);
  if (st !== "em_edicao" && st !== "revisao_solicitada") {
    throw new PermissionError(
      `Documento não pode ser editado no status atual (${st}).`
    );
  }
}

/**
 * Valida payload mínimo de um documento de escala (Semanal/Alteração).
 * Escalas pertencem à Divisão — o documento gravado não deve conter `secaoId`.
 */
export function assertEscalaPayload(data: Record<string, unknown>): void {
  const divisaoId = String(data?.divisaoId ?? "").trim();
  if (!divisaoId) {
    throw new Error("Payload de escala inválido: divisaoId é obrigatório.");
  }

  const ano = Number(data?.ano);
  if (!Number.isFinite(ano) || ano < 2000 || ano > 2100) {
    throw new Error("Payload de escala inválido: ano é obrigatório e deve ser válido.");
  }

  const semana = Number(data?.semana);
  if (!Number.isFinite(semana) || semana < 1 || semana > 53) {
    throw new Error("Payload de escala inválido: semana é obrigatória e deve ser válida.");
  }

  if (data && "secaoId" in data && data.secaoId) {
    throw new Error(
      "Payload de escala inválido: o documento não deve conter secaoId (escalas pertencem à Divisão)."
    );
  }
}

/**
 * Verifica se as linhas possuem `secao`/`secaoId` — checagem "soft": documentos
 * legados sem `secaoId` apenas emitem aviso (não lançam erro).
 */
export function assertRowsHaveSecao(
  rows: Array<Partial<ScheduleRow>> | undefined | null
): void {
  if (!Array.isArray(rows)) return;
  rows.forEach((row, index) => {
    const secao = String(row?.secao ?? "").trim();
    const secaoId = String(row?.secaoId ?? "").trim();
    if (!secao && !secaoId) {
      console.warn(`[escalaValidator] Linha ${index} sem secao/secaoId (registro legado).`);
    }
  });
}
