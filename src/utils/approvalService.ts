import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
} from "../firebase";
import {
  AprovacaoAtor,
  EscalaAprovacao,
  EscalaDocument,
  EscalaStatus,
  HistoricoEscalaEvento,
  HistoricoEscalaTipo,
  TipoEscalaDocumento,
  TIPO_ESCALA_LABELS,
  Usuario,
} from "../types";
import { normalizeRe } from "./reUtils";
import { prepareFirestoreWrite } from "./firestoreSanitize";
import { cleanAprovacao, cleanHistorico } from "./escalaPayload";
import { auditWorkflowEscala, statusLabel } from "./auditService";
import {
  createApprovalToken,
  createSolicitacaoAprovacao,
  finalizeSolicitacaoAprovacao,
  getTokenApprovalUrl,
} from "./solicitacaoAprovacaoService";

export type EscalaCollectionName =
  | "escalas_semanais"
  | "escalas_alteracao"
  | "controle_frequencia";

export function getEscalaCollection(tipo: TipoEscalaDocumento): EscalaCollectionName {
  if (tipo === "alteracao") return "escalas_alteracao";
  if (tipo === "frequencia") return "controle_frequencia";
  return "escalas_semanais";
}

export function getEscalaDocumentoLabel(tipo: TipoEscalaDocumento): string {
  return TIPO_ESCALA_LABELS[tipo];
}

export function normalizeTipoEscalaDocumento(
  value: string | null | undefined
): TipoEscalaDocumento {
  if (value === "alteracao") return "alteracao";
  if (value === "frequencia") return "frequencia";
  return "semanal";
}

/** URL canônica: /aprovacao/{token}. Aceita legado /aprovacao/{tipo}/{escalaId}. */
export type ApprovalPathParsed =
  | { mode: "token"; token: string }
  | { mode: "legacy"; escalaId: string; tipo: TipoEscalaDocumento };

export function parseApprovalPath(pathname: string): ApprovalPathParsed | null {
  const typed = pathname.match(
    /^\/aprovacao\/(semanal|alteracao|frequencia)\/([^/]+)\/?$/i
  );
  if (typed) {
    try {
      return {
        mode: "legacy",
        tipo: normalizeTipoEscalaDocumento(typed[1]),
        escalaId: decodeURIComponent(typed[2]),
      };
    } catch {
      return {
        mode: "legacy",
        tipo: normalizeTipoEscalaDocumento(typed[1]),
        escalaId: typed[2],
      };
    }
  }
  const single = pathname.match(/^\/aprovacao\/([^/]+)\/?$/i);
  if (single) {
    const seg = single[1];
    if (/^(semanal|alteracao|frequencia)$/i.test(seg)) return null;
    let decoded = seg;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      /* keep */
    }
    // Links antigos: /aprovacao/2026_29
    if (/^\d{4}_\d{1,2}$/.test(decoded)) {
      return { mode: "legacy", tipo: "semanal", escalaId: decoded };
    }
    // Controle frequência: 2026_01_Secao
    if (/^\d{4}_\d{1,2}_.+/.test(decoded)) {
      return { mode: "legacy", tipo: "frequencia", escalaId: decoded };
    }
    return { mode: "token", token: decoded };
  }
  return null;
}

/** @deprecated Preferir buildTokenApprovalPath — mantido para compatibilidade. */
export function buildApprovalPath(
  escalaId: string,
  tipo: TipoEscalaDocumento = "semanal"
): string {
  return `/aprovacao/${tipo}/${encodeURIComponent(escalaId)}`;
}

/** @deprecated Preferir getTokenApprovalUrl. */
export function getApprovalUrl(
  escalaId: string,
  tipo: TipoEscalaDocumento = "semanal"
): string {
  if (typeof window === "undefined") return buildApprovalPath(escalaId, tipo);
  return `${window.location.origin}${buildApprovalPath(escalaId, tipo)}`;
}

/** Gera token aleatório (também usado como solicitacaoId no documento da escala). */
export function createSolicitacaoId(
  _escalaId?: string,
  _tipo?: TipoEscalaDocumento
): string {
  return createApprovalToken(11);
}

