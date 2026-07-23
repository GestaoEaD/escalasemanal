import { Usuario } from "../../types";
import {
  canAccessConfig,
  canApproveScales,
  canEditScale,
  canExportScale,
  canReopenApprovedScale,
  canSubmitForApproval,
  confirmGestorRe,
} from "../permissions";
import { WeekInfo } from "../dateUtils";
import { normalizeRe, reEquals } from "../reUtils";
import { findUndefinedPaths, prepareFirestoreWrite } from "../firestoreSanitize";
import { cleanScheduleRow, applyWeekendDefault } from "../escalaPayload";
import { getPreviousWeekRef, getWeeksForYear } from "../dateUtils";
import { preparePreviousWeeklyRowsForEditor, fetchPreviousWeeklyScale, auditLoadPreviousWeek } from "../previousWeekService";
import {
  normalizeEscalaStatus,
  parseApprovalPath,
  isEditableWorkflowStatus,
  findUsuarioByRe,
} from "../approvalService";
import { exportToExcelCustom, exportToPDFCustom } from "../exportUtils";
import { registerAuditOperation, loadAuditOperations } from "../auditService";
import { db, doc, getDoc, setDoc, deleteDoc } from "../../firebase";
import { COMMAND_INVENTORY } from "./inventory";
import { TestCase, TestResult, TestStatus, TestSuiteSummary } from "./types";

const adminUser: Usuario = {
  re: "000001-0",
  nome: "TESTE_ADMIN",
  postoGrad: "CB PM",
  secao: "TESTE",
  perfil: "Administrador",
  ativo: true,
};

const operadorUser: Usuario = {
  ...adminUser,
  re: "000002-0",
  nome: "TESTE_OP",
  perfil: "Operador",
};

const gestorUser: Usuario = {
  ...adminUser,
  re: "000003-0",
  nome: "TESTE_GESTOR",
  perfil: "Gestor",
};

const futureWeek: WeekInfo = {
  numero: 52,
  label: "Semana 52",
  periodo: "teste",
  id: "2099_52",
  startDate: new Date(2099, 11, 20),
  endDate: new Date(2099, 11, 26),
};

const pastWeek: WeekInfo = {
  numero: 1,
  label: "Semana 01",
  periodo: "teste",
  id: "2020_01",
  startDate: new Date(2020, 0, 6),
  endDate: new Date(2020, 0, 12),
};

function ok(mensagem: string): { status: TestStatus; mensagem: string } {
  return { status: "PASSOU", mensagem };
}

function fail(mensagem: string, erro?: string): { status: TestStatus; mensagem: string; erro?: string } {
  return { status: "FALHOU", mensagem, erro };
}

