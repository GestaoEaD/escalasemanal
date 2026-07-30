/**
 * Testes unitários do núcleo de sincronização Frequência (sem Firebase).
 * Executar: npx tsx scripts/frequencia-sync.test.ts
 */
import assert from "node:assert/strict";
import {
  buildLegendaLookup,
  convertEscalaValorToFrequencia,
} from "../src/utils/frequenciaCalculo";
import { syncFrequenciaRows } from "../src/utils/frequenciaSync";
import type {
  ControleFrequenciaRow,
  EscalaDocument,
  Legenda,
  ScheduleRow,
} from "../src/types";

function legenda(partial: Partial<Legenda> & { sigla: string }): Legenda {
  return {
    id: partial.sigla,
    sigla: partial.sigla,
    descricao: partial.descricao || partial.sigla,
    cor: "#ccc",
    ordem: partial.ordem || 1,
    ativo: true,
    representacoes: partial.representacoes,
    regras: partial.regras,
  } as Legenda;
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

const legendas: Legenda[] = [
  legenda({
    sigla: "EN",
    representacoes: { escalaSemanal: "EN", escalaConsolidada: "1" },
    regras: { diaTrabalhado: true, meiaDiaria: { participa: true, valor: 1 }, aa: { contaDia: true } },
  }),
  legenda({
    sigla: "A",
    representacoes: { escalaSemanal: "A", escalaConsolidada: "A" },
  }),
  legenda({
    sigla: "LT",
    representacoes: { escalaSemanal: "LT", escalaConsolidada: "LT" },
  }),
];

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

check("converte EN da Semanal para consolidada 1", () => {
  // 05/01/2026 é segunda
  const sem = escala([row({ re: "1", seg: "EN" })]);
  const { rows } = syncFrequenciaRows({
    ano: 2026,
    mes: 1,
    secao: "Secao X",
    colaboradores: [colab],
    legendas,
    scaleDocs: { "2026_01": { semanal: sem, alteracao: null } },
    existingRows: [baseFreqRow("1")],
  });
  assert.equal(rows[0]?.dias?.["05"]?.valor, "1");
  assert.equal(rows[0]?.dias?.["05"]?.origem, "escala_semanal");
  assert.equal(rows[0]?.dias?.["05"]?.valorEscalaOriginal, "EN");
});

check("remapeia célula antiga EN → 1 mesmo sem valor novo na escala", () => {
  const existing: ControleFrequenciaRow[] = [
    {
      ...baseFreqRow("1"),
      dias: {
        "05": {
          valor: "EN",
          origem: "escala_semanal",
          editadoManualmente: false,
        } as any,
      },
    },
  ];
  const sem = escala([row({ re: "1", seg: "" })]);
  const { rows } = syncFrequenciaRows({
    ano: 2026,
    mes: 1,
    secao: "Secao X",
    colaboradores: [colab],
    legendas,
    scaleDocs: { "2026_01": { semanal: sem, alteracao: null } },
    existingRows: existing,
  });
  assert.equal(rows[0]?.dias?.["05"]?.valor, "1");
});

check("mapeia todas as legendas oficiais de teste (sigla → consolidada)", () => {
  const lookup = buildLegendaLookup(legendas);
  assert.equal(convertEscalaValorToFrequencia("EN", lookup), "1");
  assert.equal(convertEscalaValorToFrequencia("A", lookup), "A");
  assert.equal(convertEscalaValorToFrequencia("LT", lookup), "LT");
});

check("Alteração tem prioridade sobre Semanal", () => {
  const sem = escala([row({ re: "1", seg: "EN" })]);
  const alt = escala([row({ re: "1", seg: "LT" })]);
  const { rows } = syncFrequenciaRows({
    ano: 2026,
    mes: 1,
    secao: "Secao X",
    colaboradores: [colab],
    legendas,
    scaleDocs: { "2026_01": { semanal: sem, alteracao: alt } },
    existingRows: [baseFreqRow("1")],
  });
  assert.equal(rows[0]?.dias?.["05"]?.valor, "LT");
  assert.equal(rows[0]?.dias?.["05"]?.origem, "escala_alteracao");
});

check("Manual preservado", () => {
  const existing: ControleFrequenciaRow[] = [
    {
      ...baseFreqRow("1"),
      dias: {
        "05": {
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
    legendas,
    scaleDocs: { "2026_01": { semanal: sem, alteracao: null } },
    existingRows: existing,
  });
  const manual = rows[0]?.dias?.["05"] as any;
  assert.equal(manual?.editadoManualmente, true);
  assert.equal(manual?.valor, "MANUAL");
});

check("fim de semana usa consolidada da legenda A", () => {
  // 03/01/2026 é sábado → semana 2025_52 (29 Dez a 04 Jan)
  const sem = escala([row({ re: "1", sab: "", dom: "" })]);
  const { rows } = syncFrequenciaRows({
    ano: 2026,
    mes: 1,
    secao: "Secao X",
    colaboradores: [colab],
    legendas,
    scaleDocs: { "2025_52": { semanal: sem, alteracao: null } },
    existingRows: [baseFreqRow("1")],
  });
  assert.equal(rows[0]?.dias?.["03"]?.valor, "A");
  assert.equal(rows[0]?.dias?.["03"]?.origem, "padrao_fim_semana");
});

console.log(`\n${passed} checks finished`);
