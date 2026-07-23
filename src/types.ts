/**
 * Types for the Weekly Schedule System (Sistema de Escala de Serviço)
 */

export type PerfilUsuario = "Administrador" | "Operador" | "Gestor";

export type EscalaStatus =
  | "em_edicao"
  | "aguardando_aprovacao"
  | "aprovada"
  | "revisao_solicitada"
  /** @deprecated Preferir revisao_solicitada — mantido para documentos legados. */
  | "rejeitada";

/** Documento oficial com ciclo de aprovação próprio. */
export type TipoEscalaDocumento = "semanal" | "alteracao" | "frequencia";

/** Provedor de autenticação (Google Auth + cadastro em usuarios). */
export type AuthProvider = "local" | "google";

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
  /**
   * E-mail Google (minúsculas). Vínculo com a Conta Google autenticada.
   * Usuários legados podem estar sem valor e não conseguem entrar.
   */
  email?: string;
  /** Preferencialmente "google" após autenticação Firebase. */
  authProvider?: AuthProvider;
  /** Último login via Google (ISO). */
  ultimoLogin?: string | null;
  /** true quando o e-mail foi confirmado pelo Firebase Auth. */
  emailVerificado?: boolean;
  /** URL da foto da Conta Google (Firebase Auth photoURL). */
  photoURL?: string | null;
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
  | "solicitacao_revisao"
  | "rejeicao"
  | "reabertura"
  | "cancelamento_solicitacao"
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

/** Dados do ciclo de aprovação de um documento (Semanal ou Alteração). */
export interface EscalaAprovacao {
  /** Identificador único desta solicitação de aprovação (invalida o link após encerrar). */
  solicitacaoId?: string;
  enviadoPor?: AprovacaoAtor | null;
  aprovadoPor?: AprovacaoAtor | null;
  /** Gestor que solicitou revisão (devolução para correção). */
  revisaoSolicitadaPor?: AprovacaoAtor | null;
  motivoRevisao?: string;
  /** @deprecated Preferir revisaoSolicitadaPor. */
  rejeitadoPor?: AprovacaoAtor | null;
  /** @deprecated Preferir motivoRevisao. */
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
  /** E-mail Google de acesso (minúsculas). Usado ao conceder permissão. */
  email?: string;
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
  /** Status do fluxo de aprovação deste documento (independente por coleção). */
  status?: EscalaStatus;
  /** Versão incremental do conteúdo deste documento. */
  versao?: number;
  /** Metadados do ciclo de aprovação atual deste documento. */
  aprovacao?: EscalaAprovacao | null;
  /** Histórico permanente de eventos deste documento (cronológico). */
  historico?: HistoricoEscalaEvento[];
}

export const TIPO_ESCALA_LABELS: Record<TipoEscalaDocumento, string> = {
  semanal: "Escala Semanal",
  alteracao: "Escala de Alteração",
  frequencia: "Controle de Frequência",
};

/** Tipo do documento na coleção solicitacoes_aprovacao. */
export type SolicitacaoTipoDocumento =
  | "ESCALA_SEMANAL"
  | "ESCALA_ALTERACAO"
  | "CONTROLE_FREQUENCIA";

export type SolicitacaoAprovacaoStatus = "AGUARDANDO" | "FINALIZADA";

export type SolicitacaoAprovacaoResultado =
  | "APROVADA"
  | "REVISAO_SOLICITADA"
  | "CANCELADA"
  | null;

/** Documento em solicitacoes_aprovacao — link exclusivo por token. */
export interface SolicitacaoAprovacao {
  token: string;
  tipoDocumento: SolicitacaoTipoDocumento;
  semana: number;
  ano: number;
  escalaId: string;
  versao: number;
  status: SolicitacaoAprovacaoStatus;
  criadoPor: {
    nome: string;
    re: string;
    postoGrad?: string;
  };
  criadoEm: any;
  expiraEm: any;
  utilizado: boolean;
  resultado?: SolicitacaoAprovacaoResultado;
  finalizadoPor?: {
    nome: string;
    re: string;
    postoGrad?: string;
  } | null;
  finalizadoEm?: any;
  dataFinalizacao?: string;
  horaFinalizacao?: string;
}

