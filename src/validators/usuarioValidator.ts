/**
 * Validações de cadastro de Usuário.
 * Reexporta helpers existentes de usuarioHelpers para manter um único ponto de
 * importação na camada de validação.
 */
import { Usuario } from "../types";
import { prepareUsuarioDocument, validateUsuarioEmail } from "../utils/usuarioHelpers";
import { isValidRe } from "../utils/reUtils";

export { validateUsuarioEmail, prepareUsuarioDocument };

/** Garante campos mínimos de cadastro: RE, nome, perfil, divisaoId, secaoId. */
export function assertUsuarioCadastro(
  usuario: Partial<Usuario> | null | undefined
): asserts usuario is Usuario {
  const re = String(usuario?.re ?? "").trim();
  if (!re) throw new Error("Usuário inválido: R.E. é obrigatório.");
  if (!isValidRe(re)) {
    throw new Error(
      "Usuário inválido: R.E. deve seguir o formato 000000-0 (verificador pode ser letra)."
    );
  }

  const nome = String(usuario?.nome ?? "").trim();
  if (!nome) throw new Error("Usuário inválido: nome é obrigatório.");

  const perfil = String(usuario?.perfil ?? "").trim();
  if (!perfil) throw new Error("Usuário inválido: perfil é obrigatório.");

  const divisaoId = String(usuario?.divisaoId ?? "").trim();
  if (!divisaoId) throw new Error("Usuário inválido: divisaoId é obrigatório.");

  const secaoId = String(usuario?.secaoId ?? "").trim();
  if (!secaoId) throw new Error("Usuário inválido: secaoId é obrigatório.");
}