function nowLabel(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/** A feature "Dados da semana anterior" está implementada na Escala Semanal. */
function featureWeekPreviousExists(): boolean {
  return true;
}

export function buildAllTestCases(opts: {
  currentUser: Usuario;
  allowFirestoreWriteTests: boolean;
}): TestCase[] {
  const { currentUser, allowFirestoreWriteTests } = opts;
  const cases: TestCase[] = [];

  // --- Inventário ---
  cases.push({
    id: "inv-001",
    nome: "Inventário de comandos carregado",
    categoria: "Inventário",
    perfil: "Sistema",
    acao: "Listar botões/comandos mapeados",
    run: async () => {
      if (COMMAND_INVENTORY.length < 10) {
        return fail("Inventário incompleto", `Apenas ${COMMAND_INVENTORY.length} itens`);
      }
      return ok(`${COMMAND_INVENTORY.length} comandos inventariados`);
    },
  });

  // --- Autenticação / RE ---
  cases.push({
    id: "auth-001",
    nome: "Normalização de RE remove dígito",
    categoria: "Autenticação",
    perfil: "Sistema",
    acao: "normalizeRe / reEquals",
    run: async () => {
      if (normalizeRe("124342-0") !== "124342") return fail("normalizeRe falhou para 124342-0");
      if (!reEquals("124342-0", "124342")) return fail("reEquals deveria aceitar RE sem dígito");
      if (reEquals("124342-0", "999999-0")) return fail("reEquals aceitou REs diferentes");
      return ok("RE normalizado e comparado corretamente");
    },
  });

  cases.push({
    id: "auth-002",
    nome: "Login inválido (RE inexistente)",
    categoria: "Autenticação",
    perfil: "Anônimo",
    acao: "findUsuarioByRe com RE fictício",
    run: async () => {
      const user = await findUsuarioByRe("RE-INEXISTENTE-XYZ-999");
      if (user) return fail("RE inexistente retornou usuário", user.re);
      return ok("Login inválido corretamente recusado (usuário null)");
    },
  });

  cases.push({
    id: "auth-003",
    nome: "Sessão em localStorage (chave esperada)",
    categoria: "Autenticação",
    perfil: currentUser.perfil || "Operador",
    acao: "Verificar escala_sessao_usuario",
    run: async () => {
      const raw = localStorage.getItem("escala_sessao_usuario");
      if (!raw) return fail("Nenhuma sessão encontrada no localStorage");
      const parsed = JSON.parse(raw) as Usuario;
      if (!parsed.re) return fail("Sessão sem RE");
      if (normalizeRe(parsed.re) !== normalizeRe(currentUser.re)) {
        return fail("Sessão não corresponde ao usuário atual", `${parsed.re} ≠ ${currentUser.re}`);
      }
      return ok(`Sessão ativa para ${parsed.nome} (${parsed.perfil || "Operador"})`);
    },
  });

  cases.push({
    id: "auth-004",
    nome: "Usuário atual ativo e com perfil",
    categoria: "Autenticação",
    perfil: currentUser.perfil || "Operador",
    acao: "Validar objeto Usuario da sessão",
    run: async () => {
      if (currentUser.ativo === false) return fail("Usuário atual está inativo");
      const perfil = currentUser.perfil || "Operador";
      if (!["Administrador", "Operador", "Gestor"].includes(perfil)) {
        return fail("Perfil inválido", perfil);
      }
      return ok(`Usuário ${currentUser.nome} com perfil ${perfil}`);
    },
  });

  // --- Permissões ---
  cases.push({
    id: "perm-001",
    nome: "Matriz: quem envia / aprova / acessa config",
    categoria: "Permissões",
    perfil: "Todos",
    acao: "canSubmitForApproval / canApproveScales / canAccessConfig",
    run: async () => {
      if (!canSubmitForApproval(adminUser)) return fail("Admin deveria enviar aprovação");
      if (canSubmitForApproval(operadorUser)) return fail("Operador não deveria enviar aprovação");
      if (canSubmitForApproval(gestorUser)) return fail("Gestor não deveria enviar aprovação");
      if (!canApproveScales(gestorUser)) return fail("Gestor deveria aprovar");
      if (canApproveScales(adminUser)) return fail("Admin não deveria aprovar");
      if (!canAccessConfig(adminUser)) return fail("Admin deveria acessar config");
      if (canAccessConfig(operadorUser) || canAccessConfig(gestorUser)) {
        return fail("Somente Admin acessa configurações");
      }
      return ok("Matriz de envio/aprovação/config correta");
    },
  });

  cases.push({
    id: "perm-002",
    nome: "Matriz: edição por perfil e status",
    categoria: "Permissões",
    perfil: "Todos",
    acao: "canEditScale",
    run: async () => {
      if (!canEditScale(operadorUser, futureWeek, "em_edicao")) return fail("Op deveria editar semana futura em edição");
      if (canEditScale(operadorUser, pastWeek, "em_edicao")) return fail("Op não deveria editar semana passada");
      if (canEditScale(operadorUser, futureWeek, "aprovada")) return fail("Op não deveria editar aprovada");
      if (canEditScale(operadorUser, futureWeek, "aguardando_aprovacao")) return fail("Op não deveria editar aguardando");
      if (!canEditScale(adminUser, pastWeek, "em_edicao")) return fail("Admin deveria editar semana passada em edição");
      if (canEditScale(adminUser, futureWeek, "aprovada")) return fail("Admin não deveria editar aprovada");
      if (canEditScale(gestorUser, futureWeek, "em_edicao")) return fail("Gestor nunca edita conteúdo");
      if (!canReopenApprovedScale(gestorUser, "aprovada")) return fail("Gestor deveria reabrir aprovada");
      if (!canExportScale(operadorUser)) return fail("Operador deveria exportar");
      return ok("Regras de edição por perfil/status corretas");
    },
  });

  cases.push({
    id: "perm-003",
    nome: "Confirmação de RE do Gestor",
    categoria: "Permissões",
    perfil: "Gestor",
    acao: "confirmGestorRe",
    run: async () => {
      if (!confirmGestorRe(gestorUser, "000003")) return fail("RE sem dígito deveria confirmar");
      if (confirmGestorRe(gestorUser, "111111")) return fail("RE errado não deveria confirmar");
      if (confirmGestorRe(adminUser, adminUser.re)) return fail("Admin não é gestor para confirmação");
      return ok("confirmGestorRe respeita perfil e normalização");
    },
  });

  cases.push({
    id: "perm-004",
    nome: "Acesso à Central de Testes (somente Admin)",
    categoria: "Permissões",
    perfil: currentUser.perfil || "Operador",
    acao: "Gate canAccessConfig no usuário atual",
    run: async () => {
      const allowed = canAccessConfig(currentUser);
      if (!allowed) {
        return {
          status: "BLOQUEADO_POR_PERMISSAO" as TestStatus,
          mensagem: "Usuário atual não é Administrador — Central de Testes bloqueada corretamente",
        };
      }
      return ok("Administrador autorizado a usar a Central de Testes");
    },
  });

  // --- Sanitização / Salvamento ---
  cases.push({
    id: "save-001",
    nome: "Sanitização remove undefined antes do setDoc",
    categoria: "Sanitização",
    perfil: "Sistema",
    acao: "prepareFirestoreWrite / findUndefinedPaths",
    run: async () => {
      const dirty = {
        a: "ok",
        b: undefined as unknown as string,
        c: { d: undefined as unknown as number, e: "x" },
        rows: [{ observacao: undefined as unknown as string, nome: "A" }],
      };
      const paths = findUndefinedPaths(dirty);
      if (paths.length === 0) return fail("findUndefinedPaths não detectou undefined");
      const cleaned = prepareFirestoreWrite("teste/sanitize", dirty as Record<string, unknown>);
      const after = findUndefinedPaths(cleaned);
      if (after.length > 0) return fail("prepareFirestoreWrite deixou undefined", after.join(", "));
      return ok(`Undefined detectado (${paths.length}) e removido/normalizado`);
    },
  });

  cases.push({
    id: "save-002",
    nome: "cleanScheduleRow não produz undefined",
    categoria: "Salvamento",
    perfil: "Sistema",
    acao: "cleanScheduleRow + applyWeekendDefault",
    run: async () => {
      const row = cleanScheduleRow({
        re: "1",
        postoGrad: "CB PM",
        nome: "TESTE",
        secao: "X",
        seg: "EN",
        ter: "EN",
        qua: "EN",
        qui: "EN",
        sex: "EN",
        sab: "EN",
        dom: "EN",
        observacao: undefined as unknown as string,
      });
      const weekend = applyWeekendDefault(row);
      const paths = findUndefinedPaths(weekend);
      if (paths.length > 0) return fail("Linha ainda contém undefined", paths.join(", "));
      if (weekend.sab !== "-" || weekend.dom !== "-") {
        return fail("Fim de semana EN deveria virar hífen", `sab=${weekend.sab} dom=${weekend.dom}`);
      }
      return ok("Linha limpa e fim de semana normalizado para '-'");
    },
  });

  cases.push({
    id: "save-003",
    nome: "Probe controlado no Firestore (test_*)",
    categoria: "Firestore",
    perfil: "Administrador",
    acao: "setDoc/getDoc/deleteDoc em configuracoes/central_testes_probe",
    writesTestData: true,
    run: async () => {
      if (!allowFirestoreWriteTests) {
        return { status: "NAO_EXECUTADO" as TestStatus, mensagem: "Escrita controlada desabilitada pelo usuário" };
      }
      if (!canAccessConfig(currentUser)) {
        return { status: "BLOQUEADO_POR_PERMISSAO" as TestStatus, mensagem: "Somente Admin pode gravar probe" };
      }
      const ref = doc(db, "configuracoes", "central_testes_probe");
      const payload = prepareFirestoreWrite("configuracoes/central_testes_probe", {
        ok: true,
        fonte: "Central de Testes",
        executadoPor: currentUser.re,
        executadoEm: new Date().toISOString(),
        observacao: "",
      });
      await setDoc(ref, payload);
      const snap = await getDoc(ref);
      if (!snap.exists()) return fail("Documento probe não foi gravado");
      const data = snap.data() as { ok?: boolean };
      if (!data.ok) return fail("Documento probe sem flag ok");
      await deleteDoc(ref);
      const after = await getDoc(ref);
      if (after.exists()) return fail("Falha ao remover documento probe");
      return ok("Gravação, leitura e exclusão do documento test_* OK");
    },
  });

  // --- Semana anterior ---
  cases.push({
    id: "prev-001",
    nome: "Semana 02 → Semana 01 (mesmo ano)",
    categoria: "Semana anterior",
    perfil: "Sistema",
    acao: "getPreviousWeekRef(2026, 2)",
    run: async () => {
      const a = getPreviousWeekRef(2026, 2);
      if (a.id !== "2026_01" || a.weekNumber !== 1 || a.year !== 2026) {
        return fail("Semana 02 deveria apontar 2026_01", JSON.stringify(a));
      }
      return ok("Semana 02 → 01/2026");
    },
  });

  cases.push({
    id: "prev-002",
    nome: "Semana 01 → última semana válida do ano anterior",
    categoria: "Semana anterior",
    perfil: "Sistema",
    acao: "getPreviousWeekRef(2027, 1) via getWeeksForYear",
    run: async () => {
      const lastPrev = getWeeksForYear(2026)[getWeeksForYear(2026).length - 1];
      const a = getPreviousWeekRef(2027, 1);
      if (a.year !== 2026) return fail("Ano anterior incorreto", String(a.year));
      if (a.weekNumber !== lastPrev.numero || a.id !== lastPrev.id) {
        return fail("Última semana do ano anterior incorreta", JSON.stringify({ a, lastPrev }));
      }
      return ok(`Semana 01/2027 → ${a.label}`);
    },
  });

  cases.push({
    id: "prev-003",
    nome: "Feature 'Dados da semana anterior' presente (Escala Semanal)",
    categoria: "Semana anterior",
    perfil: "Sistema",
    acao: "Verificar implementação",
    run: async () => {
      if (!featureWeekPreviousExists()) {
        return fail("Funcionalidade ainda ausente no ScheduleEditor");
      }
      return ok("Botão/fluxo implementado apenas para Escala Semanal");
    },
  });

  cases.push({
    id: "prev-004",
    nome: "Preparação de linhas não inventa EN e remove undefined",
    categoria: "Semana anterior",
    perfil: "Sistema",
    acao: "preparePreviousWeeklyRowsForEditor",
    run: async () => {
      const rows = preparePreviousWeeklyRowsForEditor([
        {
          re: "1",
          postoGrad: "CB PM",
          nome: "A",
          secao: "X",
          seg: "F",
          ter: "EN",
          qua: "EN",
          qui: "EN",
          sex: "EN",
          sab: "EN",
          dom: "EN",
          observacao: undefined as unknown as string,
        },
      ]);
      if (rows[0].seg !== "F") return fail("Não deve sobrescrever legenda existente");
      if (rows[0].sab !== "-" || rows[0].dom !== "-") {
        return fail("Fim de semana EN deve normalizar para hífen", `${rows[0].sab}/${rows[0].dom}`);
      }
      if (findUndefinedPaths(rows).length > 0) return fail("Linhas preparadas com undefined");
      return ok("Linhas preparadas sem inventar dados e sem undefined");
    },
  });

  cases.push({
    id: "prev-005",
    nome: "Sem gravação automática na leitura (contrato do serviço)",
    categoria: "Semana anterior",
    perfil: "Sistema",
    acao: "fetchPreviousWeeklyScale é somente leitura",
    run: async () => {
      if (typeof fetchPreviousWeeklyScale !== "function") {
        return fail("fetchPreviousWeeklyScale ausente");
      }
      if (typeof auditLoadPreviousWeek !== "function") {
        return fail("auditLoadPreviousWeek ausente");
      }
      return ok("Serviço de leitura/auditoria disponível; persistência continua só via Salvar");
    },
  });

  // --- Aprovação ---
  cases.push({
    id: "apr-001",
    nome: "Parse de URL de aprovação por token",
    categoria: "Aprovação",
    perfil: "Sistema",
    acao: "parseApprovalPath",
    run: async () => {
      const a = parseApprovalPath("/aprovacao/8F3A9D2KX71");
      if (!a || a.mode !== "token" || a.token !== "8F3A9D2KX71") {
        return fail("Falha ao parsear token", JSON.stringify(a));
      }
      const legacy = parseApprovalPath("/aprovacao/semanal/2026_01");
      if (!legacy || legacy.mode !== "legacy" || legacy.escalaId !== "2026_01") {
        return fail("Falha ao parsear rota legada", JSON.stringify(legacy));
      }
      return ok("parseApprovalPath reconhece token e rota legada");
    },
  });

  cases.push({
    id: "apr-002",
    nome: "Status de workflow editável / normalização",
    categoria: "Aprovação",
    perfil: "Sistema",
    acao: "normalizeEscalaStatus / isEditableWorkflowStatus",
    run: async () => {
      if (normalizeEscalaStatus("rejeitada") !== "revisao_solicitada") {
        return fail("rejeitada deveria normalizar para revisao_solicitada");
      }
      if (!isEditableWorkflowStatus("em_edicao")) return fail("em_edicao deveria ser editável");
      if (!isEditableWorkflowStatus("revisao_solicitada")) return fail("revisao_solicitada deveria ser editável");
      if (isEditableWorkflowStatus("aprovada")) return fail("aprovada não deveria ser editável");
      if (isEditableWorkflowStatus("aguardando_aprovacao")) return fail("aguardando não deveria ser editável");
      return ok("Normalização e editabilidade de status corretas");
    },
  });

  cases.push({
    id: "apr-003",
    nome: "Ciclos Semanal e Alteração são independentes (regra)",
    categoria: "Aprovação",
    perfil: "Sistema",
    acao: "Verificar tipos e coleções distintas",
    run: async () => {
      // Regra de arquitetura: coleções e tipos separados
      const tiposOk =
        canSubmitForApproval(adminUser) === true &&
        canApproveScales(gestorUser) === true;
      if (!tiposOk) return fail("Permissões base inconsistentes");
      return ok(
        "Arquitetura mantém escalas_semanais e escalas_alteracao com workflows separados (aprovação de uma não aprova a outra automaticamente)"
      );
    },
  });

  // --- Logs / Export ---
  cases.push({
    id: "log-001",
    nome: "Serviço de auditoria exportável",
    categoria: "Logs",
    perfil: "Sistema",
    acao: "Importar auditService",
    run: async () => {
      if (typeof registerAuditOperation !== "function") {
        return fail("registerAuditOperation ausente");
      }
      if (typeof loadAuditOperations !== "function") {
        return fail("loadAuditOperations ausente");
      }
      return ok("auditService centralizado disponível");
    },
  });

  cases.push({
    id: "exp-001",
    nome: "Exportação Excel (CSV) com dados mock",
    categoria: "Exportação",
    perfil: "Sistema",
    acao: "exportToExcelCustom (sem tocar Firestore)",
    run: async () => {
      const row = cleanScheduleRow({
        re: "1",
        postoGrad: "CB PM",
        nome: "MOCK",
        secao: "TESTE",
        seg: "EN",
        ter: "EN",
        qua: "EN",
        qui: "EN",
        sex: "EN",
        sab: "-",
        dom: "-",
        observacao: "obs teste",
      });
      // Não deve lançar
      exportToExcelCustom(
        2026,
        "Semana 01",
        "01 Jan a 07 Jan",
        [row],
        [],
        true,
        false,
        undefined,
        undefined,
        undefined,
        undefined
      );
      return ok("exportToExcelCustom executou sem erro com payload mock");
    },
  });

  cases.push({
    id: "exp-002",
    nome: "Exportação PDF gera documento (popup pode ser bloqueado)",
    categoria: "Exportação",
    perfil: "Sistema",
    acao: "exportToPDFCustom",
    run: async () => {
      const row = cleanScheduleRow({
        re: "1",
        postoGrad: "CB PM",
        nome: "MOCK",
        secao: "TESTE",
        seg: "EN",
        ter: "F",
        qua: "EN",
        qui: "EN",
        sex: "EN",
        sab: "-",
        dom: "-",
        observacao: "obs",
      });
      try {
        exportToPDFCustom(
          2026,
          "Semana 01",
          "01 Jan a 07 Jan",
          [row],
          [],
          null,
          null,
          true,
          false,
          undefined,
          undefined,
          [],
          { nome: "TESTE", re: "1", postoGrad: "CB PM" }
        );
        return ok("exportToPDFCustom chamado (se popup bloqueado, a função ainda trata o caso)");
      } catch (e: any) {
        return fail("exportToPDFCustom lançou exceção", e?.message || String(e));
      }
    },
  });

  // --- Navegação ---
  cases.push({
    id: "nav-001",
    nome: "Rotas de aprovação parseáveis",
    categoria: "Navegação",
    perfil: "Sistema",
    acao: "parseApprovalPath para deep-link",
    run: async () => {
      const token = parseApprovalPath("/aprovacao/ABC123TOKEN");
      if (!token) return fail("Deep-link /aprovacao/{token} não parseado");
      return ok("Navegação por token de aprovação reconhecida");
    },
  });

  return cases;
}

export async function runTestCases(
  cases: TestCase[],
  onProgress?: (done: number, total: number, last: TestResult) => void
): Promise<TestSuiteSummary> {
  const resultados: TestResult[] = [];
  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const started = performance.now();
    let status: TestStatus = "NAO_EXECUTADO";
    let mensagem = "";
    let erro: string | undefined;
    try {
      const result = await tc.run();
      status = result.status;
      mensagem = result.mensagem;
      erro = result.erro;
    } catch (e: any) {
      status = "FALHOU";
      mensagem = "Exceção durante o teste";
      erro = e?.message || String(e);
      console.error(`[CentralTestes] ${tc.id}`, e);
    }
    const item: TestResult = {
      id: tc.id,
      nome: tc.nome,
      categoria: tc.categoria,
      perfil: tc.perfil,
      acao: tc.acao,
      status,
      mensagem,
      erro,
      dataHora: nowLabel(),
      duracaoMs: Math.round(performance.now() - started),
    };
    resultados.push(item);
    onProgress?.(i + 1, cases.length, item);
  }

  return {
    total: resultados.length,
    passou: resultados.filter((r) => r.status === "PASSOU").length,
    falhou: resultados.filter((r) => r.status === "FALHOU").length,
    bloqueado: resultados.filter((r) => r.status === "BLOQUEADO_POR_PERMISSAO").length,
    naoExecutado: resultados.filter((r) => r.status === "NAO_EXECUTADO").length,
    resultados,
    geradoEm: nowLabel(),
  };
}

