/**
 * Smoke test: detect/sanitize undefined Firestore fields + clean payloads.
 * Run: npx tsx scripts/firestore-sanitize-smoke.ts
 */
import {
  findUndefinedPaths,
  prepareFirestoreWrite,
  sanitizeFirestoreData,
} from "../src/utils/firestoreSanitize";
import { buildHistoricoEvento } from "../src/utils/approvalService";
import {
  cleanAprovacao,
  cleanHistorico,
  cleanScheduleRow,
} from "../src/utils/escalaPayload";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

// Simula objeto problemático típico após aprovação
const dirty = {
  id: "2026_29",
  observacoes: "",
  aprovacao: {
    solicitacaoId: "sol_x",
    enviadoPor: {
      nome: "VENTURA",
      re: "124342-0",
      postoGrad: undefined as unknown as string,
      data: "20/07/2026",
      hora: "15:00",
      timestamp: { toDate: () => new Date() },
    },
    aprovadoPor: null,
    rejeitadoPor: undefined as unknown as null,
    motivoRejeicao: undefined as unknown as string,
    versaoEnviada: 1,
  },
  historico: [
    {
      id: "h1",
      tipo: "alteracao" as const,
      descricao: "x",
      usuario: "VENTURA",
      re: "124342-0",
      postoGrad: undefined as unknown as string,
      data: "20/07/2026",
      hora: "15:00",
      timestamp: { toDate: () => new Date() },
      versao: 1,
      solicitacaoId: undefined as unknown as string,
      detalhes: undefined as unknown as string,
    },
  ],
  rows: [
    {
      re: "1",
      postoGrad: "CB PM",
      nome: "A",
      secao: "X",
      seg: "EN",
      ter: "EN",
      qua: "EN",
      qui: "EN",
      sex: "EN",
      sab: "EN",
      dom: "EN",
      observacao: undefined as unknown as string,
      ordem: undefined as unknown as number,
    },
  ],
};

const paths = findUndefinedPaths(dirty);
assert(paths.includes("aprovacao.enviadoPor.postoGrad"), "detecta aprovacao.enviadoPor.postoGrad");
assert(paths.includes("aprovacao.rejeitadoPor"), "detecta aprovacao.rejeitadoPor");
assert(paths.includes("historico[0].postoGrad"), "detecta historico[0].postoGrad");
assert(paths.includes("rows[0].observacao"), "detecta rows[0].observacao");
assert(paths.includes("rows[0].ordem"), "detecta rows[0].ordem (spread extra)");

const cleanedRow = cleanScheduleRow(dirty.rows[0]);
assert(findUndefinedPaths(cleanedRow).length === 0, "cleanScheduleRow sem undefined");
assert(!("ordem" in cleanedRow), "cleanScheduleRow remove ordem extra");

const cleanedHist = cleanHistorico(dirty.historico as any);
assert(findUndefinedPaths(cleanedHist).length === 0, "cleanHistorico sem undefined");

const cleanedApr = cleanAprovacao(dirty.aprovacao as any);
assert(findUndefinedPaths(cleanedApr).length === 0, "cleanAprovacao sem undefined");
assert(!cleanedApr || !("rejeitadoPor" in cleanedApr) || cleanedApr.rejeitadoPor === null, "rejeitadoPor tratado");

const payload = {
  id: "2026_29",
  rows: dirty.rows.map(cleanScheduleRow),
  aprovacao: cleanAprovacao(dirty.aprovacao as any),
  historico: cleanHistorico(dirty.historico as any),
  observacoes: "",
};
assert(findUndefinedPaths(payload).length === 0, "payload limpo na origem");

const afterSanitize = prepareFirestoreWrite("escalas_semanais/2026_29", dirty as any);
assert(findUndefinedPaths(afterSanitize).length === 0, "sanitize remove todos undefined");

const evento = buildHistoricoEvento({
  tipo: "alteracao",
  descricao: "Alterações salvas",
  usuario: { nome: "VENTURA", re: "124342-0" },
  versao: 2,
});
assert(findUndefinedPaths(evento).length === 0, "buildHistoricoEvento sem undefined");

const nested = sanitizeFirestoreData({ a: { b: undefined, c: 1 }, d: [1, undefined, 3] }) as any;
assert(!("b" in nested.a), "remove chave undefined em objeto");
assert(nested.d[1] === null, "undefined em array vira null");

console.log("\nSanitização + origem validadas.");
console.log("Caminhos típicos do bug:", paths);
