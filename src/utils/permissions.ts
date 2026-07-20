import { EscalaStatus, PerfilUsuario, Usuario } from "../types";
import { WeekInfo } from "./dateUtils";
import { normalizeRe } from "./reUtils";

export function getPerfil(usuario: Usuario | null | undefined): PerfilUsuario {
  return usuario?.perfil || "Operador";
}

export function isAdministrador(usuario: Usuario | null | undefined): boolean {
  return getPerfil(usuario) === "Administrador";
}

export function isGestor(usuario: Usuario | null | undefined): boolean {
  return getPerfil(usuario) === "Gestor";
}

export function isOperador(usuario: Usuario | null | undefined): boolean {
  return getPerfil(usuario) === "Operador";
}

/** Acesso às configurações administrativas da plataforma. */
export function canAccessConfig(usuario: Usuario | null | undefined): boolean {
  return isAdministrador(usuario);
}

/** Pode enviar escala para aprovação. */
export function canSubmitForApproval(usuario: Usuario | null | undefined): boolean {
  return isAdministrador(usuario);
}

/** Pode aprovar ou rejeitar escalas. */
export function canApproveScales(usuario: Usuario | null | undefined): boolean {
  return isGestor(usuario);
}

/** Semana é atual ou futura (comparado com o horário local). */
export function isWeekCurrentOrFuture(week: WeekInfo, today: Date = new Date()): boolean {
  const end = new Date(week.endDate);
  end.setHours(23, 59, 59, 999);
  return end >= today;
}

/**
 * Pode editar o conteúdo da escala.
 * - Operador: apenas semana atual/futura e status editável (não aprovada / não aguardando).
 * - Administrador: qualquer semana; inclusive aprovadas (o save reabre o ciclo).
 * - Gestor: nunca edita.
 */
export function canEditScale(
  usuario: Usuario | null | undefined,
  week: WeekInfo,
  status: EscalaStatus | undefined | null,
  today: Date = new Date()
): boolean {
  if (!usuario) return false;
  if (isGestor(usuario)) return false;

  const st = status || "em_edicao";

  if (isAdministrador(usuario)) {
    return true;
  }

  // Operador
  if (!isWeekCurrentOrFuture(week, today)) return false;
  if (st === "aprovada" || st === "aguardando_aprovacao") return false;
  return true;
}

/** Pode exportar PDF/Excel. */
export function canExportScale(usuario: Usuario | null | undefined): boolean {
  return !!usuario;
}

/** Confirmação de RE do gestor autenticado (sem dígito). */
export function confirmGestorRe(usuario: Usuario, typedRe: string): boolean {
  if (!isGestor(usuario)) return false;
  return normalizeRe(typedRe) === normalizeRe(usuario.re);
}
