/**
 * Smoke tests for approval permissions and status transitions (no Firebase).
 * Run: npx tsx scripts/approval-flow-smoke.ts
 */
import {
  buildReopenAfterEdit,
  getClosedApprovalMessage,
  isApprovalRequestOpen,
  normalizeEscalaStatus,
} from "../src/utils/approvalService";
import {
  canApproveScales,
  canEditScale,
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
assert(canSubmitForApproval(operador) === false, "Operador não envia");
assert(canSubmitForApproval(gestor) === false, "Gestor não envia");

assert(canApproveScales(gestor) === true, "Gestor aprova");
assert(canApproveScales(admin) === false, "Admin não aprova");
assert(canApproveScales(operador) === false, "Operador não aprova");

assert(canEditScale(operador, futureWeek, "em_edicao") === true, "Op edita futuro em edição");
assert(canEditScale(operador, pastWeek, "em_edicao") === false, "Op não edita passado");
assert(canEditScale(operador, futureWeek, "aprovada") === false, "Op não edita aprovada");
assert(canEditScale(operador, futureWeek, "aguardando_aprovacao") === false, "Op não edita aguardando");
assert(canEditScale(admin, pastWeek, "aprovada") === true, "Admin edita aprovada");
assert(canEditScale(gestor, futureWeek, "em_edicao") === false, "Gestor não edita");

assert(confirmGestorRe(gestor, "104585") === true, "RE gestor sem dígito");
assert(confirmGestorRe(gestor, "999") === false, "RE inválido");
assert(confirmGestorRe(admin, "124342") === false, "Admin não confirma como gestor");

const awaiting: EscalaDocument = {
  id: "2026_10",
  ano: 2026,
  semana: 10,
  periodo: "x",
  rows: [],
  lastSaved: null,
  status: "aguardando_aprovacao",
};
assert(isApprovalRequestOpen(awaiting) === true, "Link aberto em aguardando");
assert(isApprovalRequestOpen({ ...awaiting, status: "aprovada" }) === false, "Link fechado após aprovar");
assert(isApprovalRequestOpen({ ...awaiting, status: "em_edicao" }) === false, "Link fechado em edição");

const reopen = buildReopenAfterEdit("aprovada", 3);
assert(reopen.status === "em_edicao" && reopen.versao === 4 && reopen.aprovacao === null, "Reabertura incrementa versão");

assert(normalizeEscalaStatus(undefined) === "em_edicao", "Status default");
assert(getClosedApprovalMessage("aprovada").includes("aprovada"), "Mensagem encerrada");
assert(isWeekCurrentOrFuture(futureWeek) === true, "Semana futura");

console.log("\nTodos os testes de fluxo/permissões passaram.");
