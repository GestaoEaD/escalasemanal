/**
 * Persistência e fluxo de aprovação do Controle de Frequência.
 */
import { db, doc, getDoc, getDocs, collection, query, where, Timestamp } from "../firebase";
import { save as saveFrequenciaDoc } from "../repositories/frequenciaRepository";
import { assertOperadorSecaoPropria } from "../validators/frequenciaValidator";
import {
  CONTROLE_FREQUENCIA_COLLECTION,
  ControleFrequenciaDocument,
  Colaborador,
  DIVISAO_EAD_ID,
  EscalaDocument,
  EscalaStatus,
  FrequenciaResponsavel,
  HistoricoEscalaEvento,
  Legenda,
  Usuario,
} from "../types";
import { normalizeEscalaStatus, buildHistoricoEvento } from "./approvalService";
import { cleanAprovacao, cleanHistorico } from "./escalaPayload";
import {
  createApprovalToken,
  createSolicitacaoAprovacao,
  finalizeSolicitacaoAprovacao,
  getTokenApprovalUrl,
} from "./solicitacaoAprovacaoService";
import { registerAuditOperation } from "./auditService";
import {
  assertCanApprove,
  assertCanCancelApproval,
  assertCanReopen,
  assertCanSubmitForApproval,
  assertPendingApproval,
} from "./permissionGuards";
import {
  buildControleFrequenciaId,
  formatNowParts,
} from "./frequenciaIds";
import { recalcAllRows } from "./frequenciaCalculo";
import { normalizeLegenda } from "./legendaModel";
import {
  buildEmptyControleDocument,
  getWeeksOverlappingMonth,
  ScaleDocsByWeek,
  syncFrequenciaObservacoes,
  syncFrequenciaRows,
} from "./frequenciaSync";
import { normalizeSecaoNome } from "./secaoMatch";
import { normalizeAtivoFlag } from "./ativoFlag";
import { resolveActiveDivisaoId } from "./divisaoContext";
import { buildEscalaDocId } from "./divisaoIds";
import { normalizeSecaoId as normalizeFrequenciaSecaoId, parseControleFrequenciaId } from "./frequenciaIds";
import { accessibleSecaoIdsFrequencia, normalizeSecaoId } from "./secaoContext";

function toResponsavel(usuario: Usuario): FrequenciaResponsavel {
  const { data, hora } = formatNowParts();
  return {
    nome: usuario.nome,
    re: usuario.re,
    postoGrad: usuario.postoGrad,
    data,
    hora,
  };
}

export async function loadLegendas(
  _divisaoId: string = DIVISAO_EAD_ID
): Promise<Legenda[]> {
  // Garante representações CF nas legendas oficiais (idempotente via flag de status).
  try {
    const { ensureLegendasFrequenciaRepresentacoes } = await import("./seedData");
    await ensureLegendasFrequenciaRepresentacoes();
  } catch (err) {
    console.warn("[loadLegendas] backfill de representações:", err);
  }
  const snap = await getDocs(collection(db, "legendas"));
  const list: Legenda[] = [];
  snap.forEach((d) => list.push(normalizeLegenda(d.data())));
  list.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return list;
}

export async function loadColaboradores(
  divisaoId: string = DIVISAO_EAD_ID,
  secaoId?: string
): Promise<Colaborador[]> {
  // Preferir filtro composto divisaoId+secaoId (índice em firestore.indexes.json).
  const snap = secaoId
    ? await getDocs(
        query(
          collection(db, "colaboradores"),
          where("divisaoId", "==", divisaoId),
          where("secaoId", "==", secaoId)
        )
      )
    : await getDocs(
        query(collection(db, "colaboradores"), where("divisaoId", "==", divisaoId))
      );
  const list: Colaborador[] = [];
  snap.forEach((d) => {
    const raw = d.data() as Colaborador;
    if (divisaoId && String(raw.divisaoId || "") !== divisaoId) return;
    list.push({
      ...raw,
      re: String(raw.re || "").trim(),
      secao: normalizeSecaoNome(raw.secao),
      secaoId: String(raw.secaoId || "").trim(),
      nome: String(raw.nome || "").trim(),
      postoGrad: String(raw.postoGrad || "").trim(),
      ativo: normalizeAtivoFlag(raw.ativo),
      divisaoId: String(raw.divisaoId || divisaoId),
    });
  });
  list.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return list;
}

