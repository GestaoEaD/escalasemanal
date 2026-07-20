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
  AuditLog,
  EscalaAprovacao,
  EscalaDocument,
  EscalaStatus,
  HistoricoEscalaEvento,
  HistoricoEscalaTipo,
  Usuario,
} from "../types";
import { normalizeRe } from "./reUtils";
import { prepareFirestoreWrite } from "./firestoreSanitize";
import { cleanAprovacao, cleanHistorico } from "./escalaPayload";

export function buildApprovalPath(escalaId: string): string {
  return `/aprovacao/${encodeURIComponent(escalaId)}`;
}

export function getApprovalUrl(escalaId: string): string {
  if (typeof window === "undefined") return buildApprovalPath(escalaId);
  return `${window.location.origin}${buildApprovalPath(escalaId)}`;
}

export function createSolicitacaoId(escalaId: string): string {
  return `sol_${escalaId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

async function writeApprovalLog(partial: {
  timestamp: any;
  data: string;
  hora: string;
  usuario: string;
  re: string;
  campoAlterado: string;
  valorAnterior?: string;
  novoValor?: string;
  anoSemana: string;
  versao?: number;
  solicitacaoId?: string;
  enviadoPor?: string;
  aprovadoPor?: string;
  gestorRe?: string;
}) {
  const log: AuditLog = {
    timestamp: partial.timestamp,
    data: partial.data,
    hora: partial.hora,
    usuario: partial.usuario,
    re: partial.re,
    painel: "Aprovação",
    colaborador: "Geral",
    campoAlterado: partial.campoAlterado,
    valorAnterior: partial.valorAnterior || "",
    novoValor: partial.novoValor || "",
    anoSemana: partial.anoSemana,
  };
  if (typeof partial.versao === "number") log.versao = partial.versao;
  if (partial.solicitacaoId) log.solicitacaoId = partial.solicitacaoId;
  if (partial.enviadoPor) log.enviadoPor = partial.enviadoPor;
  if (partial.aprovadoPor) log.aprovadoPor = partial.aprovadoPor;
  if (partial.gestorRe) log.gestorRe = partial.gestorRe;

  await setDoc(
    doc(collection(db, "logs")),
    prepareFirestoreWrite("logs/aprovacao", log as unknown as Record<string, unknown>)
  );
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
  if (
    status === "aguardando_aprovacao" ||
    status === "aprovada" ||
    status === "rejeitada" ||
    status === "em_edicao"
  ) {
    return status;
  }
  return "em_edicao";
}

/** Link só é válido enquanto a solicitação estiver aberta (aguardando). */
export function isApprovalRequestOpen(escala: EscalaDocument | null | undefined): boolean {
  return normalizeEscalaStatus(escala?.status) === "aguardando_aprovacao";
}

export function getClosedApprovalMessage(status: EscalaStatus): string {
  switch (status) {
    case "aprovada":
      return "Esta solicitação de aprovação já foi encerrada: a escala foi aprovada.";
    case "rejeitada":
      return "Esta solicitação de aprovação já foi encerrada: a escala foi rejeitada.";
    case "em_edicao":
      return "Esta solicitação de aprovação já foi encerrada: a escala voltou para edição.";
    default:
      return "Esta solicitação de aprovação não está mais aberta.";
  }
}

export async function loadWeeklyEscala(escalaId: string): Promise<EscalaDocument | null> {
  const snap = await getDoc(doc(db, "escalas_semanais", escalaId));
  if (!snap.exists()) return null;
  return snap.data() as EscalaDocument;
}

export async function loadAlterationEscala(escalaId: string): Promise<EscalaDocument | null> {
  const snap = await getDoc(doc(db, "escalas_alteracao", escalaId));
  if (!snap.exists()) return null;
  return snap.data() as EscalaDocument;
}

/** Envia a Escala Semanal para aprovação. */
export async function submitScaleForApproval(
  escalaId: string,
  usuario: Usuario
): Promise<{ status: EscalaStatus; versao: number; aprovacao: EscalaAprovacao; historico: HistoricoEscalaEvento[]; url: string }> {
  const ref = doc(db, "escalas_semanais", escalaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Escala não encontrada.");
  }
  const data = snap.data() as EscalaDocument;
  const currentStatus = normalizeEscalaStatus(data.status);
  if (currentStatus === "aguardando_aprovacao") {
    throw new Error("Esta escala já está aguardando aprovação.");
  }
  if (currentStatus === "aprovada") {
    throw new Error("Esta escala já está aprovada. Edite-a para reabrir o ciclo.");
  }

  const versao = data.versao && data.versao > 0 ? data.versao : 1;
  const solicitacaoId = createSolicitacaoId(escalaId);
  const enviadoPor = toAprovacaoAtor(usuario);
  const aprovacao: EscalaAprovacao = {
    solicitacaoId,
    enviadoPor,
    aprovadoPor: null,
    rejeitadoPor: null,
    motivoRejeicao: "",
    observacaoAprovacao: "",
    versaoEnviada: versao,
  };

  const isReenvio = (data.historico || []).some(
    (h) => h.tipo === "aprovacao" || h.tipo === "rejeicao" || h.tipo === "reabertura"
  );
  const evento = buildHistoricoEvento({
    tipo: isReenvio ? "nova_aprovacao" : "envio_aprovacao",
    descricao: isReenvio
      ? `Nova solicitação de aprovação (v${versao})`
      : `Enviado para aprovação (v${versao})`,
    usuario,
    versao,
    solicitacaoId,
  });
  const historico = cleanHistorico(appendHistorico(data.historico, evento));
  const aprovacaoLimpa = cleanAprovacao(aprovacao);

  console.log("Escala antes do Firestore (submit):", {
    status: "aguardando_aprovacao",
    versao,
    aprovacao: aprovacaoLimpa,
    historico,
  });

  await setDoc(
    ref,
    prepareFirestoreWrite("escalas_semanais/submit", {
      status: "aguardando_aprovacao" as EscalaStatus,
      versao,
      aprovacao: aprovacaoLimpa,
      historico,
    }),
    { merge: true }
  );

  const { timestamp, data: dataStr, hora } = formatNowParts();
  await writeApprovalLog({
    timestamp,
    data: dataStr,
    hora,
    usuario: `${usuario.postoGrad} ${usuario.nome}`.trim(),
    re: usuario.re,
    campoAlterado: isReenvio ? "Nova solicitação de aprovação" : "Envio para Aprovação",
    valorAnterior: currentStatus,
    novoValor: "aguardando_aprovacao",
    anoSemana: escalaId,
    versao,
    solicitacaoId,
    enviadoPor: `${enviadoPor.postoGrad} ${enviadoPor.nome} (RE ${normalizeRe(enviadoPor.re)})`,
  });

  return {
    status: "aguardando_aprovacao",
    versao,
    aprovacao: aprovacaoLimpa || aprovacao,
    historico,
    url: getApprovalUrl(escalaId),
  };
}

export async function approveScale(
  escalaId: string,
  gestor: Usuario,
  observacao: string = ""
): Promise<void> {
  const ref = doc(db, "escalas_semanais", escalaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Escala não encontrada.");
  const data = snap.data() as EscalaDocument;
  const currentStatus = normalizeEscalaStatus(data.status);
  if (currentStatus !== "aguardando_aprovacao") {
    throw new Error(getClosedApprovalMessage(currentStatus));
  }

  const versao = data.versao && data.versao > 0 ? data.versao : 1;
  const solicitacaoId = data.aprovacao?.solicitacaoId || "";
  const aprovadoPor = toAprovacaoAtor(gestor);
  const enviadoPor = data.aprovacao?.enviadoPor || null;
  const aprovacao: EscalaAprovacao = {
    solicitacaoId: solicitacaoId || undefined,
    enviadoPor,
    aprovadoPor,
    rejeitadoPor: null,
    motivoRejeicao: "",
    observacaoAprovacao: observacao || "",
    versaoAprovada: versao,
    versaoEnviada: data.aprovacao?.versaoEnviada ?? versao,
  };

  const evento = buildHistoricoEvento({
    tipo: "aprovacao",
    descricao: `Aprovada por ${gestor.postoGrad} ${gestor.nome} (v${versao})`,
    usuario: gestor,
    versao,
    solicitacaoId,
    detalhes: observacao || undefined,
  });
  const historico = cleanHistorico(appendHistorico(data.historico, evento));
  const aprovacaoLimpa = cleanAprovacao(aprovacao);

  console.log("Escala antes do Firestore (approve):", {
    status: "aprovada",
    versao,
    aprovacao: aprovacaoLimpa,
    historico,
  });

  await setDoc(
    ref,
    prepareFirestoreWrite("escalas_semanais/approve", {
      status: "aprovada" as EscalaStatus,
      versao,
      aprovacao: aprovacaoLimpa,
      historico,
    }),
    { merge: true }
  );

  const { timestamp, data: dataStr, hora } = formatNowParts();
  await writeApprovalLog({
    timestamp,
    data: dataStr,
    hora,
    usuario: `${gestor.postoGrad} ${gestor.nome}`.trim(),
    re: gestor.re,
    campoAlterado: "Aprovação",
    valorAnterior: "aguardando_aprovacao",
    novoValor: observacao ? `aprovada (v${versao}): ${observacao}` : `aprovada (v${versao})`,
    anoSemana: escalaId,
    versao,
    solicitacaoId,
    enviadoPor: enviadoPor
      ? `${enviadoPor.postoGrad} ${enviadoPor.nome} (RE ${normalizeRe(enviadoPor.re)})`
      : undefined,
    aprovadoPor: `${aprovadoPor.postoGrad} ${aprovadoPor.nome} (RE ${normalizeRe(aprovadoPor.re)})`,
    gestorRe: normalizeRe(gestor.re),
  });
}

export async function rejectScale(
  escalaId: string,
  gestor: Usuario,
  motivo: string = ""
): Promise<void> {
  const ref = doc(db, "escalas_semanais", escalaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Escala não encontrada.");
  const data = snap.data() as EscalaDocument;
  const currentStatus = normalizeEscalaStatus(data.status);
  if (currentStatus !== "aguardando_aprovacao") {
    throw new Error(getClosedApprovalMessage(currentStatus));
  }

  const versao = data.versao && data.versao > 0 ? data.versao : 1;
  const solicitacaoId = data.aprovacao?.solicitacaoId || "";
  const rejeitadoPor = toAprovacaoAtor(gestor);
  const enviadoPor = data.aprovacao?.enviadoPor || null;
  const aprovacao: EscalaAprovacao = {
    solicitacaoId: solicitacaoId || undefined,
    enviadoPor,
    rejeitadoPor,
    aprovadoPor: null,
    motivoRejeicao: motivo || "",
    observacaoAprovacao: motivo || "",
    versaoEnviada: data.aprovacao?.versaoEnviada,
  };

  const evento = buildHistoricoEvento({
    tipo: "rejeicao",
    descricao: `Rejeitada por ${gestor.postoGrad} ${gestor.nome}`,
    usuario: gestor,
    versao,
    solicitacaoId,
    detalhes: motivo || undefined,
  });
  const historico = cleanHistorico(appendHistorico(data.historico, evento));
  const aprovacaoLimpa = cleanAprovacao(aprovacao);

  console.log("Escala antes do Firestore (reject):", {
    status: "rejeitada",
    aprovacao: aprovacaoLimpa,
    historico,
  });

  await setDoc(
    ref,
    prepareFirestoreWrite("escalas_semanais/reject", {
      status: "rejeitada" as EscalaStatus,
      aprovacao: aprovacaoLimpa,
      historico,
    }),
    { merge: true }
  );

  const { timestamp, data: dataStr, hora } = formatNowParts();
  await writeApprovalLog({
    timestamp,
    data: dataStr,
    hora,
    usuario: `${gestor.postoGrad} ${gestor.nome}`.trim(),
    re: gestor.re,
    campoAlterado: "Rejeição",
    valorAnterior: "aguardando_aprovacao",
    novoValor: motivo ? `rejeitada: ${motivo}` : "rejeitada",
    anoSemana: escalaId,
    versao,
    solicitacaoId,
    enviadoPor: enviadoPor
      ? `${enviadoPor.postoGrad} ${enviadoPor.nome} (RE ${normalizeRe(enviadoPor.re)})`
      : undefined,
    aprovadoPor: `${rejeitadoPor.postoGrad} ${rejeitadoPor.nome} (RE ${normalizeRe(rejeitadoPor.re)})`,
    gestorRe: normalizeRe(gestor.re),
  });
}

/** Limpa aprovação ao editar escala aprovada/aguardando (Administrador). */
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
  const shouldLog =
    currentStatus === "aprovada" || currentStatus === "aguardando_aprovacao";
  return {
    status: "em_edicao",
    versao: currentStatus === "aprovada" ? currentVersao + 1 : Math.max(1, currentVersao),
    aprovacao: null,
    shouldLog,
    previousStatus: currentStatus,
  };
}
