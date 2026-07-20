import { ScheduleRow, LastSaved } from "../types";
import { formatTimestamp } from "./dateUtils";

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
  lastSavedAlteration: LastSaved | null
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Por favor, permita popups para poder gerar a exportação em PDF.");
    return;
  }

  const renderTableRows = (rows: ScheduleRow[]) => {
    if (rows.length === 0) {
      return `<tr><td colspan="12" class="empty-state">Nenhum colaborador adicionado a este painel.</td></tr>`;
    }
    return rows
      .map(
        (r) => `
      <tr>
        <td class="bold font-dense">${r.postoGrad}</td>
        <td class="font-mono text-center">${r.re}</td>
        <td class="bold text-left">${r.nome}</td>
        <td class="text-left">${r.secao}</td>
        <td class="text-center bold bg-cell">${r.seg}</td>
        <td class="text-center bold bg-cell">${r.ter}</td>
        <td class="text-center bold bg-cell">${r.qua}</td>
        <td class="text-center bold bg-cell">${r.qui}</td>
        <td class="text-center bold bg-cell">${r.sex}</td>
        <td class="text-center bold bg-cell bg-weekend">${r.sab}</td>
        <td class="text-center bold bg-cell bg-weekend">${r.dom}</td>
        <td class="text-left text-obs">${r.observacao || "-"}</td>
      </tr>
    `
      )
      .join("");
  };

  const weeklySavedInfo = lastSavedWeekly
    ? `Último salvamento por: ${lastSavedWeekly.nome} (R.E. ${lastSavedWeekly.re}) em ${formatTimestamp(lastSavedWeekly.timestamp)}`
    : "Não há registros de salvamento.";

  const alterationSavedInfo = lastSavedAlteration
    ? `Último salvamento por: ${lastSavedAlteration.nome} (R.E. ${lastSavedAlteration.re}) em ${formatTimestamp(lastSavedAlteration.timestamp)}`
    : "Não há registros de salvamento.";

  const currentDateStr = new Date().toLocaleString("pt-BR");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Escala de Serviço - ${weekLabel} (${year})</title>
      <style>
        body {
          font-family: 'Inter', Arial, sans-serif;
          color: #111827;
          background-color: #ffffff;
          margin: 0;
          padding: 20px;
          font-size: 10px;
          line-height: 1.4;
        }
        @media print {
          body {
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
        }
        .header-container {
          text-align: center;
          margin-bottom: 25px;
          border-bottom: 2px solid #111827;
          padding-bottom: 12px;
        }
        .header-subtitle {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 4px 0;
          color: #374151;
        }
        .header-title {
          font-size: 18px;
          font-weight: 800;
          margin: 4px 0;
          color: #111827;
          letter-spacing: -0.5px;
        }
        .header-meta {
          font-size: 11px;
          font-weight: 600;
          color: #4B5563;
          margin: 4px 0 0 0;
        }
        .section-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          margin: 15px 0 8px 0;
          color: #111827;
          background-color: #F3F4F6;
          padding: 6px 10px;
          border-left: 4px solid #2563EB;
          border-radius: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          font-size: 9px;
        }
        th {
          background-color: #111827;
          color: #ffffff;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 8px;
          letter-spacing: 0.5px;
          padding: 6px 4px;
          border: 1px solid #111827;
        }
        td {
          padding: 5px 4px;
          border: 1px solid #D1D5DB;
          text-align: center;
        }
        tr:nth-child(even) {
          background-color: #F9FAFB;
        }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .bold { font-weight: 700; }
        .font-mono { font-family: monospace; font-size: 8.5px; }
        .font-dense { font-size: 8.5px; }
        .bg-cell {
          background-color: #F3F4F6;
          font-weight: 700;
          color: #1F2937;
        }
        .bg-weekend {
          background-color: #E5E7EB;
        }
        .text-obs {
          font-size: 8px;
          color: #4B5563;
        }
        .empty-state {
          text-align: center;
          padding: 15px;
          color: #9CA3AF;
          font-style: italic;
        }
        .footer-info {
          font-size: 7.5px;
          color: #6B7280;
          margin-top: 4px;
          display: flex;
          justify-content: space-between;
        }
        .signature-container {
          margin-top: 40px;
          display: flex;
          justify-content: space-around;
          text-align: center;
          page-break-inside: avoid;
        }
        .signature-box {
          width: 220px;
          border-top: 1px solid #111827;
          padding-top: 8px;
          font-size: 9px;
        }
        .signature-role {
          font-size: 8px;
          color: #4B5563;
          margin-top: 2px;
        }
        .print-btn-bar {
          background-color: #F3F4F6;
          padding: 10px 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border: 1px solid #E5E7EB;
        }
        .btn {
          background-color: #2563EB;
          color: white;
          border: none;
          padding: 6px 16px;
          font-weight: 700;
          font-size: 11px;
          border-radius: 4px;
          cursor: pointer;
        }
        .btn:hover {
          background-color: #1D4ED8;
        }
        .btn-secondary {
          background-color: #4B5563;
        }
        .btn-secondary:hover {
          background-color: #374151;
        }
      </style>
    </head>
    <body>
      <div class="print-btn-bar no-print">
        <span style="font-size: 11px; font-weight: 600; color: #374151;">
          Visualização de Impressão Institucional. Clique no botão ao lado para imprimir ou salvar como PDF.
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.close()">Fechar Janela</button>
          <button class="btn" onclick="window.print()">Imprimir / PDF</button>
        </div>
      </div>

      <div class="header-container">
        <div class="header-subtitle">Polícia Militar do Estado de São Paulo</div>
        <div class="header-title">Escala de Serviço Operacional e Administrativo</div>
        <div class="header-meta">
          ${weekLabel} &nbsp;|&nbsp; Ano: ${year} &nbsp;|&nbsp; Período: ${weekPeriod}
        </div>
      </div>

      <!-- Section 1 -->
      <div class="section-title">1. Escala Semanal Principal</div>
      <table>
        <thead>
          <tr>
            <th style="width: 8%;">Posto</th>
            <th style="width: 8%;">R.E.</th>
            <th style="width: 15%;">Nome de Guerra</th>
            <th style="width: 13%;">Seção</th>
            <th style="width: 5%;">Seg</th>
            <th style="width: 5%;">Ter</th>
            <th style="width: 5%;">Qua</th>
            <th style="width: 5%;">Qui</th>
            <th style="width: 5%;">Sex</th>
            <th style="width: 5%;">Sáb</th>
            <th style="width: 5%;">Dom</th>
            <th style="width: 21%;">Observações</th>
          </tr>
        </thead>
        <tbody>
          ${renderTableRows(weeklyRows)}
        </tbody>
      </table>
      <div class="footer-info">
        <span>${weeklySavedInfo}</span>
        <span>Impresso em: ${currentDateStr}</span>
      </div>

      <!-- Section 2 -->
      <div class="section-title" style="margin-top: 25px;">2. Escala de Alteração / Substituições</div>
      <table>
        <thead>
          <tr>
            <th style="width: 8%;">Posto</th>
            <th style="width: 8%;">R.E.</th>
            <th style="width: 15%;">Nome de Guerra</th>
            <th style="width: 13%;">Seção</th>
            <th style="width: 5%;">Seg</th>
            <th style="width: 5%;">Ter</th>
            <th style="width: 5%;">Qua</th>
            <th style="width: 5%;">Qui</th>
            <th style="width: 5%;">Sex</th>
            <th style="width: 5%;">Sáb</th>
            <th style="width: 5%;">Dom</th>
            <th style="width: 21%;">Observações</th>
          </tr>
        </thead>
        <tbody>
          ${renderTableRows(alterationRows)}
        </tbody>
      </table>
      <div class="footer-info">
        <span>${alterationSavedInfo}</span>
        <span>Documento eletrônico oficial gerado pelo sistema</span>
      </div>

      <!-- Signatures Area -->
      <div class="signature-container">
        <div class="signature-box">
          <div><b>Auxiliar de Escala</b></div>
          <div class="signature-role">Seção de Gestão Educacional</div>
        </div>
        <div class="signature-box">
          <div><b>Chefe de Seção / Comandante</b></div>
          <div class="signature-role">Polícia Militar do Estado de São Paulo</div>
        </div>
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();
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
  legendasList: { sigla: string; cor: string }[] = []
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Por favor, permita popups para poder gerar a exportação em PDF.");
    return;
  }

  const translateColorToHex = (color: string): string => {
    if (!color) return "#ffffff";
    const trimmed = color.trim().toLowerCase();
    
    if (trimmed.startsWith("#")) {
      return color;
    }
    
    const map: Record<string, string> = {
      "verde": "#dcfce7",          // light green (green-100)
      "verde-escuro": "#bbf7d0",   // green-200
      "amarelo": "#fef08a",        // yellow-100
      "laranja": "#ffedd5",        // orange-100
      "azul-claro": "#eff6ff",     // blue-50
      "azul-medio": "#dbeafe",     // blue-100
      "roxo-claro": "#f3e8ff",     // purple-100
      "roxo-escuro": "#e9d5ff",     // purple-200
      "cinza": "#f3f4f6",          // gray-100
      "vermelho-claro": "#fee2e2", // red-100
      "vermelho": "#fca5a5",       // red-200
      "bordo": "#fca5a5",          // red-300
      "bordô": "#fca5a5",          // red-300
      "azul-escuro": "#bfdbfe",    // blue-200
      "cinza-escuro": "#e5e7eb",   // gray-200
      "branco": "#ffffff",
      "preto": "#374151"
    };
    
    return map[trimmed] || color;
  };

  const getCellStyle = (val: string) => {
    const legend = legendasList.find((l) => l.sigla === val);
    if (legend && legend.cor) {
      const translatedCor = translateColorToHex(legend.cor);
      const hex = translatedCor.replace("#", "");
      let textColor = "#000000";
      if (hex.length === 7 && hex.startsWith("#")) {
        const rawHex = hex.substring(1);
        const r = parseInt(rawHex.substr(0, 2), 16);
        const g = parseInt(rawHex.substr(2, 2), 16);
        const b = parseInt(rawHex.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        textColor = (yiq >= 128) ? "#000000" : "#ffffff";
      } else if (hex.length === 6) {
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        textColor = (yiq >= 128) ? "#000000" : "#ffffff";
      }
      return `background-color: ${translatedCor}; color: ${textColor}; border: 1px solid rgba(0,0,0,0.15);`;
    }
    return "background-color: #ffffff; color: #000000; border: 1px solid #D1D5DB;";
  };

  const renderTableRows = (rows: ScheduleRow[]) => {
    if (rows.length === 0) {
      return `<tr><td colspan="12" class="empty-state">Nenhum colaborador adicionado a este painel.</td></tr>`;
    }
    return rows
      .map(
        (r) => `
      <tr>
        <td class="bold font-dense" style="border: 1px solid #D1D5DB;">${r.postoGrad}</td>
        <td class="font-mono text-center" style="border: 1px solid #D1D5DB;">${r.re}</td>
        <td class="bold text-left" style="border: 1px solid #D1D5DB;">${r.nome}</td>
        <td class="text-left" style="border: 1px solid #D1D5DB;">${r.secao}</td>
        <td class="text-center bold" style="${getCellStyle(r.seg)}">${r.seg}</td>
        <td class="text-center bold" style="${getCellStyle(r.ter)}">${r.ter}</td>
        <td class="text-center bold" style="${getCellStyle(r.qua)}">${r.qua}</td>
        <td class="text-center bold" style="${getCellStyle(r.qui)}">${r.qui}</td>
        <td class="text-center bold" style="${getCellStyle(r.sex)}">${r.sex}</td>
        <td class="text-center bold" style="${getCellStyle(r.sab)}">${r.sab}</td>
        <td class="text-center bold" style="${getCellStyle(r.dom)}">${r.dom}</td>
        <td class="text-left text-obs" style="border: 1px solid #D1D5DB;">${r.observacao || "-"}</td>
      </tr>
    `
      )
      .join("");
  };

  const weeklySavedInfo = lastSavedWeekly
    ? `Último salvamento por: ${lastSavedWeekly.nome} (R.E. ${lastSavedWeekly.re}) em ${formatTimestamp(lastSavedWeekly.timestamp)}`
    : "Não há registros de salvamento.";

  const alterationSavedInfo = lastSavedAlteration
    ? `Último salvamento por: ${lastSavedAlteration.nome} (R.E. ${lastSavedAlteration.re}) em ${formatTimestamp(lastSavedAlteration.timestamp)}`
    : "Não há registros de salvamento.";

  const currentDateStr = new Date().toLocaleString("pt-BR");

  let bodyContent = "";

  if (includeWeekly) {
    bodyContent += `
      <!-- Section 1 -->
      <div class="section-title">1. Escala Semanal Principal</div>
      <table>
        <thead>
          <tr>
            <th style="width: 8%;">Posto</th>
            <th style="width: 8%;">R.E.</th>
            <th style="width: 15%;">Nome de Guerra</th>
            <th style="width: 13%;">Seção</th>
            <th style="width: 5%;">Seg</th>
            <th style="width: 5%;">Ter</th>
            <th style="width: 5%;">Qua</th>
            <th style="width: 5%;">Qui</th>
            <th style="width: 5%;">Sex</th>
            <th style="width: 5%;">Sáb</th>
            <th style="width: 5%;">Dom</th>
            <th style="width: 21%;">Observações</th>
          </tr>
        </thead>
        <tbody>
          ${renderTableRows(weeklyRows)}
        </tbody>
      </table>
      ${weeklyObservacoes ? `
        <div style="margin-bottom: 12px; padding: 10px; background-color: #F9FAFB; border: 1px solid #D1D5DB; border-radius: 6px; white-space: pre-wrap; font-size: 9px; color: #374151; text-align: left;">
          <b>Observações da Semana:</b><br/>${weeklyObservacoes}
        </div>
      ` : ""}
      <div class="footer-info" style="margin-bottom: 25px;">
        <span>${weeklySavedInfo}</span>
        <span>Impresso em: ${currentDateStr}</span>
      </div>
    `;
  }

  if (includeAlteration) {
    bodyContent += `
      <!-- Section 2 -->
      <div class="section-title" style="margin-top: 25px;">2. Escala de Alteração / Substituições</div>
      <table>
        <thead>
          <tr>
            <th style="width: 8%;">Posto</th>
            <th style="width: 8%;">R.E.</th>
            <th style="width: 15%;">Nome de Guerra</th>
            <th style="width: 13%;">Seção</th>
            <th style="width: 5%;">Seg</th>
            <th style="width: 5%;">Ter</th>
            <th style="width: 5%;">Qua</th>
            <th style="width: 5%;">Qui</th>
            <th style="width: 5%;">Sex</th>
            <th style="width: 5%;">Sáb</th>
            <th style="width: 5%;">Dom</th>
            <th style="width: 21%;">Observações</th>
          </tr>
        </thead>
        <tbody>
          ${renderTableRows(alterationRows)}
        </tbody>
      </table>
      ${alterationObservacoes ? `
        <div style="margin-bottom: 12px; padding: 10px; background-color: #F9FAFB; border: 1px solid #D1D5DB; border-radius: 6px; white-space: pre-wrap; font-size: 9px; color: #374151; text-align: left;">
          <b>Observações da Semana:</b><br/>${alterationObservacoes}
        </div>
      ` : ""}
      <div class="footer-info">
        <span>${alterationSavedInfo}</span>
        <span>Documento eletrônico oficial gerado pelo sistema</span>
      </div>
    `;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Escala de Serviço - ${weekLabel} (${year})</title>
      <style>
        body {
          font-family: 'Inter', Arial, sans-serif;
          color: #111827;
          background-color: #ffffff;
          margin: 0;
          padding: 20px;
          font-size: 10px;
          line-height: 1.4;
        }
        @media print {
          body {
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
        }
        .header-container {
          text-align: center;
          margin-bottom: 25px;
          border-bottom: 2px solid #111827;
          padding-bottom: 12px;
        }
        .header-subtitle {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 4px 0;
          color: #374151;
        }
        .header-title {
          font-size: 18px;
          font-weight: 800;
          margin: 4px 0;
          color: #111827;
          letter-spacing: -0.5px;
        }
        .header-meta {
          font-size: 11px;
          font-weight: 600;
          color: #4B5563;
          margin: 4px 0 0 0;
        }
        .section-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          margin: 15px 0 8px 0;
          color: #111827;
          background-color: #F3F4F6;
          padding: 6px 10px;
          border-left: 4px solid #2563EB;
          border-radius: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          font-size: 9px;
        }
        th {
          background-color: #111827;
          color: #ffffff;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 8px;
          letter-spacing: 0.5px;
          padding: 6px 4px;
          border: 1px solid #111827;
        }
        td {
          padding: 5px 4px;
          border: 1px solid #D1D5DB;
          text-align: center;
        }
        tr:nth-child(even) {
          background-color: #F9FAFB;
        }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .bold { font-weight: 700; }
        .font-mono { font-family: monospace; font-size: 8.5px; }
        .font-dense { font-size: 8.5px; }
        .bg-cell {
          background-color: #F3F4F6;
          font-weight: 700;
          color: #1F2937;
        }
        .bg-weekend {
          background-color: #E5E7EB;
        }
        .text-obs {
          font-size: 8px;
          color: #4B5563;
        }
        .empty-state {
          text-align: center;
          padding: 15px;
          color: #9CA3AF;
          font-style: italic;
        }
        .footer-info {
          font-size: 7.5px;
          color: #6B7280;
          margin-top: 4px;
          display: flex;
          justify-content: space-between;
        }
        .signature-container {
          margin-top: 40px;
          display: flex;
          justify-content: space-around;
          text-align: center;
          page-break-inside: avoid;
        }
        .signature-box {
          width: 220px;
          border-top: 1px solid #111827;
          padding-top: 8px;
          font-size: 9px;
        }
        .signature-role {
          font-size: 8px;
          color: #4B5563;
          margin-top: 2px;
        }
        .print-btn-bar {
          background-color: #F3F4F6;
          padding: 10px 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border: 1px solid #E5E7EB;
        }
        .btn {
          background-color: #2563EB;
          color: white;
          border: none;
          padding: 6px 16px;
          font-weight: 700;
          font-size: 11px;
          border-radius: 4px;
          cursor: pointer;
        }
        .btn:hover {
          background-color: #1D4ED8;
        }
        .btn-secondary {
          background-color: #4B5563;
        }
        .btn-secondary:hover {
          background-color: #374151;
        }
      </style>
    </head>
    <body>
      <div class="print-btn-bar no-print">
        <span style="font-size: 11px; font-weight: 600; color: #374151;">
          Visualização de Impressão Institucional. Clique no botão ao lado para imprimir ou salvar como PDF.
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.close()">Fechar Janela</button>
          <button class="btn" onclick="window.print()">Imprimir / PDF</button>
        </div>
      </div>

      <div class="header-container">
        <div class="header-subtitle">Polícia Militar do Estado de São Paulo</div>
        <div class="header-title">Escala de Serviço Operacional e Administrativo</div>
        <div class="header-meta">
          ${weekLabel} &nbsp;|&nbsp; Período: ${weekPeriod} &nbsp;|&nbsp; Ano: ${year}
        </div>
      </div>

      ${bodyContent}

      <!-- Signatures Area -->
      <div class="signature-container">
        <div class="signature-box">
          <div><b>Auxiliar de Escala</b></div>
          <div class="signature-role">Seção de Gestão Educacional</div>
        </div>
        <div class="signature-box">
          <div><b>Chefe de Seção / Comandante</b></div>
          <div class="signature-role">Polícia Militar do Estado de São Paulo</div>
        </div>
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();
}

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
export function exportLogsToPDF(logs: any[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Por favor, permita popups para poder gerar a exportação em PDF.");
    return;
  }

  const rowsHtml = logs.map(log => `
    <tr>
      <td>${log.data || ""}</td>
      <td>${log.hora || ""}</td>
      <td class="bold">${log.usuario || ""}</td>
      <td class="font-mono">${log.re || ""}</td>
      <td>${log.perfil || "Operador"}</td>
      <td class="bold">${log.operacao || ""}</td>
      <td>${log.modulo || ""}</td>
      <td>${log.registroAlterado || ""}</td>
      <td class="bold">${log.campoAlterado || ""}</td>
      <td class="text-gray-500">${log.valorAnterior || "-"}</td>
      <td class="bold text-blue-800">${log.novoValor || "-"}</td>
    </tr>
  `).join("");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Logs de Auditoria</title>
      <style>
        body {
          font-family: 'Inter', Arial, sans-serif;
          color: #111827;
          background-color: #ffffff;
          margin: 0;
          padding: 20px;
          font-size: 8px;
          line-height: 1.3;
        }
        @media print {
          .no-print { display: none !important; }
        }
        .print-btn-bar {
          background-color: #F3F4F6;
          border: 1px solid #E5E7EB;
          padding: 10px 15px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
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
        .btn-secondary {
          background-color: #374151;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          border-bottom: 2px solid #111827;
          padding-bottom: 10px;
        }
        h1 {
          font-size: 14px;
          margin: 0;
          text-transform: uppercase;
        }
        .meta {
          font-size: 9px;
          color: #4B5563;
          margin-top: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background-color: #111827;
          color: #ffffff;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 7px;
          padding: 5px 3px;
          border: 1px solid #111827;
        }
        td {
          padding: 4px 3px;
          border: 1px solid #D1D5DB;
          text-align: left;
          word-break: break-all;
        }
        tr:nth-child(even) {
          background-color: #F9FAFB;
        }
        .bold { font-weight: 700; }
        .font-mono { font-family: monospace; font-size: 7.5px; }
        .text-gray-500 { color: #6B7280; }
        .text-blue-800 { color: #1E40AF; }
      </style>
    </head>
    <body>
      <div class="print-btn-bar no-print">
        <span style="font-size: 11px; font-weight: 600; color: #374151;">
          Visualização de Logs. Clique no botão ao lado para imprimir ou salvar como PDF.
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.close()">Fechar Janela</button>
          <button class="btn" onclick="window.print()">Imprimir / PDF</button>
        </div>
      </div>
      <div class="header">
        <h1>Relatório de Logs de Auditoria</h1>
        <div class="meta">Gerado em ${new Date().toLocaleString("pt-BR")} - Total de Registros: ${logs.length}</div>
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
    </body>
    </html>
  `);
  printWindow.document.close();
}
