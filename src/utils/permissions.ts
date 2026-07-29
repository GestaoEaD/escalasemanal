/**
 * Matriz final de permissões.
 *
 * - Gerente: global (todas as Divisões e módulos administrativos globais).
 * - Administrador: administração da própria Divisão.
 * - Gestor: aprova na própria Divisão (todas as Seções).
 * - Operador: edita/envia na própria Divisão (todas as Seções).
 *
 * `secaoId` identifica lotação e documento selecionado, mas NÃO restringe
 * o acesso dentro da própria Divisão.
 */
import { EscalaStatus, PerfilUsuario, Usuario } from "../types";
import { WeekInfo } from "./dateUtils";
import { normalizeRe } from "./reUtils";
import { normalizeDivisaoId } from "./divisaoIds";

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

export function isGerente(usuario: Usuario | null | undefined): boolean {
  return getPerfil(usuario) === "Gerente";
}

/** Gerente navega entre qualquer Divisão. */
export function canAccessAnyDivisao(usuario: Usuario | null | undefined): boolean {
  return isGerente(usuario);
}

/** CRUD de Divisões — somente Gerente. */
export function canManageDivisoes(usuario: Usuario | null | undefined): boolean {
  return isGerente(usuario);
}

/** Entrada na área de Configurações (Admin da Divisão ou Gerente). */
export function canAccessConfig(usuario: Usuario | null | undefined): boolean {
  return isAdministrador(usuario) || isGerente(usuario);
}

/** Cadastros da Divisão: Colaboradores e Postos (Seções nascem em Divisões). */
export function canManageCadastrosDivisao(
  usuario: Usuario | null | undefined
): boolean {
  return isAdministrador(usuario) || isGerente(usuario);
}

/** Alias histórico — Seções passam a ser geridas dentro de Divisões. */
export function canManageSecoes(usuario: Usuario | null | undefined): boolean {
  return canManageCadastrosDivisao(usuario);
}

/** Gerenciamento de usuários/perfis (Admin da Divisão ou Gerente). */
export function canManageUsuarios(usuario: Usuario | null | undefined): boolean {
  return isAdministrador(usuario) || isGerente(usuario);
}

/** Legendas globais — somente Gerente. */
export function canManageLegendasGlobais(
  usuario: Usuario | null | undefined
): boolean {
  return isGerente(usuario);
}

/** Configurações Gerais — somente Gerente. */
export function canEditConfigGerais(usuario: Usuario | null | undefined): boolean {
  return isGerente(usuario);
}

/** Central de Testes / diagnósticos — somente Gerente. */
export function canAccessTestCenter(usuario: Usuario | null | undefined): boolean {
  return isGerente(usuario);
}

/** Logs: Gerente (global) ou Administrador (própria Divisão). */
export function canViewLogs(usuario: Usuario | null | undefined): boolean {
  return isGerente(usuario) || isAdministrador(usuario);
}

/**
 * Enviar para aprovação: Operador, Administrador ou Gerente.
 * Gestor não envia (só aprova).
 */
export function canSubmitForApproval(usuario: Usuario | null | undefined): boolean {
  if (!usuario) return false;
  if (isGestor(usuario)) return false;
  return isOperador(usuario) || isAdministrador(usuario) || isGerente(usuario);
}

/** Cancelar solicitação: quem pode enviar + status aguardando. */
export function canCancelApprovalRequest(
  usuario: Usuario | null | undefined,
  status: EscalaStatus | undefined | null
): boolean {
  return (
    canSubmitForApproval(usuario) &&
    (status || "em_edicao") === "aguardando_aprovacao"
  );
}

/** Pode aprovar ou solicitar revisão — Gestor (ou Gerente atuando como aprovador). */
export function canApproveScales(usuario: Usuario | null | undefined): boolean {
  return isGestor(usuario) || isGerente(usuario);
}

/** Pode reabrir escala aprovada. */
export function canReopenApprovedScale(
  usuario: Usuario | null | undefined,
  status: EscalaStatus | undefined | null
): boolean {
  return canApproveScales(usuario) && (status || "em_edicao") === "aprovada";
}

