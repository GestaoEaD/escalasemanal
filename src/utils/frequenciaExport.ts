/**
 * Exportação/impressão A4 paisagem do Controle de Frequência.
 * Usa documento HTML dedicado (texto vetorial + bordas hairline) —
 * evita imprimir a UI da tela (baixa nitidez).
 */
import {
  ControleFrequenciaDocument,
  ControleFrequenciaObservacao,
  MESES_NOMES,
} from "../types";
import { dayKey, daysInMonth } from "./frequenciaIds";
import { displayFrequenciaCelula, isWeekendDay } from "./frequenciaDisplay";

export type FrequenciaExportUser = {
  nome: string;
  re?: string;
  postoGrad?: string;
};

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExportUserLabel(user?: FrequenciaExportUser | null): string {
  if (!user?.nome) return "Usuário não identificado";
  const displayName = user.postoGrad
    ? `${user.postoGrad} ${user.nome}`.trim()
    : user.nome.trim();
  return user.re ? `${displayName} (RE ${user.re})` : displayName;
}

function resolveObsNome(
  obs: ControleFrequenciaObservacao,
  doc: ControleFrequenciaDocument
): string {
  if (!obs.re) return "—";
  const row = doc.rows.find((r) => r.re === obs.re);
  return row?.nome || obs.re;
}

function resolveObsPosto(
  obs: ControleFrequenciaObservacao,
  doc: ControleFrequenciaDocument
): string {
  if (!obs.re) return "—";
  const row = doc.rows.find((r) => r.re === obs.re);
  return row?.postoGrad || "—";
}

const FREQUENCIA_PRINT_CSS = `
  @page {
    size: A4 landscape;
    margin: 5mm 4.5mm;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, "Segoe UI", sans-serif;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
  }

  body {
    padding: 8px 10px 12px;
    font-size: 8px;
    line-height: 1.2;
  }

  .no-print { display: block; }

  .print-btn-bar {
    background: #f3f4f6;
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    border: 1px solid #d1d5db;
  }
  .print-hint { font-size: 10px; font-weight: 600; color: #374151; }
  .print-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .btn {
    background: #111827;
    color: #fff;
    border: none;
    padding: 6px 12px;
    font-weight: 700;
    font-size: 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-secondary { background: #4b5563; }

  .header {
    text-align: center;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 0.75pt solid #000;
  }
  .header-org {
    margin: 0;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }
  .header-org-main {
    margin: 1px 0 0;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }
  .header-title {
    margin: 4px 0 1px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .header-meta {
    margin: 0;
    font-size: 8.5px;
    font-weight: 600;
  }

  .freq-table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
    table-layout: fixed;
    font-size: 7px;
    line-height: 1.15;
    empty-cells: show;
  }

  .freq-table thead th {
    background: #111827;
    color: #fff;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.15px;
    font-size: 6.5px;
  }

  .freq-table th,
  .freq-table td {
    border: 0.4pt solid #000;
    padding: 1.5px 1px;
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .freq-table .group-head th {
    background: #111827;
    color: #fff;
    font-size: 6.5px;
    padding: 2px 2px;
    border: 0.4pt solid #000;
  }

  .freq-table .col-posto { width: 7%; text-align: left; }
  .freq-table .col-re { width: 5.5%; text-align: left; font-family: "Consolas", "Courier New", monospace; }
  .freq-table .col-nome { width: 12%; text-align: left; font-weight: 700; }
  .freq-table .col-day { text-align: center; font-family: "Consolas", "Courier New", monospace; font-weight: 700; }
  .freq-table .col-meia { width: 4.2%; text-align: center; font-weight: 700; font-family: "Consolas", "Courier New", monospace; }
  .freq-table .col-aa { width: 3.2%; text-align: center; font-weight: 700; font-family: "Consolas", "Courier New", monospace; }

  .freq-table tbody td {
    background: #fff;
    color: #000;
    font-size: 7px;
  }

  .freq-table .weekend {
    background: #ececec !important;
  }

  .freq-table .id-cell {
    text-align: left;
    padding-left: 2px;
    padding-right: 2px;
  }

  .section-title {
    margin: 8px 0 3px;
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 0.5pt solid #000;
    padding-bottom: 2px;
  }

  .obs-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 7px;
  }
  .obs-table th,
  .obs-table td {
    border: 0.4pt solid #000;
    padding: 2px 3px;
    vertical-align: top;
  }
  .obs-table th {
    background: #111827;
    color: #fff;
    font-size: 6.5px;
    text-transform: uppercase;
  }
  .obs-table .col-obs-posto { width: 10%; }
  .obs-table .col-obs-re { width: 8%; }
  .obs-table .col-obs-text { width: auto; text-align: left; white-space: pre-wrap; word-break: break-word; }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }
  .meta-box {
    border: 0.5pt solid #000;
    padding: 5px 6px;
    min-height: 42px;
  }
  .meta-box .label {
    font-size: 6.5px;
    font-weight: 800;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .meta-box .value { font-size: 7.5px; font-weight: 700; }
  .meta-box .sub { font-size: 7px; }

  .export-footer {
    margin-top: 8px;
    padding-top: 4px;
    border-top: 0.5pt solid #000;
    font-size: 7px;
    line-height: 1.4;
  }

  @media print {
    body { padding: 0 !important; }
    .no-print { display: none !important; }
    .freq-table,
    .obs-table {
      font-size: 6.8px !important;
    }
    .freq-table th,
    .freq-table td,
    .obs-table th,
    .obs-table td {
      border: 0.35pt solid #000 !important;
      padding: 1px 1px !important;
    }
    .header { border-bottom: 0.75pt solid #000 !important; }
    .meta-box { border: 0.5pt solid #000 !important; }
    .weekend { background: #e8e8e8 !important; }
  }
`;

