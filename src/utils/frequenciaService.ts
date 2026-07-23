/**
 * Persistência e fluxo de aprovação do Controle de Frequência.
 */
import { db, doc, getDoc, getDocs, collection, setDoc, query, where, Timestamp } from "../firebase";
import {
  CONTROLE_FREQUENCIA_COLLECTION,
  ControleFrequenciaDocument,
  Colaborador,
  EscalaDocument,
  EscalaStatus,
  FrequenciaResponsavel,
  HistoricoEscalaEvento,
  Legenda,
  Usuario,
} from "../types";
import { prepareFirestoreWrite } from "./firestoreSanitize";
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
  buildControleFrequenciaId,
  controleFrequenciaDocPath,
  formatNowParts,
} from "./frequenciaIds";
import {
  buildEmptyControleDocument,
  getWeeksOverlappingMonth,
  ScaleDocsByWeek,
  syncFrequenciaObservacoes,
  syncFrequenciaRows,
} from "./frequenciaSync";
import { recalcAllRows } from "./frequenciaCalculo";
import { normalizeLegenda } from "./legendaModel";

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

export async function loadLegendas(): Promise<Legenda[]> {
  const snap = await getDocs(collection(db, "legendas"));
  const list: Legenda[] = [];
  snap.forEach((d) => list.push(normalizeLegenda(d.data())));
  list.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return list;
}

export async function loadColaboradores(): Promise<Colaborador[]> {
  const snap = await getDocs(collection(db, "colaboradores"));
  const list: Colaborador[] = [];
  snap.forEach((d) => list.push(d.data() as Colaborador));
  list.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return list;
}

export async function loadSecoes(): Promise<{ nome: string; ativo?: boolean; ordem?: number }[]> {
  const snap = await getDocs(collection(db, "secoes"));
  const list: { nome: string; ativo?: boolean; ordem?: number }[] = [];
  snap.forEach((d) => list.push(d.data() as { nome: string; ativo?: boolean; ordem?: number }));
  list.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return list.filter((s) => s.ativo !== false);
}