/** Resolve token ativo a partir do documento da escala (para Abrir Aprovação / Link). */
export async function resolveActiveApprovalToken(
  escalaId: string,
  tipo: TipoEscalaDocumento = "semanal"
): Promise<string | null> {
  const snap = await getDoc(doc(db, getEscalaCollection(tipo), escalaId));
  if (!snap.exists()) return null;
  const data = snap.data() as EscalaDocument;
  if (normalizeEscalaStatus(data.status) !== "aguardando_aprovacao") return null;
  const token = String(data.aprovacao?.solicitacaoId || "").trim();
  return token || null;
}

export function formatNowParts(date: Date = new Date()): {
  timestamp: ReturnType<typeof Timestamp.fromDate>;
  data: string;
  hora: string;
} {
  const timestamp = Timestamp.fromDate(date);
  const data =
    String(date.getDate()).padStart(2, "0") +
    "/" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "/" +
    date.getFullYear();
  const hora =
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0");
  return { timestamp, data, hora };
}

export function toAprovacaoAtor(usuario: Usuario, date: Date = new Date()): AprovacaoAtor {
  const { timestamp, data, hora } = formatNowParts(date);
  return {
    nome: usuario.nome || "",
    re: usuario.re || "",
    postoGrad: usuario.postoGrad || "",
    timestamp,
    data,
    hora,
  };
}

