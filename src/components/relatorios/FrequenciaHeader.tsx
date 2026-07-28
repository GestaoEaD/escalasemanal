/**
 * Cabeçalho institucional do Controle de Frequência.
 * Replicação pixel-perfect do gabarito oficial (mesmas classes do PDF).
 */
import React from "react";
import {
  CODIGO_OPM_DIGITS,
  FREQUENCIA_BRASAO_SRC,
  FREQUENCIA_HEADER_PRINT_CSS,
  FREQUENCIA_LEGENDA_INSTITUCIONAL,
  codigoOpmDigits,
  formatPagina,
  mesAbreviadoPt,
} from "../../utils/frequenciaHeader";

export type FrequenciaHeaderProps = {
  secaoNome: string;
  codigoOpm: string;
  mes: number;
  ano: number;
  paginaAtual?: number;
  totalPaginas?: number;
  /** Exibe a legenda institucional abaixo do cabeçalho (padrão: true). */
  showLegend?: boolean;
  className?: string;
};

export default function FrequenciaHeader({
  secaoNome,
  codigoOpm,
  mes,
  ano,
  paginaAtual = 1,
  totalPaginas = 1,
  showLegend = true,
  className = "",
}: FrequenciaHeaderProps) {
  const digits = codigoOpmDigits(codigoOpm, CODIGO_OPM_DIGITS);
  const mesAbrev = mesAbreviadoPt(mes);
  const pagina = formatPagina(paginaAtual, totalPaginas);

  return (
    <div className={className || undefined}>
      <style>{FREQUENCIA_HEADER_PRINT_CSS}</style>
      <div className="freq-inst-wrap">
        <div className="freq-inst-main">
          <div className="freq-inst-left">
            <div className="freq-inst-left-grid">
              <div className="freq-inst-brasao-wrap">
                <img
                  className="freq-inst-brasao"
                  src={FREQUENCIA_BRASAO_SRC}
                  alt="Brasão do Estado de São Paulo"
                />
              </div>
              <div className="freq-inst-org">
                POLÍCIA MILITAR
                <br />
                DO
                <br />
                ESTADO DE SÃO PAULO
              </div>
            </div>
          </div>

          <div className="freq-inst-title">CONTROLE DE FREQUÊNCIA</div>

          <div className="freq-inst-labels">
            <div>OPM</div>
            <div>CÓDIGO DA OPM</div>
            <div>MÊS/ANO</div>
            <div>PÁGINA</div>
          </div>

          <div className="freq-inst-values">
            <div className="freq-inst-opm">
              <span>DEC</span>
              <span title={secaoNome || undefined}>{secaoNome || "—"}</span>
            </div>
            <div className="freq-inst-cod">
              {digits.map((d, i) => (
                <span key={i}>{d.trim() || "\u00A0"}</span>
              ))}
            </div>
            <div className="freq-inst-mesano">
              <span>{mesAbrev}</span>
              <span>{ano}</span>
            </div>
            <div className="freq-inst-pag">{pagina}</div>
          </div>
        </div>

        {showLegend && (
          <div className="freq-inst-legend">{FREQUENCIA_LEGENDA_INSTITUCIONAL}</div>
        )}
      </div>
    </div>
  );
}
