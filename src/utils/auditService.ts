/**
 * Serviço centralizado de auditoria.
 * Nenhum componente deve gravar diretamente na coleção `logs`.
 */
import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  Timestamp,
  runTransaction,
} from "../firebase";
import {
  AuditAlteracao,
  AuditDocumentoTipo,
  AuditOperacaoTipo,
  AuditOperation,
  AuditUsuarioSnapshot,
  AUDIT_DOCUMENTO_LABELS,
  AUDIT_OPERACAO_LABELS,
  ESCALA_STATUS_LABELS,
  EscalaStatus,
  Usuario,
} from "../types";
import { prepareFirestoreWrite } from "./firestoreSanitize";

const LOGS_COLLECTION = "logs";

function formatNowParts(date: Date = new Date()): {
  timestamp: ReturnType<typeof Timestamp.fromDate>;
  data: string;
  hora: string;
  dataHora: string;
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
  return { timestamp, data, hora, dataHora: `${data} ${hora}` };
}

export function toAuditUsuario(usuario: Usuario | null | undefined): AuditUsuarioSnapshot {
  return {
    nome: usuario?.nome || "",
    re: usuario?.re || "",
    posto: usuario?.postoGrad || "",
    perfil: usuario?.perfil || "Operador",
  };
}

export function statusLabel(status?: EscalaStatus | string | null): string {
  if (!status) return "";
  if (status in ESCALA_STATUS_LABELS) {
    return ESCALA_STATUS_LABELS[status as EscalaStatus];
  }
  return String(status);
}

async function allocateLogId(): Promise<string> {
  const counterRef = doc(db, "counters", "logs");
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data()?.next || 1) : 1;
    const value = Number.isFinite(current) && current > 0 ? current : 1;
    tx.set(counterRef, { next: value + 1 }, { merge: true });
    return value;
  });
  return `LOG-${String(next).padStart(6, "0")}`;
}

function parseAnoSemana(anoSemana?: string): { ano?: number; semana?: number } {
  if (!anoSemana || !/^\d{4}_\d{1,2}$/.test(anoSemana)) return {};
  const [anoStr, semStr] = anoSemana.split("_");
  return { ano: Number(anoStr), semana: Number(semStr) };
}

export interface RegisterAuditInput {
  tipo: AuditOperacaoTipo;
  usuario: Usuario;
  escala?: AuditDocumentoTipo;
  anoSemana?: string;
  ano?: number;
  semana?: number;
  versao?: number;
  statusAnterior?: string;
  statusAtual?: string;
  alteracoes?: AuditAlteracao[];
  detalhes?: string;
  solicitacaoId?: string;
  motivo?: string;
  date?: Date;
}

/** Registra uma operação de auditoria (um documento). */
export async function registerAuditOperation(
  input: RegisterAuditInput
): Promise<AuditOperation> {
  const id = await allocateLogId();
  const { timestamp, data, hora, dataHora } = formatNowParts(input.date);
  const parsed = parseAnoSemana(input.anoSemana);
  const usuario = toAuditUsuario(input.usuario);

  const op: AuditOperation = {
    id,
    tipo: input.tipo,
    usuario,
    data,
    hora,
    dataHora,
    timestamp,
  };

  if (input.escala) op.escala = input.escala;
  if (input.anoSemana) op.anoSemana = input.anoSemana;
  if (typeof input.ano === "number") op.ano = input.ano;
  else if (typeof parsed.ano === "number") op.ano = parsed.ano;
  if (typeof input.semana === "number") op.semana = input.semana;
  else if (typeof parsed.semana === "number") op.semana = parsed.semana;
  if (typeof input.versao === "number") op.versao = input.versao;
  if (input.statusAnterior) op.statusAnterior = input.statusAnterior;
  if (input.statusAtual) op.statusAtual = input.statusAtual;
  if (input.alteracoes && input.alteracoes.length > 0) {
    op.alteracoes = input.alteracoes.map((a) => ({
      campo: String(a.campo ?? ""),
      antes: String(a.antes ?? ""),
      depois: String(a.depois ?? ""),
      ...(a.colaborador ? { colaborador: String(a.colaborador) } : {}),
    }));
  }
  if (input.detalhes) op.detalhes = input.detalhes;
  if (input.solicitacaoId) op.solicitacaoId = input.solicitacaoId;
  if (input.motivo) op.motivo = input.motivo;

  await setDoc(
    doc(db, LOGS_COLLECTION, id),
    prepareFirestoreWrite(`logs/${id}`, op as unknown as Record<string, unknown>)
  );

  return op;
}

/** Helpers tipados para escalas. */
export async function auditSalvarEscala(options: {
  usuario: Usuario;
  tipoDoc: "semanal" | "alteracao";
  anoSemana: string;
  versao?: number;
  statusAnterior?: string;
  statusAtual?: string;
  alteracoes: AuditAlteracao[];
}): Promise<AuditOperation | null> {
  if (!options.alteracoes.length) return null;
  return registerAuditOperation({
    tipo:
      options.tipoDoc === "alteracao"
        ? "SALVAR_ESCALA_ALTERACAO"
        : "SALVAR_ESCALA_SEMANAL",
    escala: options.tipoDoc === "alteracao" ? "ALTERACAO" : "SEMANAL",
    usuario: options.usuario,
    anoSemana: options.anoSemana,
    versao: options.versao,
    statusAnterior: options.statusAnterior,
    statusAtual: options.statusAtual,
    alteracoes: options.alteracoes,
  });
}

