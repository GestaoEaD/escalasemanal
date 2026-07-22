import { ScheduleRow, LastSaved, AuditOperation, Usuario } from "../types";
import { formatTimestamp } from "./dateUtils";
import { flattenAuditForExport } from "./auditService";
import { normalizeEmail } from "./usuarioHelpers";

/** Usuário autenticado que realizou a exportação (identificação digital). */
export interface ExportUser {
  nome: string;
  re?: string;
  postoGrad?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExportUserLabel(user?: ExportUser | null): string {
  if (!user?.nome) return "Usuário não identificado";
  const displayName = user.postoGrad
    ? `${user.postoGrad} ${user.nome}`.trim()
    : user.nome.trim();
  return user.re ? `${displayName} (RE ${user.re})` : displayName;
}

function getExportTimestamp(): { date: string; time: string } {
  const now = new Date();
  const date = String(now.getDate()).padStart(2, "0") + "/" +
    String(now.getMonth() + 1).padStart(2, "0") + "/" +
    now.getFullYear();
  const time = String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0");
  return { date, time };
}

function buildDigitalExportFooterHtml(exportedBy?: ExportUser | null): string {
  const { date, time } = getExportTimestamp();
  const userLabel = escapeHtml(formatExportUserLabel(exportedBy));
  return `
    <div class="export-footer">
      <div><b>Exportado por:</b> ${userLabel}</div>
      <div><b>Data:</b> ${date}</div>
      <div><b>Hora:</b> ${time}</div>
    </div>
  `;
}

function openPrintDocument(title: string, html: string): Window | null {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Por favor, permita popups para poder gerar a exportação em PDF.");
    return null;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  return printWindow;
}

function buildPrintButtonBar(hint: string): string {
  return `
    <div class="print-btn-bar no-print">
      <span class="print-hint">${escapeHtml(hint)}</span>
      <div class="print-actions">
        <button class="btn btn-secondary" onclick="window.close()">Fechar Janela</button>
        <button class="btn" onclick="window.print()">Imprimir / PDF</button>
      </div>
    </div>
  `;
}

/** CSS compartilhado: A4 paisagem, layout horizontal, mais espaço para observações. */
const A4_LANDSCAPE_PRINT_CSS = `
  @page {
    size: A4 landscape;
    margin: 6mm 5mm;
  }
  @media print {
    html, body {
      width: 100%;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      text-rendering: optimizeLegibility;
    }
    .no-print { display: none !important; }
    .header-container {
      margin-bottom: 5px !important;
      padding-bottom: 3px !important;
    }
    .header-title { font-size: 11px !important; }
    .header-org, .header-subtitle, .header-meta { font-size: 8.5px !important; }
    .header-org-main { font-size: 10px !important; }
    .section-title {
      font-size: 8.5px !important;
      margin: 5px 0 3px 0 !important;
      padding: 3px 6px !important;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      font-size: 7.5px !important;
      margin-bottom: 5px !important;
    }
    th, td {
      padding: 2px 2px !important;
      font-size: 7.5px !important;
      line-height: 1.2 !important;
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: middle;
    }
    td { color: #000000; }
    th { font-size: 7px !important; letter-spacing: 0 !important; }
    .col-nome, .col-secao {
      font-size: 7px !important;
      line-height: 1.15 !important;
    }
    .font-mono, .font-dense { font-size: 7px !important; }
    .text-obs, .col-obs {
      font-size: 7.5px !important;
      line-height: 1.25 !important;
      text-align: left !important;
      white-space: pre-wrap !important;
      vertical-align: top !important;
      padding: 3px 4px !important;
    }
    .footer-info, .export-footer { font-size: 7px !important; }
    .obs-block { padding: 6px !important; margin-bottom: 6px !important; font-size: 7.5px !important; }
    .print-section { page-break-inside: avoid; }
    .export-footer { page-break-inside: avoid; margin-top: 8px !important; }
  }
`;

const REPORT_BASE_CSS = `
  body {
    font-family: 'Inter', Arial, sans-serif;
    color: #000000;
    background-color: #ffffff;
    margin: 0;
    padding: 12px;
    font-size: 9px;
    line-height: 1.3;
    text-rendering: optimizeLegibility;
  }
  ${A4_LANDSCAPE_PRINT_CSS}
  .header-container {
    text-align: center;
    margin-bottom: 12px;
    border-bottom: 2px solid #111827;
    padding-bottom: 8px;
  }
  .header-org {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin: 0;
    color: #111827;
    line-height: 1.35;
  }
  .header-org-main {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.6px;
  }
  .header-title {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    margin: 6px 0 2px 0;
    color: #111827;
  }
  .header-meta {
    font-size: 10px;
    font-weight: 600;
    color: #111827;
    margin: 2px 0 0 0;
  }
  .section-title {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    margin: 10px 0 5px 0;
    color: #111827;
    background-color: #F3F4F6;
    padding: 4px 8px;
    border-left: 4px solid #2563EB;
    border-radius: 3px;
  }
  table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    font-size: 8px;
    table-layout: fixed;
  }
  th {
    background-color: #111827;
    color: #ffffff;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 7px;
    letter-spacing: 0.3px;
    padding: 4px 3px;
    border: 1px solid #111827;
  }
  td {
    padding: 3px 2px;
    border: 1px solid #9CA3AF;
    text-align: center;
    overflow-wrap: anywhere;
    word-break: break-word;
    color: #000000;
  }
  tr:nth-child(even) { background-color: #F9FAFB; }
  .text-left { text-align: left; }
  .text-center { text-align: center; }
  .bold { font-weight: 700; }
  .font-mono { font-family: monospace; font-size: 7.5px; }
  .font-dense { font-size: 7.5px; }
  .bg-cell { background-color: #F3F4F6; font-weight: 700; color: #000000; }
  .bg-weekend { background-color: #E5E7EB; }
  .weekend-cell { border: 1.5px solid #6B7280 !important; }
  .col-nome, .col-secao {
    overflow-wrap: anywhere;
    word-break: break-word;
    hyphens: auto;
  }
  .text-obs, .col-obs {
    font-size: 7.5px;
    color: #1F2937;
    text-align: left;
    white-space: pre-wrap;
    vertical-align: top;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .empty-state {
    text-align: center;
    padding: 8px;
    color: #9CA3AF;
    font-style: italic;
  }
  .footer-info {
    font-size: 7.5px;
    color: #1F2937;
    margin-top: 2px;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: wrap;
  }
  .obs-block {
    margin-bottom: 8px;
    padding: 6px 8px;
    background-color: #F9FAFB;
    border: 1px solid #9CA3AF;
    border-radius: 4px;
    white-space: pre-wrap;
    font-size: 8px;
    color: #111827;
    text-align: left;
  }
  .export-footer {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid #9CA3AF;
    font-size: 7.5px;
    color: #1F2937;
    line-height: 1.5;
  }
  .print-btn-bar {
    background-color: #F3F4F6;
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    border: 1px solid #E5E7EB;
  }
  .print-hint { font-size: 10px; font-weight: 600; color: #374151; }
  .print-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .btn {
    background-color: #2563EB;
    color: white;
    border: none;
    padding: 5px 12px;
    font-weight: 700;
    font-size: 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn:hover { background-color: #1D4ED8; }
  .btn-secondary { background-color: #4B5563; }
  .btn-secondary:hover { background-color: #374151; }
`;

const LOGS_REPORT_CSS = `
  body {
    font-family: 'Inter', Arial, sans-serif;
    color: #000000;
    background-color: #ffffff;
    margin: 0;
    padding: 12px;
    font-size: 8px;
    line-height: 1.25;
    text-rendering: optimizeLegibility;
  }
  ${A4_LANDSCAPE_PRINT_CSS}
  .header {
    text-align: center;
    margin-bottom: 10px;
    border-bottom: 2px solid #111827;
    padding-bottom: 6px;
  }
  h1 {
    font-size: 12px;
    margin: 0;
    text-transform: uppercase;
  }
  .meta {
    font-size: 8px;
    color: #1F2937;
    margin-top: 3px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    margin-bottom: 8px;
    table-layout: fixed;
    font-size: 7.5px;
  }
  th {
    background-color: #111827;
    color: #ffffff;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 7px;
    padding: 3px 2px;
    border: 1px solid #111827;
  }
  td {
    padding: 3px 2px;
    border: 1px solid #9CA3AF;
    text-align: left;
    overflow-wrap: anywhere;
    word-break: break-word;
    color: #000000;
  }
  tr:nth-child(even) { background-color: #F9FAFB; }
  .bold { font-weight: 700; }
  .font-mono { font-family: monospace; font-size: 7px; }
  .text-gray-500 { color: #374151; }
  .text-blue-800 { color: #1E3A8A; }
  .export-footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid #9CA3AF;
    font-size: 7.5px;
    color: #1F2937;
    line-height: 1.5;
  }
  .print-btn-bar {
    background-color: #F3F4F6;
    border: 1px solid #E5E7EB;
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .print-hint { font-size: 10px; font-weight: 600; color: #374151; }
  .print-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .btn {
    font-size: 9px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    background-color: #2563EB;
    color: white;
  }
  .btn-secondary { background-color: #374151; }
`;

function buildScheduleTableHeader(): string {
  return `
    <tr>
      <th style="width: 7%;">Posto</th>
      <th style="width: 7%;">R.E.</th>
      <th class="col-nome" style="width: 8%;">Nome</th>
      <th class="col-secao" style="width: 7%;">Seção</th>
      <th style="width: 4%;">Seg</th>
      <th style="width: 4%;">Ter</th>
      <th style="width: 4%;">Qua</th>
      <th style="width: 4%;">Qui</th>
      <th style="width: 4%;">Sex</th>
      <th style="width: 4%;">Sáb</th>
      <th style="width: 4%;">Dom</th>
      <th class="col-obs" style="width: 43%;">Observação</th>
    </tr>
  `;
}

function renderPlainTableRows(rows: ScheduleRow[]): string {
  if (rows.length === 0) {
    return `<tr><td colspan="12" class="empty-state">Nenhum colaborador adicionado a este painel.</td></tr>`;
  }
  return rows.map((r) => `
    <tr>
      <td class="bold font-dense">${escapeHtml(r.postoGrad)}</td>
      <td class="font-mono text-center">${escapeHtml(r.re)}</td>
      <td class="bold text-left col-nome">${escapeHtml(r.nome)}</td>
      <td class="text-left col-secao">${escapeHtml(r.secao)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.seg)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.ter)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.qua)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.qui)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.sex)}</td>
      <td class="text-center bold bg-cell bg-weekend weekend-cell">${escapeHtml(r.sab)}</td>
      <td class="text-center bold bg-cell bg-weekend weekend-cell">${escapeHtml(r.dom)}</td>
      <td class="text-left text-obs col-obs">${escapeHtml(r.observacao || "-")}</td>
    </tr>
  `).join("");
}

function translateLegendColorToHex(color: string): string {
  if (!color) return "#ffffff";
  const trimmed = color.trim().toLowerCase();
  if (trimmed.startsWith("#")) return color;
  const map: Record<string, string> = {
    "verde": "#dcfce7",
    "verde-escuro": "#bbf7d0",
    "amarelo": "#fef08a",
    "laranja": "#ffedd5",
    "azul-claro": "#eff6ff",
    "azul-medio": "#dbeafe",
    "roxo-claro": "#f3e8ff",
    "roxo-escuro": "#e9d5ff",
    "cinza": "#f3f4f6",
    "vermelho-claro": "#fee2e2",
    "vermelho": "#fca5a5",
    "bordo": "#fca5a5",
    "bordô": "#fca5a5",
    "azul-escuro": "#bfdbfe",
    "cinza-escuro": "#e5e7eb",
    "branco": "#ffffff",
    "preto": "#374151",
  };
  return map[trimmed] || color;
}

function createLegendCellStyleGetter(
  legendasList: { sigla: string; cor: string }[]
): (val: string) => string {
  return (val: string) => {
    const legend = legendasList.find((l) => l.sigla === val);
    if (legend?.cor) {
      const translatedCor = translateLegendColorToHex(legend.cor);
      const hex = translatedCor.replace("#", "");
      let textColor = "#000000";
      if (hex.length === 6) {
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        textColor = yiq >= 128 ? "#000000" : "#ffffff";
      }
      return `background-color: ${translatedCor}; color: ${textColor}; border: 1px solid #9CA3AF;`;
    }
    return "background-color: #ffffff; color: #000000; border: 1px solid #9CA3AF;";
  };
}

function renderColoredTableRows(
  rows: ScheduleRow[],
  getCellStyle: (val: string) => string
): string {
  if (rows.length === 0) {
    return `<tr><td colspan="12" class="empty-state">Nenhum colaborador adicionado a este painel.</td></tr>`;
  }
  return rows.map((r) => `
    <tr>
      <td class="bold font-dense">${escapeHtml(r.postoGrad)}</td>
      <td class="font-mono text-center">${escapeHtml(r.re)}</td>
      <td class="bold text-left col-nome">${escapeHtml(r.nome)}</td>
      <td class="text-left col-secao">${escapeHtml(r.secao)}</td>
      <td class="text-center bold" style="${getCellStyle(r.seg)}">${escapeHtml(r.seg)}</td>
      <td class="text-center bold" style="${getCellStyle(r.ter)}">${escapeHtml(r.ter)}</td>
      <td class="text-center bold" style="${getCellStyle(r.qua)}">${escapeHtml(r.qua)}</td>
      <td class="text-center bold" style="${getCellStyle(r.qui)}">${escapeHtml(r.qui)}</td>
      <td class="text-center bold" style="${getCellStyle(r.sex)}">${escapeHtml(r.sex)}</td>
      <td class="text-center bold weekend-cell" style="${getCellStyle(r.sab)}">${escapeHtml(r.sab)}</td>
      <td class="text-center bold weekend-cell" style="${getCellStyle(r.dom)}">${escapeHtml(r.dom)}</td>
      <td class="text-left text-obs col-obs">${escapeHtml(r.observacao || "-")}</td>
    </tr>
  `).join("");
}

function buildScheduleSectionHtml(
  title: string,
  rows: ScheduleRow[],
  renderRows: (rows: ScheduleRow[]) => string,
  observacoes?: string,
  savedInfo?: string,
  homologacaoInfo?: string
): string {
  const obsBlock = observacoes
    ? `<div class="obs-block"><b>Observações da Semana:</b><br/>${escapeHtml(observacoes)}</div>`
    : "";
  const homologLine = homologacaoInfo
    ? `<div class="footer-info" style="margin-top:4px;"><span><b>Homologação:</b> ${escapeHtml(homologacaoInfo)}</span></div>`
    : "";
  const savedLine = savedInfo
    ? `<div class="footer-info"><span>${escapeHtml(savedInfo)}</span></div>`
    : "";

  return `
    <div class="print-section">
      <div class="section-title">${escapeHtml(title)}</div>
      <table>
        <thead>${buildScheduleTableHeader()}</thead>
        <tbody>${renderRows(rows)}</tbody>
      </table>
      ${obsBlock}
      ${homologLine}
      ${savedLine}
    </div>
  `;
}

function buildScheduleReportDocument(options: {
  title: string;
  weekLabel: string;
  weekPeriod: string;
  year: number;
  bodyContent: string;
  exportedBy?: ExportUser | null;
}): string {
  const { title, weekLabel, weekPeriod, year, bodyContent, exportedBy } = options;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${REPORT_BASE_CSS}</style>
</head>
<body>
  ${buildPrintButtonBar("Impressão A4 paisagem (horizontal). Use Imprimir / PDF com orientação Paisagem.")}
  <div class="header-container">
    <div class="header-org header-org-main">Polícia Militar do Estado de São Paulo</div>
    <div class="header-org">Diretoria de Educação e Cultura</div>
    <div class="header-org">Divisão de Educação a Distância</div>
    <div class="header-meta">${escapeHtml(weekLabel)} &nbsp;|&nbsp; Período: ${escapeHtml(weekPeriod)} &nbsp;|&nbsp; Ano: ${year}</div>
  </div>
  ${bodyContent}
  ${buildDigitalExportFooterHtml(exportedBy)}
</body>
</html>`;
}

/**
 * Exports both scales to Excel-compatible CSV with UTF-8 BOM and semicolon separation.
 */
export function exportToExcel(
  year: number,
  weekLabel: string,
  weekPeriod: string,
  weeklyRows: ScheduleRow[],
  alterationRows: ScheduleRow[]
) {
  let csvContent = "\uFEFF"; // UTF-8 BOM

  // Title Section
  csvContent += `ESCALA DE SERVIÇO;ANO: ${year};${weekLabel};PERÍODO: ${weekPeriod}\n\n`;

  // Section 1: Escala Semanal
  csvContent += "1. ESCALA SEMANAL\n";
  csvContent += "Painel;Posto;R.E.;Nome;Seção;Seg;Ter;Qua;Qui;Sex;Sab;Dom;Observação\n";
  
  weeklyRows.forEach((row) => {
    const line = [
      "Escala Semanal",
      row.postoGrad,
      row.re,
      row.nome,
      row.secao,
      row.seg,
      row.ter,
      row.qua,
      row.qui,
      row.sex,
      row.sab,
      row.dom,
      row.observacao || ""
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(";");
    csvContent += line + "\n";
  });

  csvContent += "\n\n";

  // Section 2: Escala Alteração
  csvContent += "2. ESCALA ALTERAÇÃO\n";
  csvContent += "Painel;Posto;R.E.;Nome;Seção;Seg;Ter;Qua;Qui;Sex;Sab;Dom;Observação\n";

  alterationRows.forEach((row) => {
    const line = [
      "Escala Alteração",
      row.postoGrad,
      row.re,
      row.nome,
      row.secao,
      row.seg,
      row.ter,
      row.qua,
      row.qui,
      row.sex,
      row.sab,
      row.dom,
      row.observacao || ""
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(";");
    csvContent += line + "\n";
  });

  // Create Blob and Trigger Download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Escala_Servico_${year}_${weekLabel.replace(/\s+/g, "_")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Renders a highly polished, military-grade institutional layout of the schedules and prints/saves as PDF.
 */
export function exportToPDF(
  year: number,
  weekLabel: string,
  weekPeriod: string,
  weeklyRows: ScheduleRow[],
  alterationRows: ScheduleRow[],
  lastSavedWeekly: LastSaved | null,
  lastSavedAlteration: LastSaved | null,
  exportedBy?: ExportUser | null
) {
  const weeklySavedInfo = lastSavedWeekly
    ? `Último salvamento por: ${lastSavedWeekly.nome} (R.E. ${lastSavedWeekly.re}) em ${formatTimestamp(lastSavedWeekly.timestamp)}`
    : "Não há registros de salvamento.";

  const alterationSavedInfo = lastSavedAlteration
    ? `Último salvamento por: ${lastSavedAlteration.nome} (R.E. ${lastSavedAlteration.re}) em ${formatTimestamp(lastSavedAlteration.timestamp)}`
    : "Não há registros de salvamento.";

  const bodyContent =
    buildScheduleSectionHtml("1. Escala Semanal Principal", weeklyRows, renderPlainTableRows, undefined, weeklySavedInfo) +
    buildScheduleSectionHtml("2. Escala de Alteração / Substituições", alterationRows, renderPlainTableRows, undefined, alterationSavedInfo);

  const html = buildScheduleReportDocument({
    title: `Escala de Serviço - ${weekLabel} (${year})`,
    weekLabel,
    weekPeriod,
    year,
    bodyContent,
    exportedBy,
  });

  openPrintDocument(`Escala de Serviço - ${weekLabel} (${year})`, html);
}

/**
 * Exports selected scales to Excel CSV.
 */
export function exportToExcelCustom(
  year: number,
  weekLabel: string,
  weekPeriod: string,
  weeklyRows: ScheduleRow[],
  alterationRows: ScheduleRow[],
  includeWeekly: boolean,
  includeAlteration: boolean,
  weeklyObservacoes?: string,
  alterationObservacoes?: string,
  weeklyHomologacao?: string,
  alterationHomologacao?: string
) {
  let csvContent = "\uFEFF"; // UTF-8 BOM
  csvContent += `ESCALA DE SERVIÇO;ANO: ${year};${weekLabel};PERÍODO: ${weekPeriod}\n\n`;

  if (includeWeekly) {
    csvContent += "1. ESCALA SEMANAL\n";
    if (weeklyHomologacao) {
      csvContent += `Homologação: "${weeklyHomologacao.replace(/"/g, '""')}"\n`;
    }
    if (weeklyObservacoes) {
      csvContent += `Observações da Semana: "${weeklyObservacoes.replace(/"/g, '""')}"\n\n`;
    }
    csvContent += "Painel;Posto;R.E.;Nome;Seção;Seg;Ter;Qua;Qui;Sex;Sab;Dom;Observação\n";
    weeklyRows.forEach((row) => {
      const line = [
        "Escala Semanal",
        row.postoGrad,
        row.re,
        row.nome,
        row.secao,
        row.seg,
        row.ter,
        row.qua,
        row.qui,
        row.sex,
        row.sab,
        row.dom,
        row.observacao || ""
      ].map(v => `"${v.replace(/"/g, '""')}"`).join(";");
      csvContent += line + "\n";
    });
    csvContent += "\n\n";
  }

  if (includeAlteration) {
    csvContent += "2. ESCALA ALTERAÇÃO\n";
    if (alterationHomologacao) {
      csvContent += `Homologação: "${alterationHomologacao.replace(/"/g, '""')}"\n`;
    }
    if (alterationObservacoes) {
      csvContent += `Observações da Semana: "${alterationObservacoes.replace(/"/g, '""')}"\n\n`;
    }
    csvContent += "Painel;Posto;R.E.;Nome;Seção;Seg;Ter;Qua;Qui;Sex;Sab;Dom;Observação\n";
    alterationRows.forEach((row) => {
      const line = [
        "Escala Alteração",
        row.postoGrad,
        row.re,
        row.nome,
        row.secao,
        row.seg,
        row.ter,
        row.qua,
        row.qui,
        row.sex,
        row.sab,
        row.dom,
        row.observacao || ""
      ].map(v => `"${v.replace(/"/g, '""')}"`).join(";");
      csvContent += line + "\n";
    });
  }

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Escala_Servico_${year}_${weekLabel.replace(/\s+/g, "_")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exports selected scales to PDF.
 */
export function exportToPDFCustom(
  year: number,
  weekLabel: string,
  weekPeriod: string,
  weeklyRows: ScheduleRow[],
  alterationRows: ScheduleRow[],
  lastSavedWeekly: LastSaved | null,
  lastSavedAlteration: LastSaved | null,
  includeWeekly: boolean,
  includeAlteration: boolean,
  weeklyObservacoes?: string,
  alterationObservacoes?: string,
  legendasList: { sigla: string; cor: string }[] = [],
  exportedBy?: ExportUser | null,
  weeklyHomologacao?: string,
  alterationHomologacao?: string
) {
  const getCellStyle = createLegendCellStyleGetter(legendasList);
  const renderRows = (rows: ScheduleRow[]) => renderColoredTableRows(rows, getCellStyle);

  const weeklySavedInfo = lastSavedWeekly
    ? `Último salvamento por: ${lastSavedWeekly.nome} (R.E. ${lastSavedWeekly.re}) em ${formatTimestamp(lastSavedWeekly.timestamp)}`
    : "Não há registros de salvamento.";

  const alterationSavedInfo = lastSavedAlteration
    ? `Último salvamento por: ${lastSavedAlteration.nome} (R.E. ${lastSavedAlteration.re}) em ${formatTimestamp(lastSavedAlteration.timestamp)}`
    : "Não há registros de salvamento.";

  let bodyContent = "";

  if (includeWeekly) {
    bodyContent += buildScheduleSectionHtml(
      "1. Escala Semanal Principal",
      weeklyRows,
      renderRows,
      weeklyObservacoes,
      weeklySavedInfo,
      weeklyHomologacao
    );
  }

  if (includeAlteration) {
    bodyContent += buildScheduleSectionHtml(
      "2. Escala de Alteração / Substituições",
      alterationRows,
      renderRows,
      alterationObservacoes,
      alterationSavedInfo,
      alterationHomologacao
    );
  }

  const html = buildScheduleReportDocument({
    title: `Escala de Serviço - ${weekLabel} (${year})`,
    weekLabel,
    weekPeriod,
    year,
    bodyContent,
    exportedBy,
  });

  openPrintDocument(`Escala de Serviço - ${weekLabel} (${year})`, html);
}

/**
 * Exports logs to Excel-compatible CSV.
 */
/**
 * Exports logs to Excel-compatible CSV.
 */
export function exportLogsToExcel(logs: any[]) {
  let csvContent = "\uFEFF"; // UTF-8 BOM
  csvContent += "REGISTROS DE AUDITORIA (LOGS)\n\n";
  csvContent += "Data;Hora;Usuário;RE;Perfil;Operação;Módulo;Registro Alterado;Campo Alterado;Valor Anterior;Novo Valor\n";

  logs.forEach((log) => {
    const line = [
      log.data || "",
      log.hora || "",
      log.usuario || "",
      log.re || "",
      log.perfil || "Operador",
      log.operacao || "",
      log.modulo || "",
      log.registroAlterado || "",
      log.campoAlterado || "",
      log.valorAnterior || "",
      log.novoValor || ""
    ].map(v => `"${(v || "").replace(/"/g, '""')}"`).join(";");
    csvContent += line + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Logs_Auditoria_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Renders audit logs and prints/saves as PDF.
 */
export function exportLogsToPDF(logs: any[], exportedBy?: ExportUser | null) {
  const rowsHtml = logs.map((log) => `
    <tr>
      <td>${escapeHtml(log.data || "")}</td>
      <td>${escapeHtml(log.hora || "")}</td>
      <td class="bold">${escapeHtml(log.usuario || "")}</td>
      <td class="font-mono">${escapeHtml(log.re || "")}</td>
      <td>${escapeHtml(log.perfil || "Operador")}</td>
      <td class="bold">${escapeHtml(log.operacao || "")}</td>
      <td>${escapeHtml(log.modulo || "")}</td>
      <td>${escapeHtml(log.registroAlterado || "")}</td>
      <td class="bold">${escapeHtml(log.campoAlterado || "")}</td>
      <td class="text-gray-500">${escapeHtml(log.valorAnterior || "-")}</td>
      <td class="bold text-blue-800">${escapeHtml(log.novoValor || "-")}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Logs de Auditoria</title>
  <style>${LOGS_REPORT_CSS}</style>
</head>
<body>
  ${buildPrintButtonBar("Visualização de Logs. Clique em Imprimir / PDF para exportar.")}
  <div class="header">
    <h1>Relatório de Logs de Auditoria</h1>
    <div class="meta">Total de Registros: ${logs.length}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Hora</th>
        <th>Usuário</th>
        <th>RE</th>
        <th>Perfil</th>
        <th>Operação</th>
        <th>Módulo</th>
        <th>Reg. Alterado</th>
        <th>Campo</th>
        <th>Vl. Anterior</th>
        <th>Novo Valor</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="11" style="text-align:center;">Nenhum log encontrado.</td></tr>'}
    </tbody>
  </table>
  ${buildDigitalExportFooterHtml(exportedBy)}
</body>
</html>`;

  openPrintDocument("Logs de Auditoria", html);
}

/** Exporta operações desnormalizadas (1 linha por alteração) com coluna Operação. */
export function exportAuditOperationsToExcel(ops: AuditOperation[]) {
  const rows = flattenAuditForExport(ops);
  let csvContent = "\uFEFF";
  csvContent += "REGISTROS DE AUDITORIA\n\n";
  csvContent +=
    "Operação;Data;Hora;Usuário;RE;Perfil;Tipo;Documento;Semana;Ano;Campo;Antes;Depois;Colaborador;Versão;Detalhes\n";

  rows.forEach((r) => {
    const line = [
      r.operacaoId,
      r.data,
      r.hora,
      r.usuario,
      r.re,
      r.perfil,
      r.operacao,
      r.documento,
      r.semana,
      r.ano,
      r.campo,
      r.antes,
      r.depois,
      r.colaborador,
      r.versao,
      r.detalhes,
    ]
      .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(";");
    csvContent += line + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `Logs_Auditoria_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportAuditOperationsToPDF(
  ops: AuditOperation[],
  exportedBy?: ExportUser | null
) {
  const rows = flattenAuditForExport(ops);
  const rowsHtml = rows
    .map(
      (r) => `
    <tr>
      <td class="bold">${escapeHtml(r.operacaoId)}</td>
      <td>${escapeHtml(r.data)}</td>
      <td>${escapeHtml(r.hora)}</td>
      <td class="bold">${escapeHtml(r.usuario)}</td>
      <td class="font-mono">${escapeHtml(r.re)}</td>
      <td>${escapeHtml(r.operacao)}</td>
      <td>${escapeHtml(r.documento)}</td>
      <td class="bold">${escapeHtml(r.campo)}</td>
      <td class="text-gray-500">${escapeHtml(r.antes || "-")}</td>
      <td class="bold text-blue-800">${escapeHtml(r.depois || "-")}</td>
    </tr>
  `
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Logs de Auditoria</title>
  <style>${LOGS_REPORT_CSS}</style>
</head>
<body>
  ${buildPrintButtonBar("Visualização de Logs. Clique em Imprimir / PDF para exportar.")}
  <div class="header">
    <h1>Relatório de Logs de Auditoria</h1>
    <div class="meta">Total de linhas: ${rows.length} (desnormalizado a partir de ${ops.length} operação(ões))</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Operação</th>
        <th>Data</th>
        <th>Hora</th>
        <th>Usuário</th>
        <th>RE</th>
        <th>Tipo</th>
        <th>Documento</th>
        <th>Campo</th>
        <th>Antes</th>
        <th>Depois</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="10" style="text-align:center;">Nenhum log encontrado.</td></tr>'}
    </tbody>
  </table>
  ${buildDigitalExportFooterHtml(exportedBy)}
</body>
</html>`;

  openPrintDocument("Logs de Auditoria", html);
}

/** Exporta cadastro de usuários (CSV) incluindo E-mail Google. */
export function exportUsuariosToExcel(usuarios: Usuario[]) {
  let csvContent = "\uFEFF";
  csvContent += "CADASTRO DE USUÁRIOS\n\n";
  csvContent +=
    "Posto/Graduação;RE;Nome de Guerra;E-mail Google;Nome Completo;Perfil;Seção;Status;Provedor Auth;E-mail Verificado\n";

  [...usuarios]
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach((u) => {
      const line = [
        u.postoGrad,
        u.re,
        u.nome,
        normalizeEmail(u.email) || "",
        u.nomeCompleto || "",
        u.perfil || "Operador",
        u.secao,
        u.ativo !== false ? "ATIVO" : "INATIVO",
        u.authProvider || "local",
        u.emailVerificado ? "Sim" : "Não",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";");
      csvContent += line + "\n";
    });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const stamp = new Date().toISOString().slice(0, 10);
  link.setAttribute("download", "Usuarios_" + stamp + ".csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
