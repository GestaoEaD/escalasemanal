/**
 * Types for the Weekly Schedule System (Sistema de Escala de Serviço)
 */

export type PerfilUsuario = "Administrador" | "Operador" | "Gestor";

export type EscalaStatus =
  | "em_edicao"
  | "aguardando_aprovacao"
  | "aprovada"
  | "rejeitada";

export interface Usuario {
  /** Identificador da sessão (ID do documento no Firestore). */
  uid?: string;
  re: string;
  nomeCompleto?: string;
  nome: string; // Nome de Guerra
  postoGrad: string;
  secao: string;
  /** Perfil carregado exclusivamente do Firestore. */
  perfil?: PerfilUsuario;
  ativo?: boolean;
}

/** Metadados de um ator do fluxo de aprovação. */
export interface AprovacaoAtor {
  nome: string;
  re: string;
  postoGrad: string;
  timestamp?: any;
  data: string;
  hora: string;
}

export type HistoricoEscalaTipo =
  | "criacao"
  | "alteracao"
  | "envio_aprovacao"
  | "aprovacao"
  | "rejeicao"
  | "reabertura"
  | "nova_aprovacao";

/** Evento permanente do histórico da escala (ordem cronológica). */
export interface HistoricoEscalaEvento {
  id: string;
  tipo: HistoricoEscalaTipo;
  descricao: string;
  usuario: string;
  re: string;
  postoGrad?: string;
  data: string;
  hora: string;
  timestamp: any;
  versao?: number;
  solicitacaoId?: string;
  detalhes?: string;
}

/** Dados do ciclo de aprovação da Escala Semanal. */
export interface EscalaAprovacao {
  /** Identificador único desta solicitação de aprovação (invalida o link após encerrar). */
  solicitacaoId?: string;
  enviadoPor?: AprovacaoAtor | null;
  aprovadoPor?: AprovacaoAtor | null;
  rejeitadoPor?: AprovacaoAtor | null;
  motivoRejeicao?: string;
  observacaoAprovacao?: string;
  versaoEnviada?: number;
  versaoAprovada?: number;
}

export interface Colaborador {
  re: string;
  postoGrad: string;
  nome: string; // Nome de Guerra
  nomeCompleto?: string;
  secao: string;
  observacao?: string;
  ativo?: boolean;
  ordem?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface ScheduleRow {
  re: string;
  postoGrad: string;
  nome: string;
  secao: string;
  seg: string;
  ter: string;
  qua: string;
  qui: string;
  sex: string;
  sab: string;
  dom: string;
  observacao: string;
}

export interface LastSaved {
  nome: string;
  re: string;
  timestamp: any; // Firebase Timestamp or ISO string
}

export interface EscalaDocument {
  id: string; // Format: "year_week" e.g., "2026_01"
  ano: number;
  semana: number;
  periodo: string;
  rows: ScheduleRow[];
  lastSaved: LastSaved | null;
  observacoes?: string;
  /** Status do fluxo de aprovação (armazenado na Escala Semanal). */
  status?: EscalaStatus;
  /** Versão incremental do conteúdo da escala. */
  versao?: number;
  /** Metadados do ciclo de aprovação atual. */
  aprovacao?: EscalaAprovacao | null;
  /** Histórico permanente de eventos da escala (cronológico). */
  historico?: HistoricoEscalaEvento[];
}

export interface AuditLog {
  id?: string;
  timestamp: any;
  data: string; // DD/MM/YYYY
  hora: string; // HH:MM
  usuario: string; // Nome of the user who made the change
  re: string; // RE of the user who made the change
  painel: "Escala Semanal" | "Escala Alteração" | "Configurações" | "Aprovação";
  colaborador: string; // Name and/or RE of collaborator
  campoAlterado: string; // Field that was changed
  valorAnterior: string;
  novoValor: string;
  anoSemana: string; // Format "2026_01" for query filtering
  /** Campos extras de auditoria do fluxo de aprovação */
  versao?: number;
  solicitacaoId?: string;
  enviadoPor?: string;
  aprovadoPor?: string;
  gestorRe?: string;
}

export const ESCALA_STATUS_LABELS: Record<EscalaStatus, string> = {
  em_edicao: "Em edição",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
};

export const ESCALA_STATUS_EMOJI: Record<EscalaStatus, string> = {
  em_edicao: "🔵",
  aguardando_aprovacao: "🟡",
  aprovada: "🟢",
  rejeitada: "🔴",
};

export type DayOfWeek = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export const OPCOES_ESCALA = [
  "EN", // Escala Normal
  "F", // Folga
  "FC", // Folga Complementar
  "FDS", // Fim de Semana
  "Dispensa",
  "Licença",
  "Curso",
  "Férias",
  "Outro",
];

export const POSTOS_GRADUACOES = [
  "CR PM",
  "CEL PM",
  "LT CEL PM",
  "MAJ PM",
  "CAP PM",
  "1º TEN PM",
  "2º TEN PM",
  "SUBTEN PM",
  "1º SGT PM",
  "2º SGT PM",
  "3º SGT PM",
  "CB PM",
  "SD PM",
];
