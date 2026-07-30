/**
 * Service de Configurações — persistência em lote (colaboradores, usuários,
 * postos, seções, legendas, divisões e configurações gerais) numa única
 * transação atômica, com validação de permissão e auditoria tipada por entidade.
 *
 * Único ponto de escrita para os dados administrativos de `Configuracoes.tsx`.
 * A UI apenas monta os snapshots (current/original) e aplica o resultado.
 */
import {
  Usuario,
  Colaborador,
  Secao,
  Legenda,
  Divisao,
  AuditAlteracao,
  AuditOperacaoTipo,
  DIVISAO_EAD_ID,
} from "../types";
import { Timestamp } from "../firebase";
import {
  batchDelete,
  batchSet,
  commitBatch,
  createWriteBatch,
} from "../repositories/batchRepository";
import { validateBatchPermissions, ConfigBatchScope } from "../validators/configBatchValidator";
import {
  auditAlterarPermissao,
  auditConfiguracao,
  auditCrudEntidade,
} from "../utils/auditService";
import {
  canManageColaboradores,
  canManageDivisoes,
  canManageLegendasGlobais,
  canManagePostos,
  canManageSecoes,
  canManageUsuarios,
  canEditConfigGerais,
  assignablePerfis,
  isGerente,
  isAdministrador,
} from "../utils/permissions";
import { normalizeDivisaoId, divisaoDocId } from "../utils/divisaoIds";
import { colaboradorDocId, tenantDocId } from "../utils/tenantDocIds";
import { legendaDocId, prepareLegendaForFirestore } from "../utils/legendaModel";
import {
  normalizeEmail,
  prepareUsuarioDocument,
  validateUsuarioEmail,
} from "../utils/usuarioHelpers";
import { normalizeSecaoNome, secoesIguais } from "../utils/secaoMatch";
import { normalizeAtivoFlag } from "../utils/ativoFlag";
import { KNOWN_SECAO_CODIGOS } from "../utils/seedData";
import { ensureCatalogoBaseDivisao } from "../utils/seedCatalogoDivisao";
import { cascadeSecaoRename } from "../utils/secaoCascade";
import { upsertAuthIndex, removeAuthIndex } from "../utils/authIndex";
import { isValidRe, reIdentityKey } from "../utils/reUtils";

/** Legenda com escopo de Divisão (campo opcional — legendas hoje são globais). */
export type TenantLegenda = Legenda & { divisaoId?: string };

