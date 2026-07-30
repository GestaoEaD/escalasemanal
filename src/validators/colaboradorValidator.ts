/**
 * Validações de cadastro de Colaborador.
 */
import { Colaborador } from "../types";
import { isValidRe } from "../utils/reUtils";

/** Garante campos mínimos de um Colaborador: RE, nome, divisaoId, secaoId. */
export function assertColaborador(
  col: Partial<Colaborador> | null | undefined
): asserts col is Colaborador {
  const re = String(col?.re ?? "").trim();
  if (!re) throw new Error("Colaborador inválido: R.E. é obrigatório.");
  if (!isValidRe(re)) {
    throw new Error(
      "Colaborador inválido: R.E. deve seguir o formato 000000-0 (verificador pode ser letra)."
    );
  }

  const nome = String(col?.nome ?? "").trim();
  if (!nome) throw new Error("Colaborador inválido: nome é obrigatório.");

  const divisaoId = String(col?.divisaoId ?? "").trim();
  if (!divisaoId) throw new Error("Colaborador inválido: divisaoId é obrigatório.");

  const secaoId = String(col?.secaoId ?? "").trim();
  if (!secaoId) throw new Error("Colaborador inválido: secaoId é obrigatório.");
}
