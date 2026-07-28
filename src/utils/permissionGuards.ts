/**
 * Validações de perfil/status usadas pelos services (camada além da UI).
 * Não substitui firestore.rules, mas impede chamadas client forjadas via UI.
 */
import { EscalaStatus, Usuario } from "../types";
import {
  canApproveScales,
  canCancelApprovalRequest,
  canReopenApprovedScale,
  canSubmitForApproval,
  getPerfil,
} from "./permissions";
import { normalizeEscalaStatus } from "./approvalService";

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export function assertUsuario(usuario: Usuario | null | undefined): asserts usuario is Usuario {
  if (!usuario?.re) {
    throw new PermissionError("Usuário não autenticado.");
  }
}

export function assertCanSubmitForApproval(usuario: Usuario): void {
  assertUsuario(usuario);
  if (!canSubmitForApproval(usuario)) {
    throw new PermissionError(
      `Perfil ${getPerfil(usuario)} não pode enviar documentos para aprovação.`
    );
  }
}

export function assertCanApprove(usuario: Usuario): void {
  assertUsuario(usuario);
  if (!canApproveScales(usuario)) {
    throw new PermissionError(
      `Perfil ${getPerfil(usuario)} não pode aprovar ou solicitar revisão.`
    );
  }
}

export function assertCanCancelApproval(
  usuario: Usuario,
  status: EscalaStatus | null | undefined
): void {
  assertUsuario(usuario);
  if (!canCancelApprovalRequest(usuario, status)) {
    throw new PermissionError("Não é permitido cancelar esta solicitação.");
  }
}

export function assertCanReopen(
  usuario: Usuario,
  status: EscalaStatus | null | undefined
): void {
  assertUsuario(usuario);
  if (!canReopenApprovedScale(usuario, status)) {
    throw new PermissionError("Somente Gestor pode reabrir documento aprovado.");
  }
}

export function assertPendingApproval(status: EscalaStatus | null | undefined, label = "documento"): void {
  const st = normalizeEscalaStatus(status);
  if (st !== "aguardando_aprovacao") {
    throw new PermissionError(
      `Este ${label} não está aguardando aprovação (status: ${st}).`
    );
  }
}
