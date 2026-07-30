/**
 * Service de escalas — validação + repository + auditoria.
 * Único caminho de escrita de escalas_semanais / escalas_alteracao.
 */
import {
  EscalaDocument,
  ScheduleRow,
  Usuario,
  EscalaStatus,
} from "../types";
import { buildEscalaDocId, normalizeDivisaoId } from "../utils/divisaoIds";
import { resolveActiveDivisaoId } from "../utils/divisaoContext";
import { canExportScale } from "../utils/permissions";
import { WeekInfo } from "../utils/dateUtils";
import {
  getEscalaDoc,
  listEscalasByDivisaoAno,
  saveEscalaDoc,
  saveEscalaMerge,
  EscalaCollection,
} from "../repositories/escalaRepository";
import { auditExportacao, auditSalvarEscala } from "../utils/auditService";
import {
  assertEscalaEditable,
  assertEscalaPayload,
  assertRowsHaveSecao,
} from "../validators/escalaValidator";
import { assertSameDivisao } from "../validators/tenantValidator";
import { PermissionError } from "../utils/permissionGuards";

export function assertDivisaoAccess(usuario: Usuario, divisaoId: string): void {
  assertSameDivisao(usuario, divisaoId);
}

export async function loadEscalaDivisao(options: {
  collectionName: EscalaCollection;
  usuario: Usuario;
  year: number;
  week: WeekInfo;
}): Promise<EscalaDocument | null> {
  const divisaoId = resolveActiveDivisaoId(options.usuario);
  assertDivisaoAccess(options.usuario, divisaoId);
  const id = buildEscalaDocId(divisaoId, options.year, options.week.numero);
  return getEscalaDoc(options.collectionName, id);
}

export async function loadEscalasAno(options: {
  collectionName: EscalaCollection;
  usuario: Usuario;
  year: number;
}): Promise<EscalaDocument[]> {
  const divisaoId = resolveActiveDivisaoId(options.usuario);
  assertDivisaoAccess(options.usuario, divisaoId);
  return listEscalasByDivisaoAno(options.collectionName, divisaoId, options.year);
}

export async function persistEscalaDivisao(options: {
  collectionName: EscalaCollection;
  usuario: Usuario;
  year: number;
  week: WeekInfo;
  data: Record<string, unknown>;
  auditAlteracoes?: Parameters<typeof auditSalvarEscala>[0]["alteracoes"];
  isNew?: boolean;
  skipEditPermission?: boolean;
}): Promise<string> {
  const divisaoId = resolveActiveDivisaoId(options.usuario);
  assertDivisaoAccess(options.usuario, divisaoId);
  const id = buildEscalaDocId(divisaoId, options.year, options.week.numero);
  const payload: Record<string, unknown> = {
    ...options.data,
    id,
    divisaoId,
  };
  delete payload.secaoId;
  assertEscalaPayload(payload);
  if (Array.isArray(payload.rows)) {
    assertRowsHaveSecao(payload.rows as ScheduleRow[]);
  }
  if (!options.skipEditPermission) {
    const status = (payload.status as EscalaStatus) || "em_edicao";
    assertEscalaEditable(status);
  }
  await saveEscalaDoc(options.collectionName, id, payload);
  if (options.auditAlteracoes?.length || options.isNew) {
    const tipoDoc =
      options.collectionName === "escalas_alteracao" ? "alteracao" : "semanal";
    await auditSalvarEscala({
      usuario: options.usuario,
      tipoDoc,
      anoSemana: id,
      versao: typeof payload.versao === "number" ? payload.versao : undefined,
      statusAnterior: undefined,
      statusAtual: String(payload.status || ""),
      alteracoes: options.auditAlteracoes || [
        {
          campo: options.isNew ? "Criação" : "Edição",
          antes: "",
          depois: id,
        },
      ],
      isNew: options.isNew,
    }).catch(() => undefined);
  }
  return id;
}

/** Persistência parcial (workflow / merge). */
export async function mergeEscalaDivisao(options: {
  collectionName: EscalaCollection;
  usuario: Usuario;
  id: string;
  partial: Record<string, unknown>;
}): Promise<void> {
  const divisaoId = resolveActiveDivisaoId(options.usuario);
  assertDivisaoAccess(options.usuario, divisaoId);
  const payload = { ...options.partial };
  delete payload.secaoId;
  await saveEscalaMerge(options.collectionName, options.id, payload);
}

export async function ensureEscalaExists(options: {
  collectionName: EscalaCollection;
  usuario: Usuario;
  year: number;
  week: WeekInfo;
  emptyDoc: Record<string, unknown>;
}): Promise<{ id: string; created: boolean; doc: EscalaDocument | null }> {
  const existing = await loadEscalaDivisao(options);
  if (existing) return { id: existing.id, created: false, doc: existing };
  // Criação inicial é sempre permitida (semana editável ou Gerente); persistEscalaDivisao
  // já recebe skipEditPermission abaixo para não bloquear o create.
  const id = await persistEscalaDivisao({
    collectionName: options.collectionName,
    usuario: options.usuario,
    year: options.year,
    week: options.week,
    data: options.emptyDoc,
    isNew: true,
    skipEditPermission: true,
  });
  const doc = await getEscalaDoc(options.collectionName, id);
  return { id, created: true, doc };
}

export async function auditExportEscala(options: {
  usuario: Usuario;
  escalaId: string;
  detalhes: string;
  documento?: "SEMANAL" | "ALTERACAO";
}): Promise<void> {
  if (!canExportScale(options.usuario)) {
    throw new PermissionError("Sem permissão para exportar.");
  }
  await auditExportacao({
    usuario: options.usuario,
    anoSemana: options.escalaId,
    detalhes: options.detalhes,
    documento: options.documento || "SEMANAL",
  }).catch(() => undefined);
}

export { normalizeDivisaoId };
