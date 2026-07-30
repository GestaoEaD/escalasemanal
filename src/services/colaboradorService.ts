/**
 * Service de Colaboradores — único caminho de escrita do cadastro operacional.
 */
import { Colaborador, Usuario } from "../types";
import {
  canManageColaboradores,
  canManageUsuarioInDivisao,
  isGerente,
} from "../utils/permissions";
import { normalizeDivisaoId } from "../utils/divisaoIds";
import { colaboradorDocId } from "../utils/tenantDocIds";
import {
  deleteColaborador,
  listColaboradoresByDivisao,
  listColaboradoresByDivisaoAndSecao,
  moveColaborador,
  saveColaborador,
} from "../repositories/colaboradorRepository";
import { assertColaborador } from "../validators/colaboradorValidator";
import { auditCrudEntidade } from "../utils/auditService";
import { PermissionError } from "../utils/permissionGuards";

function assertCanManage(usuario: Usuario, divisaoId: string): void {
  if (!canManageColaboradores(usuario)) {
    throw new PermissionError("Sem permissão para gerenciar colaboradores.");
  }
  if (!isGerente(usuario) && !canManageUsuarioInDivisao(usuario, divisaoId)) {
    throw new PermissionError("Sem permissão nesta Divisão.");
  }
}

export async function listColaboradoresAcessiveis(
  usuario: Usuario,
  divisaoId: string,
  secaoId?: string
): Promise<Colaborador[]> {
  const d = normalizeDivisaoId(divisaoId);
  if (!isGerente(usuario) && !canManageUsuarioInDivisao(usuario, d)) {
    // Leitura operacional: qualquer perfil da divisão pode listar via rules;
    // service exige mesma divisão.
    if (normalizeDivisaoId(usuario.divisaoId) !== d) {
      throw new PermissionError("Acesso negado a outra Divisão.");
    }
  }
  if (secaoId) return listColaboradoresByDivisaoAndSecao(d, secaoId);
  return listColaboradoresByDivisao(d);
}

export async function persistColaborador(options: {
  usuario: Usuario;
  colaborador: Colaborador;
  oldDocId?: string;
  isNew: boolean;
}): Promise<string> {
  const col = options.colaborador;
  assertColaborador(col);
  const divisaoId = normalizeDivisaoId(col.divisaoId);
  assertCanManage(options.usuario, divisaoId);
  const docId = colaboradorDocId(divisaoId, col.re);
  const payload = { ...col, divisaoId } as unknown as Record<string, unknown>;
  if (options.oldDocId && options.oldDocId !== docId) {
    await moveColaborador(options.oldDocId, docId, payload);
  } else {
    await saveColaborador(docId, payload);
  }
  await auditCrudEntidade({
    usuario: options.usuario,
    tipo: options.isNew ? "CRIAR_COLABORADOR" : "EDITAR_COLABORADOR",
    secaoId: col.secaoId,
    alteracoes: [
      {
        campo: options.isNew ? "Inclusão" : "Edição",
        antes: "",
        depois: `${col.nome} (${col.re})`,
        colaborador: col.nome,
      },
    ],
    detalhes: options.isNew ? "Criação de colaborador" : "Edição de colaborador",
  }).catch(() => undefined);
  return docId;
}

export async function removeColaborador(options: {
  usuario: Usuario;
  colaborador: Colaborador;
  docId?: string;
}): Promise<void> {
  const divisaoId = normalizeDivisaoId(options.colaborador.divisaoId);
  assertCanManage(options.usuario, divisaoId);
  const id =
    options.docId ||
    colaboradorDocId(divisaoId, options.colaborador.re);
  await deleteColaborador(id);
  await auditCrudEntidade({
    usuario: options.usuario,
    tipo: "EXCLUIR_COLABORADOR",
    secaoId: options.colaborador.secaoId,
    alteracoes: [
      {
        campo: "Exclusão",
        antes: options.colaborador.nome,
        depois: "",
        colaborador: options.colaborador.nome,
      },
    ],
    detalhes: "Exclusão de colaborador",
  }).catch(() => undefined);
}