export async function loadSecoes(
  divisaoId: string = DIVISAO_EAD_ID,
  usuario?: Usuario | null
): Promise<{ id: string; nome: string; ativo?: boolean; ordem?: number; divisaoId?: string }[]> {
  const snap = await getDocs(
    query(collection(db, "secoes"), where("divisaoId", "==", divisaoId))
  );
  const list: { id: string; nome: string; ativo?: boolean; ordem?: number; divisaoId?: string }[] = [];
  snap.forEach((d) => {
    const data = d.data() as { id?: string; nome: string; ativo?: boolean; ordem?: number; divisaoId?: string };
    list.push({
      id: String(data.id || d.id).trim(),
      nome: String(data.nome || "").trim(),
      ativo: data.ativo,
      ordem: data.ordem,
      divisaoId: String(data.divisaoId || divisaoId),
    });
  });
  list.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const active = list.filter((s) => s.ativo !== false);
  if (!usuario?.re) return active;
  const allowed = accessibleSecaoIdsFrequencia(usuario, active.map((s) => s.id));
  if (allowed === "ALL") return active;
  return active.filter((s) => allowed.includes(normalizeSecaoId(s.id)));
}

export async function loadScaleDocsForMonth(
  ano: number,
  mes: number,
  divisaoId: string = DIVISAO_EAD_ID,
  _secaoId: string = ""
): Promise<ScaleDocsByWeek> {
  const weeks = getWeeksOverlappingMonth(ano, mes);
  const out: ScaleDocsByWeek = {};
  await Promise.all(
    weeks.map(async (w) => {
      const parts = String(w.id).split("_");
      const yearFromId = Number(parts[0]);
      const firestoreId = buildEscalaDocId(
        divisaoId,
        Number.isFinite(yearFromId) ? yearFromId : ano,
        w.numero
      );
      const [semSnap, altSnap] = await Promise.all([
        getDoc(doc(db, "escalas_semanais", firestoreId)),
        getDoc(doc(db, "escalas_alteracao", firestoreId)),
      ]);
      out[w.id] = {
        semanal: semSnap.exists() ? (semSnap.data() as EscalaDocument) : null,
        alteracao: altSnap.exists() ? (altSnap.data() as EscalaDocument) : null,
      };
    })
  );
  return out;
}

export async function loadControleFrequencia(
  ano: number,
  mes: number,
  secao: string,
  divisaoId: string = DIVISAO_EAD_ID,
  secaoId: string = secao
): Promise<ControleFrequenciaDocument | null> {
  const id = buildControleFrequenciaId(ano, mes, secaoId || secao, divisaoId);
  const snap = await getDoc(doc(db, CONTROLE_FREQUENCIA_COLLECTION, id));
  if (!snap.exists()) return null;
  const data = snap.data() as ControleFrequenciaDocument;
  const parsed = parseControleFrequenciaId(id);
  return {
    ...data,
    id: data.id || id,
    secaoId: data.secaoId || parsed?.secaoId || normalizeFrequenciaSecaoId(secaoId || secao),
    divisaoId: data.divisaoId || divisaoId,
    status: normalizeEscalaStatus(data.status),
    rows: Array.isArray(data.rows) ? data.rows : [],
    observacoes: Array.isArray(data.observacoes) ? data.observacoes : [],
  };
}

/** Status resumido dos documentos do ano (para cards de mês).
 *  Se `secaoId` for informado, filtra apenas documentos daquela seção. */
