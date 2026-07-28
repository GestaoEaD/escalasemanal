/**
 * Cabeçalho institucional padrão do Controle de Frequência (tela + impressão).
 */
import React from "react";
import {
  CODIGO_OPM_DIGITS,
  FREQUENCIA_BRASAO_SRC,
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
    <div className={`freq-report-header w-full max-w-full min-w-0 ${className}`}>
      <div className="freq-report-header__box border border-black w-full">
        <div className="flex w-full min-w-0">
          {/* Área esquerda — brasão + texto institucional */}
          <div className="freq-report-header__left flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-2 py-1 bg-gray-100 border-r border-black shrink-0 w-[32%] sm:w-[28%] min-w-0">
            <img
              src={FREQUENCIA_BRASAO_SRC}
              alt="Brasão do Estado de São Paulo"
              className="freq-report-header__brasao h-10 w-10 sm:h-12 sm:w-12 object-contain shrink-0 [mix-blend-mode:lighten]"
            />
            <div className="text-center flex-1 min-w-0 leading-[1.1]">
              <div className="text-[7px] sm:text-[9px] font-bold uppercase tracking-wide text-black">
                POLÍCIA MILITAR
              </div>
              <div className="text-[7px] sm:text-[9px] font-bold uppercase tracking-wide text-black">
                DO
              </div>
              <div className="text-[7px] sm:text-[9px] font-bold uppercase tracking-wide text-black">
                ESTADO DE SÃO PAULO
              </div>
            </div>
          </div>

          {/* Área direita — título + meta */}
          <div className="flex-1 min-w-0 flex flex-col">
            <h1 className="text-center text-[11px] sm:text-[15px] font-extrabold uppercase tracking-wider py-1 sm:py-1.5 border-b border-black m-0 leading-tight">
              CONTROLE DE FREQUÊNCIA
            </h1>

            <table className="w-full border-collapse table-fixed text-[8px] sm:text-[9px]">
              <thead>
                <tr className="bg-gray-400">
                  <th className="border border-black border-t-0 border-l-0 font-extrabold uppercase py-0.5 px-1 text-center w-[34%]">
                    OPM
                  </th>
                  <th className="border border-black border-t-0 font-extrabold uppercase py-0.5 px-1 text-center w-[36%]">
                    CÓDIGO DA OPM
                  </th>
                  <th className="border border-black border-t-0 font-extrabold uppercase py-0.5 px-1 text-center w-[18%]">
                    MÊS/ANO
                  </th>
                  <th className="border border-black border-t-0 border-r-0 font-extrabold uppercase py-0.5 px-1 text-center w-[12%]">
                    PÁGINA
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black border-l-0 border-b-0 p-0 align-middle">
                    <div className="flex w-full min-w-0">
                      <div className="w-[22%] shrink-0 border-r border-black text-center font-bold py-1 px-0.5">
                        DEC
                      </div>
                      <div className="flex-1 min-w-0 text-center font-bold py-1 px-1 truncate">
                        {secaoNome || "—"}
                      </div>
                    </div>
                  </td>
                  <td className="border border-black border-b-0 p-0 align-middle">
                    <div className="grid grid-cols-9 w-full">
                      {digits.map((d, i) => (
                        <div
                          key={i}
                          className="border-r border-black last:border-r-0 text-center font-extrabold font-mono tabular-nums py-1 text-[9px] sm:text-[10px] leading-none"
                        >
                          {d.trim() || "\u00A0"}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="border border-black border-b-0 p-0 align-middle">
                    <div className="flex w-full">
                      <div className="w-[45%] border-r border-black text-center font-extrabold py-1">
                        {mesAbrev}
                      </div>
                      <div className="w-[55%] text-center font-extrabold py-1 tabular-nums">
                        {ano}
                      </div>
                    </div>
                  </td>
                  <td className="border border-black border-r-0 border-b-0 text-center font-extrabold tabular-nums text-[10px] sm:text-[11px] py-1">
                    {pagina}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showLegend && (
        <div className="border border-black border-t-0 bg-gray-200 px-1.5 py-1 text-center text-[5.5px] sm:text-[6.5px] font-bold uppercase leading-snug tracking-tight text-black">
          {FREQUENCIA_LEGENDA_INSTITUCIONAL}
        </div>
      )}
    </div>
  );
}
