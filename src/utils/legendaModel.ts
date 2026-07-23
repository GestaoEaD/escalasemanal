/**
 * Modelo de Legenda compatível com documentos legados (sigla/descricao/cor/ativo/ordem)
 * e campos opcionais para Escala Consolidada (representações e regras).
 */
import {
  Legenda,
  LegendaMeiaDiaria,
  LegendaRegras,
  LegendaRepresentacoes,
} from "../types";
import { findUndefinedPaths, prepareFirestoreWrite } from "./firestoreSanitize";

/** ID do documento Firestore a partir da sigla. */
export function legendaDocId(sigla: string): string {
  return String(sigla || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[ºª]/g, "");
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/** Normaliza representações: omite chaves vazias; objeto vazio → undefined. */
export function normalizeRepresentacoes(raw: unknown): LegendaRepresentacoes | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: LegendaRepresentacoes = {};
  const semanal = optionalTrimmedString(src.escalaSemanal);
  const consolidada = optionalTrimmedString(src.escalaConsolidada);
  if (semanal !== undefined) out.escalaSemanal = semanal;
  if (consolidada !== undefined) out.escalaConsolidada = consolidada;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Normaliza regras: todos os campos opcionais; objeto vazio → undefined. */
export function normalizeRegras(raw: unknown): LegendaRegras | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: LegendaRegras = {};

  const dia = optionalBoolean(src.diaTrabalhado);
  if (dia !== undefined) out.diaTrabalhado = dia;

  const meiaRaw = src.meiaDiaria;
  if (meiaRaw && typeof meiaRaw === "object" && !Array.isArray(meiaRaw)) {
    const m = meiaRaw as Record<string, unknown>;
    const meia: LegendaMeiaDiaria = {};
    const participa = optionalBoolean(m.participa);
    const valor = optionalNumber(m.valor);
    if (participa !== undefined) meia.participa = participa;
    if (valor !== undefined) meia.valor = valor;
    if (Object.keys(meia).length > 0) out.meiaDiaria = meia;
  }

  const aaRaw = src.aa;
  if (aaRaw && typeof aaRaw === "object" && !Array.isArray(aaRaw)) {
    const a = aaRaw as Record<string, unknown>;
    const contaDia = optionalBoolean(a.contaDia);
    if (contaDia !== undefined) out.aa = { contaDia };
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Converte documento Firestore (legado ou novo) em Legenda tipada.
 * Campos ausentes permanecem "não configurados" (undefined) — não inventa regras.
 */
export function normalizeLegenda(raw: unknown): Legenda {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sigla = String(src.sigla ?? src.codigo ?? "").trim();
  const descricao = String(src.descricao ?? "").trim();
  const nome = optionalTrimmedString(src.nome);
  const cor = optionalTrimmedString(src.cor) ?? "";
  const ativo = src.ativo === false ? false : true;
  const ordem =
    typeof src.ordem === "number" && Number.isFinite(src.ordem)
      ? src.ordem
      : Number(src.ordem) || 0;

  const legenda: Legenda = {
    sigla,
    descricao,
    cor,
    ativo,
    ordem,
  };

  if (nome !== undefined) legenda.nome = nome;

  const representacoes = normalizeRepresentacoes(src.representacoes);
  if (representacoes) legenda.representacoes = representacoes;

  const regras = normalizeRegras(src.regras);
  if (regras) legenda.regras = regras;

  return legenda;
}

/**
 * Prepara legenda para gravação: remove undefined, omite objetos opcionais vazios.
 * Preserva campos básicos existentes.
 */
export function prepareLegendaForFirestore(legenda: Legenda): Record<string, unknown> {
  const normalized = normalizeLegenda(legenda);
  const payload: Record<string, unknown> = {
    sigla: normalized.sigla,
    descricao: normalized.descricao,
    cor: normalized.cor || "",
    ativo: normalized.ativo !== false,
    ordem: normalized.ordem || 0,
  };

  if (normalized.nome) payload.nome = normalized.nome;
  if (normalized.representacoes) payload.representacoes = { ...normalized.representacoes };
  if (normalized.regras) {
    const regras: Record<string, unknown> = {};
    if (normalized.regras.diaTrabalhado !== undefined) {
      regras.diaTrabalhado = normalized.regras.diaTrabalhado;
    }
    if (normalized.regras.meiaDiaria) {
      regras.meiaDiaria = { ...normalized.regras.meiaDiaria };
    }
    if (normalized.regras.aa) {
      regras.aa = { ...normalized.regras.aa };
    }
    if (Object.keys(regras).length > 0) payload.regras = regras;
  }

  const cleaned = prepareFirestoreWrite(
    `legendas/${legendaDocId(normalized.sigla)}`,
    payload
  );
  const bad = findUndefinedPaths(cleaned);
  if (bad.length > 0) {
    console.error("[legendaModel] undefined após prepare:", bad);
  }
  return cleaned;
}

/** Código usado na Escala Semanal (representação ou sigla). */
export function getRepresentacaoSemanal(legenda: Legenda): string {
  return legenda.representacoes?.escalaSemanal?.trim() || legenda.sigla;
}

/** Representação consolidada, se configurada. */
export function getRepresentacaoConsolidada(legenda: Legenda): string | undefined {
  return optionalTrimmedString(legenda.representacoes?.escalaConsolidada);
}

/**
 * Futuro A.A.: conta dia trabalhado somente se explicitamente configurado.
 * Ausência de regra = não conta (não configurado).
 */
export function isDiaTrabalhado(legenda: Legenda): boolean {
  return legenda.regras?.diaTrabalhado === true;
}

/**
 * Futuro A.A.: preferir aa.contaDia se definido; senão diaTrabalhado.
 * Ausência = não conta.
 */
export function contaParaAA(legenda: Legenda): boolean {
  if (legenda.regras?.aa?.contaDia !== undefined) {
    return legenda.regras.aa.contaDia === true;
  }
  return isDiaTrabalhado(legenda);
}

/**
 * Futuro 1/2 Diária: só soma se participa === true e valor > 0.
 * Ausência = não participa.
 */
export function getValorMeiaDiaria(legenda: Legenda): number {
  const meia = legenda.regras?.meiaDiaria;
  if (!meia || meia.participa !== true) return 0;
  const valor = meia.valor;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return 0;
  return valor;
}

/** Estado vazio para formulário de nova legenda. */
export function createEmptyLegendaForm(): Legenda {
  return {
    sigla: "",
    nome: "",
    descricao: "",
    cor: "verde",
    ativo: true,
    ordem: 0,
    representacoes: {
      escalaSemanal: "",
      escalaConsolidada: "",
    },
    regras: {},
  };
}

/**
 * Prepara objeto editável no modal a partir de uma legenda carregada.
 * Campos opcionais ausentes ficam vazios na UI (não gravados se vazios).
 */
export function toLegendaFormState(legenda: Legenda): Legenda {
  const n = normalizeLegenda(legenda);
  return {
    ...n,
    nome: n.nome || "",
    representacoes: {
      escalaSemanal: n.representacoes?.escalaSemanal || "",
      escalaConsolidada: n.representacoes?.escalaConsolidada || "",
    },
    regras: {
      ...(n.regras?.diaTrabalhado !== undefined
        ? { diaTrabalhado: n.regras.diaTrabalhado }
        : {}),
      meiaDiaria: {
        ...(n.regras?.meiaDiaria?.participa !== undefined
          ? { participa: n.regras.meiaDiaria.participa }
          : {}),
        ...(n.regras?.meiaDiaria?.valor !== undefined
          ? { valor: n.regras.meiaDiaria.valor }
          : {}),
      },
      aa: {
        ...(n.regras?.aa?.contaDia !== undefined
          ? { contaDia: n.regras.aa.contaDia }
          : {}),
      },
    },
  };
}