/** Item interno de alteração dentro de uma operação de auditoria. */
export interface AuditAlteracao {
  campo: string;
  antes: string;
  depois: string;
  /** Colaborador / registro afetado (quando aplicável). */
  colaborador?: string;
}

/** Tipos de operação de auditoria (um documento por operação). */
export type AuditOperacaoTipo =
  | "SALVAR_ESCALA_SEMANAL"
  | "SALVAR_ESCALA_ALTERACAO"
  | "ENVIAR_ESCALA_SEMANAL"
  | "ENVIAR_ESCALA_ALTERACAO"
  | "APROVAR_ESCALA_SEMANAL"
  | "APROVAR_ESCALA_ALTERACAO"
  | "SOLICITAR_REVISAO_SEMANAL"
  | "SOLICITAR_REVISAO_ALTERACAO"
  | "CANCELAR_SOLICITACAO_SEMANAL"
  | "CANCELAR_SOLICITACAO_ALTERACAO"
  | "REABRIR_ESCALA_SEMANAL"
  | "REABRIR_ESCALA_ALTERACAO"
  | "EXPORTAR"
  | "LOGIN"
  | "LOGOUT"
  | "ALTERAR_CONFIGURACAO"
  | "CRIAR_USUARIO"
  | "EDITAR_USUARIO"
  | "EXCLUIR_USUARIO"
  | "ABRIR_LINK_APROVACAO"
  | "LOAD_PREVIOUS_WEEK_DATA"
  | "CLEAR_WEEKLY_SCHEDULE"
  | "SALVAR_CONTROLE_FREQUENCIA"
  | "SYNC_CONTROLE_FREQUENCIA"
  | "ENVIAR_CONTROLE_FREQUENCIA"
  | "APROVAR_CONTROLE_FREQUENCIA"
  | "SOLICITAR_REVISAO_CONTROLE_FREQUENCIA"
  | "CANCELAR_SOLICITACAO_CONTROLE_FREQUENCIA"
  | "REABRIR_CONTROLE_FREQUENCIA"
  | "OPERACAO_LEGADA";

export type AuditDocumentoTipo =
  | "SEMANAL"
  | "ALTERACAO"
  | "FREQUENCIA"
  | "CONFIGURACAO"
  | "SISTEMA"
  | "AUTENTICACAO";

export interface AuditUsuarioSnapshot {
  nome: string;
  re: string;
  posto: string;
  perfil: string;
}

/** Documento de auditoria — uma operação com N alterações internas. */
export interface AuditOperation {
  id: string; // LOG-000145
  tipo: AuditOperacaoTipo;
  escala?: AuditDocumentoTipo;
  semana?: number;
  ano?: number;
  anoSemana?: string;
  usuario: AuditUsuarioSnapshot;
  versao?: number;
  statusAnterior?: string;
  statusAtual?: string;
  data: string;
  hora: string;
  dataHora?: string;
  timestamp: any;
  alteracoes?: AuditAlteracao[];
  detalhes?: string;
  solicitacaoId?: string;
  motivo?: string;
  /** Marcador de documento legado normalizado. */
  legado?: boolean;
}

/** @deprecated Preferir AuditOperation — mantido para leitura de documentos antigos. */
export interface AuditLog {
  id?: string;
  timestamp: any;
  data: string;
  hora: string;
  usuario: string;
  re: string;
  painel: "Escala Semanal" | "Escala Alteração" | "Configurações" | "Aprovação";
  colaborador: string;
  campoAlterado: string;
  valorAnterior: string;
  novoValor: string;
  anoSemana: string;
  versao?: number;
  solicitacaoId?: string;
  enviadoPor?: string;
  aprovadoPor?: string;
  gestorRe?: string;
  modulo?: string;
  operacao?: string;
  registroAlterado?: string;
  perfil?: string;
  tipo?: AuditOperacaoTipo;
  escala?: AuditDocumentoTipo;
  alteracoes?: AuditAlteracao[];
  statusAnterior?: string;
  statusAtual?: string;
}

