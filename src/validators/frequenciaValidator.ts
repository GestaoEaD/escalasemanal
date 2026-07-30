/**
 * Validações de conteúdo/status/acesso do Controle de Frequência.
 */
import { EscalaStatus, Usuario } from "../types";
import { normalizeEscalaStatus } from "../utils/approvalService";
import { PermissionError } from "../utils/permissionGuards";
import { isAdministrador, isGerente, isGestor, isOperador } from "../utils/permissions";
import { normalizeSecaoId, usuarioSecaoId } from "../utils/secaoContext";

/** Garante que o Controle de Frequência está em status que permite edição. */
export function assertFrequenciaEditable(status: EscalaStatus | null | undefined): void {
  const st = normalizeEscalaStatus(status);
  if (st !== "em_edicao" && st !== "revisao_solicitada") {
    throw new PermissionError(
      `Controle de Frequência não pode ser editado no status atual (${st}).`
    );
  }
}

/**
 * Operador só acessa a própria Seção no Controle de Frequência.
 * Admin/Gestor/Gerente acessam qualquer Seção da(s) Divisão(ões) permitida(s).
 */
export function assertOperadorSecaoPropria(
  usuario: Usuario | null | undefined,
  secaoId: string
): void {
  if (isGerente(usuario) || isAdministrador(usuario) || isGestor(usuario)) return;

  if (!isOperador(usuario)) {
    throw new PermissionError("Perfil sem acesso ao Controle de Frequência.");
  }

  const target = normalizeSecaoId(secaoId);
  if (!target || usuarioSecaoId(usuario) !== target) {
    throw new PermissionError(
      "Operador só pode acessar a própria Seção no Controle de Frequência."
    );
  }
}
