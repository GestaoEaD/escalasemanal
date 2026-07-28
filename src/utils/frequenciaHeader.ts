/**
 * Cabeçalho institucional do Controle de Frequência (tela + PDF).
 * Fonte única de legenda, mês abreviado e markup HTML para impressão.
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

/** CSS do cabeçalho institucional (janela de impressão / PDF). */
export const FREQUENCIA_HEADER_PRINT_CSS = `
  .freq-inst-wrap {
    width: 100%;
    margin: 0 0 6px;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .freq-inst-header {
    width: 100%;
    border: 1.5px solid #000;
    border-collapse: collapse;
    table-layout: fixed;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
  }

  .freq-inst-header td {
    border: 1px solid #000;
    vertical-align: middle;
    padding: 0;
  }

  .freq-inst-left {
    width: 28%;
    background: #f3f4f6;
    padding: 4px 6px !important;
  }

  .freq-inst-left-inner {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 58px;
  }

  .freq-inst-brasao {
    width: 48px;
    height: 48px;
    object-fit: contain;
    flex-shrink: 0;
    mix-blend-mode: lighten;
  }

  .freq-inst-org {
    flex: 1;
    text-align: center;
    font-size: 9px;
    font-weight: 700;
    line-height: 1.15;
    text-transform: uppercase;
    letter-spacing: 0.2px;
  }

  .freq-inst-right {
    width: 72%;
    padding: 0 !important;
  }

  .freq-inst-title {
    margin: 0;
    padding: 5px 4px 4px;
    text-align: center;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    border-bottom: 1px solid #000;
  }

  .freq-inst-meta {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .freq-inst-meta th,
  .freq-inst-meta td {
    border: 1px solid #000;
    text-align: center;
    vertical-align: middle;
    padding: 2px 3px;
    font-size: 8px;
  }

  .freq-inst-meta th {
    background: #9ca3af;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 3px 2px;
  }

  .freq-inst-meta .col-opm { width: 34%; }
  .freq-inst-meta .col-cod { width: 36%; }
  .freq-inst-meta .col-mes { width: 18%; }
  .freq-inst-meta .col-pag { width: 12%; }

  .freq-inst-opm-row {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .freq-inst-opm-row td {
    border: 1px solid #000;
    padding: 3px 4px;
    font-size: 9px;
    font-weight: 700;
  }

  .freq-inst-opm-dec {
    width: 22%;
    text-align: center;
    background: #fff;
  }

  .freq-inst-opm-nome {
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .freq-inst-digits {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .freq-inst-digits td {
    border: 1px solid #000;
    width: 11.11%;
    height: 18px;
    padding: 0;
    text-align: center;
    font-size: 10px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    font-family: ui-monospace, "Courier New", monospace;
  }

  .freq-inst-mesano {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .freq-inst-mesano td {
    border: 1px solid #000;
    padding: 3px 2px;
    font-size: 10px;
    font-weight: 800;
    text-align: center;
  }

  .freq-inst-mesano .mes { width: 45%; }
  .freq-inst-mesano .ano { width: 55%; }

  .freq-inst-pagina {
    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    padding: 3px !important;
  }

  .freq-inst-legend {
    width: 100%;
    border: 1px solid #000;
    border-top: none;
    background: #e5e7eb;
    padding: 3px 5px;
    font-size: 6.5px;
    font-weight: 700;
    line-height: 1.25;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.1px;
    color: #111;
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
  <table class="freq-inst-header" role="presentation">
    <tr>
      <td class="freq-inst-left">
        <div class="freq-inst-left-inner">
          <img class="freq-inst-brasao" src="${escapeHtml(brasaoSrc)}" alt="Brasão do Estado de São Paulo" />
          <div class="freq-inst-org">POLÍCIA MILITAR<br/>DO<br/>ESTADO DE SÃO PAULO</div>
        </div>
      </td>
      <td class="freq-inst-right">
        <h1 class="freq-inst-title">CONTROLE DE FREQUÊNCIA</h1>
        <table class="freq-inst-meta" role="presentation">
          <thead>
            <tr>
              <th class="col-opm">OPM</th>
              <th class="col-cod">CÓDIGO DA OPM</th>
              <th class="col-mes">MÊS/ANO</th>
              <th class="col-pag">PÁGINA</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="col-opm" style="padding:0;">
                <table class="freq-inst-opm-row" role="presentation">
                  <tr>
                    <td class="freq-inst-opm-dec">DEC</td>
                    <td class="freq-inst-opm-nome">${secao}</td>
                  </tr>
                </table>
              </td>
              <td class="col-cod" style="padding:0;">
                <table class="freq-inst-digits" role="presentation">
                  <tr>${digitCells}</tr>
                </table>
              </td>
              <td class="col-mes" style="padding:0;">
                <table class="freq-inst-mesano" role="presentation">
                  <tr>
                    <td class="mes">${escapeHtml(mes)}</td>
                    <td class="ano">${escapeHtml(String(data.ano))}</td>
                  </tr>
                </table>
              </td>
              <td class="col-pag freq-inst-pagina">${escapeHtml(pagina)}</td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </table>
  <div class="freq-inst-legend">${escapeHtml(FREQUENCIA_LEGENDA_INSTITUCIONAL)}</div>
</div>`;
}
