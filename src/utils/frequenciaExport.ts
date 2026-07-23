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

function resolveObsPosto(
  obs: ControleFrequenciaObservacao,
  doc: ControleFrequenciaDocument
): string {
  if (!obs.re) return "—";
  const row = doc.rows.find((r) => r.re === obs.re);
  return row?.postoGrad || "—";
}

function resolveObsNome(
  obs: ControleFrequenciaObservacao,
  doc: ControleFrequenciaDocument
): string {
  if (!obs.re) return "—";
  const row = doc.rows.find((r) => r.re === obs.re);
  return row?.nome || "—";
}

const FREQUENCIA_PRINT_CSS = `
  /* —— Preview na tela (mesma linguagem visual da impressão) —— */
  @page {
    size: A4 landscape;
    margin: 12mm 10mm;
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
    color: #1f2937;
    font-family: system-ui, -apple-system, "Segoe UI", Arial, Helvetica, sans-serif;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  body {
    padding: 14px 16px 18px;
    font-size: 9.5px;
    line-height: 1.35;
  }

  .no-print { display: block; }

  .print-btn-bar {
    background: #f8fafc;
    padding: 10px 14px;
    border-radius: 8px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    border: 1px solid #e4e7ec;
  }
  .print-hint { font-size: 11px; font-weight: 600; color: #475569; }
  .print-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .btn {
    background: #334155;
    color: #fff;
    border: none;
    padding: 7px 14px;
    font-weight: 650;
    font-size: 11px;
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-secondary { background: #64748b; }

  .header {
    text-align: center;
    margin: 0 0 14px;
    padding: 0 4px 10px;
    border-bottom: 1px solid #d0d5dd;
  }
  .header-org {
    margin: 0;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.35px;
    text-transform: uppercase;
    color: #475569;
  }
  .header-org-main {
    margin: 3px 0 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: #111827;
  }
  .header-title {
    margin: 8px 0 3px;
    font-size: 13px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #0f172a;
  }
  .header-meta {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    color: #334155;
  }

  .freq-table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
    table-layout: fixed;
    font-size: 9px;
    line-height: 1.25;
    empty-cells: show;
    margin: 0 0 16px;
  }

  .freq-table thead th {
    background: #f2f4f7;
    color: #344054;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    font-size: 8px;
  }

  .freq-table th,
  .freq-table td {
    border: 1px solid #e4e7ec;
    padding: 4px 3px;
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .freq-table .group-head th {
    background: #eaecf0;
    color: #1d2939;
    font-size: 8.5px;
    font-weight: 750;
    padding: 6px 4px;
    border: 1px solid #d0d5dd;
    letter-spacing: 0.35px;
  }

  .freq-table thead tr:not(.group-head) th {
    border: 1px solid #d0d5dd;
    padding: 5px 3px;
  }

  .freq-table .col-posto { width: 10%; text-align: left; }
  .freq-table .col-re {
    width: 8%;
    text-align: left;
    font-variant-numeric: tabular-nums;
    font-family: ui-monospace, "Segoe UI", Arial, monospace;
  }
  .freq-table .col-nome { width: 11%; text-align: left; font-weight: 650; color: #101828; }
  .freq-table .col-day {
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 8px;
    color: #1f2937;
    white-space: nowrap;
    padding: 2px 0 !important;
  }
  .freq-table .col-meia,
  .freq-table .col-aa {
    width: 4.5%;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #101828;
  }
  .freq-table .col-aa { width: 3.5%; }

  .freq-table thead th.col-day {
    font-size: 7.5px;
    font-weight: 750;
    padding: 3px 0 !important;
  }

  .freq-table tbody td {
    background: #fff;
    color: #1f2937;
    font-size: 9px;
    border-color: #e4e7ec;
  }

  .freq-table tbody tr:nth-child(even) td:not(.weekend) {
    background: #fcfcfd;
  }

  .freq-table .weekend {
    background: #f2f4f7 !important;
  }

  .freq-table .id-cell {
    text-align: left;
    padding-left: 5px;
    padding-right: 4px;
  }

  /* Destaque sóbrio para afastamento / falta (A, F) — sem alterar o texto */
  .freq-table td.mark-afast {
    font-weight: 750;
    color: #344054;
    letter-spacing: 0.15px;
  }

  .section-title {
    margin: 18px 0 8px;
    padding: 0 0 5px;
    font-size: 10px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #1d2939;
    border-bottom: 1px solid #d0d5dd;
  }

  .obs-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 9px;
    margin: 0 0 16px;
  }
  .obs-table th,
  .obs-table td {
    border: 1px solid #e4e7ec;
    padding: 6px 7px;
    vertical-align: top;
  }
  .obs-table th {
    background: #f2f4f7;
    color: #344054;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    border-color: #d0d5dd;
  }
  .obs-table .col-obs-posto { width: 12%; text-align: left; }
  .obs-table .col-obs-re { width: 9%; text-align: left; }
  .obs-table .col-obs-nome {
    width: 12%;
    text-align: left;
    font-weight: 750;
    color: #101828;
    white-space: nowrap;
  }
  .obs-table .col-obs-text {
    width: auto;
    text-align: left;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
    color: #1f2937;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 4px;
  }
  .meta-box {
    border: 1px solid #d0d5dd;
    background: #f9fafb;
    padding: 10px 12px;
    min-height: 52px;
    border-radius: 2px;
  }
  .meta-box .label {
    font-size: 8px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.35px;
    color: #475569;
    margin-bottom: 5px;
  }
  .meta-box .value {
    font-size: 10px;
    font-weight: 700;
    color: #101828;
  }
  .meta-box .sub {
    font-size: 9px;
    color: #475569;
    margin-top: 2px;
  }

  .export-footer {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #d0d5dd;
    font-size: 8.5px;
    line-height: 1.45;
    color: #475569;
  }

  /* —— Impressão / PDF —— */
  @media print {
    @page {
      size: A4 landscape;
      margin: 12mm 10mm;
    }

    html, body {
      width: auto;
      background: #fff !important;
      color: #1f2937 !important;
      font-family: system-ui, -apple-system, "Segoe UI", Arial, Helvetica, sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      padding: 0 !important;
      margin: 0 !important;
      font-size: 9.5px !important;
      line-height: 1.3 !important;
    }

    .no-print { display: none !important; }

    .header {
      margin-bottom: 12px !important;
      padding-bottom: 8px !important;
      border-bottom: 1px solid #d0d5dd !important;
    }
    .header-org { font-size: 8.5px !important; color: #475569 !important; }
    .header-org-main { font-size: 10.5px !important; color: #111827 !important; }
    .header-title { font-size: 12px !important; margin: 6px 0 2px !important; }
    .header-meta { font-size: 9.5px !important; }

    .freq-table {
      width: 100% !important;
      margin: 0 0 14px !important;
      font-size: 9px !important;
      table-layout: fixed !important;
    }

    .freq-table .group-head th {
      background: #eaecf0 !important;
      color: #1d2939 !important;
      border: 1px solid #d0d5dd !important;
      padding: 5px 3px !important;
      font-size: 8px !important;
    }

    .freq-table thead tr:not(.group-head) th {
      background: #f2f4f7 !important;
      color: #344054 !important;
      border: 1px solid #d0d5dd !important;
      padding: 4px 2px !important;
      font-size: 7.5px !important;
    }

    .freq-table th,
    .freq-table td {
      border: 1px solid #e4e7ec !important;
      padding: 3.5px 2.5px !important;
    }

    .freq-table tbody td {
      background: #fff !important;
      color: #1f2937 !important;
      font-size: 9px !important;
    }

    .freq-table tbody tr:nth-child(even) td:not(.weekend) {
      background: #fcfcfd !important;
    }

    .freq-table .weekend {
      background: #f2f4f7 !important;
    }

    .freq-table .col-day {
      text-align: center !important;
      font-size: 8px !important;
      padding: 2px 0 !important;
    }

    .freq-table thead th.col-day {
      font-size: 7.5px !important;
      padding: 2.5px 0 !important;
    }

    .freq-table .col-posto { width: 10% !important; }
    .freq-table .col-re { width: 8% !important; }
    .freq-table .col-nome { width: 11% !important; }
    .freq-table .col-meia { width: 4.5% !important; }
    .freq-table .col-aa { width: 3.5% !important; }

    .freq-table .col-posto,
    .freq-table .col-re,
    .freq-table .col-nome,
    .freq-table .id-cell {
      text-align: left !important;
      padding-left: 3px !important;
      padding-right: 2px !important;
    }

    .freq-table td.mark-afast {
      font-weight: 750 !important;
      color: #344054 !important;
    }

    .section-title {
      margin: 16px 0 7px !important;
      padding-bottom: 4px !important;
      border-bottom: 1px solid #d0d5dd !important;
      font-size: 9.5px !important;
      color: #1d2939 !important;
    }

    .obs-table {
      margin: 0 0 14px !important;
      font-size: 9px !important;
    }
    .obs-table th {
      background: #f2f4f7 !important;
      color: #344054 !important;
      border: 1px solid #d0d5dd !important;
      padding: 5px 6px !important;
    }
    .obs-table td {
      border: 1px solid #e4e7ec !important;
      padding: 5px 6px !important;
    }
    .obs-table .col-obs-text {
      text-align: left !important;
      white-space: pre-wrap !important;
    }

    .meta-grid {
      gap: 10px !important;
      margin-top: 2px !important;
    }
    .meta-box {
      border: 1px solid #d0d5dd !important;
      background: #f9fafb !important;
      padding: 9px 10px !important;
      border-radius: 0 !important;
    }

    .export-footer {
      margin-top: 14px !important;
      padding-top: 7px !important;
      border-top: 1px solid #d0d5dd !important;
      color: #475569 !important;
      font-size: 8px !important;
    }
  }
`;