/** Cadastro de Posto/Graduação (catálogo por Divisão). */
export interface PostoConfigItem {
  sigla: string;
  descricao: string;
  ordem?: number;
  divisaoId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Configurações gerais (identidade visual, exportações). */
export interface GeraisConfig {
  nomeOrganizacao: string;
  unidade: string;
  pdfExportHeader: string;
  excelExportHeader: string;
  tema: string;
  idioma: string;
  updatedAt?: unknown;
}

/** Item de catálogo removido: a chave sozinha não identifica o documento. */
export interface RemocaoCatalogo {
  chave: string;
  divisaoId?: string;
}

export interface SecaoRename {
  id: string;
  from: string;
  to: string;
  divisaoId: string;
}

interface EntityBlock<T> {
  current: T[];
  original: T[];
  removed: string[];
}

interface CatalogBlock<T> {
  current: T[];
  original: T[];
  removed: RemocaoCatalogo[];
}

export interface SaveConfiguracoesBatchOptions {
  usuario: Usuario;
  activeDivisaoId: string;
  colaboradores: EntityBlock<Colaborador>;
  usuarios: EntityBlock<Usuario>;
  postos: CatalogBlock<PostoConfigItem>;
  secoes: CatalogBlock<Secao>;
  legendas: CatalogBlock<TenantLegenda>;
  divisoes: EntityBlock<Divisao>;
  gerais: { current: GeraisConfig; original: GeraisConfig };
  /**
   * Sobrescreve o escopo de permissão inferido via `canManage*` (uso
   * avançado/testes). Por padrão o próprio service calcula cada flag a
   * partir do `usuario`.
   */
  permissoes?: Partial<ConfigBatchScope>;
}

export interface SaveConfiguracoesBatchResult {
  colaboradores: Colaborador[];
  usuarios: Usuario[];
  secaoRenames: SecaoRename[];
}

/** Normaliza campos do colaborador antes de gravar/comparar. */
export function normalizeColaborador(raw: Colaborador | Record<string, unknown>): Colaborador {
  const src = raw as Colaborador;
  return {
    ...src,
    re: String(src.re || "").trim(),
    postoGrad: String(src.postoGrad || ""),
    nome: String(src.nome || ""),
    nomeCompleto: src.nomeCompleto,
    secao: normalizeSecaoNome(src.secao),
    divisaoId: String(src.divisaoId || DIVISAO_EAD_ID),
    email: normalizeEmail(src.email),
    observacao: src.observacao || "",
    ativo: normalizeAtivoFlag(src.ativo),
    ordem: typeof src.ordem === "number" ? src.ordem : Number(src.ordem) || 0,
    createdAt: src.createdAt,
    updatedAt: src.updatedAt,
  };
}

/** Dois nomes de seção vazios são iguais (`secoesIguais` recusa vazios). */
function mesmaSecaoTexto(a: unknown, b: unknown): boolean {
  if (!normalizeSecaoNome(a) && !normalizeSecaoNome(b)) return true;
  return secoesIguais(a, b);
}

/**
 * Garante o acesso básico derivado do cadastro:
 * - colaborador ativo sem usuário recebe perfil Operador automaticamente;
 * - colaborador inativo permanece cadastrado, mas sua permissão fica inativa;
 * - perfis elevados existentes são preservados enquanto o colaborador está ativo.
 *
 * Também alinha seção, identidade e e-mail Google entre colaborador e usuário
 * com o mesmo RE. Preferência: o lado alterado nesta sessão; senão o cadastro
 * de colaborador.
 *
 * O e-mail entra aqui porque é o vínculo de login: se o administrador o corrige
 * apenas em Colaboradores, a permissão precisa acompanhar — do contrário o
 * usuário entra com a conta Google nova e o cadastro continua apontando para a
 * antiga.
 */
export function reconcileColaboradoresUsuarios(
  cols: Colaborador[],
  users: Usuario[],
  origCols: Colaborador[],
  origUsers: Usuario[]
): { colaboradores: Colaborador[]; usuarios: Usuario[] } {
  const colsOut = cols.map((c) => normalizeColaborador(c));
  const usersOut = users.map((u) => ({
    ...u,
    re: String(u.re || "").trim(),
    secao: normalizeSecaoNome(u.secao),
    secaoId: String(u.secaoId || "").trim(),
    email: normalizeEmail(u.email),
  }));

  for (let i = 0; i < colsOut.length; i++) {
    const col = colsOut[i];
    const ui = usersOut.findIndex((u) => u.re === col.re);
    if (ui < 0) {
      // Sem conta Google não há identidade de login. O colaborador continua
      // normalmente no cadastro/escalas e a permissão será criada quando o
      // Gerente ou o Administrador informar o e-mail.
      if (!col.email) continue;
      usersOut.push({
        re: col.re,
        postoGrad: col.postoGrad,
        nomeCompleto: col.nomeCompleto || "",
        nome: col.nome,
        secao: col.secao,
        secaoId: String(col.secaoId || "").trim(),
        divisaoId: col.divisaoId,
        email: col.email,
        perfil: "Operador",
        ativo: normalizeAtivoFlag(col.ativo),
        secoesResponsaveisIds: [],
        authProvider: col.email ? "google" : "local",
        ultimoLogin: null,
        emailVerificado: false,
      });
      continue;
    }

    const usr = usersOut[ui];
    const origCol = origCols.find((c) => c.re === col.re);
    const origUsr = origUsers.find((u) => u.re === usr.re);
    const colSecaoId = String(col.secaoId || "").trim();
    const usrSecaoId = String(usr.secaoId || "").trim();

    const colSecaoChanged =
      Boolean(origCol) &&
      (!mesmaSecaoTexto(col.secao, origCol!.secao) ||
        colSecaoId !== String(origCol!.secaoId || "").trim());
    const usrSecaoChanged =
      Boolean(origUsr) &&
      (!mesmaSecaoTexto(usr.secao, origUsr!.secao) ||
        usrSecaoId !== String(origUsr!.secaoId || "").trim());

    let secao = col.secao;
    let secaoId = colSecaoId;
    if (usrSecaoChanged && !colSecaoChanged) {
      secao = normalizeSecaoNome(usr.secao);
      secaoId = usrSecaoId;
    } else if (colSecaoChanged) {
      secao = normalizeSecaoNome(col.secao);
      secaoId = colSecaoId;
    } else if (!mesmaSecaoTexto(col.secao, usr.secao) || colSecaoId !== usrSecaoId) {
      secao = normalizeSecaoNome(col.secao || usr.secao);
      secaoId = colSecaoId || usrSecaoId;
    }

    const colEmailChanged =
      Boolean(origCol) && col.email !== normalizeEmail(origCol!.email);
    const usrEmailChanged =
      Boolean(origUsr) && usr.email !== normalizeEmail(origUsr!.email);

    let email = usr.email;
    if (usrEmailChanged && !colEmailChanged) {
      email = usr.email;
    } else if (colEmailChanged) {
      email = col.email;
    } else if (!usr.email) {
      // Permissão legada sem e-mail herda o do cadastro para liberar o login.
      email = col.email;
    }

    colsOut[i] = { ...col, secao, secaoId, email: email || col.email };
    usersOut[ui] = {
      ...usr,
      secao,
      secaoId,
      email,
      nome: col.nome || usr.nome,
      postoGrad: col.postoGrad || usr.postoGrad,
      nomeCompleto: col.nomeCompleto || usr.nomeCompleto,
      // A situação do colaborador é a fonte única do acesso. Ao reativar,
      // preserva-se eventual perfil elevado (Gestor/Admin/Gerente).
      ativo: normalizeAtivoFlag(col.ativo) && Boolean(email),
    };
  }

  return { colaboradores: colsOut, usuarios: usersOut };
}

/** Normaliza código da seção para dígitos apenas. */
function normalizeSecaoCodigo(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Persiste, num único batch atômico, todas as alterações pendentes de
 * Configurações e emite auditoria tipada por entidade.
 *
 * Mesma lógica de diff que o antigo `handleSaveChanges` de `Configuracoes.tsx`,
 * agora encapsulada no service: nenhum componente grava diretamente no Firestore.
 */
export async function saveConfiguracoesBatch(
  options: SaveConfiguracoesBatchOptions
): Promise<SaveConfiguracoesBatchResult> {
  const { usuario, activeDivisaoId } = options;

  const canColaboradores = options.permissoes?.colaboradores ?? canManageColaboradores(usuario);
  const canUsuarios = options.permissoes?.usuarios ?? canManageUsuarios(usuario);
  const canPostos = options.permissoes?.postos ?? canManagePostos(usuario);
  const canSecoes = options.permissoes?.secoes ?? canManageSecoes(usuario);
  const canLegendas = options.permissoes?.legendas ?? canManageLegendasGlobais(usuario);
  const canDivisoes = options.permissoes?.divisoes ?? canManageDivisoes(usuario);
  const canGerais = options.permissoes?.gerais ?? canEditConfigGerais(usuario);

  validateBatchPermissions(usuario, {
    colaboradores: canColaboradores,
    usuarios: canUsuarios,
    postos: canPostos,
    secoes: canSecoes,
    legendas: canLegendas,
    divisoes: canDivisoes,
    gerais: canGerais,
  });

  const { colaboradores: colBlock, usuarios: userBlock, postos: postoBlock, secoes: secaoBlock, legendas: legendaBlock, divisoes: divisaoBlock, gerais: geraisBlock } = options;

  if (!isGerente(usuario) && !isAdministrador(usuario)) {
    for (const col of colBlock.current) {
      const original = colBlock.original.find((item) => item.re === col.re);
      if (normalizeEmail(col.email) !== normalizeEmail(original?.email)) {
        throw new Error(
          "Somente Gerente ou Administrador pode registrar ou alterar e-mails de acesso."
        );
      }
    }
  }

  // Cadastros legados inválidos podem ser lidos até serem corrigidos, mas toda
  // inclusão ou troca de RE deve respeitar 000000-0 (verificador aceita letra) e
  // não pode reutilizar a identidade (seis primeiros algarismos) de outro registro.
  for (const col of colBlock.current) {
    const original = colBlock.original.find((item) => item.re === col.re);
    if (!original && !isValidRe(col.re)) {
      throw new Error(
        `${col.nome}: R.E. inválido; use o formato 000000-0 (o verificador pode ser letra).`
      );
    }
    const conflitoCol = colBlock.current.find(
      (item) => item !== col && reIdentityKey(item.re) === reIdentityKey(col.re)
    );
    if (conflitoCol) {
      throw new Error(`R.E. duplicado entre ${col.nome} e ${conflitoCol.nome}.`);
    }
  }

  const batch = createWriteBatch();
  const alteracoes: AuditAlteracao[] = [];
  const now = new Date();
  const timestamp = Timestamp.now();

  const createAuditLog = (
    modulo: string,
    operacao: string,
    registro: string,
    campo: string,
    ant: string,
    nvo: string
  ) => {
    alteracoes.push({
      campo: `${operacao} — ${campo}`,
      antes: ant,
      depois: nvo,
      colaborador: `${modulo}: ${registro}`,
    });
  };

  // Alinha seção, identidade e e-mail entre colaboradores e usuários (mesmo RE).
  const reconciled = reconcileColaboradoresUsuarios(
    colBlock.current,
    userBlock.current,
    colBlock.original,
    userBlock.original
  );

  const resolveSecaoNomeById = (secaoId: string): string => {
    const match = secaoBlock.current.find((s) => s.id === String(secaoId || "").trim());
    return String(match?.nome || "");
  };

  // Cadastros legados podem ter só o nome da seção; o ID é a identidade real.
  const resolveSecaoIdByNome = (nome: unknown, divisaoId: string): string => {
    if (!normalizeSecaoNome(nome)) return "";
    const alvoDivisao = normalizeDivisaoId(divisaoId);
    const match = secaoBlock.current.find(
      (s) => secoesIguais(s.nome, nome) && normalizeDivisaoId(s.divisaoId) === alvoDivisao
    );
    return String(match?.id || "");
  };

  const colsToSave = reconciled.colaboradores.map((c) => {
    const divisaoId = String(c.divisaoId || activeDivisaoId);
    const secaoId =
      String(c.secaoId || "").trim() || resolveSecaoIdByNome(c.secao, divisaoId);
    const secaoNome = resolveSecaoNomeById(secaoId) || normalizeSecaoNome(c.secao);
    return { ...c, secaoId, secao: secaoNome, divisaoId };
  });
  const usersToSave = reconciled.usuarios.map((u) => {
    const divisaoId = String(u.divisaoId || activeDivisaoId);
    const secaoId =
      String(u.secaoId || "").trim() || resolveSecaoIdByNome(u.secao, divisaoId);
    const secaoNome = resolveSecaoNomeById(secaoId) || normalizeSecaoNome(u.secao);
    return { ...u, secaoId, secao: secaoNome, divisaoId };
  });

  if (canUsuarios) {
    const perfisPermitidos = assignablePerfis(usuario);
    for (const target of usersToSave) {
      const original = userBlock.original.find((u) => u.re === target.re);
      const perfil = target.perfil || "Operador";
      if (!original && !isValidRe(target.re)) {
        throw new Error(
          `${target.nome}: R.E. inválido; use o formato 000000-0 (o verificador pode ser letra).`
        );
      }
      if (!original) {
        const conflito = usersToSave.find(
          (u) => u !== target && reIdentityKey(u.re) === reIdentityKey(target.re)
        );
        if (conflito) {
          throw new Error(
            `Não é possível cadastrar ${target.nome}: o R.E. já pertence a ${conflito.nome}.`
          );
        }
      }
      if ((!original || (original.perfil || "Operador") !== perfil) && !perfisPermitidos.includes(perfil)) {
        throw new Error(`Seu perfil não pode atribuir o acesso ${perfil}.`);
      }
    }
  }

  if (canColaboradores) {
    // --- 1. AUDIT & SAVE: COLABORADORES ---
    for (const reDel of colBlock.removed) {
      const original = colBlock.original.find((c) => c.re === reDel);
      const colLabel = original ? `${original.postoGrad} ${original.nome}` : reDel;
      const docId = colaboradorDocId(String(original?.divisaoId || activeDivisaoId), reDel);
      batchDelete(batch, "colaboradores", docId);
      createAuditLog("Colaboradores", "Exclusão", colLabel, "Todos", `${colLabel} (R.E. ${reDel})`, "");
    }
    for (const col of colsToSave) {
      const original = colBlock.original.find((c) => c.re === col.re);
      const newDivisaoId = String(col.divisaoId || activeDivisaoId);
      const docId = colaboradorDocId(newDivisaoId, col.re);
      const normalized = normalizeColaborador(col);
      // Troca de Divisão muda o ID do documento — remove o antigo.
      if (original) {
        const oldDivisaoId = String(original.divisaoId || activeDivisaoId);
        if (normalizeDivisaoId(oldDivisaoId) !== normalizeDivisaoId(newDivisaoId)) {
          batchDelete(batch, "colaboradores", colaboradorDocId(oldDivisaoId, original.re));
        }
      }
      batchSet(batch, "colaboradores", docId, {
        ...normalized,
        divisaoId: newDivisaoId,
        ativo: normalized.ativo, // boolean explícito (false deve persistir)
        updatedAt: timestamp,
        createdAt: col.createdAt || timestamp,
      });

      const colLabel = `${normalized.postoGrad} ${normalized.nome}`;

      if (!original) {
        createAuditLog(
          "Colaboradores",
          "Inclusão",
          colLabel,
          "Todos",
          "",
          `RE: ${normalized.re}, Posto: ${normalized.postoGrad}, Nome Completo: ${normalized.nomeCompleto || ""}, Guerra: ${normalized.nome}, E-mail Google: ${normalizeEmail(normalized.email) || "—"}, Divisão: ${normalized.divisaoId}, Seção: ${normalized.secao}, Ordem: ${normalized.ordem}, Ativo: ${normalized.ativo ? "Sim" : "Não"}`
        );
      } else {
        if (normalized.postoGrad !== original.postoGrad) {
          createAuditLog("Colaboradores", "Edição", colLabel, "Posto/Graduação", original.postoGrad, normalized.postoGrad);
        }
        if (normalized.nome !== original.nome) {
          createAuditLog("Colaboradores", "Edição", colLabel, "Nome de Guerra", original.nome, normalized.nome);
        }
        if (normalized.nomeCompleto !== original.nomeCompleto) {
          createAuditLog("Colaboradores", "Edição", colLabel, "Nome Completo", original.nomeCompleto || "", normalized.nomeCompleto || "");
        }
        if (normalizeEmail(normalized.email) !== normalizeEmail(original.email)) {
          createAuditLog(
            "Colaboradores",
            "Edição",
            colLabel,
            "E-mail Google",
            normalizeEmail(original.email) || "",
            normalizeEmail(normalized.email) || ""
          );
        }
        if (normalizeDivisaoId(normalized.divisaoId) !== normalizeDivisaoId(original.divisaoId)) {
          createAuditLog(
            "Colaboradores",
            "Edição",
            colLabel,
            "Divisão",
            String(original.divisaoId || ""),
            String(normalized.divisaoId || "")
          );
        }
        if (
          String(normalized.secaoId || "") !== String(original.secaoId || "") ||
          !mesmaSecaoTexto(normalized.secao, original.secao)
        ) {
          createAuditLog(
            "Colaboradores",
            "Edição",
            colLabel,
            "Seção",
            `${original.secao || "—"} (${original.secaoId || "—"})`,
            `${normalized.secao || "—"} (${normalized.secaoId || "—"})`
          );
        }
        if (normalizeAtivoFlag(normalized.ativo) !== normalizeAtivoFlag(original.ativo)) {
          createAuditLog(
            "Colaboradores",
            "Edição",
            colLabel,
            "Situação (Ativo)",
            normalizeAtivoFlag(original.ativo) ? "Ativo" : "Inativo",
            normalizeAtivoFlag(normalized.ativo) ? "Ativo" : "Inativo"
          );
        }
        if (normalized.ordem !== original.ordem) {
          createAuditLog("Colaboradores", "Ordenação", colLabel, "Ordem", String(original.ordem || 0), String(normalized.ordem || 0));
        }
        if (normalized.observacao !== original.observacao) {
          createAuditLog("Colaboradores", "Edição", colLabel, "Observação", original.observacao || "", normalized.observacao || "");
        }
      }
    }
  }

  // Permissões acompanham o cadastro: ao salvar colaboradores ativos, o
  // Operador (ou perfil elevado definido no modal) é gravado aqui.
  if (canColaboradores || canUsuarios) {
    for (const reDel of userBlock.removed) {
      const original = userBlock.original.find((u) => u.re === reDel);
      const userLabel = original ? `${original.postoGrad} ${original.nome}` : reDel;
      batchDelete(batch, "usuarios", reDel);
      createAuditLog("Permissão", "Exclusão", userLabel, "Todos", `${userLabel} (R.E. ${reDel})`, "");
    }
    for (const usr of usersToSave) {
      const prepared = prepareUsuarioDocument({
        ...usr,
        divisaoId: String(usr.divisaoId || activeDivisaoId),
        secoesResponsaveisIds: [],
      });
      const original = userBlock.original.find((u) => u.re === prepared.re);
      const emailCheck = validateUsuarioEmail({
        email: prepared.email,
        re: prepared.re,
        isNew: !original,
        // Inclui Operadores gerados automaticamente nesta mesma gravação.
        existingUsers: usersToSave.filter((u) => u.re !== prepared.re),
      });
      if (emailCheck.ok === false) {
        throw new Error(`${prepared.postoGrad} ${prepared.nome}: ${emailCheck.message}`);
      }

      const { uid: _uid, ...toPersist } = prepared;
      batchSet(batch, "usuarios", prepared.re, toPersist as unknown as Record<string, unknown>);

      const userLabel = `${prepared.postoGrad} ${prepared.nome}`;
      const emailAntes = normalizeEmail(original?.email);
      const emailDepois = normalizeEmail(prepared.email);

      if (!original) {
        createAuditLog(
          "Permissão",
          "Inclusão",
          userLabel,
          "Todos",
          "",
          `RE: ${prepared.re}, Posto: ${prepared.postoGrad}, Nome Completo: ${prepared.nomeCompleto || ""}, Guerra: ${prepared.nome}, E-mail Google: ${emailDepois || "—"}, Seção: ${prepared.secao}, Perfil: ${prepared.perfil || "Operador"}, Ativo: ${prepared.ativo ? "Sim" : "Não"}`
        );
        if (emailDepois) {
          createAuditLog("Permissão", "Inclusão", userLabel, "E-mail Google", "", emailDepois);
        }
      } else {
        if (prepared.postoGrad !== original.postoGrad) {
          createAuditLog("Permissão", "Edição", userLabel, "Posto/Graduação", original.postoGrad, prepared.postoGrad);
        }
        if (prepared.nome !== original.nome) {
          createAuditLog("Permissão", "Edição", userLabel, "Nome de Guerra", original.nome, prepared.nome);
        }
        if (prepared.nomeCompleto !== original.nomeCompleto) {
          createAuditLog("Permissão", "Edição", userLabel, "Nome Completo", original.nomeCompleto || "", prepared.nomeCompleto || "");
        }
        if (emailAntes !== emailDepois) {
          createAuditLog(
            "Permissão",
            emailAntes ? "Edição" : "Inclusão",
            userLabel,
            "E-mail Google",
            emailAntes,
            emailDepois
          );
        }
        if (normalizeDivisaoId(prepared.divisaoId) !== normalizeDivisaoId(original.divisaoId)) {
          createAuditLog(
            "Permissão",
            "Edição",
            userLabel,
            "Divisão",
            String(original.divisaoId || ""),
            String(prepared.divisaoId || "")
          );
        }
        if (
          String(prepared.secaoId || "") !== String(original.secaoId || "") ||
          !mesmaSecaoTexto(prepared.secao, original.secao)
        ) {
          createAuditLog(
            "Permissão",
            "Edição",
            userLabel,
            "Seção",
            `${original.secao || "—"} (${original.secaoId || "—"})`,
            `${prepared.secao || "—"} (${prepared.secaoId || "—"})`
          );
        }
        if (prepared.perfil !== original.perfil) {
          createAuditLog("Permissão", "Edição", userLabel, "Perfil", original.perfil || "Operador", prepared.perfil || "Operador");
        }
        if (prepared.ativo !== original.ativo) {
          createAuditLog("Permissão", "Edição", userLabel, "Situação (Ativo)", original.ativo ? "Ativo" : "Inativo", prepared.ativo ? "Ativo" : "Inativo");
        }
      }
    }
  }

  if (canPostos) {
    // --- 3. AUDIT & SAVE: POSTOS ---
    for (const rem of postoBlock.removed) {
      batchDelete(
        batch,
        "postos",
        tenantDocId(String(rem.divisaoId || activeDivisaoId), rem.chave)
      );
      createAuditLog("Postos", "Exclusão", rem.chave, "Todos", rem.chave, "");
    }
    for (const p of postoBlock.current) {
      // A sigla só identifica o posto dentro da Divisão: "CAP PM" existe em
      // todas, cada uma com sua ordem e descrição.
      const divisaoPosto = normalizeDivisaoId(String(p.divisaoId || activeDivisaoId));
      const original = postoBlock.original.find(
        (op) =>
          op.sigla === p.sigla &&
          normalizeDivisaoId(String(op.divisaoId || activeDivisaoId)) === divisaoPosto
      );
      const docId = tenantDocId(divisaoPosto, p.sigla);
      batchSet(batch, "postos", docId, {
        ...p,
        divisaoId: divisaoPosto,
      } as unknown as Record<string, unknown>);

      if (!original) {
        createAuditLog("Postos", "Inclusão", p.sigla, "Todos", "", `Sigla: ${p.sigla}, Descricao: ${p.descricao}, Ordem: ${p.ordem}`);
      } else {
        if (p.descricao !== original.descricao) {
          createAuditLog("Postos", "Edição", p.sigla, "Descrição", original.descricao, p.descricao);
        }
        if (p.ordem !== original.ordem) {
          createAuditLog("Postos", "Ordenação", p.sigla, "Ordem", String(original.ordem || 0), String(p.ordem || 0));
        }
      }
    }
  }

  // --- 4. AUDIT & SAVE: SECOES ---
  const secaoRenamesLocal: SecaoRename[] = canSecoes
    ? secaoBlock.current
        .map((s) => ({
          current: s,
          original: secaoBlock.original.find((os) => os.id === s.id),
        }))
        .filter((entry) => Boolean(entry.original) && entry.original!.nome !== entry.current.nome)
        .map((entry) => ({
          id: entry.current.id,
          from: entry.original!.nome,
          to: entry.current.nome,
          divisaoId: String(entry.current.divisaoId || activeDivisaoId),
        }))
    : [];

  if (canSecoes) {
    for (const rem of secaoBlock.removed) {
      batchDelete(batch, "secoes", rem.chave);
      createAuditLog("Seções", "Exclusão", rem.chave, "Todos", rem.chave, "");
    }
    for (const s of secaoBlock.current) {
      const original = secaoBlock.original.find((os) => os.id === s.id);
      const docId = String(s.id || "").trim();
      const payload = {
        ...s,
        id: docId,
        codigo: normalizeSecaoCodigo(s.codigo) || KNOWN_SECAO_CODIGOS[s.nome] || "",
        divisaoId: String(s.divisaoId || activeDivisaoId),
      };
      batchSet(batch, "secoes", docId, payload as unknown as Record<string, unknown>);

      if (!original) {
        createAuditLog(
          "Seções",
          "Inclusão",
          s.nome,
          "Todos",
          "",
          `Nome: ${payload.nome}, Código: ${payload.codigo || "—"}, Ordem: ${payload.ordem}, Ativo: ${payload.ativo ? "Sim" : "Não"}`
        );
      } else {
        if (!secoesIguais(original.nome, s.nome)) {
          createAuditLog("Seções", "Edição", s.nome, "Nome", original.nome, s.nome);
        }
        if (s.ordem !== original.ordem) {
          createAuditLog("Seções", "Ordenação", s.nome, "Ordem", String(original.ordem || 0), String(s.ordem || 0));
        }
        if (s.ativo !== original.ativo) {
          createAuditLog("Seções", "Edição", s.nome, "Ativo", original.ativo ? "Sim" : "Não", s.ativo ? "Sim" : "Não");
        }
        if (String(payload.codigo || "") !== String(original.codigo || "")) {
          createAuditLog(
            "Seções",
            "Edição",
            s.nome,
            "Código da OPM",
            String(original.codigo || ""),
            String(payload.codigo || "")
          );
        }
      }
    }
  }

  // --- 5. AUDIT & SAVE: LEGENDAS ---
  if (canLegendas) {
    for (const rem of legendaBlock.removed) {
      batchDelete(batch, "legendas", legendaDocId(rem.chave));
      createAuditLog("Legendas", "Exclusão", rem.chave, "Todos", rem.chave, "");
    }
    for (const l of legendaBlock.current) {
      const original = legendaBlock.original.find((ol) => ol.sigla === l.sigla);
      const docId = legendaDocId(l.sigla);
      batchSet(batch, "legendas", docId, {
        ...prepareLegendaForFirestore(l),
      });

      if (!original) {
        createAuditLog(
          "Legendas",
          "Inclusão",
          l.sigla,
          "Todos",
          "",
          `Sigla: ${l.sigla}, Nome: ${l.nome || "—"}, Descrição: ${l.descricao}, Cor: ${l.cor}, Ordem: ${l.ordem}, Ativo: ${l.ativo ? "Sim" : "Não"}`
        );
      } else {
        if ((l.nome || "") !== (original.nome || "")) {
          createAuditLog("Legendas", "Edição", l.sigla, "Nome", original.nome || "", l.nome || "");
        }
        if (l.descricao !== original.descricao) {
          createAuditLog("Legendas", "Edição", l.sigla, "Descrição", original.descricao, l.descricao);
        }
        if (l.cor !== original.cor) {
          createAuditLog("Legendas", "Edição", l.sigla, "Cor", original.cor, l.cor);
        }
        if (l.ordem !== original.ordem) {
          createAuditLog("Legendas", "Ordenação", l.sigla, "Ordem", String(original.ordem || 0), String(l.ordem || 0));
        }
        if (l.ativo !== original.ativo) {
          createAuditLog("Legendas", "Edição", l.sigla, "Ativo", original.ativo ? "Sim" : "Não", l.ativo ? "Sim" : "Não");
        }
        if (JSON.stringify(l.representacoes || null) !== JSON.stringify(original.representacoes || null)) {
          createAuditLog(
            "Legendas",
            "Edição",
            l.sigla,
            "Representações",
            JSON.stringify(original.representacoes || {}),
            JSON.stringify(l.representacoes || {})
          );
        }
        if (JSON.stringify(l.regras || null) !== JSON.stringify(original.regras || null)) {
          createAuditLog(
            "Legendas",
            "Edição",
            l.sigla,
            "Regras",
            JSON.stringify(original.regras || {}),
            JSON.stringify(l.regras || {})
          );
        }
      }
    }
  }

  // --- 6. AUDIT & SAVE: DIVISÕES (somente Gerente) ---
  if (canDivisoes) {
    for (const codigoDel of divisaoBlock.removed) {
      batchDelete(batch, "divisoes", divisaoDocId(codigoDel));
      createAuditLog("Divisões", "Exclusão", codigoDel, "Todos", codigoDel, "");
    }
    for (const divisao of divisaoBlock.current) {
      const codigo = divisaoDocId(divisao.codigo);
      const original = divisaoBlock.original.find((d) => d.codigo === divisao.codigo);
      batchSet(batch, "divisoes", codigo, {
        ...divisao,
        codigo,
        ativo: divisao.ativo !== false,
        updatedAt: now.toISOString(),
        createdAt: original?.createdAt || divisao.createdAt || now.toISOString(),
      });
      if (!original) {
        createAuditLog("Divisões", "Inclusão", codigo, "Todos", "", divisao.nome);
      } else {
        if (divisao.nome !== original.nome) {
          createAuditLog("Divisões", "Edição", codigo, "Nome", original.nome, divisao.nome);
        }
        if ((divisao.descricao || "") !== (original.descricao || "")) {
          createAuditLog("Divisões", "Edição", codigo, "Descrição", original.descricao || "", divisao.descricao || "");
        }
        if ((divisao.ativo !== false) !== (original.ativo !== false)) {
          createAuditLog(
            "Divisões",
            "Edição",
            codigo,
            "Ativo",
            original.ativo !== false ? "Sim" : "Não",
            divisao.ativo !== false ? "Sim" : "Não"
          );
        }
      }
    }
  }

  // --- 7. AUDIT & SAVE: CONFIGS GERAIS ---
  if (canGerais && JSON.stringify(geraisBlock.current) !== JSON.stringify(geraisBlock.original)) {
    batchSet(batch, "configuracoes", "gerais", {
      ...geraisBlock.current,
      updatedAt: timestamp,
    });

    const g = geraisBlock.current;
    const og = geraisBlock.original;
    if (g.nomeOrganizacao !== og.nomeOrganizacao) {
      createAuditLog("Configurações Gerais", "Edição", "Gerais", "Nome da Organização", og.nomeOrganizacao, g.nomeOrganizacao);
    }
    if (g.unidade !== og.unidade) {
      createAuditLog("Configurações Gerais", "Edição", "Gerais", "Unidade", og.unidade, g.unidade);
    }
    if (g.pdfExportHeader !== og.pdfExportHeader) {
      createAuditLog("Configurações Gerais", "Edição", "Gerais", "Cabeçalho PDF", og.pdfExportHeader, g.pdfExportHeader);
    }
    if (g.excelExportHeader !== og.excelExportHeader) {
      createAuditLog("Configurações Gerais", "Edição", "Gerais", "Cabeçalho Excel", og.excelExportHeader, g.excelExportHeader);
    }
    if (g.tema !== og.tema) {
      createAuditLog("Configurações Gerais", "Edição", "Gerais", "Tema", og.tema, g.tema);
    }
    if (g.idioma !== og.idioma) {
      createAuditLog("Configurações Gerais", "Edição", "Gerais", "Idioma", og.idioma, g.idioma);
    }
  }

  // Grava o batch atômico.
  await commitBatch(batch);

  if (canDivisoes) {
    // Divisões novas precisam do catálogo base de postos (legendas são globais).
    const divisoesNovas = divisaoBlock.current
      .map((d) => divisaoDocId(d.codigo))
      .filter((codigo) => !divisaoBlock.original.some((o) => o.codigo === codigo));
    for (const codigo of divisoesNovas) {
      try {
        await ensureCatalogoBaseDivisao(codigo);
      } catch (err) {
        console.warn(`Falha ao semear catálogo da Divisão ${codigo}:`, err);
      }
    }
  }

  // Propaga rename de seção em escalas e CF.
  for (const rename of secaoRenamesLocal) {
    try {
      const cascade = await cascadeSecaoRename(
        rename.from,
        rename.to,
        rename.divisaoId,
        rename.id
      );
      if (cascade.semanais + cascade.alteracao + cascade.frequencia > 0) {
        createAuditLog(
          "Seções",
          "Edição",
          rename.to,
          "Propagação rename",
          rename.from,
          `semanais=${cascade.semanais}; alteracao=${cascade.alteracao}; frequencia=${cascade.frequencia}`
        );
      }
    } catch (cascadeErr) {
      console.warn("Falha ao propagar rename de seção:", cascadeErr);
    }
  }

  if (canColaboradores || canUsuarios) {
    // Mantém auth_index alinhado aos usuários. Inativo continua em `usuarios`,
    // mas perde o índice que autoriza leituras pelas security rules.
    for (const u of usersToSave) {
      const original = userBlock.original.find((item) => item.re === u.re);
      if (
        original?.email &&
        normalizeEmail(original.email) !== normalizeEmail(u.email)
      ) {
        await removeAuthIndex(original.email).catch(() => undefined);
      }
      if (u.email && u.ativo !== false) {
        await upsertAuthIndex(u).catch((e) => console.warn("auth_index upsert:", e));
      } else if (u.email) {
        await removeAuthIndex(u.email).catch(() => undefined);
      }
    }
    for (const reDel of userBlock.removed) {
      const original = userBlock.original.find((u) => u.re === reDel);
      if (original?.email) {
        await removeAuthIndex(original.email).catch(() => undefined);
      }
    }
  }

  // Auditoria tipada por entidade (CRIAR/EDITAR/EXCLUIR_*, ALTERAR_PERMISSAO)
  // + fallback genérico ALTERAR_CONFIGURACAO para Postos/Legendas/Gerais.
  for (const a of alteracoes) {
    const mod = String(a.colaborador || "");
    const campo = String(a.campo || "");
    const isIncl = campo.startsWith("Inclusão");
    const isExcl = campo.startsWith("Exclusão");
    let tipo: AuditOperacaoTipo | null = null;
    if (mod.startsWith("Divisões:")) {
      tipo = isIncl ? "CRIAR_DIVISAO" : isExcl ? "EXCLUIR_DIVISAO" : "EDITAR_DIVISAO";
    } else if (mod.startsWith("Seções:")) {
      tipo = isIncl ? "CRIAR_SECAO" : isExcl ? "EXCLUIR_SECAO" : "EDITAR_SECAO";
    } else if (mod.startsWith("Colaboradores:")) {
      tipo = isIncl ? "CRIAR_COLABORADOR" : isExcl ? "EXCLUIR_COLABORADOR" : "EDITAR_COLABORADOR";
    } else if (mod.startsWith("Permissão:")) {
      tipo = campo.includes("Perfil")
        ? "ALTERAR_PERMISSAO"
        : isIncl
          ? "CRIAR_USUARIO"
          : isExcl
            ? "EXCLUIR_USUARIO"
            : "EDITAR_USUARIO";
    }
    if (!tipo) continue;
    if (tipo === "ALTERAR_PERMISSAO") {
      await auditAlterarPermissao({ usuario, alteracoes: [a] }).catch(() => undefined);
    } else {
      await auditCrudEntidade({ usuario, tipo, alteracoes: [a] }).catch(() => undefined);
    }
  }

  const leftover = alteracoes.filter((a) => {
    const mod = String(a.colaborador || "");
    return (
      mod.startsWith("Postos:") ||
      mod.startsWith("Legendas:") ||
      mod.startsWith("Configurações Gerais:") ||
      (!mod.startsWith("Divisões:") &&
        !mod.startsWith("Seções:") &&
        !mod.startsWith("Colaboradores:") &&
        !mod.startsWith("Permissão:"))
    );
  });
  if (leftover.length) {
    await auditConfiguracao({
      usuario,
      alteracoes: leftover,
      detalhes: "Salvamento de configurações administrativas",
    }).catch((e) => console.warn("Falha ao registrar auditoria do salvamento:", e));
  }

  return {
    colaboradores: colsToSave,
    usuarios: usersToSave,
    secaoRenames: secaoRenamesLocal,
  };
}