export type FrequenciaMonthCardInfo = {
  count: number;
  statuses: EscalaStatus[];
  /** Ação recente de aprovação/revisão a destacar no card. */
  notification: FrequenciaMonthNotification | null;
};

export type FrequenciaMonthNotification = {
  kind: "aprovacao" | "revisao" | "aguardando";
  label: string;
  /** Data legível do evento (dd/mm/aaaa), quando disponível. */
  data?: string;
};

const WORKFLOW_HIST_TIPOS = new Set([
  "aprovacao",
  "nova_aprovacao",
  "solicitacao_revisao",
  "rejeicao",
  "envio_aprovacao",
]);

const NOTIFICATION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function historicoEventMs(ev: HistoricoEscalaEvento): number {
  const ts = ev.timestamp as { toDate?: () => Date; seconds?: number } | Date | string | null | undefined;
  if (ts && typeof ts === "object" && typeof (ts as { toDate?: () => Date }).toDate === "function") {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "object" && ts && typeof (ts as { seconds?: number }).seconds === "number") {
    return (ts as { seconds: number }).seconds * 1000;
  }
  if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (ev.data) {
    const parts = String(ev.data).split(/[/-]/);
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      if (d && m && y) return new Date(y, m - 1, d).getTime();
    }
  }
  return 0;
}

function notificationFromDoc(
  data: ControleFrequenciaDocument,
  nowMs: number = Date.now()
): FrequenciaMonthNotification | null {
  const status = normalizeEscalaStatus(data.status);
  const historico = Array.isArray(data.historico) ? data.historico : [];
  const workflowEvents = historico
    .filter((ev) => WORKFLOW_HIST_TIPOS.has(ev.tipo))
    .slice()
    .sort((a, b) => historicoEventMs(a) - historicoEventMs(b));
  const latest = workflowEvents[workflowEvents.length - 1];
  const latestMs = latest ? historicoEventMs(latest) : 0;
  const isRecent = latestMs > 0 && nowMs - latestMs <= NOTIFICATION_WINDOW_MS;

  if (status === "aguardando_aprovacao") {
    return {
      kind: "aguardando",
      label: "Aguardando aprovação",
      data: latest?.tipo === "envio_aprovacao" ? latest.data : undefined,
    };
  }
  if (status === "revisao_solicitada" || status === "rejeitada") {
    const motivo = data.aprovacao?.motivoRevisao || data.aprovacao?.motivoRejeicao;
    return {
      kind: "revisao",
      label: motivo ? `Revisão solicitada: ${motivo}` : "Revisão solicitada",
      data: latest?.data,
    };
  }
  if (status === "aprovada") {
    if (
      !isRecent ||
      !latest ||
      (latest.tipo !== "aprovacao" && latest.tipo !== "nova_aprovacao")
    ) {
      return null;
    }
    return {
      kind: "aprovacao",
      label: "Aprovado recentemente",
      data: latest.data,
    };
  }
  return null;
}

function pickPreferredNotification(
  current: FrequenciaMonthNotification | null,
  next: FrequenciaMonthNotification | null
): FrequenciaMonthNotification | null {
  if (!next) return current;
  if (!current) return next;
  const rank = { revisao: 3, aguardando: 2, aprovacao: 1 } as const;
  return rank[next.kind] >= rank[current.kind] ? next : current;
}

export async function loadFrequenciaMonthStatuses(
  ano: number,
  secaoId?: string,
  divisaoId: string = DIVISAO_EAD_ID
): Promise<Record<number, FrequenciaMonthCardInfo>> {
  const snap = await getDocs(
    query(
      collection(db, CONTROLE_FREQUENCIA_COLLECTION),
      where("ano", "==", ano),
      where("divisaoId", "==", divisaoId)
    )
  );
  const map: Record<number, FrequenciaMonthCardInfo> = {};
  const nowMs = Date.now();
  snap.forEach((d) => {
    const data = d.data() as ControleFrequenciaDocument;
    if (
      secaoId &&
      normalizeFrequenciaSecaoId(data.secaoId || data.secao) !==
        normalizeFrequenciaSecaoId(secaoId)
    ) {
      return;
    }
    const mes = Number(data.mes);
    if (!map[mes]) map[mes] = { count: 0, statuses: [], notification: null };
    map[mes].count += 1;
    map[mes].statuses.push(normalizeEscalaStatus(data.status));
    map[mes].notification = pickPreferredNotification(
      map[mes].notification,
      notificationFromDoc(data, nowMs)
    );
  });
  return map;
}

