/**
 * Types for the Weekly Schedule System (Sistema de Escala de Serviço)
 */

export interface Usuario {
  re: string;
  nomeCompleto?: string;
  nome: string; // Nome de Guerra
  postoGrad: string;
  secao: string;
  perfil?: "Administrador" | "Operador";
  ativo?: boolean;
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
}

export interface AuditLog {
  id?: string;
  timestamp: any;
  data: string; // DD/MM/YYYY
  hora: string; // HH:MM
  usuario: string; // Nome of the user who made the change
  re: string; // RE of the user who made the change
  painel: "Escala Semanal" | "Escala Alteração" | "Configurações";
  colaborador: string; // Name and/or RE of collaborator
  campoAlterado: string; // Field that was changed
  valorAnterior: string;
  novoValor: string;
  anoSemana: string; // Format "2026_01" for query filtering
}

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
