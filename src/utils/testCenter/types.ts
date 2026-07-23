/** Tipos da Central de Testes funcionais. */

export type TestStatus = "PASSOU" | "FALHOU" | "NAO_EXECUTADO" | "BLOQUEADO_POR_PERMISSAO";

export type TestCategory =
  | "Autenticação"
  | "Permissões"
  | "Salvamento"
  | "Semana anterior"
  | "Aprovação"
  | "Logs"
  | "Exportação"
  | "Navegação"
  | "Sanitização"
  | "Inventário"
  | "Firestore";

export interface TestResult {
  id: string;
  nome: string;
  categoria: TestCategory;
  perfil: string;
  acao: string;
  status: TestStatus;
  mensagem: string;
  erro?: string;
  dataHora: string;
  duracaoMs: number;
}

export interface TestCase {
  id: string;
  nome: string;
  categoria: TestCategory;
  perfil: string;
  acao: string;
  /** Se true, o teste pode gravar apenas em documentos test_* controlados. */
  writesTestData?: boolean;
  run: () => Promise<{ status: TestStatus; mensagem: string; erro?: string }>;
}

export interface TestSuiteSummary {
  total: number;
  passou: number;
  falhou: number;
  bloqueado: number;
  naoExecutado: number;
  resultados: TestResult[];
  geradoEm: string;
}

export interface CommandInventoryItem {
  tela: string;
  botao: string;
  funcaoEsperada: string;
  perfilPermitido: string;
  acaoFirestore: string;
  geraLog: string;
}
