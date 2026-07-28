/**
 * Export CSV (Excel-compatível) do Controle de Frequência.
 */
import { ControleFrequenciaDocument } from "../types";
import { dayKey, daysInMonth, mesLabel } from "./frequenciaIds";
import { displayFrequenciaCelula } from "./frequenciaDisplay";

function csvEscape(value: string): string {
  const v = String(value ?? "");
  if (/[",;\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function exportFrequenciaToExcel(options: {
  doc: ControleFrequenciaDocument;
  codigoOpm?: string;
}): void {
  const { doc: docData, codigoOpm } = options;
  const n = daysInMonth(docData.ano, docData.mes);
  const headers = [
    "RE",
    "Posto/Grad",
    "Nome",
    "Seção",
    ...Array.from({ length: n }, (_, i) => String(i + 1)),
    "Meia Diária",
    "A.A.",
  ];

  const lines: string[] = [];
  lines.push(
    csvEscape(
      `Controle de Frequência — ${mesLabel(docData.mes)}/${docData.ano} — ${docData.secao}`
    )
  );
  if (codigoOpm) lines.push(csvEscape(`Código OPM: ${codigoOpm}`));
  lines.push(headers.map(csvEscape).join(";"));

  for (const row of docData.rows || []) {
    const cells = [
      row.re,
      row.postoGrad,
      row.nome,
      row.secao,
      ...Array.from({ length: n }, (_, i) => {
        const k = dayKey(i + 1);
        return displayFrequenciaCelula(row.dias?.[k]);
      }),
      String(row.meiaDiaria ?? 0),
      String(row.aa ?? 0),
    ];
    lines.push(cells.map(csvEscape).join(";"));
  }

  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `frequencia_${docData.ano}_${String(docData.mes).padStart(2, "0")}_${String(docData.secao || "")
    .replace(/\s+/g, "_")
    .slice(0, 40)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