/**
 * Abre janela de impressão/PDF do Controle de Frequência (A4 paisagem).
 */
export function exportFrequenciaToPDF(options: {
  doc: ControleFrequenciaDocument;
  exportedBy?: FrequenciaExportUser | null;
}): void {
  const { doc, exportedBy } = options;
  const year = doc.ano;
  const month = doc.mes;
  const nDays = daysInMonth(year, month);
  const dayKeys = Array.from({ length: nDays }, (_, i) => dayKey(i + 1));
  const mesNome = MESES_NOMES[month - 1] || `Mês ${month}`;

  const weekend: Record<string, boolean> = {};
  for (let d = 1; d <= nDays; d++) {
    weekend[dayKey(d)] = isWeekendDay(year, month, d);
  }

  const dayHeads = dayKeys
    .map(
      (k) =>
        `<th class="col-day${weekend[k] ? " weekend" : ""}">${Number(k)}</th>`
    )
    .join("");

  const bodyRows =
    doc.rows.length === 0
      ? `<tr><td colspan="${3 + dayKeys.length + 2}" style="text-align:center;padding:8px;">Nenhum colaborador nesta seção.</td></tr>`
      : doc.rows
          .map((row) => {
            const days = dayKeys
              .map((k) => {
                const cel = row.dias[k];
                const shown = escapeHtml(displayFrequenciaCelula(cel));
                const wk = weekend[k] ? " weekend" : "";
                return `<td class="col-day${wk}">${shown}</td>`;
              })
              .join("");
            return `<tr>
              <td class="col-posto id-cell">${escapeHtml(row.postoGrad || "")}</td>
              <td class="col-re id-cell">${escapeHtml(row.re || "")}</td>
              <td class="col-nome id-cell">${escapeHtml(row.nome || "")}</td>
              ${days}
              <td class="col-meia">${escapeHtml(String(row.meiaDiaria ?? 0))}</td>
              <td class="col-aa">${escapeHtml(String(row.aa ?? 0))}</td>
            </tr>`;
          })
          .join("");

  const visibleObs = (doc.observacoes || []).filter((o) => !o.excluido);
  const obsRows =
    visibleObs.length === 0
      ? `<tr><td colspan="3" style="text-align:center;padding:6px;">Sem observações.</td></tr>`
      : visibleObs
          .map((o) => {
            return `<tr>
              <td class="col-obs-posto">${escapeHtml(resolveObsPosto(o, doc))}</td>
              <td class="col-obs-re">${escapeHtml(o.re || "—")}</td>
              <td class="col-obs-text">${escapeHtml(o.texto || "")}</td>
            </tr>`;
          })
          .join("");

  const ed = doc.responsavelEdicao;
  const ap = doc.responsavelAprovacao;
  const edHtml = ed
    ? `<div class="value">${escapeHtml(`${ed.postoGrad || ""} ${ed.nome || ""}`.trim())}</div>
       <div class="sub">RE ${escapeHtml(ed.re || "")} · ${escapeHtml(ed.data || "")} ${escapeHtml(ed.hora || "")}</div>`
    : `<div class="sub">Ainda sem edição salva</div>`;
  const apHtml = ap
    ? `<div class="value">${escapeHtml(`${ap.postoGrad || ""} ${ap.nome || ""}`.trim())}</div>
       <div class="sub">RE ${escapeHtml(ap.re || "")} · ${escapeHtml(ap.data || "")} ${escapeHtml(ap.hora || "")}</div>`
    : `<div class="sub">Pendente de aprovação</div>`;

  const now = new Date();
  const date =
    String(now.getDate()).padStart(2, "0") +
    "/" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "/" +
    now.getFullYear();
  const time =
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0");

  const title = `Controle de Frequência — ${doc.secao} — ${mesNome}/${year}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${FREQUENCIA_PRINT_CSS}</style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <span class="print-hint">Documento otimizado para A4 horizontal — linhas finas e texto nítido. Use Imprimir / PDF.</span>
    <div class="print-actions">
      <button class="btn btn-secondary" type="button" onclick="window.close()">Fechar</button>
      <button class="btn" type="button" onclick="window.print()">Imprimir / PDF</button>
    </div>
  </div>

  <header class="header">
    <p class="header-org">Polícia Militar do Estado de São Paulo</p>
    <p class="header-org-main">Divisão de Educação a Distância</p>
    <h1 class="header-title">Controle de Frequência</h1>
    <p class="header-meta">OPM: ${escapeHtml(doc.secao)} · ${escapeHtml(mesNome)}/${year}</p>
  </header>

  <table class="freq-table">
    <thead>
      <tr class="group-head">
        <th colspan="3">Identificação</th>
        <th colspan="${dayKeys.length}">Frequência</th>
        <th colspan="2">Totais</th>
      </tr>
      <tr>
        <th class="col-posto">Posto/Grad.</th>
        <th class="col-re">RE</th>
        <th class="col-nome">Nome</th>
        ${dayHeads}
        <th class="col-meia">1/2 Diária</th>
        <th class="col-aa">A.A.</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>

  <h2 class="section-title">Observações</h2>
  <table class="obs-table">
    <thead>
      <tr>
        <th class="col-obs-posto">Posto/Grad.</th>
        <th class="col-obs-re">RE</th>
        <th class="col-obs-text">Observação</th>
      </tr>
    </thead>
    <tbody>
      ${obsRows}
    </tbody>
  </table>

  <div class="meta-grid">
    <div class="meta-box">
      <div class="label">Responsável pela edição</div>
      ${edHtml}
    </div>
    <div class="meta-box">
      <div class="label">Responsável pela aprovação</div>
      ${apHtml}
    </div>
  </div>

  <div class="export-footer">
    <div><b>Exportado por:</b> ${escapeHtml(formatExportUserLabel(exportedBy))}</div>
    <div><b>Data:</b> ${date} &nbsp; <b>Hora:</b> ${time}</div>
  </div>

  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); }, 50);
    });
  </script>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Permita pop-ups para gerar a impressão/PDF do Controle de Frequência.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
