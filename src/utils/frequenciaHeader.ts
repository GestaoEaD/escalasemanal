/**
 * Cabeçalho institucional do Controle de Frequência (tela + PDF).
 * Replicação pixel-perfect do formulário oficial — sem reinterpretar layout.
 */

export const FREQUENCIA_BRASAO_SRC = "/brasao-pmsp.png?v=2";

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
 *
 * Cores alinhadas à identidade da página (slate / gray-50).
 */
export const FREQUENCIA_HEADER_PRINT_CSS = `
  .freq-inst-wrap {
    --freq-border: #334155; /* slate-700 */
    --freq-text: #0f172a; /* slate-900 */
    --freq-muted: #1e293b; /* slate-800 */
    --freq-label-bg: #e2e8f0; /* slate-200 */
    --freq-left-bg: #f8fafc; /* slate-50 */
    --freq-legend-bg: #f1f5f9; /* slate-100 */
    --freq-white: #ffffff;
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
    border: 1.5px solid var(--freq-border);
    background: var(--freq-white);
    color: var(--freq-text);
    font-family: Arial, Helvetica, sans-serif;
  }

  /* —— Bloco esquerdo: brasão + texto institucional —— */
  .freq-inst-left {
    grid-column: 1;
    grid-row: 1 / 4;
    border-right: 1px solid var(--freq-border);
    background: var(--freq-left-bg);
    min-width: 0;
  }

  .freq-inst-left-grid {
    display: grid;
    grid-template-columns: 25% 75%;
    width: 100%;
    height: 100%;
    min-height: 130px;
    align-items: center;
    justify-items: stretch;
  }

  .freq-inst-brasao-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 8px 4px 8px 8px;
    min-width: 0;
    border-right: 1px solid var(--freq-border);
  }

  .freq-inst-brasao {
    display: block;
    width: 100%;
    max-width: 100px;
    height: auto;
    max-height: 108px;
    aspect-ratio: 1;
    object-fit: contain;
    object-position: center center;
  }

  .freq-inst-org {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 10px 12px 10px 6px;
    text-align: center;
    font-size: clamp(11px, 1.15vw, 14px);
    font-weight: 700;
    line-height: 1.25;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--freq-muted);
    white-space: normal;
  }

  /* —— Linha 1: título —— */
  .freq-inst-title {
    grid-column: 2;
    grid-row: 1;
    display: grid;
    place-items: center;
    border-bottom: 1px solid var(--freq-border);
    padding: 10px 12px;
    text-align: center;
    font-size: clamp(18px, 2.35vw, 26px);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--freq-text);
    background: var(--freq-white);
    white-space: nowrap;
    overflow: hidden;
  }

  /* —— Linha 2: rótulos —— */
  .freq-inst-labels {
    grid-column: 2;
    grid-row: 2;
    display: grid;
    grid-template-columns: 30% 38% 18% 14%;
    border-bottom: 1px solid var(--freq-border);
    background: var(--freq-label-bg);
    min-height: 26px;
  }

  .freq-inst-labels > div {
    display: grid;
    place-items: center;
    border-right: 1px solid var(--freq-border);
    padding: 4px 2px;
    text-align: center;
    font-size: clamp(9px, 0.95vw, 11px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    line-height: 1.1;
    color: var(--freq-muted);
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
    background: var(--freq-white);
  }

  .freq-inst-values > div {
    border: none;
    min-width: 0;
    min-height: 36px;
  }

  /*
   * Cada dado é uma célula fechada. Não dependemos somente das divisórias do
   * grid: assim DEC, seção, cada dígito, mês, ano e página mantêm o contorno
   * completo também no PDF.
   */
  .freq-inst-opm > span,
  .freq-inst-cod > span,
  .freq-inst-mesano > span,
  .freq-inst-pag {
    border: 1px solid var(--freq-border);
  }

  .freq-inst-opm {
    display: grid;
    grid-template-columns: 28% 72%;
    height: 100%;
  }

  .freq-inst-opm > span {
    display: grid;
    place-items: center;
    padding: 4px 3px;
    text-align: center;
    font-size: clamp(10px, 1.05vw, 13px);
    font-weight: 700;
    color: var(--freq-text);
    text-transform: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .freq-inst-cod {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    height: 100%;
  }

  .freq-inst-cod > span {
    display: grid;
    place-items: center;
    font-size: clamp(11px, 1.15vw, 14px);
    font-weight: 700;
    color: var(--freq-text);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .freq-inst-mesano {
    display: grid;
    grid-template-columns: 42% 58%;
    height: 100%;
  }

  .freq-inst-mesano > span {
    display: grid;
    place-items: center;
    font-size: clamp(10px, 1.05vw, 13px);
    font-weight: 700;
    color: var(--freq-text);
    font-variant-numeric: tabular-nums;
    text-transform: uppercase;
  }

  .freq-inst-pag {
    display: grid;
    place-items: center;
    height: 100%;
    font-size: clamp(11px, 1.15vw, 14px);
    font-weight: 700;
    color: var(--freq-text);
    font-variant-numeric: tabular-nums;
  }

  /* —— Legenda (logo abaixo, sem gap) —— */
  .freq-inst-legend {
    width: 100%;
    border: 1.5px solid var(--freq-border);
    border-top: none;
    background: var(--freq-legend-bg);
    padding: 5px 8px;
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-size: clamp(6.5px, 0.72vw, 8px);
    font-weight: 700;
    line-height: 1.35;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    color: var(--freq-muted);
  }

  /*
   * Responsividade da visualização. Em telas intermediárias preserva o
   * gabarito horizontal; no celular reorganiza os blocos sem esconder ou
   * sobrepor dados. A impressão sempre restaura o A4 paisagem abaixo.
   */
  @media screen and (max-width: 900px) {
    .freq-inst-main {
      grid-template-columns: 36% 64%;
      grid-template-rows: minmax(50px, 1.35fr) minmax(24px, 0.48fr) minmax(34px, 0.72fr);
      min-height: 116px;
    }
    .freq-inst-left-grid { min-height: 116px; grid-template-columns: 30% 70%; }
    .freq-inst-brasao-wrap { padding: 6px 3px 6px 6px; }
    .freq-inst-brasao { max-width: 76px; max-height: 84px; }
    .freq-inst-org { padding: 7px 7px 7px 4px; font-size: 10px; }
    .freq-inst-title { font-size: clamp(15px, 2.8vw, 21px); padding: 7px 8px; }
    .freq-inst-labels > div { font-size: 8px; }
    .freq-inst-opm > span,
    .freq-inst-mesano > span { font-size: 9px; }
    .freq-inst-cod > span,
    .freq-inst-pag { font-size: 10px; }
  }

  @media screen and (max-width: 640px) {
    .freq-inst-main {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 78px 42px 24px 34px;
      min-height: 178px;
    }
    .freq-inst-left {
      grid-column: 1;
      grid-row: 1;
      border-right: none;
      border-bottom: 1px solid var(--freq-border);
    }
    .freq-inst-left-grid {
      min-height: 78px;
      grid-template-columns: 30% 70%;
    }
    .freq-inst-brasao { max-width: 58px; max-height: 62px; }
    .freq-inst-org {
      padding: 5px 8px;
      font-size: 9px;
      line-height: 1.15;
    }
    .freq-inst-title {
      grid-column: 1;
      grid-row: 2;
      font-size: clamp(15px, 5vw, 19px);
      white-space: normal;
    }
    .freq-inst-labels {
      grid-column: 1;
      grid-row: 3;
      grid-template-columns: 30% 38% 18% 14%;
    }
    .freq-inst-values {
      grid-column: 1;
      grid-row: 4;
      grid-template-columns: 30% 38% 18% 14%;
    }
    .freq-inst-labels > div {
      padding: 3px 1px;
      font-size: 7px;
      letter-spacing: 0;
    }
    .freq-inst-values > div { min-height: 34px; }
    .freq-inst-opm > span,
    .freq-inst-mesano > span { padding: 2px 1px; font-size: 8px; }
    .freq-inst-cod > span,
    .freq-inst-pag { font-size: 9px; }
    .freq-inst-legend {
      padding: 4px;
      font-size: 6px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
  }

  @media print {
    .freq-inst-main {
      grid-template-columns: 32% 68% !important;
      min-height: 118px;
      grid-template-rows: minmax(48px, 1.5fr) minmax(22px, 0.48fr) minmax(32px, 0.72fr);
      border-color: #000 !important;
    }
    .freq-inst-left-grid {
      min-height: 118px;
      grid-template-columns: 25% 75% !important;
    }
    .freq-inst-left {
      grid-column: 1 !important;
      grid-row: 1 / 4 !important;
      background: #f8fafc !important;
      border-right-color: #000 !important;
      border-right-width: 1px !important;
      border-bottom: none !important;
    }
    .freq-inst-brasao-wrap { border-right-color: #000 !important; }
    .freq-inst-brasao {
      max-width: 86px;
      max-height: 92px;
    }
    .freq-inst-org { font-size: 11px !important; color: #1e293b !important; }
    .freq-inst-title {
      grid-column: 2 !important;
      grid-row: 1 !important;
      font-size: 20px !important;
      padding: 8px 10px !important;
      border-bottom-color: #000 !important;
      color: #0f172a !important;
    }
    .freq-inst-labels {
      grid-column: 2 !important;
      grid-row: 2 !important;
      grid-template-columns: 30% 38% 18% 14% !important;
      background: #e2e8f0 !important;
      border-bottom-color: #000 !important;
    }
    .freq-inst-labels > div {
      font-size: 9px !important;
      border-right-color: #000 !important;
      color: #1e293b !important;
    }
    .freq-inst-opm > span,
    .freq-inst-cod > span,
    .freq-inst-mesano > span,
    .freq-inst-pag {
      border-color: #000 !important;
      border-style: solid !important;
      border-width: 1px !important;
    }
    .freq-inst-values {
      grid-column: 2 !important;
      grid-row: 3 !important;
      grid-template-columns: 30% 38% 18% 14% !important;
    }
    .freq-inst-opm > span,
    .freq-inst-mesano > span { font-size: 10px !important; }
    .freq-inst-cod > span,
    .freq-inst-pag { font-size: 11px !important; }
    .freq-inst-legend {
      background: #f1f5f9 !important;
      border-color: #000 !important;
      color: #1e293b !important;
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
