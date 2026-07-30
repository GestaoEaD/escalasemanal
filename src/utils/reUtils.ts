/**
 * Utilitários de R.E.
 *
 * Identidade (IDs, maps, presença): use canonicalizeRe — preserva o sufixo.
 * Exibição / confirmação digitada sem dígito: use normalizeRe (base).
 * Comparação: reEquals — não colide "128687-A" com "128687-B".
 */
export function canonicalizeRe(re: string): string {
  return String(re || "").trim().toUpperCase();
}

/**
 * Formato institucional obrigatório: seis algarismos, hífen e um dígito
 * verificador, que pode ser algarismo ou letra (há REs terminados em A ou X).
 */
export const RE_FORMAT_REGEX = /^\d{6}-[0-9A-Z]$/;

export function isValidRe(re: string): boolean {
  return RE_FORMAT_REGEX.test(canonicalizeRe(re));
}

/** Máscara para cadastro: seis algarismos + dígito verificador alfanumérico. */
export function formatReInput(value: string): string {
  const limpo = canonicalizeRe(value).replace(/[^0-9A-Z]/g, "");
  let base = "";
  let i = 0;
  for (; i < limpo.length && base.length < 6; i++) {
    if (limpo[i] >= "0" && limpo[i] <= "9") base += limpo[i];
  }
  if (base.length < 6) return base;
  const verificador = limpo.slice(i, i + 1);
  return verificador ? `${base}-${verificador}` : base;
}

/**
 * Identidade para detectar duplicados, inclusive documentos legados sem hífen
 * ou com sufixo inválido. Os seis primeiros algarismos identificam o militar.
 */
export function reIdentityKey(re: string): string {
  return canonicalizeRe(re).replace(/\D/g, "").slice(0, 6);
}

/**
 * Base do R.E. sem sufixo após hífen/espaço.
 * Ex.: "124342-0" → "124342", "128687-A" → "128687"
 * Uso: exibição e confirmação de RE digitado sem dígito.
 */
export function normalizeRe(re: string): string {
  return canonicalizeRe(re).replace(/[-\s].*$/, "");
}

/**
 * Compara dois R.E. sem colidir sufixos distintos.
 * - "124342-0" === "124342-0"
 * - "124342-0" === "124342" (compat: um sem sufixo)
 * - "128687-A" !== "128687-B"
 */
export function reEquals(a: string, b: string): boolean {
  const ca = canonicalizeRe(a);
  const cb = canonicalizeRe(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;

  const ba = normalizeRe(a);
  const bb = normalizeRe(b);
  if (!ba || ba !== bb) return false;

  const suffixA = ca.includes("-") || ca.includes(" ");
  const suffixB = cb.includes("-") || cb.includes(" ");
  // Ambos com sufixo e strings canônicas diferentes → identidades distintas
  if (suffixA && suffixB) return false;
  // Um com sufixo e outro só a base → compatível (digitação sem dígito)
  return true;
}

/** Chave estável para maps/doc IDs (preserva sufixo; sanitiza path). */
export function reDocKey(re: string): string {
  const c = canonicalizeRe(re);
  if (!c) return "";
  return c.replace(/\//g, "_");
}
