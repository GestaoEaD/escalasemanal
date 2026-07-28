/**
 * Normalização do flag ativo/inativo do cadastro.
 * Ausência ou valores ambíguos = ativo (compatível com cadastros legados).
 */

export function normalizeAtivoFlag(value: unknown): boolean {
  if (value === false || value === 0 || value === "false" || value === "0") {
    return false;
  }
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (s === "não" || s === "nao" || s === "inativo" || s === "inactive") {
    return false;
  }
  return true;
}

export function isColaboradorAtivo(colaborador: { ativo?: unknown }): boolean {
  return normalizeAtivoFlag(colaborador.ativo);
}