export async function auditWorkflowEscala(options: {
  usuario: Usuario;
  tipoDoc: "semanal" | "alteracao";
  acao:
    | "enviar"
    | "aprovar"
    | "revisao"
    | "cancelar"
    | "reabrir";
  anoSemana: string;
  versao?: number;
  statusAnterior?: string;
  statusAtual?: string;
  solicitacaoId?: string;
  motivo?: string;
  detalhes?: string;
}): Promise<AuditOperation> {
  const isAlt = options.tipoDoc === "alteracao";
  const tipoMap: Record<typeof options.acao, AuditOperacaoTipo> = {
    enviar: isAlt ? "ENVIAR_ESCALA_ALTERACAO" : "ENVIAR_ESCALA_SEMANAL",
    aprovar: isAlt ? "APROVAR_ESCALA_ALTERACAO" : "APROVAR_ESCALA_SEMANAL",
    revisao: isAlt ? "SOLICITAR_REVISAO_ALTERACAO" : "SOLICITAR_REVISAO_SEMANAL",
    cancelar: isAlt ? "CANCELAR_SOLICITACAO_ALTERACAO" : "CANCELAR_SOLICITACAO_SEMANAL",
    reabrir: isAlt ? "REABRIR_ESCALA_ALTERACAO" : "REABRIR_ESCALA_SEMANAL",
  };
  return registerAuditOperation({
    tipo: tipoMap[options.acao],
    escala: isAlt ? "ALTERACAO" : "SEMANAL",
    usuario: options.usuario,
    anoSemana: options.anoSemana,
    versao: options.versao,
    statusAnterior: options.statusAnterior,
    statusAtual: options.statusAtual,
    solicitacaoId: options.solicitacaoId,
    motivo: options.motivo,
    detalhes: options.detalhes,
  });
}

export async function auditAbrirLinkAprovacao(options: {
  usuario: Usuario;
  tipoDoc: "semanal" | "alteracao";
  anoSemana: string;
  versao?: number;
  solicitacaoId: string;
  detalhes?: string;
}): Promise<AuditOperation> {
  return registerAuditOperation({
    tipo: "ABRIR_LINK_APROVACAO",
    escala: options.tipoDoc === "alteracao" ? "ALTERACAO" : "SEMANAL",
    usuario: options.usuario,
    anoSemana: options.anoSemana,
    versao: options.versao,
    solicitacaoId: options.solicitacaoId,
    detalhes: options.detalhes || "Abertura do link de aprovação",
  });
}

export async function auditExportacao(options: {
  usuario: Usuario;
  anoSemana?: string;
  detalhes?: string;
}): Promise<AuditOperation> {
  return registerAuditOperation({
    tipo: "EXPORTAR",
    escala: "SISTEMA",
    usuario: options.usuario,
    anoSemana: options.anoSemana,
    detalhes: options.detalhes,
  });
}

export async function auditAuth(
  tipo: "LOGIN" | "LOGOUT",
  usuario: Usuario
): Promise<AuditOperation> {
  return registerAuditOperation({
    tipo,
    escala: "AUTENTICACAO",
    usuario,
  });
}

export async function auditConfiguracao(options: {
  usuario: Usuario;
  alteracoes: AuditAlteracao[];
  detalhes?: string;
}): Promise<AuditOperation | null> {
  if (!options.alteracoes.length) return null;
  return registerAuditOperation({
    tipo: "ALTERAR_CONFIGURACAO",
    escala: "CONFIGURACAO",
    usuario: options.usuario,
    anoSemana: "Configurações",
    alteracoes: options.alteracoes,
    detalhes: options.detalhes,
  });
}

