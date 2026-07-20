import { ScheduleRow, LastSaved } from "../types";
import { formatTimestamp } from "./dateUtils";

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

/** CSS compartilhado: A4 retrato, layout compacto, sem áreas de assinatura. */
const A4_PORTRAIT_PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 8mm 6mm;
  }
  @media print {
    html, body {
      width: 100%;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .no-print { display: none !important; }
    .header-container {
      margin-bottom: 6px !important;
      padding-bottom: 4px !important;
    }
    .header-title { font-size: 12px !important; }
    .header-subtitle, .header-meta { font-size: 8px !important; }
    .section-title {
      font-size: 8px !important;
      margin: 6px 0 3px 0 !important;
      padding: 3px 6px !important;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      font-size: 6.5px !important;
      margin-bottom: 6px !important;
    }
    th, td {
      padding: 2px 1px !important;
      font-size: 6.5px !important;
      line-height: 1.15 !important;
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: middle;
    }
    th { font-size: 6px !important; letter-spacing: 0 !important; }
    .font-mono, .font-dense, .text-obs { font-size: 6px !important; }
    .footer-info, .export-footer { font-size: 6px !important; }
    .obs-block { padding: 6px !important; margin-bottom: 6px !important; font-size: 6.5px !important; }
    .print-section { page-break-inside: avoid; }
    .export-footer { page-break-inside: avoid; margin-top: 8px !important; }
  }
`;

const REPORT_BASE_CSS = `
  body {
    font-family: 'Inter', Arial, sans-serif;
    color: #111827;
    background-color: #ffffff;
    margin: 0;
    padding: 12px;
    font-size: 9px;
    line-height: 1.3;
  }
  ${A4_PORTRAIT_PRINT_CSS}
  .header-container {
    text-align: center;
    margin-bottom: 12px;
    border-bottom: 2px solid #111827;
    padding-bottom: 8px;
  }
  .header-subtitle {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 2px 0;
    color: #374151;
  }
  .header-title {
    font-size: 15px;
    font-weight: 800;
    margin: 2px 0;
    color: #111827;
  }
  .header-meta {
    font-size: 10px;
    font-weight: 600;
    color: #4B5563;
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
    border: 1px solid #D1D5DB;
    text-align: center;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  tr:nth-child(even) { background-color: #F9FAFB; }
  .text-left { text-align: left; }
  .text-center { text-align: center; }
  .bold { font-weight: 700; }
  .font-mono { font-family: monospace; font-size: 7.5px; }
  .font-dense { font-size: 7.5px; }
  .bg-cell { background-color: #F3F4F6; font-weight: 700; color: #1F2937; }
  .bg-weekend { background-color: #E5E7EB; }
  .text-obs { font-size: 7px; color: #4B5563; }
  .empty-state {
    text-align: center;
    padding: 8px;
    color: #9CA3AF;
    font-style: italic;
  }
  .footer-info {
    font-size: 7px;
    color: #6B7280;
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
    border: 1px solid #D1D5DB;
    border-radius: 4px;
    white-space: pre-wrap;
    font-size: 8px;
    color: #374151;
    text-align: left;
  }
  .export-footer {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid #D1D5DB;
    font-size: 7px;
    color: #4B5563;
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
    color: #111827;
    background-color: #ffffff;
    margin: 0;
    padding: 12px;
    font-size: 7.5px;
    line-height: 1.25;
  }
  ${A4_PORTRAIT_PRINT_CSS}
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
    color: #4B5563;
    margin-top: 3px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    margin-bottom: 8px;
    table-layout: fixed;
    font-size: 7px;
  }
  th {
    background-color: #111827;
    color: #ffffff;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 6.5px;
    padding: 3px 2px;
    border: 1px solid #111827;
  }
  td {
    padding: 3px 2px;
    border: 1px solid #D1D5DB;
    text-align: left;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  tr:nth-child(even) { background-color: #F9FAFB; }
  .bold { font-weight: 700; }
  .font-mono { font-family: monospace; font-size: 6.5px; }
  .text-gray-500 { color: #6B7280; }
  .text-blue-800 { color: #1E40AF; }
  .export-footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid #D1D5DB;
    font-size: 7px;
    color: #4B5563;
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
      <th style="width: 9%;">Posto</th>
      <th style="width: 9%;">R.E.</th>
      <th style="width: 14%;">Nome</th>
      <th style="width: 12%;">Seção</th>
      <th style="width: 5%;">Seg</th>
      <th style="width: 5%;">Ter</th>
      <th style="width: 5%;">Qua</th>
      <th style="width: 5%;">Qui</th>
      <th style="width: 5%;">Sex</th>
      <th style="width: 5%;">Sáb</th>
      <th style="width: 5%;">Dom</th>
      <th style="width: 21%;">Obs.</th>
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
      <td class="bold text-left">${escapeHtml(r.nome)}</td>
      <td class="text-left">${escapeHtml(r.secao)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.seg)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.ter)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.qua)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.qui)}</td>
      <td class="text-center bold bg-cell">${escapeHtml(r.sex)}</td>
      <td class="text-center bold bg-cell bg-weekend">${escapeHtml(r.sab)}</td>
      <td class="text-center bold bg-cell bg-weekend">${escapeHtml(r.dom)}</td>
      <td class="text-left text-obs">${escapeHtml(r.observacao || "-")}</td>
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
      return `background-color: ${translatedCor}; color: ${textColor}; border: 1px solid rgba(0,0,0,0.15);`;
    }
    return "background-color: #ffffff; color: #000000; border: 1px solid #D1D5DB;";
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
      <td class="bold text-left">${escapeHtml(r.nome)}</td>
      <td class="text-left">${escapeHtml(r.secao)}</td>
      <td class="text-center bold" style="${getCellStyle(r.seg)}">${escapeHtml(r.seg)}</td>
      <td class="text-center bold" style="${getCellStyle(r.ter)}">${escapeHtml(r.ter)}</td>
      <td class="text-center bold" style="${getCellStyle(r.qua)}">${escapeHtml(r.qua)}</td>
      <td class="text-center bold" style="${getCellStyle(r.qui)}">${escapeHtml(r.qui)}</td>
      <td class="text-center bold" style="${getCellStyle(r.sex)}">${escapeHtml(r.sex)}</td>
      <td class="text-center bold" style="${getCellStyle(r.sab)}">${escapeHtml(r.sab)}</td>
      <td class="text-center bold" style="${getCellStyle(r.dom)}">${escapeHtml(r.dom)}</td>
      <td class="text-left text-obs">${escapeHtml(r.observacao || "-")}</td>
    </tr>
  `).join("");
}

function buildScheduleSectionHtml(
  title: string,
  rows: ScheduleRow[],
  renderRows: (rows: ScheduleRow[]) => string,
  observacoes?: string,
  savedInfo?: string
): string {
  const obsBlock = observacoes
    ? `<div class="obs-block"><b>Observações da Semana:</b><br/>${escapeHtml(observacoes)}</div>`
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
  ${buildPrintButtonBar("Impressão A4 retrato (vertical). Use Imprimir / PDF com orientação Retrato.")}
  <div class="header-container">
    <div class="header-subtitle">Polícia Militar do Estado de São Paulo</div>
    <div class="header-title">Escala de Serviço Operacional e Administrativo</div>
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
  alterationObservacoes?: string
) {
  let csvContent = "\uFEFF"; // UTF-8 BOM
  csvContent += `ESCALA DE SERVIÇO;ANO: ${year};${weekLabel};PERÍODO: ${weekPeriod}\n\n`;

  if (includeWeekly) {
    csvContent += "1. ESCALA SEMANAL\n";
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
  exportedBy?: ExportUser | null
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
      weeklySavedInfo
    );
  }

  if (includeAlteration) {
    bodyContent += buildScheduleSectionHtml(
      "2. Escala de Alteração / Substituições",
      alterationRows,
      renderRows,
      alterationObservacoes,
      alterationSavedInfo
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