function dayCellExtraClass(shown: string): string {
  const v = String(shown || "").trim().toUpperCase();
  if (v === "A" || v === "F") return " mark-afast";
  return "";
}

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

  const dayCols = dayKeys.map(() => `<col class="col-day" />`).join("");

  const bodyRows =
    doc.rows.length === 0
      ? `<tr><td colspan="${3 + dayKeys.length + 2}" style="text-align:center;padding:8px;">Nenhum colaborador nesta seção.</td></tr>`
      : doc.rows
          .map((row) => {
            const days = dayKeys
              .map((k) => {
                const cel = row.dias[k];
                const shownRaw = displayFrequenciaCelula(cel);
                const shown = escapeHtml(shownRaw);
                const wk = weekend[k] ? " weekend" : "";
                const mark = dayCellExtraClass(shownRaw);
                return `<td class="col-day${wk}${mark}">${shown}</td>`;
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
      ? `<tr><td colspan="4" style="text-align:center;padding:6px;">Sem observações.</td></tr>`
      : visibleObs
          .map((o) => {
            return `<tr>
              <td class="col-obs-posto">${escapeHtml(resolveObsPosto(o, doc))}</td>
              <td class="col-obs-re">${escapeHtml(o.re || "—")}</td>
              <td class="col-obs-nome">${escapeHtml(resolveObsNome(o, doc))}</td>
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
    <span class="print-hint">Pré-visualização A4 paisagem — bordas suaves e tipografia leve. Use Imprimir / PDF.</span>
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
    <colgroup>
      <col class="col-posto" />
      <col class="col-re" />
      <col class="col-nome" />
      ${dayCols}
      <col class="col-meia" />
      <col class="col-aa" />
    </colgroup>
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
        <th class="col-obs-posto">Posto/Graduação</th>
        <th class="col-obs-re">RE</th>
        <th class="col-obs-nome">Nome</th>
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
