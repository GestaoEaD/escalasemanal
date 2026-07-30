/**
 * Service de Seções — validação de permissão + repository.
 */
import { Secao, Usuario } from "../types";
import { canManageSecoes, canManageUsuarioInDivisao, isGerente } from "../utils/permissions";
import { normalizeDivisaoId } from "../utils/divisaoIds";
import {
  deleteSecao,
  listSecoesByDivisao,
  saveSecao,
} from "../repositories/secaoRepository";
import { auditCrudEntidade } from "../utils/auditService";

export async function listSecoesAcessiveis(
  usuario: Usuario,
  divisaoId: string
): Promise<Secao[]> {
  if (!isGerente(usuario) && !canManageUsuarioInDivisao(usuario, divisaoId)) {
    throw new Error("Sem permissão para listar seções desta Divisão.");
  }
  return listSecoesByDivisao(divisaoId);
}

export async function persistSecao(options: {
  usuario: Usuario;
  secao: Secao;
  isNew: boolean;
}): Promise<void> {
  if (!canManageSecoes(options.usuario)) {
    throw new Error("Sem permissão para gerenciar Seções.");
  }
  const divisaoId = normalizeDivisaoId(options.secao.divisaoId);
  if (!canManageUsuarioInDivisao(options.usuario, divisaoId) && !isGerente(options.usuario)) {
    throw new Error("Sem permissão nesta Divisão.");
  }
  await saveSecao(options.secao);
  await auditCrudEntidade({
    usuario: options.usuario,
    tipo: options.isNew ? "CRIAR_SECAO" : "EDITAR_SECAO",
    alteracoes: [
      {
        campo: options.isNew ? "Inclusão — Seção" : "Edição — Seção",
        antes: "",
        depois: `${options.secao.nome} (${options.secao.codigo})`,
        colaborador: `Seções: ${options.secao.nome}`,
      },
    ],
    detalhes: options.isNew ? "Criação de Seção" : "Edição de Seção",
    secaoId: options.secao.id,
  }).catch(() => undefined);
}

export async function removeSecao(options: {
  usuario: Usuario;
  secao: Secao;
}): Promise<void> {
  if (!canManageSecoes(options.usuario)) {
    throw new Error("Sem permissão para gerenciar Seções.");
  }
  await deleteSecao(options.secao.id);
  await auditCrudEntidade({
    usuario: options.usuario,
    tipo: "EXCLUIR_SECAO",
    alteracoes: [
      {
        campo: "Exclusão — Seção",
        antes: options.secao.nome,
        depois: "",
        colaborador: `Seções: ${options.secao.nome}`,
      },
    ],
    detalhes: "Exclusão de Seção",
    secaoId: options.secao.id,
  }).catch(() => undefined);
}
