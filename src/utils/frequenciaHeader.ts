/**
 * Cabeçalho institucional do Controle de Frequência (tela + PDF).
 * Replicação pixel-perfect do formulário oficial — sem reinterpretar layout.
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
 * CSS Grid pixel-perfect (gabarito oficial).
 * Proporções fixas — responsividade só por escala, sem reorganizar.
 *
 * Larguras totais: esquerdo 32% | direito 68%
 * Dentro do direito: OPM 30% | Código 38% | Mês/Ano 18% | Página 14%
 * Dentro do esquerdo: brasão 25% | texto 75%
 */
export const FREQUENCIA_HEADER_PRINT_CSS = `
  .freq-inst-wrap {
    width: 100%;
    margin: 0 0 8px;
    box-sizing: border-box;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .freq-inst-wrap *,
  .freq-inst-wrap *::before,
  .freq-inst-wrap *::after {
    box-sizing: border-box;
  }

  .freq-inst-main {
    display: grid;
    grid-template-columns: 32% 68%;
    grid-template-rows: minmax(56px, 1.5fr) minmax(26px, 0.48fr) minmax(36px, 0.72fr);
    width: 100%;
    min-height: 130px;
    border: 1px solid #000;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
  }

  /* —— Bloco esquerdo (rowspan visual das 3 linhas) —— */
  .freq-inst-left {
    grid-column: 1;
    grid-row: 1 / 4;
    border-right: 1px solid #000;
    background: #fff;
    min-width: 0;
  }

  .freq-inst-left-grid {
    display: grid;
    grid-template-columns: 25% 75%;
    width: 100%;
    height: 100%;
    min-height: 130px;
    align-items: center;
  }

  .freq-inst-brasao-wrap {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 6px 4px;
    min-width: 0;
  }

  .freq-inst-brasao {
    display: block;
    width: 100%;
    max-width: 92px;
    height: auto;
    max-height: 96px;
    object-fit: contain;
    object-position: center;
    mix-blend-mode: lighten;
  }

  .freq-inst-org {
    display: grid;
    place-content: center;
    width: 100%;
    height: 100%;
    padding: 8px 10px;
    text-align: center;
    font-size: clamp(11px, 1.15vw, 14px);
    font-weight: 700;
    line-height: 1.25;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    white-space: normal;
  }

  /* —— Linha 1: título —— */
  .freq-inst-title {
    grid-column: 2;
    grid-row: 1;
    display: grid;
    place-items: center;
    border-bottom: 1px solid #000;
    padding: 10px 12px;
    text-align: center;
    font-size: clamp(18px, 2.35vw, 26px);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: #fff;
    white-space: nowrap;
    overflow: hidden;
  }

  /* —— Linha 2: rótulos —— */
  .freq-inst-labels {
    grid-column: 2;
    grid-row: 2;
    display: grid;
    grid-template-columns: 30% 38% 18% 14%;
    border-bottom: 1px solid #000;
    background: #e0e0e0;
    min-height: 26px;
  }

  .freq-inst-labels > div {
    display: grid;
    place-items: center;
    border-right: 1px solid #000;
    padding: 4px 2px;
    text-align: center;
    font-size: clamp(9px, 0.95vw, 11px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
  }

  .freq-inst-labels > div:last-child {
    border-right: none;
  }

  /* —— Linha 3: valores —— */
  .freq-inst-values {
    grid-column: 2;
    grid-row: 3;
    display: grid;
    grid-template-columns: 30% 38% 18% 14%;
    min-height: 36px;
    background: #fff;
  }

  .freq-inst-values > div {
    border-right: 1px solid #000;
    min-width: 0;
    min-height: 36px;
  }

  .freq-inst-values > div:last-child {
    border-right: none;
  }

  .freq-inst-opm {
    display: grid;
    grid-template-columns: 28% 72%;
    height: 100%;
  }

  .freq-inst-opm > span {
    display: grid;
    place-items: center;
    border-right: 1px solid #000;
    padding: 4px 3px;
    text-align: center;
    font-size: clamp(10px, 1.05vw, 13px);
    font-weight: 700;
    text-transform: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .freq-inst-opm > span:last-child {
    border-right: none;
  }

  .freq-inst-cod {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    height: 100%;
  }

  .freq-inst-cod > span {
    display: grid;
    place-items: center;
    border-right: 1px solid #000;
    font-size: clamp(11px, 1.15vw, 14px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .freq-inst-cod > span:last-child {
    border-right: none;
  }

  .freq-inst-mesano {
    display: grid;
    grid-template-columns: 42% 58%;
    height: 100%;
  }

  .freq-inst-mesano > span {
    display: grid;
    place-items: center;
    border-right: 1px solid #000;
    font-size: clamp(10px, 1.05vw, 13px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-transform: uppercase;
  }

  .freq-inst-mesano > span:last-child {
    border-right: none;
  }

  .freq-inst-pag {
    display: grid;
    place-items: center;
    height: 100%;
    font-size: clamp(11px, 1.15vw, 14px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* —— Legenda (logo abaixo, sem gap) —— */
  .freq-inst-legend {
    width: 100%;
    border: 1px solid #000;
    border-top: none;
    background: #fff;
    padding: 5px 8px;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-size: clamp(6.5px, 0.72vw, 8px);
    font-weight: 700;
    line-height: 1.35;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    color: #000;
  }

  @media print {
    .freq-inst-main {
      min-height: 118px;
      grid-template-rows: minmax(48px, 1.5fr) minmax(22px, 0.48fr) minmax(32px, 0.72fr);
    }
    .freq-inst-left-grid { min-height: 118px; }
    .freq-inst-brasao {
      max-width: 78px;
      max-height: 82px;
      mix-blend-mode: lighten !important;
    }
    .freq-inst-org { font-size: 11px !important; }
    .freq-inst-title { font-size: 20px !important; padding: 8px 10px !important; }
    .freq-inst-labels { background: #e0e0e0 !important; }
    .freq-inst-labels > div { font-size: 9px !important; }
    .freq-inst-opm > span,
    .freq-inst-mesano > span { font-size: 10px !important; }
    .freq-inst-cod > span,
    .freq-inst-pag { font-size: 11px !important; }
    .freq-inst-legend {
      background: #fff !important;
      font-size: 7px !important;
      padding: 4px 6px !important;
    }
  }
`;