export async function ensureAndSyncControleFrequencia(options: {
  ano: number;
  mes: number;
  secao: string;
  secaoId?: string;
  usuario: Usuario;
  forceResync?: boolean;
  /** Quando true (padrão), reaplica o cadastro de colaboradores da seção em docs editáveis. */
  syncCadastro?: boolean;
}): Promise<{ doc: ControleFrequenciaDocument; created: boolean; synced: boolean }> {
  const divisaoId = resolveActiveDivisaoId(options.usuario);
  const secaoId = String(options.secaoId || options.secao || "").trim();
  assertOperadorSecaoPropria(options.usuario, secaoId);
  const id = buildControleFrequenciaId(
    options.ano,
    options.mes,
    secaoId,
    divisaoId
  );
  let existing = await loadControleFrequencia(
    options.ano,
    options.mes,
    options.secao,
    divisaoId,
    secaoId
  );
  const created = !existing;
  if (!existing) {
    existing = {
      ...buildEmptyControleDocument({
        id,
        ano: options.ano,
        mes: options.mes,
        secao: options.secao,
        secaoId,
      }),
      divisaoId,
      secaoId,
    };
  }

  const status = normalizeEscalaStatus(existing.status);
  const blocked =
    status === "aprovada" || status === "aguardando_aprovacao";

  // Sincroniza com o cadastro (seções/colaboradores) em documentos editáveis.
  // forceResync também força recarga a partir das escalas.
  const shouldSync =
    !blocked && (created || options.forceResync === true || options.syncCadastro !== false);

  if (!shouldSync) {
    return { doc: existing, created, synced: false };
  }

  const [cols, legendas, scaleDocs] = await Promise.all([
    loadColaboradores(divisaoId, secaoId),
    loadLegendas(divisaoId),
    loadScaleDocsForMonth(options.ano, options.mes, divisaoId, secaoId),
  ]);

  const { rows, sourceWeeks } = syncFrequenciaRows({
    ano: options.ano,
    mes: options.mes,
    secao: options.secao,
    colaboradores: cols,
    legendas,
    scaleDocs,
    existingRows: existing.rows,
  });

  const observacoes = syncFrequenciaObservacoes({
    colaboradores: cols,
    secao: options.secao,
    scaleDocs,
    sourceWeeks,
    existing: existing.observacoes,
    usuario: options.usuario,
  });

  const { data, hora } = formatNowParts();
  const docData: ControleFrequenciaDocument = {
    ...existing,
    secaoId: existing.secaoId || secaoId,
    rows: recalcAllRows(rows, legendas),
    observacoes,
    syncMeta: {
      lastSyncAt: `${data} ${hora}`,
      sourceWeeks,
    },
  };

  return { doc: docData, created, synced: true };
}