export async function loadScaleDocsForMonth(
  ano: number,
  mes: number
): Promise<ScaleDocsByWeek> {
  const weeks = getWeeksOverlappingMonth(ano, mes);
  const out: ScaleDocsByWeek = {};
  await Promise.all(
    weeks.map(async (w) => {
      const [semSnap, altSnap] = await Promise.all([
        getDoc(doc(db, "escalas_semanais", w.id)),
        getDoc(doc(db, "escalas_alteracao", w.id)),
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
  secao: string
): Promise<ControleFrequenciaDocument | null> {
  const id = buildControleFrequenciaId(ano, mes, secao);
  const snap = await getDoc(doc(db, CONTROLE_FREQUENCIA_COLLECTION, id));
  if (!snap.exists()) return null;
  const data = snap.data() as ControleFrequenciaDocument;
  return {
    ...data,
    id: data.id || id,
    status: normalizeEscalaStatus(data.status),
    rows: Array.isArray(data.rows) ? data.rows : [],
    observacoes: Array.isArray(data.observacoes) ? data.observacoes : [],
  };
}

/** Status resumido dos documentos do ano (para cards de mês). */
export async function loadFrequenciaMonthStatuses(
  ano: number
): Promise<Record<number, { count: number; statuses: EscalaStatus[] }>> {
  const snap = await getDocs(
    query(collection(db, CONTROLE_FREQUENCIA_COLLECTION), where("ano", "==", ano))
  );
  const map: Record<number, { count: number; statuses: EscalaStatus[] }> = {};
  snap.forEach((d) => {
    const data = d.data() as ControleFrequenciaDocument;
    const mes = Number(data.mes);
    if (!map[mes]) map[mes] = { count: 0, statuses: [] };
    map[mes].count += 1;
    map[mes].statuses.push(normalizeEscalaStatus(data.status));
  });
  return map;
}

export async function ensureAndSyncControleFrequencia(options: {
  ano: number;
  mes: number;
  secao: string;
  usuario: Usuario;
  forceResync?: boolean;
}): Promise<{ doc: ControleFrequenciaDocument; created: boolean; synced: boolean }> {
  const id = buildControleFrequenciaId(options.ano, options.mes, options.secao);
  let existing = await loadControleFrequencia(options.ano, options.mes, options.secao);
  const created = !existing;
  if (!existing) {
    existing = buildEmptyControleDocument({
      id,
      ano: options.ano,
      mes: options.mes,
      secao: options.secao,
    });
  }

  const status = normalizeEscalaStatus(existing.status);
  const blocked =
    status === "aprovada" || status === "aguardando_aprovacao";

  // Auto-sync only on first create; explicit forceResync for button
  const shouldSync = (created || options.forceResync === true) && !blocked;

  if (!shouldSync) {
    return { doc: existing, created, synced: false };
  }

  const [cols, legendas, scaleDocs] = await Promise.all([
    loadColaboradores(),
    loadLegendas(),
    loadScaleDocsForMonth(options.ano, options.mes),
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

  const timestamp = Timestamp.now();
  const { data, hora } = formatNowParts();
  const next: ControleFrequenciaDocument = {
    ...docData,
    status: status || "em_edicao",
    versao: docData.versao && docData.versao > 0 ? docData.versao : 1,
    lastSaved: {
      nome: `${usuario.postoGrad} ${usuario.nome}`,
      re: usuario.re,
      timestamp,
    },
    responsavelEdicao: toResponsavel(usuario),
  };

  const payload = prepareFirestoreWrite(
    controleFrequenciaDocPath(next.id),
    next as unknown as Record<string, unknown>
  );
  await setDoc(doc(db, CONTROLE_FREQUENCIA_COLLECTION, next.id), payload);

  await registerAuditOperation({
    tipo: "SALVAR_CONTROLE_FREQUENCIA",
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
    tipo: "SYNC_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: docData.ano,
    semana: docData.mes,
    anoSemana: docData.id,
    detalhes: `Seção: ${docData.secao} · semanas: ${(docData.syncMeta?.sourceWeeks || []).join(", ")}`,
  });
}

/** Envia Controle de Frequência para aprovação (reutiliza solicitacoes_aprovacao). */
export async function submitFrequenciaForApproval(
  docData: ControleFrequenciaDocument,
  usuario: Usuario
): Promise<{ doc: ControleFrequenciaDocument; url: string; token: string }> {
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

  await setDoc(
    doc(db, CONTROLE_FREQUENCIA_COLLECTION, next.id),
    prepareFirestoreWrite(
      controleFrequenciaDocPath(next.id),
      next as unknown as Record<string, unknown>
    )
  );

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
  });

  return { doc: next, url: getTokenApprovalUrl(token), token };
}

export async function cancelFrequenciaApproval(
  docData: ControleFrequenciaDocument,
  usuario: Usuario
): Promise<ControleFrequenciaDocument> {
  const status = normalizeEscalaStatus(docData.status);
  if (status !== "aguardando_aprovacao") {
    throw new Error("Não há solicitação ativa para cancelar.");
  }
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
  await setDoc(
    doc(db, CONTROLE_FREQUENCIA_COLLECTION, next.id),
    prepareFirestoreWrite(
      controleFrequenciaDocPath(next.id),
      next as unknown as Record<string, unknown>
    )
  );
  await registerAuditOperation({
    tipo: "CANCELAR_SOLICITACAO_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    solicitacaoId: token,
  });
  return next;
}

export async function approveFrequencia(
  docData: ControleFrequenciaDocument,
  usuario: Usuario,
  observacao: string = ""
): Promise<ControleFrequenciaDocument> {
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
  await setDoc(
    doc(db, CONTROLE_FREQUENCIA_COLLECTION, next.id),
    prepareFirestoreWrite(
      controleFrequenciaDocPath(next.id),
      next as unknown as Record<string, unknown>
    )
  );
  await registerAuditOperation({
    tipo: "APROVAR_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    solicitacaoId: token,
  });
  return next;
}

export async function requestFrequenciaRevision(
  docData: ControleFrequenciaDocument,
  usuario: Usuario,
  motivo: string
): Promise<ControleFrequenciaDocument> {
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
  const evento = buildHistoricoEvento({
    tipo: "solicitacao_revisao",
    descricao: `Revisão solicitada — Controle de Frequência`,
    usuario,
    versao: docData.versao,
    solicitacaoId: token,
    detalhes: motivo,
  });
  const next: ControleFrequenciaDocument = {
    ...docData,
    status: "revisao_solicitada",
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
  await setDoc(
    doc(db, CONTROLE_FREQUENCIA_COLLECTION, next.id),
    prepareFirestoreWrite(
      controleFrequenciaDocPath(next.id),
      next as unknown as Record<string, unknown>
    )
  );
  await registerAuditOperation({
    tipo: "SOLICITAR_REVISAO_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    motivo,
    solicitacaoId: token,
  });
  return next;
}

export async function reopenFrequencia(
  docData: ControleFrequenciaDocument,
  usuario: Usuario,
  motivo: string
): Promise<ControleFrequenciaDocument> {
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
  await setDoc(
    doc(db, CONTROLE_FREQUENCIA_COLLECTION, next.id),
    prepareFirestoreWrite(
      controleFrequenciaDocPath(next.id),
      next as unknown as Record<string, unknown>
    )
  );
  await registerAuditOperation({
    tipo: "REABRIR_CONTROLE_FREQUENCIA",
    escala: "FREQUENCIA",
    usuario,
    ano: next.ano,
    semana: next.mes,
    anoSemana: next.id,
    motivo,
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
    status: normalizeEscalaStatus(data.status),
    rows: Array.isArray(data.rows) ? data.rows : [],
    observacoes: Array.isArray(data.observacoes) ? data.observacoes : [],
  };
}
