/**
 * Normalização e comparação de nomes de seção (cadastro ↔ relatórios).
 */
import { isColaboradorAtivo } from "./ativoFlag";

export function normalizeSecaoNome(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave de comparação tolerante: minúsculas, sem acentos, só alfanuméricos.
 * Ex.: "Seç Gest Educ" ≈ "Sec Gest Educ" ≈ "SEÇ  GEST  EDUC"
 */
export function foldSecaoKey(value: unknown): string {
  return normalizeSecaoNome(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");
}

/** Compara seções ignorando espaços, caixa e acentos. */
export function secoesIguais(a: unknown, b: unknown): boolean {
  const ka = foldSecaoKey(a);
  const kb = foldSecaoKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

/** Colaborador ativo pertencente à seção informada. */
export function colaboradorNaSecao(
  colaborador: { secao?: string; ativo?: unknown },
  secao: string
): boolean {
  if (!isColaboradorAtivo(colaborador)) return false;
  return secoesIguais(colaborador.secao, secao);
}