export async function saveControleFrequencia(
  docData: ControleFrequenciaDocument,
  usuario: Usuario,
  alteracoes?: { campo: string; antes: string; depois: string; colaborador?: string }[]
): Promise<ControleFrequenciaDocument> {
  const status = normalizeEscalaStatus(docData.status);
  if (status === "aprovada" || status === "aguardando_aprovacao") {
    throw new Error("Este Controle de Frequência não pode ser editado no status atual.");
  }

  const divisaoId =
    String(docData.divisaoId || "").trim() ||
    resolveActiveDivisaoId(usuario);
  const legendasSnap = await getDocs(collection(db, "legendas"));
  const legendas = legendasSnap.docs.map((d) =>
    normalizeLegenda(d.data() as Record<string, unknown>)
  );
  const rowsRecalc = recalcAllRows(docData.rows || [], legendas);

  const timestamp = Timestamp.now();
  const next: ControleFrequenciaDocument = {
    ...docData,
    id:
      docData.id ||
      buildControleFrequenciaId(
        docData.ano,
        docData.mes,
        docData.secaoId || docData.secao,
        divisaoId
      ),
    divisaoId,
    secaoId: String(docData.secaoId || "").trim() || normalizeFrequenciaSecaoId(docData.secao),
    rows: rowsRecalc,
    status: status || "em_edicao",
    versao: docData.versao && docData.versao > 0 ? docData.versao : 1,
    lastSaved: {
      nome: `${usuario.postoGrad} ${usuario.nome}`,
      re: usuario.re,
      timestamp,
    },
    responsavelEdicao: toResponsavel(usuario),
  };

  await saveFrequenciaDoc(next);

  await registerAuditOperation({
    tipo: "EDITAR_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    versao: next.versao,
    statusAnterior: statusLabelSafe(docData.status),
    statusAtual: statusLabelSafe(next.status),
    alteracoes: alteracoes || [],
    detalhes: `Seção: ${next.secao} · ${next.rows.length} colaborador(es)`,
    origem: "ui",
    secaoId: next.secaoId,
  });

  return next;
}

function statusLabelSafe(s: EscalaStatus | undefined | null): string {
  const st = normalizeEscalaStatus(s);
  if (st === "aprovada") return "Aprovada";
  if (st === "aguardando_aprovacao") return "Aguardando Aprovação";
  if (st === "revisao_solicitada") return "Revisão Solicitada";
  return "Em edição";
}

export async function auditSyncFrequencia(
  docData: ControleFrequenciaDocument,
  usuario: Usuario
): Promise<void> {
  await registerAuditOperation({
    tipo: "SINCRONIZAR_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: docData.ano,
    semana: docData.mes,
    anoSemana: docData.id,
    detalhes: `Seção: ${docData.secao} · semanas: ${(docData.syncMeta?.sourceWeeks || []).join(", ")}`,
    secaoId: docData.secaoId,
  });
}

/** Envia Controle de Frequência para aprovação (reutiliza solicitacoes_aprovacao). */
export async function submitFrequenciaForApproval(
  docData: ControleFrequenciaDocument,
  usuario: Usuario
): Promise<{ doc: ControleFrequenciaDocument; url: string; token: string }> {
  assertCanSubmitForApproval(usuario);
  const status = normalizeEscalaStatus(docData.status);
  if (status === "aguardando_aprovacao") {
    throw new Error("Este Controle de Frequência já está aguardando aprovação.");
  }
  if (status === "aprovada") {
    throw new Error("Este Controle de Frequência já está aprovado.");
  }

  const versao = docData.versao && docData.versao > 0 ? docData.versao : 1;
  const token = createApprovalToken(11);
  const { data, hora } = formatNowParts();
  const timestamp = Timestamp.now();

  const aprovacao = cleanAprovacao({
    solicitacaoId: token,
    enviadoPor: {
      nome: usuario.nome,
      re: usuario.re,
      postoGrad: usuario.postoGrad,
      timestamp,
      data,
      hora,
    },
    aprovadoPor: null,
    revisaoSolicitadaPor: null,
    motivoRevisao: "",
    rejeitadoPor: null,
    motivoRejeicao: "",
    observacaoAprovacao: "",
    versaoEnviada: versao,
  });

  const evento = buildHistoricoEvento({
    tipo: "envio_aprovacao",
    descricao: `Enviado para aprovação — Controle de Frequência (v${versao})`,
    usuario,
    versao,
    solicitacaoId: token,
  });
  const historico = cleanHistorico([...(docData.historico || []), evento]);

  await createSolicitacaoAprovacao({
    token,
    tipo: "frequencia",
    escalaId: docData.id,
    versao,
    usuario,
  });

  const next: ControleFrequenciaDocument = {
    ...docData,
    status: "aguardando_aprovacao",
    versao,
    aprovacao,
    historico,
    responsavelEdicao: toResponsavel(usuario),
  };

  await saveFrequenciaDoc(next);

  await registerAuditOperation({
    tipo: "ENVIAR_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    versao,
    statusAnterior: statusLabelSafe(status),
    statusAtual: "Aguardando Aprovação",
    solicitacaoId: token,
    secaoId: next.secaoId,
  });

  return { doc: next, url: getTokenApprovalUrl(token), token };
}

