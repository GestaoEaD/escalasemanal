/**
 * Validações de cadastro de Seção.
 */
import { Secao } from "../types";

/** Garante campos mínimos de uma Seção: id, nome, codigo, divisaoId. */
export function assertSecao(
  secao: Partial<Secao> | null | undefined
): asserts secao is Secao {
  const id = String(secao?.id ?? "").trim();
  if (!id) throw new Error("Seção inválida: id é obrigatório.");

  const nome = String(secao?.nome ?? "").trim();
  if (!nome) throw new Error("Seção inválida: nome é obrigatório.");

  const codigo = String(secao?.codigo ?? "").trim();
  if (!codigo) throw new Error("Seção inválida: código é obrigatório.");

  const divisaoId = String(secao?.divisaoId ?? "").trim();
  if (!divisaoId) throw new Error("Seção inválida: divisaoId é obrigatório.");
}

/**
 * Garante que, após excluir/inativar `excludingId`, ainda reste ao menos uma
 * Seção ativa entre as informadas (mesma Divisão).
 */
export function assertDivisaoTemSecaoAtiva(
  secoesDaDivisao: Secao[],
  excludingId?: string
): void {
  const restantesAtivas = secoesDaDivisao.filter(
    (s) => s.id !== excludingId && s.ativo !== false
  );
  if (restantesAtivas.length === 0) {
    throw new Error("Cada Divisão precisa de pelo menos uma Seção ativa.");
  }
}
