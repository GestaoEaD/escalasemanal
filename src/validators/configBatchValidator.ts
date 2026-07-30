/**
 * Validações leves para o batch atômico de Configurações (colaboradores,
 * usuários, postos, seções, legendas, divisões, gerais).
 */
import { Usuario } from "../types";
import { PermissionError } from "../utils/permissionGuards";
import {
  canEditConfigGerais,
  canManageColaboradores,
  canManageDivisoes,
  canManageLegendasGlobais,
  canManagePostos,
  canManageSecoes,
  canManageUsuarios,
} from "../utils/permissions";

/** Blocos opcionais presentes num batch de Configurações. */
export interface ConfigBatchScope {
  colaboradores?: boolean;
  usuarios?: boolean;
  postos?: boolean;
  secoes?: boolean;
  legendas?: boolean;
  divisoes?: boolean;
  gerais?: boolean;
}

/**
 * Valida, por bloco, se o usuário tem permissão para incluí-lo no batch.
 * Lança PermissionError no primeiro bloco não permitido presente no escopo.
 */
export function validateBatchPermissions(
  usuario: Usuario | null | undefined,
  scope: ConfigBatchScope
): void {
  if (scope.colaboradores && !canManageColaboradores(usuario)) {
    throw new PermissionError("Sem permissão para gerenciar Colaboradores.");
  }
  if (scope.usuarios && !canManageUsuarios(usuario)) {
    throw new PermissionError("Sem permissão para gerenciar Usuários.");
  }
  if (scope.postos && !canManagePostos(usuario)) {
    throw new PermissionError("Sem permissão para gerenciar Postos.");
  }
  if (scope.secoes && !canManageSecoes(usuario)) {
    throw new PermissionError("Sem permissão para gerenciar Seções.");
  }
  if (scope.legendas && !canManageLegendasGlobais(usuario)) {
    throw new PermissionError("Sem permissão para gerenciar Legendas.");
  }
  if (scope.divisoes && !canManageDivisoes(usuario)) {
    throw new PermissionError("Sem permissão para gerenciar Divisões.");
  }
  if (scope.gerais && !canEditConfigGerais(usuario)) {
    throw new PermissionError("Sem permissão para editar Configurações Gerais.");
  }
}
