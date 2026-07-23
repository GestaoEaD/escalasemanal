/**
 * Smoke da Central de Testes (sem Firebase / sem DOM).
 * Run: npx tsx scripts/test-center-smoke.ts
 */
import {
  canAccessConfig,
  canApproveScales,
  canEditScale,
  canSubmitForApproval,
} from "../src/utils/permissions";
import { getPreviousWeekRef, getWeeksForYear } from "../src/utils/dateUtils";
import { findUndefinedPaths, prepareFirestoreWrite } from "../src/utils/firestoreSanitize";
import { applyWeekendDefault, cleanScheduleRow } from "../src/utils/escalaPayload";
import { parseApprovalPath, normalizeEscalaStatus } from "../src/utils/approvalService";
import { preparePreviousWeeklyRowsForEditor } from "../src/utils/previousWeekService";
import {
  clearWeeklySchedule,
  getInitialWeeklyEditableFields,
  resetWeeklyRowsToInitialState,
} from "../src/utils/clearWeeklySchedule";
import { COMMAND_INVENTORY } from "../src/utils/testCenter/inventory";
import { Usuario } from "../src/types";
import { WeekInfo } from "../src/utils/dateUtils";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

const admin: Usuario = {
  re: "1",
  nome: "A",
  postoGrad: "CB PM",
  secao: "X",
  perfil: "Administrador",
};
const op: Usuario = { ...admin, perfil: "Operador" };
const gestor: Usuario = { ...admin, perfil: "Gestor" };
const future: WeekInfo = {
  numero: 52,
  label: "S52",
  periodo: "x",
  id: "2099_52",
  startDate: new Date(2099, 11, 20),
  endDate: new Date(2099, 11, 26),
};

assert(COMMAND_INVENTORY.length >= 10, "inventário carregado");
assert(
  COMMAND_INVENTORY.some((i) => i.tela === "Escala Semanal" && i.botao === "Limpar escala"),
  "inventário Limpar escala (Semanal)"
);
assert(
  COMMAND_INVENTORY.some(
    (i) =>
      i.tela === "Escala Alteração" &&
      i.botao === "Limpar escala" &&
      String(i.funcaoEsperada).includes("Não aplicável")
  ),
  "Limpar escala ausente na Alteração"
);
assert(canSubmitForApproval(admin) && !canSubmitForApproval(op), "envio aprovação");
assert(canApproveScales(gestor) && !canApproveScales(admin), "aprovação gestor");
assert(canAccessConfig(admin) && !canAccessConfig(gestor), "config admin");
assert(canEditScale(op, future, "em_edicao") === true, "op edita futura");
assert(canEditScale(gestor, future, "em_edicao") === false, "gestor não edita");
assert(canEditScale(admin, future, "aprovada") === false, "aprovada não editável");

assert(getPreviousWeekRef(2026, 2).id === "2026_01", "semana 02→01");
const last2026 = getWeeksForYear(2026)[getWeeksForYear(2026).length - 1];
assert(getPreviousWeekRef(2027, 1).id === last2026.id, "semana 01→última do ano anterior");
assert(getPreviousWeekRef(2026, 2).label.includes("01/2026"), "label semana anterior");

assert(parseApprovalPath("/aprovacao/TOK")?.mode === "token", "parse token");
assert(normalizeEscalaStatus("rejeitada") === "revisao_solicitada", "status legado");

const dirty = { a: undefined as unknown as string, b: "ok" };
assert(findUndefinedPaths(dirty).length > 0, "detecta undefined");
const cleaned = prepareFirestoreWrite("t", dirty as Record<string, unknown>);
assert(findUndefinedPaths(cleaned).length === 0, "sanitize remove undefined");

const prepared = preparePreviousWeeklyRowsForEditor([
  {
    re: "1",
    postoGrad: "CB",
    nome: "N",
    secao: "S",
    seg: "F",
    ter: "EN",
    qua: "EN",
    qui: "EN",
    sex: "EN",
    sab: "EN",
    dom: "EN",
    observacao: "",
  },
]);
assert(prepared[0].seg === "F", "não inventa EN sobre legenda existente");
assert(prepared[0].sab === "-" && prepared[0].dom === "-", "weekend default no prepare");

const row = applyWeekendDefault(
  cleanScheduleRow({
    re: "1",
    postoGrad: "CB",
    nome: "N",
    secao: "S",
    seg: "EN",
    ter: "EN",
    qua: "EN",
    qui: "EN",
    sex: "EN",
    sab: "EN",
    dom: "EN",
    observacao: "",
  })
);
assert(row.sab === "-" && row.dom === "-", "weekend default");

const filled = [
  cleanScheduleRow({
    re: "9",
    postoGrad: "SD",
    nome: "X",
    secao: "Z",
    seg: "F",
    ter: "SV",
    qua: "EN",
    qui: "EN",
    sex: "EN",
    sab: "SV",
    dom: "SV",
    observacao: "obs",
  }),
];
const init = getInitialWeeklyEditableFields();
const reset = resetWeeklyRowsToInitialState(filled);
assert(reset[0].re === "9" && reset[0].nome === "X", "limpeza mantém colaborador");
assert(reset[0].seg === init.seg && reset[0].observacao === "", "estado inicial aplicado");
assert(findUndefinedPaths(reset).length === 0, "limpeza sem undefined");

const blocked = clearWeeklySchedule({
  usuario: admin,
  week: future,
  status: "aprovada",
  rows: filled,
});
assert(!blocked.ok && blocked.reason === "aprovada", "aprovada bloqueia limpeza");

const allowed = clearWeeklySchedule({
  usuario: admin,
  week: future,
  status: "em_edicao",
  rows: filled,
});
assert(allowed.ok === true, "em_edicao permite limpeza");

console.log("\nCentral de Testes smoke: PASSOU");
console.log("Feature Dados da semana anterior: implementada na Escala Semanal (Alteração não alterada).");
console.log("Feature Limpar escala: implementada na Escala Semanal; bloqueada se aprovada; sem gravação automática.");
console.log(
  "Pendências manuais: limpar/cancelar/salvar/reload; escala aprovada; logout/login após salvar limpeza."
);