/** Normaliza documento Firestore (novo ou legado) para AuditOperation. */
export function normalizeAuditOperation(
  id: string,
  raw: Record<string, any>
): AuditOperation {
  // Novo modelo
  if (raw.tipo && raw.usuario && typeof raw.usuario === "object") {
    return {
      id: raw.id || id,
      tipo: raw.tipo as AuditOperacaoTipo,
      escala: raw.escala,
      semana: raw.semana,
      ano: raw.ano,
      anoSemana: raw.anoSemana,
      usuario: {
        nome: raw.usuario.nome || "",
        re: raw.usuario.re || "",
        posto: raw.usuario.posto || "",
        perfil: raw.usuario.perfil || "Operador",
      },
      versao: raw.versao,
      statusAnterior: raw.statusAnterior,
      statusAtual: raw.statusAtual,
      data: raw.data || "",
      hora: raw.hora || "",
      dataHora: raw.dataHora || `${raw.data || ""} ${raw.hora || ""}`.trim(),
      timestamp: raw.timestamp,
      alteracoes: Array.isArray(raw.alteracoes) ? raw.alteracoes : undefined,
      detalhes: raw.detalhes,
      solicitacaoId: raw.solicitacaoId,
      motivo: raw.motivo,
      legado: !!raw.legado,
    };
  }

  // Modelo legado (um campo por documento)
  const painel = String(raw.painel || "");
  let escala: AuditDocumentoTipo = "SISTEMA";
  if (painel.includes("Semanal")) escala = "SEMANAL";
  else if (painel.includes("Alteração") || painel.includes("Alteracao")) escala = "ALTERACAO";
  else if (painel.includes("Config")) escala = "CONFIGURACAO";
  else if (painel.includes("Aprov")) escala = "SEMANAL";

  const campo = String(raw.campoAlterado || raw.operacao || "Alteração");
  const colaborador = String(raw.colaborador || raw.registroAlterado || "");
  const parsed = parseAnoSemana(raw.anoSemana);

  return {
    id: raw.id || id,
    tipo: "OPERACAO_LEGADA",
    escala,
    semana: parsed.semana,
    ano: parsed.ano,
    anoSemana: raw.anoSemana,
    usuario: {
      nome: String(raw.usuario || "").replace(/^(CB|SD|SGT|TEN|CAP|MAJ|CEL|LT)\s+PM\s+/i, "").trim() ||
        String(raw.usuario || ""),
      re: String(raw.re || ""),
      posto: "",
      perfil: String(raw.perfil || "Operador"),
    },
    versao: raw.versao,
    data: raw.data || "",
    hora: raw.hora || "",
    dataHora: `${raw.data || ""} ${raw.hora || ""}`.trim(),
    timestamp: raw.timestamp,
    alteracoes: [
      {
        campo,
        antes: String(raw.valorAnterior ?? ""),
        depois: String(raw.novoValor ?? ""),
        ...(colaborador ? { colaborador } : {}),
      },
    ],
    detalhes: painel || undefined,
    solicitacaoId: raw.solicitacaoId,
    legado: true,
  };
}

export async function loadAuditOperations(): Promise<AuditOperation[]> {
  const snap = await getDocs(collection(db, LOGS_COLLECTION));
  const list: AuditOperation[] = [];
  snap.forEach((d) => {
    list.push(normalizeAuditOperation(d.id, d.data() as Record<string, any>));
  });
  list.sort((a, b) => {
    const ta =
      a.timestamp?.toMillis?.() ??
      (a.timestamp ? new Date(a.timestamp).getTime() : 0);
    const tb =
      b.timestamp?.toMillis?.() ??
      (b.timestamp ? new Date(b.timestamp).getTime() : 0);
    return tb - ta;
  });
  return list;
}

export function getOperacaoLabel(tipo: AuditOperacaoTipo): string {
  return AUDIT_OPERACAO_LABELS[tipo] || tipo;
}

export function getDocumentoLabel(escala?: AuditDocumentoTipo): string {
  if (!escala) return "-";
  return AUDIT_DOCUMENTO_LABELS[escala] || escala;
}

/** Desnormaliza operações em linhas planas para exportação. */
export function flattenAuditForExport(ops: AuditOperation[]): Array<{
  operacaoId: string;
  data: string;
  hora: string;
  usuario: string;
  re: string;
  perfil: string;
  operacao: string;
  documento: string;
  semana: string;
  ano: string;
  campo: string;
  antes: string;
  depois: string;
  colaborador: string;
  versao: string;
  detalhes: string;
}> {
  const rows: ReturnType<typeof flattenAuditForExport> = [];
  for (const op of ops) {
    const base = {
      operacaoId: op.id.replace(/^LOG-0*/, "") || op.id,
      data: op.data,
      hora: op.hora,
      usuario: `${op.usuario.posto} ${op.usuario.nome}`.trim() || op.usuario.nome,
      re: op.usuario.re,
      perfil: op.usuario.perfil,
      operacao: getOperacaoLabel(op.tipo),
      documento: getDocumentoLabel(op.escala),
      semana: op.semana != null ? String(op.semana) : "",
      ano: op.ano != null ? String(op.ano) : "",
      versao: op.versao != null ? String(op.versao) : "",
      detalhes: op.detalhes || op.motivo || "",
    };
    const alts = op.alteracoes && op.alteracoes.length > 0 ? op.alteracoes : null;
    if (alts) {
      for (const a of alts) {
        rows.push({
          ...base,
          campo: a.campo,
          antes: a.antes,
          depois: a.depois,
          colaborador: a.colaborador || "",
        });
      }
    } else {
      rows.push({
        ...base,
        campo: getOperacaoLabel(op.tipo),
        antes: op.statusAnterior || "-",
        depois: op.statusAtual || op.motivo || "-",
        colaborador: "",
      });
    }
  }
  return rows;
}

/** Extrai número sequencial do id LOG-000145 → 145 */
export function auditOperationNumber(id: string): string {
  const m = String(id).match(/(\d+)$/);
  return m ? String(Number(m[1])) : id;
}
