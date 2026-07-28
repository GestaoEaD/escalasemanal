/**
 * Normalização e comparação de nomes de seção (cadastro ↔ relatórios).
 */

export function normalizeSecaoNome(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compara seções ignorando espaços extras (mantém acentos/caixa). */
export function secoesIguais(a: unknown, b: unknown): boolean {
  return normalizeSecaoNome(a) === normalizeSecaoNome(b);
}

/** Colaborador ativo pertencente à seção informada. */
export function colaboradorNaSecao(
  colaborador: { secao?: string; ativo?: boolean },
  secao: string
): boolean {
  return colaborador.ativo !== false && secoesIguais(colaborador.secao, secao);
}