/** Exportação de escala (todos os perfis autenticados). */
export function canExportScale(usuario: Usuario | null | undefined): boolean {
  return Boolean(usuario?.re);
}

/** Semana é atual ou futura (comparado com o horário local). */
export function isWeekCurrentOrFuture(week: WeekInfo, today: Date = new Date()): boolean {
  const end = new Date(week.endDate);
  end.setHours(23, 59, 59, 999);
  return end >= today;
}

/**
 * Pode editar o conteúdo da escala.
 * - Aprovada / Aguardando: ninguém edita conteúdo.
 * - Gestor: nunca edita conteúdo.
 * - Gerente / Administrador: qualquer período editável.
 * - Operador: semana atual/futura editável (qualquer Seção da Divisão).
 */
export function canEditScale(
  usuario: Usuario | null | undefined,
  week: WeekInfo,
  status: EscalaStatus | undefined | null,
  today: Date = new Date()
): boolean {
  if (!usuario) return false;
  if (isGestor(usuario)) return false;

  const st = status === "rejeitada" ? "revisao_solicitada" : status || "em_edicao";
  if (st === "aprovada" || st === "aguardando_aprovacao") return false;

  if (isAdministrador(usuario) || isGerente(usuario)) {
    return true;
  }

  if (!isWeekCurrentOrFuture(week, today)) return false;
  return st === "em_edicao" || st === "revisao_solicitada";
}

export function canEditFrequencia(
  usuario: Usuario | null | undefined,
  ano: number,
  mes: number,
  status: EscalaStatus | undefined | null,
  today: Date = new Date()
): boolean {
  if (!usuario) return false;
  if (isGestor(usuario)) return false;

  const st = status === "rejeitada" ? "revisao_solicitada" : status || "em_edicao";
  if (st === "aprovada" || st === "aguardando_aprovacao") return false;

  if (isAdministrador(usuario) || isGerente(usuario)) return true;

  const monthEnd = new Date(ano, mes, 0);
  monthEnd.setHours(23, 59, 59, 999);
  if (monthEnd < today) return false;
  return st === "em_edicao" || st === "revisao_solicitada";
}

/**
 * Acesso a documento de escala/frequência por Seção.
 * Dentro da própria Divisão, Operador/Gestor/Admin acessam qualquer Seção.
 * Somente Gerente cruza Divisões.
 */
export function canAccessSecaoScale(
  usuario: Usuario | null | undefined,
  secaoId: string,
  divisaoId?: string
): boolean {
  if (!usuario?.re) return false;
  if (isGerente(usuario)) return true;
  if (divisaoId && normalizeDivisaoId(usuario.divisaoId) !== normalizeDivisaoId(divisaoId)) {
    return false;
  }
  return Boolean(String(secaoId || "").trim());
}

/** Confirmação de RE do aprovador (Gestor/Gerente). */
export function confirmGestorRe(usuario: Usuario, typedRe: string): boolean {
  if (!canApproveScales(usuario)) return false;
  return normalizeRe(typedRe) === normalizeRe(usuario.re);
}

/** Admin só gerencia a própria Divisão; Gerente qualquer. */
export function canManageUsuarioInDivisao(
  actor: Usuario | null | undefined,
  targetDivisaoId: string
): boolean {
  if (!actor) return false;
  if (isGerente(actor)) return true;
  if (!isAdministrador(actor)) return false;
  return normalizeDivisaoId(actor.divisaoId) === normalizeDivisaoId(targetDivisaoId);
}

/** Pode atribuir perfil Gerente (somente Gerente). */
export function canAssignGerente(actor: Usuario | null | undefined): boolean {
  return isGerente(actor);
}

/** Perfis que o ator pode atribuir a outro usuário. */
export function assignablePerfis(
  actor: Usuario | null | undefined
): PerfilUsuario[] {
  if (isGerente(actor)) {
    return ["Operador", "Gestor", "Administrador", "Gerente"];
  }
  if (isAdministrador(actor)) {
    return ["Operador", "Gestor", "Administrador"];
  }
  return [];
}