export async function cancelFrequenciaApproval(
  docData: ControleFrequenciaDocument,
  usuario: Usuario
): Promise<ControleFrequenciaDocument> {
  const status = normalizeEscalaStatus(docData.status);
  assertCanCancelApproval(usuario, status);
  const token = docData.aprovacao?.solicitacaoId;
  if (token) {
    await finalizeSolicitacaoAprovacao({
      token,
      resultado: "CANCELADA",
      usuario,
    });
  }
  const evento = buildHistoricoEvento({
    tipo: "cancelamento_solicitacao",
    descricao: "Solicitação de aprovação cancelada — Controle de Frequência",
    usuario,
    versao: docData.versao,
    solicitacaoId: token,
  });
  const next: ControleFrequenciaDocument = {
    ...docData,
    status: "em_edicao",
    historico: cleanHistorico([...(docData.historico || []), evento]),
  };
  await saveFrequenciaDoc(next);
  await registerAuditOperation({
    tipo: "CANCELAR_SOLICITACAO_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    solicitacaoId: token,
    secaoId: next.secaoId,
  });
  return next;
}

export async function approveFrequencia(
  docData: ControleFrequenciaDocument,
  usuario: Usuario,
  observacao: string = ""
): Promise<ControleFrequenciaDocument> {
  assertCanApprove(usuario);
  assertPendingApproval(docData.status, "Controle de Frequência");
  const statusAnterior = normalizeEscalaStatus(docData.status);
  const { data, hora } = formatNowParts();
  const timestamp = Timestamp.now();
  const token = docData.aprovacao?.solicitacaoId;
  if (token) {
    await finalizeSolicitacaoAprovacao({
      token,
      resultado: "APROVADA",
      usuario,
    });
  }
  const aprovadoPor = {
    nome: usuario.nome,
    re: usuario.re,
    postoGrad: usuario.postoGrad,
    timestamp,
    data,
    hora,
  };
  const evento = buildHistoricoEvento({
    tipo: "aprovacao",
    descricao: "Controle de Frequência aprovado",
    usuario,
    versao: docData.versao,
    solicitacaoId: token,
    detalhes: observacao || undefined,
  });
  const next: ControleFrequenciaDocument = {
    ...docData,
    status: "aprovada",
    aprovacao: cleanAprovacao({
      ...(docData.aprovacao || {
        solicitacaoId: token || "",
        enviadoPor: null,
        aprovadoPor: null,
        revisaoSolicitadaPor: null,
        motivoRevisao: "",
        rejeitadoPor: null,
        motivoRejeicao: "",
        observacaoAprovacao: "",
        versaoEnviada: docData.versao || 1,
      }),
      aprovadoPor,
      observacaoAprovacao: observacao || "",
    }),
    historico: cleanHistorico([...(docData.historico || []), evento]),
    responsavelAprovacao: toResponsavel(usuario),
  };
  await saveFrequenciaDoc(next);
  await registerAuditOperation({
    tipo: "APROVAR_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    solicitacaoId: token,
    statusAnterior: statusLabelSafe(statusAnterior),
    statusAtual: "Aprovada",
    detalhes: observacao || undefined,
    secaoId: next.secaoId,
  });
  return next;
}

