/**
 * Testes unitários da sincronização de roster das escalas.
 * Executar: npx tsx scripts/roster-sync.test.ts
 */
import assert from "node:assert/strict";
import { syncScheduleRosterWithCadastro } from "../src/utils/rosterSync";
import type { Colaborador, ScheduleRow } from "../src/types";

function colaborador(re: string, ativo = true): Colaborador {
  return {
    re,
    nome: `Nome ${re}`,
    postoGrad: "CB",
    secao: "Secao X",
    secaoId: "SEC_X",
    ativo,
    ordem: Number(re),
    divisaoId: "d",
  } as Colaborador;
}

function row(re: string): ScheduleRow {
  return {
    re,
    nome: `Nome ${re}`,
    postoGrad: "CB",
    secao: "Secao X",
    secaoId: "SEC_X",
    seg: "EN",
    ter: "EN",
    qua: "EN",
    qui: "EN",
    sex: "EN",
    sab: "A",
    dom: "A",
    observacao: "",
  } as ScheduleRow;
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log("OK", name);
  } catch (e) {
    console.error("FAIL", name, e);
    process.exitCode = 1;
  }
}

check("Semanal inclui colaboradores ativos ausentes", () => {
  const result = syncScheduleRosterWithCadastro(
    [row("1")],
    [colaborador("1"), colaborador("2")]
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.added.length, 1);
});

check("Alteração não inclui colaboradores ausentes", () => {
  const result = syncScheduleRosterWithCadastro(
    [row("1")],
    [colaborador("1"), colaborador("2")],
    { addMissing: false }
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.added.length, 0);
  assert.equal(result.changed, false);
});

check("Alteração remove inativos e mantém os demais", () => {
  const result = syncScheduleRosterWithCadastro(
    [row("1"), row("2")],
    [colaborador("1"), colaborador("2", false)],
    { addMissing: false }
  );
  assert.deepEqual(result.removedRes, ["2"]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.re, "1");
});

console.log(`\n${passed} checks finished`);
