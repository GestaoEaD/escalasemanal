/**
 * Normaliza o R.E. removendo o dígito/sufixo após o hífen.
 * Ex.: "124342-0" → "124342", "128687-A" → "128687", "124342" → "124342"
 */
export function normalizeRe(re: string): string {
  return String(re || "")
    .trim()
    .replace(/[-\s].*$/, "")
    .toUpperCase();
}

/** Compara dois R.E. ignorando o dígito verificador. */
export function reEquals(a: string, b: string): boolean {
  const na = normalizeRe(a);
  const nb = normalizeRe(b);
  if (!na || !nb) return false;
  return na === nb;
}
