/**
 * Smoke tests for dual approval + revisão solicitada (no Firebase).
 * Run: npx tsx scripts/approval-flow-smoke.ts
 */
import {
  formatHomologacaoResumo,
  getClosedApprovalMessage,
  getRevisaoInfo,
  isApprovalRequestOpen,
  isEditableWorkflowStatus,
  normalizeEscalaStatus,
  normalizeTipoEscalaDocumento,
  parseApprovalPath,
} from "../src/utils/approvalService";
import {
  canApproveScales,
  canCancelApprovalRequest,
  canEditScale,
  canReopenApprovedScale,
  canSubmitForApproval,
  confirmGestorRe,
  isWeekCurrentOrFuture,
} from "../src/utils/permissions";
import { EscalaDocument, Usuario } from "../src/types";
import { WeekInfo } from "../src/utils/dateUtils";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

const admin: Usuario = {
  re: "124342-0",
  nome: "VENTURA",
  postoGrad: "CB PM",
  secao: "Seç Gest Educ",
  perfil: "Administrador",
};
const operador: Usuario = { ...admin, perfil: "Operador", nome: "OP" };
const gestor: Usuario = { ...admin, perfil: "Gestor", nome: "AUGUSTO", re: "104585-7" };

const futureWeek: WeekInfo = {
  numero: 52,
  label: "Semana 52",
  periodo: "x",
  id: "2026_52",
  startDate: new Date(2099, 11, 20),
  endDate: new Date(2099, 11, 26),
};
const pastWeek: WeekInfo = {
  numero: 1,
  label: "Semana 01",
  periodo: "x",
  id: "2020_01",
  startDate: new Date(2020, 0, 6),
  endDate: new Date(2020, 0, 12),
};

assert(canSubmitForApproval(admin) === true, "Admin envia aprovação");
assert(canApproveScales(gestor) === true, "Gestor aprova / solicita revisão");

assert(canEditScale(operador, futureWeek, "em_edicao") === true, "Op edita em edição");
assert(canEditScale(operador, futureWeek, "revisao_solicitada") === true, "Op edita revisão solicitada");
assert(canEditScale(operador, futureWeek, "rejeitada") === true, "Op edita legado rejeitada→revisão");
assert(canEditScale(operador, futureWeek, "aprovada") === false, "Op não edita aprovada");
assert(canEditScale(operador, futureWeek, "aguardando_aprovacao") === false, "Op não edita aguardando");
assert(canEditScale(admin, pastWeek, "revisao_solicitada") === true, "Admin edita revisão");
assert(canEditScale(gestor, futureWeek, "revisao_solicitada") === false, "Gestor não edita");

assert(normalizeEscalaStatus("rejeitada") === "revisao_solicitada", "Legado rejeitada → revisão");
assert(normalizeEscalaStatus("revisao_solicitada") === "revisao_solicitada", "Status revisão");
assert(isEditableWorkflowStatus("revisao_solicitada") === true, "Revisão é editável");
assert(isEditableWorkflowStatus("aprovada") === false, "Aprovada não editável");

assert(canReopenApprovedScale(gestor, "aprovada") === true, "Gestor reabre aprovada");
assert(canCancelApprovalRequest(admin, "aguardando_aprovacao") === true, "Admin cancela");

assert(confirmGestorRe(gestor, "104585") === true, "RE gestor");

const awaiting: EscalaDocument = {
  id: "2026_10",
  ano: 2026,
  semana: 10,
  periodo: "x",
  rows: [],
  lastSaved: null,
  status: "aguardando_aprovacao",
};
assert(isApprovalRequestOpen(awaiting) === true, "Link aberto");
assert(
  isApprovalRequestOpen({ ...awaiting, status: "revisao_solicitada" }) === false,
  "Link fechado após revisão"
);

assert(getClosedApprovalMessage("revisao_solicitada", "semanal").includes("revisão"), "Msg revisão");
assert(getClosedApprovalMessage("aprovada", "alteracao").includes("Alteração"), "Msg alteração");

const revisao = getRevisaoInfo({
  revisaoSolicitadaPor: {
    nome: "FERREIRA",
    re: "1",
    postoGrad: "CAP PM",
    data: "20/07/2026",
    hora: "15:42",
  },
  motivoRevisao: "Ajustar efetivo",
});
assert(revisao.por?.nome === "FERREIRA" && revisao.motivo === "Ajustar efetivo", "Info revisão");

const legado = getRevisaoInfo({
  rejeitadoPor: {
    nome: "OLD",
    re: "2",
    postoGrad: "TEN",
    data: "01/01/2026",
    hora: "10:00",
  },
  motivoRejeicao: "legado",
});
assert(legado.por?.nome === "OLD" && legado.motivo === "legado", "Info revisão legada");

assert(
  formatHomologacaoResumo("revisao_solicitada", {
    revisaoSolicitadaPor: revisao.por!,
    motivoRevisao: "x",
  }).includes("Revisão Solicitada"),
  "Homologação revisão"
);

assert(normalizeTipoEscalaDocumento("alteracao") === "alteracao", "Tipo alteração");
const typed = parseApprovalPath("/aprovacao/alteracao/2026_32");
assert(typed?.tipo === "alteracao" && typed.escalaId === "2026_32", "Path tipado");
assert(isWeekCurrentOrFuture(futureWeek) === true, "Semana futura");
assert(canSubmitForApproval(operador) === false, "Operador não envia");

console.log("\nTodos os testes de fluxo/permissões passaram.");
