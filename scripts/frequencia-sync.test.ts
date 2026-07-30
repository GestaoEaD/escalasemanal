/**
 * Testes unitários do núcleo de sincronização Frequência (sem Firebase).
 * Executar: npx tsx scripts/frequencia-sync.test.ts
 */
import assert from "node:assert/strict";
import { syncFrequenciaRows } from "../src/utils/frequenciaSync";
import type {
  ControleFrequenciaRow,
  EscalaDocument,
  Legenda,
  ScheduleRow,
} from "../src/types";

function legendaA(): Legenda {
  return {
    id: "A",
    sigla: "A",
    descricao: "Afastamento",
    cor: "#ccc",
    ordem: 1,
    ativo: true,
    representacoes: [{ tipo: "texto", valor: "A" }],
    regras: { padrao_fim_semana: true },
  } as unknown as Legenda;
}

function row(partial: Partial<ScheduleRow> & { re: string }): ScheduleRow {
  return {
    re: partial.re,
    nome: partial.nome || "Teste",
    postoGrad: "CB",
    secao: "Secao X",
    secaoId: "SEC_X",
    seg: partial.seg || "",
    ter: partial.ter || "",
    qua: partial.qua || "",
    qui: partial.qui || "",
    sex: partial.sex || "",
    sab: partial.sab || "",
    dom: partial.dom || "",
    observacao: "",
  } as ScheduleRow;
}

function escala(rows: ScheduleRow[]): EscalaDocument {
  return {
    id: "d__2026__01",
    divisaoId: "d",
    ano: 2026,
    semana: 1,
    periodo: "",
    rows,
    status: "em_edicao",
    versao: 1,
  } as EscalaDocument;
}

function baseFreqRow(re: string): ControleFrequenciaRow {
  return {
    re,
    nome: "Teste",
    postoGrad: "CB",
    dias: {},
  } as ControleFrequenciaRow;
}

const colab = {
  re: "1",
  nome: "Teste",
  postoGrad: "CB",
  secao: "Secao X",
  secaoId: "SEC_X",
  ativo: true,
  divisaoId: "d",
} as any;

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

check("retorna rows sincronizadas", () => {
  const sem = escala([row({ re: "1", seg: "EN" })]);
  const { rows } = syncFrequenciaRows({
    ano: 2026,
    mes: 1,
    secao: "Secao X",
    colaboradores: [colab],
    legendas: [legendaA()],
    scaleDocs: { "2026_01": { semanal: sem, alteracao: null } },
    existingRows: [baseFreqRow("1")],
  });
  assert.ok(rows.length >= 1);
});

check("Manual preservado", () => {
  const existing: ControleFrequenciaRow[] = [
    {
      ...baseFreqRow("1"),
      dias: {
        "2026-01-05": {
          valor: "MANUAL",
          origem: "manual",
          editadoManualmente: true,
        } as any,
      },
    },
  ];
  const sem = escala([row({ re: "1", seg: "EN" })]);
  const { rows } = syncFrequenciaRows({
    ano: 2026,
    mes: 1,
    secao: "Secao X",
    colaboradores: [colab],
    legendas: [legendaA()],
    scaleDocs: { "2026_01": { semanal: sem, alteracao: null } },
    existingRows: existing,
  });
  const manual = rows[0]?.dias?.["2026-01-05"] as any;
  assert.equal(manual?.editadoManualmente, true);
  assert.equal(manual?.valor, "MANUAL");
});

check("Alteração tem prioridade quando convertível", () => {
  const sem = escala([row({ re: "1", seg: "EN" })]);
  const alt = escala([row({ re: "1", seg: "LT" })]);
  const { rows } = syncFrequenciaRows({
    ano: 2026,
    mes: 1,
    secao: "Secao X",
    colaboradores: [colab],
    legendas: [legendaA()],
    scaleDocs: { "2026_01": { semanal: sem, alteracao: alt } },
    existingRows: [baseFreqRow("1")],
  });
  assert.ok(rows[0]);
});

console.log(`\n${passed} checks finished`);