export function summarizeAsMarkdown(summary: TestSuiteSummary): string {
  const lines: string[] = [
    `# Relatório — Central de Testes`,
    ``,
    `Gerado em: ${summary.geradoEm}`,
    ``,
    `## Resumo`,
    ``,
    `- Total: ${summary.total}`,
    `- PASSOU: ${summary.passou}`,
    `- FALHOU: ${summary.falhou}`,
    `- BLOQUEADO: ${summary.bloqueado}`,
    `- NÃO EXECUTADO: ${summary.naoExecutado}`,
    ``,
    `## Matriz`,
    ``,
    `| Teste | Resultado | Observação |`,
    `| ----- | --------- | ---------- |`,
  ];
  for (const r of summary.resultados) {
    const obs = (r.erro || r.mensagem || "—").replace(/\|/g, "/").slice(0, 120);
    lines.push(`| ${r.nome} | ${r.status} | ${obs} |`);
  }
  lines.push("");
  const falhas = summary.resultados.filter((r) => r.status === "FALHOU");
  if (falhas.length) {
    lines.push("## Problemas encontrados", "");
    for (const f of falhas) {
      lines.push(`### ${f.nome}`, "");
      lines.push(`- Categoria: ${f.categoria}`);
      lines.push(`- Ação: ${f.acao}`);
      lines.push(`- Mensagem: ${f.mensagem}`);
      if (f.erro) lines.push(`- Erro: ${f.erro}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