export const AUDIT_OPERACAO_LABELS: Record<AuditOperacaoTipo, string> = {
  SALVAR_ESCALA_SEMANAL: "Salvar",
  SALVAR_ESCALA_ALTERACAO: "Salvar",
  ENVIAR_ESCALA_SEMANAL: "Enviar Aprovação",
  ENVIAR_ESCALA_ALTERACAO: "Enviar Aprovação",
  APROVAR_ESCALA_SEMANAL: "Aprovou",
  APROVAR_ESCALA_ALTERACAO: "Aprovou",
  SOLICITAR_REVISAO_SEMANAL: "Solicitou Revisão",
  SOLICITAR_REVISAO_ALTERACAO: "Solicitou Revisão",
  CANCELAR_SOLICITACAO_SEMANAL: "Cancelou Solicitação",
  CANCELAR_SOLICITACAO_ALTERACAO: "Cancelou Solicitação",
  REABRIR_ESCALA_SEMANAL: "Reabriu Escala",
  REABRIR_ESCALA_ALTERACAO: "Reabriu Escala",
  EXPORTAR: "Exportar",
  LOGIN: "Login",
  LOGOUT: "Logout",
  ALTERAR_CONFIGURACAO: "Alterar Configuração",
  CRIAR_USUARIO: "Criar Usuário",
  EDITAR_USUARIO: "Editar Usuário",
  EXCLUIR_USUARIO: "Excluir Usuário",
  ABRIR_LINK_APROVACAO: "Abriu Link Aprovação",
  LOAD_PREVIOUS_WEEK_DATA: "Dados Semana Anterior",
  CLEAR_WEEKLY_SCHEDULE: "Limpar Escala",
  SALVAR_CONTROLE_FREQUENCIA: "Salvar Frequência",
  SYNC_CONTROLE_FREQUENCIA: "Sincronizar Frequência",
  ENVIAR_CONTROLE_FREQUENCIA: "Enviar Frequência",
  APROVAR_CONTROLE_FREQUENCIA: "Aprovar Frequência",
  SOLICITAR_REVISAO_CONTROLE_FREQUENCIA: "Revisão Frequência",
  CANCELAR_SOLICITACAO_CONTROLE_FREQUENCIA: "Cancelar Frequência",
  REABRIR_CONTROLE_FREQUENCIA: "Reabrir Frequência",
  OPERACAO_LEGADA: "Operação",
};

export const AUDIT_DOCUMENTO_LABELS: Record<AuditDocumentoTipo, string> = {
  SEMANAL: "Escala Semanal",
  ALTERACAO: "Escala Alteração",
  FREQUENCIA: "Controle de Frequência",
  CONFIGURACAO: "Configurações",
  SISTEMA: "Sistema",
  AUTENTICACAO: "Autenticação",
};

export const ESCALA_STATUS_LABELS: Record<EscalaStatus, string> = {
  em_edicao: "Em edição",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovada: "Aprovada",
  revisao_solicitada: "Revisão Solicitada",
  rejeitada: "Revisão Solicitada",
};

export const ESCALA_STATUS_EMOJI: Record<EscalaStatus, string> = {
  em_edicao: "🔵",
  aguardando_aprovacao: "🟡",
  aprovada: "🟢",
  revisao_solicitada: "🟠",
  rejeitada: "🟠",
};

export type DayOfWeek = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

/**
 * Representações opcionais da legenda em diferentes contextos.
 * Ausência de chave = não configurado (não quebra o sistema).
 */
export interface LegendaRepresentacoes {
  /** Código exibido / usado na Escala Semanal (se omitido, usa-se `sigla`). */
  escalaSemanal?: string;
  /** Código/valor no Controle de Frequência (e consolidação futura). */
  escalaConsolidada?: string;
}