export async function requestFrequenciaRevision(
  docData: ControleFrequenciaDocument,
  usuario: Usuario,
  motivo: string
): Promise<ControleFrequenciaDocument> {
  assertCanApprove(usuario);
  assertPendingApproval(docData.status, "Controle de Frequência");
  const statusAnterior = normalizeEscalaStatus(docData.status);
  const { data, hora } = formatNowParts();
  const timestamp = Timestamp.now();
  const token = docData.aprovacao?.solicitacaoId;
  if (token) {
    await finalizeSolicitacaoAprovacao({
      token,
      resultado: "REVISAO_SOLICITADA",
      usuario,
    });
  }
  const versaoAnterior = docData.versao && docData.versao > 0 ? docData.versao : 1;
  const novaVersao = versaoAnterior + 1;
  const evento = buildHistoricoEvento({
    tipo: "solicitacao_revisao",
    descricao: `Revisão solicitada — Controle de Frequência`,
    usuario,
    versao: novaVersao,
    solicitacaoId: token,
    detalhes: motivo,
  });
  const next: ControleFrequenciaDocument = {
    ...docData,
    status: "revisao_solicitada",
    versao: novaVersao,
    aprovacao: cleanAprovacao({
      ...(docData.aprovacao || {
        solicitacaoId: token || "",
        enviadoPor: null,
        aprovadoPor: null,
        revisaoSolicitadaPor: null,
        motivoRevisao: "",
        rejeitadoPor: null,
        motivoRejeicao: "",
        observacaoAprovacao: "",
        versaoEnviada: versaoAnterior,
      }),
      revisaoSolicitadaPor: {
        nome: usuario.nome,
        re: usuario.re,
        postoGrad: usuario.postoGrad,
        timestamp,
        data,
        hora,
      },
      motivoRevisao: motivo,
    }),
    historico: cleanHistorico([...(docData.historico || []), evento]),
  };
  await saveFrequenciaDoc(next);
  await registerAuditOperation({
    tipo: "SOLICITAR_REVISAO_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    motivo,
    solicitacaoId: token,
    versao: novaVersao,
    statusAnterior: statusLabelSafe(statusAnterior),
    statusAtual: "Revisão Solicitada",
    secaoId: next.secaoId,
  });
  return next;
}

export async function reopenFrequencia(
  docData: ControleFrequenciaDocument,
  usuario: Usuario,
  motivo: string
): Promise<ControleFrequenciaDocument> {
  assertCanReopen(usuario, docData.status);
  const statusAnterior = normalizeEscalaStatus(docData.status);
  const evento = buildHistoricoEvento({
    tipo: "reabertura",
    descricao: "Controle de Frequência reaberto",
    usuario,
    versao: (docData.versao || 1) + 1,
    detalhes: motivo,
  });
  const next: ControleFrequenciaDocument = {
    ...docData,
    status: "em_edicao",
    versao: (docData.versao || 1) + 1,
    aprovacao: null,
    responsavelAprovacao: null,
    historico: cleanHistorico([...(docData.historico || []), evento]),
  };
  await saveFrequenciaDoc(next);
  await registerAuditOperation({
    tipo: "REABRIR_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    versao: next.versao,
    motivo,
    statusAnterior: statusLabelSafe(statusAnterior),
    statusAtual: "Em edição",
    secaoId: next.secaoId,
  });
  return next;
}

export async function loadControleById(
  id: string
): Promise<ControleFrequenciaDocument | null> {
  const snap = await getDoc(doc(db, CONTROLE_FREQUENCIA_COLLECTION, id));
  if (!snap.exists()) return null;
  const data = snap.data() as ControleFrequenciaDocument;
  return {
    ...data,
    id: data.id || id,
    secaoId: data.secaoId || parseControleFrequenciaId(id)?.secaoId || "",
    status: normalizeEscalaStatus(data.status),
    rows: Array.isArray(data.rows) ? data.rows : [],
    observacoes: Array.isArray(data.observacoes) ? data.observacoes : [],
  };
}
