/**
 * IDs de documento das coleções de catálogo (postos, seções, legendas).
 *
 * Essas coleções repetem os mesmos nomes em toda Divisão — "CAP", "TEN",
 * "Seção de Ensino" existem em qualquer uma. Usar só o nome como ID faria a
 * segunda Divisão sobrescrever o documento da primeira, inclusive trocando o
 * divisaoId dele. O ID precisa então ser composto por Divisão + chave.
 */
import { normalizeDivisaoId } from "./divisaoIds";

const SEPARADOR = "__";

/** Normaliza nome/sigla para uso em ID de documento. */
export function slugDocKey(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[ºª]/g, "")
    .replace(/\//g, "-");
}

/** ID de catálogo com escopo de Divisão: `{divisaoId}__{slug}`. */
export function tenantDocId(divisaoId: string, chave: string): string {
  const div = normalizeDivisaoId(divisaoId);
  const slug = slugDocKey(chave);
  return div ? `${div}${SEPARADOR}${slug}` : slug;
}

/** ID de colaborador: `{divisaoId}__{re}`. */
export function colaboradorDocId(divisaoId: string, re: string): string {
  const div = normalizeDivisaoId(divisaoId);
  const registro = slugDocKey(re);
  return div ? `${div}${SEPARADOR}${registro}` : registro;
}

/** Extrai a Divisão de um ID composto; null para IDs legados sem prefixo. */
export function parseTenantDocId(
  docId: string
): { divisaoId: string; chave: string } | null {
  const idx = String(docId || "").indexOf(SEPARADOR);
  if (idx <= 0) return null;
  return {
    divisaoId: docId.slice(0, idx),
    chave: docId.slice(idx + SEPARADOR.length),
  };
}
