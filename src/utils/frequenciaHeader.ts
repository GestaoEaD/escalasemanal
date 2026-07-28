/**
 * Cabeçalho institucional do Controle de Frequência (tela + PDF).
 * Layout fiel ao formulário oficial PMESP.
 */

export const FREQUENCIA_BRASAO_SRC = "/brasao-pmsp.png";

export const MESES_ABREV_PT = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
] as const;

/** Legenda institucional fixa do formulário oficial. */
export const FREQUENCIA_LEGENDA_INSTITUCIONAL =
  '"0" INFERIOR A 8H / "1" - IGUAL OU SUPERIOR 8H E INFERIOR A 12H / "2" - IGUAL OU SUPERIOR 12H E INFERIOR A 18H / "3" - IGUAL OU SUPERIOR 18H E IGUAL OU INFERIOR A 24H / F - FÉRIAS / LP - LICENÇA PRÊMIO / FS - FALTA AO SERVIÇO / A - DEMAIS AFASTAMENTOS';

export const CODIGO_OPM_DIGITS = 9;

export type FrequenciaHeaderData = {
  secaoNome: string;
  codigoOpm: string;
  mes: number;
  ano: number;
  paginaAtual: number;
  totalPaginas: number;
};

export function mesAbreviadoPt(mes: number): string {
  const idx = Math.max(1, Math.min(12, Math.floor(mes))) - 1;
  return MESES_ABREV_PT[idx];
}