export function buildHistoricoEvento(options: {
  tipo: HistoricoEscalaTipo;
  descricao: string;
  usuario: Usuario | { nome: string; re: string; postoGrad?: string };
  versao?: number;
  solicitacaoId?: string;
  detalhes?: string;
  date?: Date;
}): HistoricoEscalaEvento {
  const { timestamp, data, hora } = formatNowParts(options.date);
  const evento: HistoricoEscalaEvento = {
    id: `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    tipo: options.tipo,
    descricao: options.descricao,
    usuario: options.usuario.nome,
    re: options.usuario.re,
    postoGrad: options.usuario.postoGrad || "",
    data,
    hora,
    timestamp,
  };
  if (typeof options.versao === "number") evento.versao = options.versao;
  if (options.solicitacaoId) evento.solicitacaoId = options.solicitacaoId;
  if (options.detalhes) evento.detalhes = options.detalhes;
  return evento;
}

function appendHistorico(
  existing: HistoricoEscalaEvento[] | undefined,
  evento: HistoricoEscalaEvento
): HistoricoEscalaEvento[] {
  return [...(existing || []), evento];
}

export async function findUsuarioByRe(inputRe: string): Promise<Usuario | null> {
  const raw = String(inputRe || "").trim();
  if (!raw) return null;
  const base = normalizeRe(raw);

  const tryIds = Array.from(new Set([raw, base]));
  for (const id of tryIds) {
    const snap = await getDoc(doc(db, "usuarios", id));
    if (snap.exists()) {
      const data = snap.data() as Usuario;
      return {
        ...data,
        uid: snap.id,
        re: data.re || snap.id,
        perfil: data.perfil,
      };
    }
  }

  const all = await getDocs(collection(db, "usuarios"));
  for (const d of all.docs) {
    const data = d.data() as Usuario;
    if (normalizeRe(d.id) === base || normalizeRe(data.re || "") === base) {
      return {
        ...data,
        uid: d.id,
        re: data.re || d.id,
        perfil: data.perfil,
      };
    }
  }
  return null;
}

export function normalizeEscalaStatus(status?: EscalaStatus | null): EscalaStatus {
  if (status === "rejeitada") return "revisao_solicitada";
  if (
    status === "aguardando_aprovacao" ||
    status === "aprovada" ||
    status === "revisao_solicitada" ||
    status === "em_edicao"
  ) {
    return status;
  }
  return "em_edicao";
}

/** Status em que o documento ainda pode ser editado (conteúdo). */
export function isEditableWorkflowStatus(status?: EscalaStatus | null): boolean {
  const st = normalizeEscalaStatus(status);
  return st === "em_edicao" || st === "revisao_solicitada";
}

/** Link só é válido enquanto a solicitação estiver aberta (aguardando). */
export function isApprovalRequestOpen(escala: EscalaDocument | null | undefined): boolean {
  return normalizeEscalaStatus(escala?.status) === "aguardando_aprovacao";
}

export function getClosedApprovalMessage(
  status: EscalaStatus,
  tipo: TipoEscalaDocumento = "semanal"
): string {
  const label = getEscalaDocumentoLabel(tipo);
  const st = normalizeEscalaStatus(status);
  switch (st) {
    case "aprovada":
      return `Esta solicitação já foi encerrada: a ${label} foi aprovada.`;
    case "revisao_solicitada":
      return `Esta solicitação já foi encerrada: foi solicitada revisão da ${label}.`;
    case "em_edicao":
      return `Esta solicitação já foi encerrada: a ${label} voltou para edição.`;
    default:
      return `Esta solicitação de aprovação da ${label} não está mais aberta.`;
  }
}

/** Motivo + ator da última solicitação de revisão (inclui legado rejeição). */
export function getRevisaoInfo(aprovacao: EscalaAprovacao | null | undefined): {
  por: AprovacaoAtor | null;
  motivo: string;
} {
  if (!aprovacao) return { por: null, motivo: "" };
  const por = aprovacao.revisaoSolicitadaPor || aprovacao.rejeitadoPor || null;
  const motivo = String(aprovacao.motivoRevisao || aprovacao.motivoRejeicao || "").trim();
  return { por, motivo };
}

export async function loadEscalaDocumento(
  escalaId: string,
  tipo: TipoEscalaDocumento
): Promise<EscalaDocument | null> {
  const snap = await getDoc(doc(db, getEscalaCollection(tipo), escalaId));
  if (!snap.exists()) return null;
  return snap.data() as EscalaDocument;
}

export async function loadWeeklyEscala(escalaId: string): Promise<EscalaDocument | null> {
  return loadEscalaDocumento(escalaId, "semanal");
}

export async function loadAlterationEscala(escalaId: string): Promise<EscalaDocument | null> {
  return loadEscalaDocumento(escalaId, "alteracao");
}

/** Texto curto de homologação para exportação / UI. */
export function formatHomologacaoResumo(
  status: EscalaStatus | undefined | null,
  aprovacao: EscalaAprovacao | null | undefined,
  versao?: number
): string {
  const st = normalizeEscalaStatus(status);
  const v = typeof versao === "number" && versao > 0 ? ` · v${versao}` : "";
  if (st === "aprovada" && aprovacao?.aprovadoPor) {
    const a = aprovacao.aprovadoPor;
    return `Status: Aprovada${v} · Homologada por ${a.postoGrad} ${a.nome} em ${a.data} às ${a.hora}`;
  }
  if (st === "aguardando_aprovacao") {
    return `Status: Aguardando Aprovação${v}`;
  }
  if (st === "revisao_solicitada") {
    const { por, motivo } = getRevisaoInfo(aprovacao);
    const quem = por ? ` · por ${por.postoGrad} ${por.nome}` : "";
    const mot = motivo ? ` · Motivo: ${motivo}` : "";
    return `Status: Revisão Solicitada${v}${quem}${mot}`;
  }
  return `Status: Em edição${v}`;
}

/** Envia um documento (Semanal ou Alteração) para aprovação. */
export async function submitScaleForApproval(
  escalaId: string,
  usuario: Usuario,
  tipo: TipoEscalaDocumento = "semanal"
): Promise<{
  status: EscalaStatus;
  versao: number;
  aprovacao: EscalaAprovacao;
  historico: HistoricoEscalaEvento[];
  url: string;
  token: string;
}> {
  const label = getEscalaDocumentoLabel(tipo);
  const collectionName = getEscalaCollection(tipo);
  const ref = doc(db, collectionName, escalaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(`${label} não encontrada.`);
  }
  const data = snap.data() as EscalaDocument;
  const currentStatus = normalizeEscalaStatus(data.status);
  if (currentStatus === "aguardando_aprovacao") {
    throw new Error(`Esta ${label} já está aguardando aprovação.`);
  }
  if (currentStatus === "aprovada") {
    throw new Error(
      `Esta ${label} já está aprovada. Somente um Gestor pode reabri-la para novo ciclo de edição.`
    );
  }

  const versao = data.versao && data.versao > 0 ? data.versao : 1;
  const solicitacaoId = createApprovalToken(11);
  const enviadoPor = toAprovacaoAtor(usuario);
  const aprovacao: EscalaAprovacao = {
    solicitacaoId,
    enviadoPor,
    aprovadoPor: null,
    revisaoSolicitadaPor: null,
    motivoRevisao: "",
    rejeitadoPor: null,
    motivoRejeicao: "",
    observacaoAprovacao: "",
    versaoEnviada: versao,
  };

  const isReenvio = (data.historico || []).some(
    (h) =>
      h.tipo === "aprovacao" ||
      h.tipo === "rejeicao" ||
      h.tipo === "solicitacao_revisao" ||
      h.tipo === "reabertura"
  );
  const fromRevisao = currentStatus === "revisao_solicitada";
  const evento = buildHistoricoEvento({
    tipo: isReenvio || fromRevisao ? "nova_aprovacao" : "envio_aprovacao",
    descricao:
      isReenvio || fromRevisao
        ? `Enviada novamente para aprovação — ${label} (v${versao})`
        : `Enviado para aprovação — ${label} (v${versao})`,
    usuario,
    versao,
    solicitacaoId,
  });
  const historico = cleanHistorico(appendHistorico(data.historico, evento));
  const aprovacaoLimpa = cleanAprovacao(aprovacao);

  await createSolicitacaoAprovacao({
    token: solicitacaoId,
    tipo,
    escalaId,
    versao,
    usuario,
  });

  await setDoc(
    ref,
    prepareFirestoreWrite(`${collectionName}/submit`, {
      status: "aguardando_aprovacao" as EscalaStatus,
      versao,
      aprovacao: aprovacaoLimpa,
      historico,
    }),
    { merge: true }
  );

  await auditWorkflowEscala({
    usuario,
    tipoDoc: tipo,
    acao: "enviar",
    anoSemana: escalaId,
    versao,
    statusAnterior: statusLabel(currentStatus),
    statusAtual: statusLabel("aguardando_aprovacao"),
    solicitacaoId,
    detalhes:
      isReenvio || fromRevisao
        ? `Nova submissão após revisão · token interno gerado`
        : `Envio para Aprovação · token interno gerado`,
  });

  return {
    status: "aguardando_aprovacao",
    versao,
    aprovacao: aprovacaoLimpa || aprovacao,
    historico,
    url: getTokenApprovalUrl(solicitacaoId),
    token: solicitacaoId,
  };
}

export async function approveScale(
  escalaId: string,
  gestor: Usuario,
  observacao: string = "",
  tipo: TipoEscalaDocumento = "semanal"
): Promise<void> {
  const label = getEscalaDocumentoLabel(tipo);
  const collectionName = getEscalaCollection(tipo);
  const ref = doc(db, collectionName, escalaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`${label} não encontrada.`);
  const data = snap.data() as EscalaDocument;
  const currentStatus = normalizeEscalaStatus(data.status);
  if (currentStatus !== "aguardando_aprovacao") {
    throw new Error(getClosedApprovalMessage(currentStatus, tipo));
  }

  const versao = data.versao && data.versao > 0 ? data.versao : 1;
  const solicitacaoId = data.aprovacao?.solicitacaoId || "";
  const aprovadoPor = toAprovacaoAtor(gestor);
  const enviadoPor = data.aprovacao?.enviadoPor || null;
  const aprovacao: EscalaAprovacao = {
    solicitacaoId: solicitacaoId || undefined,
    enviadoPor,
    aprovadoPor,
    revisaoSolicitadaPor: null,
    motivoRevisao: "",
    rejeitadoPor: null,
    motivoRejeicao: "",
    observacaoAprovacao: observacao || "",
    versaoAprovada: versao,
    versaoEnviada: data.aprovacao?.versaoEnviada ?? versao,
  };

  const evento = buildHistoricoEvento({
    tipo: "aprovacao",
    descricao: `Aprovada — ${label} por ${gestor.postoGrad} ${gestor.nome} (v${versao})`,
    usuario: gestor,
    versao,
    solicitacaoId,
    detalhes: observacao || undefined,
  });
  const historico = cleanHistorico(appendHistorico(data.historico, evento));
  const aprovacaoLimpa = cleanAprovacao(aprovacao);

  await setDoc(
    ref,
    prepareFirestoreWrite(`${collectionName}/approve`, {
      status: "aprovada" as EscalaStatus,
      versao,
      aprovacao: aprovacaoLimpa,
      historico,
    }),
    { merge: true }
  );

  await auditWorkflowEscala({
    usuario: gestor,
    tipoDoc: tipo,
    acao: "aprovar",
    anoSemana: escalaId,
    versao,
    statusAnterior: statusLabel("aguardando_aprovacao"),
    statusAtual: statusLabel("aprovada"),
    solicitacaoId,
    detalhes: observacao || undefined,
  });

  if (solicitacaoId) {
    await finalizeSolicitacaoAprovacao({
      token: solicitacaoId,
      resultado: "APROVADA",
      usuario: gestor,
    });
  }
}

/**
 * Solicita revisão (devolução para correção) com motivo obrigatório.
 * Status → revisao_solicitada. Não usa o termo "rejeitar".
 */
export async function requestRevisionScale(
  escalaId: string,
  gestor: Usuario,
  motivo: string,
  tipo: TipoEscalaDocumento = "semanal"
): Promise<void> {
  const motivoTrim = String(motivo || "").trim();
  if (!motivoTrim) {
    throw new Error("Informe o motivo da revisão.");
  }

  const label = getEscalaDocumentoLabel(tipo);
  const collectionName = getEscalaCollection(tipo);
  const ref = doc(db, collectionName, escalaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`${label} não encontrada.`);
  const data = snap.data() as EscalaDocument;
  const currentStatus = normalizeEscalaStatus(data.status);
  if (currentStatus !== "aguardando_aprovacao") {
    throw new Error(getClosedApprovalMessage(currentStatus, tipo));
  }

  const versaoAnterior = data.versao && data.versao > 0 ? data.versao : 1;
  const novaVersao = versaoAnterior + 1;
  const solicitacaoId = data.aprovacao?.solicitacaoId || "";
  const revisaoSolicitadaPor = toAprovacaoAtor(gestor);
  const enviadoPor = data.aprovacao?.enviadoPor || null;
  const aprovacao: EscalaAprovacao = {
    solicitacaoId: solicitacaoId || undefined,
    enviadoPor,
    aprovadoPor: null,
    revisaoSolicitadaPor,
    motivoRevisao: motivoTrim,
    rejeitadoPor: null,
    motivoRejeicao: "",
    observacaoAprovacao: motivoTrim,
    versaoEnviada: data.aprovacao?.versaoEnviada,
  };

  const evento = buildHistoricoEvento({
    tipo: "solicitacao_revisao",
    descricao: `Revisão solicitada — ${label} por ${gestor.postoGrad} ${gestor.nome} (v${versaoAnterior} → v${novaVersao})`,
    usuario: gestor,
    versao: novaVersao,
    solicitacaoId,
    detalhes: `Motivo: ${motivoTrim}`,
  });
  const historico = cleanHistorico(appendHistorico(data.historico, evento));
  const aprovacaoLimpa = cleanAprovacao(aprovacao);

  await setDoc(
    ref,
    prepareFirestoreWrite(`${collectionName}/revisao`, {
      status: "revisao_solicitada" as EscalaStatus,
      versao: novaVersao,
      aprovacao: aprovacaoLimpa,
      historico,
    }),
    { merge: true }
  );

  await auditWorkflowEscala({
    usuario: gestor,
    tipoDoc: tipo,
    acao: "revisao",
    anoSemana: escalaId,
    versao: novaVersao,
    statusAnterior: statusLabel("aguardando_aprovacao"),
    statusAtual: statusLabel("revisao_solicitada"),
    solicitacaoId,
    motivo: motivoTrim,
  });

  if (solicitacaoId) {
    await finalizeSolicitacaoAprovacao({
      token: solicitacaoId,
      resultado: "REVISAO_SOLICITADA",
      usuario: gestor,
    });
  }
}

/** @deprecated Use requestRevisionScale. */
export async function rejectScale(
  escalaId: string,
  gestor: Usuario,
  motivo: string = "",
  tipo: TipoEscalaDocumento = "semanal"
): Promise<void> {
  return requestRevisionScale(escalaId, gestor, motivo, tipo);
}

/** Cancela solicitação de aprovação (Administrador) → Em edição. */
export async function cancelApprovalRequest(
  escalaId: string,
  usuario: Usuario,
  tipo: TipoEscalaDocumento = "semanal"
): Promise<{ status: EscalaStatus; versao: number; aprovacao: null; historico: HistoricoEscalaEvento[] }> {
  const label = getEscalaDocumentoLabel(tipo);
  const collectionName = getEscalaCollection(tipo);
  const ref = doc(db, collectionName, escalaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`${label} não encontrada.`);
  const data = snap.data() as EscalaDocument;
  const currentStatus = normalizeEscalaStatus(data.status);
  if (currentStatus !== "aguardando_aprovacao") {
    throw new Error("Somente solicitações em aguardo podem ser canceladas.");
  }

  const versao = data.versao && data.versao > 0 ? data.versao : 1;
  const solicitacaoId = data.aprovacao?.solicitacaoId || "";
  const evento = buildHistoricoEvento({
    tipo: "cancelamento_solicitacao",
    descricao: `Solicitação de aprovação cancelada — ${label} (v${versao})`,
    usuario,
    versao,
    solicitacaoId: solicitacaoId || undefined,
  });
  const historico = cleanHistorico(appendHistorico(data.historico, evento));

  await setDoc(
    ref,
    prepareFirestoreWrite(`${collectionName}/cancel`, {
      status: "em_edicao" as EscalaStatus,
      versao,
      aprovacao: null,
      historico,
    }),
    { merge: true }
  );

  await auditWorkflowEscala({
    usuario,
    tipoDoc: tipo,
    acao: "cancelar",
    anoSemana: escalaId,
    versao,
    statusAnterior: statusLabel("aguardando_aprovacao"),
    statusAtual: statusLabel("em_edicao"),
    solicitacaoId: solicitacaoId || undefined,
  });

  if (solicitacaoId) {
    await finalizeSolicitacaoAprovacao({
      token: solicitacaoId,
      resultado: "CANCELADA",
      usuario,
    });
  }

  return { status: "em_edicao", versao, aprovacao: null, historico };
}

/**
 * Reabre documento aprovado (somente Gestor) com motivo obrigatório.
 * Incrementa versão, limpa aprovação e exige novo ciclo.
 */
export async function reopenApprovedScale(
  escalaId: string,
  gestor: Usuario,
  motivo: string,
  tipo: TipoEscalaDocumento = "semanal"
): Promise<{ status: EscalaStatus; versao: number; aprovacao: null; historico: HistoricoEscalaEvento[] }> {
  const motivoTrim = String(motivo || "").trim();
  if (!motivoTrim) {
    throw new Error("Informe o motivo da reabertura.");
  }

  const label = getEscalaDocumentoLabel(tipo);
  const collectionName = getEscalaCollection(tipo);
  const ref = doc(db, collectionName, escalaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`${label} não encontrada.`);
  const data = snap.data() as EscalaDocument;
  const currentStatus = normalizeEscalaStatus(data.status);
  if (currentStatus !== "aprovada") {
    throw new Error(`Somente ${label.toLowerCase()} aprovada pode ser reaberta.`);
  }

  const versaoAnterior = data.versao && data.versao > 0 ? data.versao : 1;
  const novaVersao = versaoAnterior + 1;
  const solicitacaoId = data.aprovacao?.solicitacaoId || "";

  const evento = buildHistoricoEvento({
    tipo: "reabertura",
    descricao: `Reaberta — ${label} por ${gestor.postoGrad} ${gestor.nome} (v${versaoAnterior} → v${novaVersao})`,
    usuario: gestor,
    versao: novaVersao,
    solicitacaoId: solicitacaoId || undefined,
    detalhes: `Motivo: ${motivoTrim}`,
  });
  const historico = cleanHistorico(appendHistorico(data.historico, evento));

  await setDoc(
    ref,
    prepareFirestoreWrite(`${collectionName}/reopen`, {
      status: "em_edicao" as EscalaStatus,
      versao: novaVersao,
      aprovacao: null,
      historico,
    }),
    { merge: true }
  );

  await auditWorkflowEscala({
    usuario: gestor,
    tipoDoc: tipo,
    acao: "reabrir",
    anoSemana: escalaId,
    versao: novaVersao,
    statusAnterior: statusLabel("aprovada"),
    statusAtual: statusLabel("em_edicao"),
    solicitacaoId: solicitacaoId || undefined,
    motivo: motivoTrim,
  });

  return { status: "em_edicao", versao: novaVersao, aprovacao: null, historico };
}

/** @deprecated Mantido apenas para testes legados — a reabertura oficial é reopenApprovedScale. */
export function buildReopenAfterEdit(
  currentStatus: EscalaStatus,
  currentVersao: number
): {
  status: EscalaStatus;
  versao: number;
  aprovacao: null;
  shouldLog: boolean;
  previousStatus: EscalaStatus;
} {
  const shouldLog = currentStatus === "aprovada";
  return {
    status: "em_edicao",
    versao: currentStatus === "aprovada" ? currentVersao + 1 : Math.max(1, currentVersao),
    aprovacao: null,
    shouldLog,
    previousStatus: currentStatus,
  };
}