/** Markup HTML do cabeçalho (PDF / janela de impressão) — mesma estrutura da tela. */
export function buildFrequenciaHeaderHtml(
  data: FrequenciaHeaderData,
  brasaoSrc: string
): string {
  const digits = codigoOpmDigits(data.codigoOpm);
  const digitCells = digits
    .map((d) => `<span>${d.trim() ? escapeHtml(d) : "&nbsp;"}</span>`)
    .join("");
  const mes = mesAbreviadoPt(data.mes);
  const pagina = formatPagina(data.paginaAtual, data.totalPaginas);
  const secao = escapeHtml(data.secaoNome || "—");

  return `<div class="freq-inst-wrap">
  <div class="freq-inst-main">
    <div class="freq-inst-left">
      <div class="freq-inst-left-grid">
        <div class="freq-inst-brasao-wrap">
          <img class="freq-inst-brasao" src="${escapeHtml(brasaoSrc)}" alt="Brasão do Estado de São Paulo" />
        </div>
        <div class="freq-inst-org">POLÍCIA MILITAR<br/>DO<br/>ESTADO DE SÃO PAULO</div>
      </div>
    </div>
    <div class="freq-inst-title">CONTROLE DE FREQUÊNCIA</div>
    <div class="freq-inst-labels">
      <div>OPM</div>
      <div>CÓDIGO DA OPM</div>
      <div>MÊS/ANO</div>
      <div>PÁGINA</div>
    </div>
    <div class="freq-inst-values">
      <div class="freq-inst-opm">
        <span>DEC</span>
        <span>${secao}</span>
      </div>
      <div class="freq-inst-cod">${digitCells}</div>
      <div class="freq-inst-mesano">
        <span>${escapeHtml(mes)}</span>
        <span>${escapeHtml(String(data.ano))}</span>
      </div>
      <div class="freq-inst-pag">${escapeHtml(pagina)}</div>
    </div>
  </div>
  <div class="freq-inst-legend">${escapeHtml(FREQUENCIA_LEGENDA_INSTITUCIONAL)}</div>
</div>`;
}