export function normalizeCodigoOpm(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Preenche/trunca para exatamente 9 dígitos (células do formulário). */
export function codigoOpmDigits(codigo: string, length = CODIGO_OPM_DIGITS): string[] {
  const digits = normalizeCodigoOpm(codigo).slice(0, length);
  const padded = digits.padEnd(length, " ");
  return padded.split("");
}

export function formatPagina(atual: number, total: number): string {
  const a = String(Math.max(1, atual)).padStart(2, "0");
  const t = String(Math.max(1, total)).padStart(2, "0");
  return `${a}/${t}`;
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * CSS compartilhado do cabeçalho (tela via classes + janela de impressão).
 * Cores e proporções alinhadas ao modelo oficial anexado.
 */
export const FREQUENCIA_HEADER_PRINT_CSS = `
  .freq-inst-wrap {
    width: 100%;
    margin: 0 0 8px;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .freq-inst-table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
    table-layout: fixed;
    border: 1.25px solid #000;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .freq-inst-table th,
  .freq-inst-table td {
    border: 1px solid #000;
    padding: 0;
    vertical-align: middle;
    text-align: center;
  }

  /* Coluna institucional (brasão + texto) — ~32% e altura das 3 linhas da direita */
  .freq-inst-brand {
    width: 32%;
    background: #f2f2f2;
    padding: 0 !important;
  }

  .freq-inst-brand-inner {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .freq-inst-brand-inner td {
    border: none;
    background: transparent;
  }

  .freq-inst-brasao-cell {
    width: 38%;
    padding: 4px 2px 4px 4px !important;
  }

  .freq-inst-brasao {
    display: block;
    width: 52px;
    height: 52px;
    max-width: 100%;
    margin: 0 auto;
    object-fit: contain;
    mix-blend-mode: lighten;
  }

  .freq-inst-org-cell {
    width: 62%;
    padding: 4px 6px 4px 2px !important;
  }

  .freq-inst-org {
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.15px;
    text-align: center;
  }

  .freq-inst-title {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    padding: 7px 6px !important;
    background: #fff;
    line-height: 1.1;
  }

  .freq-inst-label {
    background: #d9d9d9;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.25px;
    padding: 3px 2px !important;
    height: 18px;
  }

  .freq-inst-col-opm { width: 24%; }
  .freq-inst-col-cod { width: 24%; }
  .freq-inst-col-mes { width: 12%; }
  .freq-inst-col-pag { width: 8%; }

  .freq-inst-value {
    background: #fff;
    height: 22px;
  }

  .freq-inst-sub {
    width: 100%;
    height: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .freq-inst-sub td {
    border: 1px solid #000;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 2px !important;
    background: #fff;
  }

  .freq-inst-dec {
    width: 26%;
    font-weight: 700;
  }

  .freq-inst-secao {
    width: 74%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }

  .freq-inst-digits td {
    width: 11.11%;
    font-size: 11px;
    font-weight: 700;
    font-family: Arial, Helvetica, sans-serif;
    font-variant-numeric: tabular-nums;
    padding: 2px 0 !important;
    height: 22px;
  }

  .freq-inst-mes {
    width: 42%;
    font-weight: 700;
  }

  .freq-inst-ano {
    width: 58%;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .freq-inst-pagina {
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 3px !important;
  }

  .freq-inst-legend {
    background: #e8e8e8;
    font-size: 6.8px;
    font-weight: 700;
    line-height: 1.3;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.05px;
    padding: 4px 6px !important;
  }

  @media print {
    .freq-inst-brasao {
      mix-blend-mode: lighten !important;
    }
    .freq-inst-label { background: #d9d9d9 !important; }
    .freq-inst-brand { background: #f2f2f2 !important; }
    .freq-inst-legend { background: #e8e8e8 !important; }
  }
`;

/** Markup HTML do cabeçalho (PDF / janela de impressão). */
export function buildFrequenciaHeaderHtml(
  data: FrequenciaHeaderData,
  brasaoSrc: string
): string {
  const digits = codigoOpmDigits(data.codigoOpm);
  const digitCells = digits
    .map((d) => `<td>${d.trim() ? escapeHtml(d) : "&nbsp;"}</td>`)
    .join("");
  const mes = mesAbreviadoPt(data.mes);
  const pagina = formatPagina(data.paginaAtual, data.totalPaginas);
  const secao = escapeHtml(data.secaoNome || "—");

  return `<div class="freq-inst-wrap">
  <table class="freq-inst-table" role="presentation">
    <colgroup>
      <col class="freq-inst-brand" />
      <col class="freq-inst-col-opm" />
      <col class="freq-inst-col-cod" />
      <col class="freq-inst-col-mes" />
      <col class="freq-inst-col-pag" />
    </colgroup>
    <tr>
      <td class="freq-inst-brand" rowspan="3">
        <table class="freq-inst-brand-inner" role="presentation">
          <tr>
            <td class="freq-inst-brasao-cell">
              <img class="freq-inst-brasao" src="${escapeHtml(brasaoSrc)}" alt="Brasão do Estado de São Paulo" />
            </td>
            <td class="freq-inst-org-cell">
              <div class="freq-inst-org">POLÍCIA MILITAR<br/>DO<br/>ESTADO DE SÃO PAULO</div>
            </td>
          </tr>
        </table>
      </td>
      <td class="freq-inst-title" colspan="4">CONTROLE DE FREQUÊNCIA</td>
    </tr>
    <tr>
      <th class="freq-inst-label">OPM</th>
      <th class="freq-inst-label">CÓDIGO DA OPM</th>
      <th class="freq-inst-label">MÊS/ANO</th>
      <th class="freq-inst-label">PÁGINA</th>
    </tr>
    <tr>
      <td class="freq-inst-value">
        <table class="freq-inst-sub" role="presentation">
          <tr>
            <td class="freq-inst-dec">DEC</td>
            <td class="freq-inst-secao">${secao}</td>
          </tr>
        </table>
      </td>
      <td class="freq-inst-value">
        <table class="freq-inst-sub freq-inst-digits" role="presentation">
          <tr>${digitCells}</tr>
        </table>
      </td>
      <td class="freq-inst-value">
        <table class="freq-inst-sub" role="presentation">
          <tr>
            <td class="freq-inst-mes">${escapeHtml(mes)}</td>
            <td class="freq-inst-ano">${escapeHtml(String(data.ano))}</td>
          </tr>
        </table>
      </td>
      <td class="freq-inst-value freq-inst-pagina">${escapeHtml(pagina)}</td>
    </tr>
    <tr>
      <td class="freq-inst-legend" colspan="5">${escapeHtml(FREQUENCIA_LEGENDA_INSTITUCIONAL)}</td>
    </tr>
  </table>
</div>`;
}