export interface LegendaMeiaDiaria {
  /** Se true, o valor entra na soma da 1/2 Diária (somente valores > 0). */
  participa?: boolean;
  /** Valor numérico da 1/2 Diária (ex.: 1, 2, 3). */
  valor?: number;
}

export interface LegendaAA {
  /** Se true, o dia conta para A.A. (quando não definido, usa-se diaTrabalhado). */
  contaDia?: boolean;
}

/**
 * Regras opcionais de cálculo (preparação para Escala Consolidada).
 * Todos os campos são opcionais — ausência = não configurado.
 */
export interface LegendaRegras {
  /** Dia trabalhado (base futura do A.A.). */
  diaTrabalhado?: boolean;
  meiaDiaria?: LegendaMeiaDiaria;
  aa?: LegendaAA;
}

/**
 * Legenda cadastrada em Firestore `legendas/{sigla}`.
 * Campos legados (sigla, descricao, cor, ativo, ordem) são preservados.
 * `nome`, `representacoes` e `regras` são opcionais e retrocompatíveis.
 */
export interface Legenda {
  /** Código da legenda (campo legado; equivalente conceitual a "codigo"). */
  sigla: string;
  /** Nome amigável opcional (ex.: "Expediente Normal"). */
  nome?: string;
  /** Descrição completa (campo legado). */
  descricao: string;
  /** Cor visual (nome ou hex). */
  cor: string;
  ativo: boolean;
  ordem: number;
  representacoes?: LegendaRepresentacoes;
  regras?: LegendaRegras;
  createdAt?: unknown;
}

export const OPCOES_ESCALA = [
  "A", // Afastamento (substitui o hífen)
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

/** Origem de um valor diário no Controle de Frequência. */
export type FrequenciaCelulaOrigem =
  | "escala_alteracao"
  | "escala_semanal"
  | "edicao_manual"
  | "padrao_fim_semana"
  | "vazio";

export interface FrequenciaCelula {
  valor: string;
  origem: FrequenciaCelulaOrigem;
  editadoManualmente: boolean;
  /** Sigla original da escala antes da conversão por legenda. */
  valorEscalaOriginal?: string;
}

export interface ControleFrequenciaRow {
  re: string;
  postoGrad: string;
  nome: string;
  secao: string;
  ordem?: number;
  /** Chaves "01".."31". */
  dias: Record<string, FrequenciaCelula>;
  meiaDiaria: number;
  aa: number;
}

export type FrequenciaObservacaoOrigem =
  | "escala_alteracao"
  | "escala_semanal"
  | "manual";

export interface ControleFrequenciaObservacao {
  id: string;
  texto: string;
  origem: FrequenciaObservacaoOrigem;
  re?: string;
  criadoPor: string;
  criadoEm: string;
  editadoPor?: string;
  editadoEm?: string;
  /** Soft-delete — mantém histórico. */
  excluido?: boolean;
}

export interface FrequenciaResponsavel {
  nome: string;
  re: string;
  postoGrad: string;
  data: string;
  hora: string;
}

/** Documento Firestore `controle_frequencia/{ano}_{mes}_{secao}`. */
export interface ControleFrequenciaDocument {
  id: string;
  ano: number;
  mes: number;
  secao: string;
  status?: EscalaStatus;
  versao?: number;
  aprovacao?: EscalaAprovacao | null;
  historico?: HistoricoEscalaEvento[];
  rows: ControleFrequenciaRow[];
  observacoes: ControleFrequenciaObservacao[];
  lastSaved?: LastSaved | null;
  responsavelEdicao?: FrequenciaResponsavel | null;
  responsavelAprovacao?: FrequenciaResponsavel | null;
  syncMeta?: {
    lastSyncAt?: string;
    sourceWeeks?: string[];
  };
}

export const MESES_NOMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export const CONTROLE_FREQUENCIA_COLLECTION = "controle_frequencia";
