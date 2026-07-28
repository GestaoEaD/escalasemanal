/**
 * Cabeçalho institucional padrão do Controle de Frequência (tela + impressão).
 * Layout em tabela espelhando o formulário oficial PMESP.
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
      <table className="freq-report-table w-full border-collapse table-fixed border-[1.25px] border-black bg-white text-black font-[Arial,Helvetica,sans-serif]">
        <colgroup>
          <col className="w-[32%]" />
          <col className="w-[24%]" />
          <col className="w-[24%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
        </colgroup>

        <tbody>
          {/* Linha 1: marca institucional (rowspan 3) + título */}
          <tr>
            <td
              rowSpan={3}
              className="border border-black bg-[#f2f2f2] p-0 align-middle"
            >
              <div className="flex items-center h-full min-h-[72px] sm:min-h-[78px]">
                <div className="w-[38%] shrink-0 flex items-center justify-center px-1 py-1">
                  <img
                    src={FREQUENCIA_BRASAO_SRC}
                    alt="Brasão do Estado de São Paulo"
                    className="h-[48px] w-[48px] sm:h-[54px] sm:w-[54px] object-contain [mix-blend-mode:lighten]"
                  />
                </div>
                <div className="flex-1 px-1.5 sm:px-2 py-1 text-center leading-[1.15]">
                  <div className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wide">
                    POLÍCIA MILITAR
                  </div>
                  <div className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wide">
                    DO
                  </div>
                  <div className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wide">
                    ESTADO DE SÃO PAULO
                  </div>
                </div>
              </div>
            </td>
            <td
              colSpan={4}
              className="border border-black text-center text-[12px] sm:text-[16px] font-extrabold uppercase tracking-[0.06em] py-1.5 sm:py-2 px-2 leading-tight bg-white"
            >
              CONTROLE DE FREQUÊNCIA
            </td>
          </tr>

          {/* Linha 2: rótulos cinza-claro */}
          <tr>
            <th className="border border-black bg-[#d9d9d9] text-[7px] sm:text-[9px] font-bold uppercase tracking-wide py-0.5 px-1 text-center">
              OPM
            </th>
            <th className="border border-black bg-[#d9d9d9] text-[7px] sm:text-[9px] font-bold uppercase tracking-wide py-0.5 px-1 text-center">
              CÓDIGO DA OPM
            </th>
            <th className="border border-black bg-[#d9d9d9] text-[7px] sm:text-[9px] font-bold uppercase tracking-wide py-0.5 px-1 text-center">
              MÊS/ANO
            </th>
            <th className="border border-black bg-[#d9d9d9] text-[7px] sm:text-[9px] font-bold uppercase tracking-wide py-0.5 px-1 text-center">
              PÁGINA
            </th>
          </tr>

          {/* Linha 3: valores */}
          <tr>
            <td className="border border-black p-0 align-middle bg-white">
              <div className="grid grid-cols-[26%_74%] w-full h-full min-h-[22px]">
                <div className="border-r border-black flex items-center justify-center text-[9px] sm:text-[10px] font-bold py-1">
                  DEC
                </div>
                <div className="flex items-center justify-center text-[8px] sm:text-[10px] font-semibold px-1 py-1 truncate">
                  {secaoNome || "—"}
                </div>
              </div>
            </td>
            <td className="border border-black p-0 align-middle bg-white">
              <div className="grid grid-cols-9 w-full h-full min-h-[22px]">
                {digits.map((d, i) => (
                  <div
                    key={i}
                    className="border-r border-black last:border-r-0 flex items-center justify-center text-[9px] sm:text-[11px] font-bold tabular-nums py-1"
                  >
                    {d.trim() || "\u00A0"}
                  </div>
                ))}
              </div>
            </td>
            <td className="border border-black p-0 align-middle bg-white">
              <div className="grid grid-cols-[42%_58%] w-full h-full min-h-[22px]">
                <div className="border-r border-black flex items-center justify-center text-[9px] sm:text-[10px] font-bold py-1">
                  {mesAbrev}
                </div>
                <div className="flex items-center justify-center text-[9px] sm:text-[10px] font-bold tabular-nums py-1">
                  {ano}
                </div>
              </div>
            </td>
            <td className="border border-black text-center text-[10px] sm:text-[11px] font-bold tabular-nums py-1 bg-white align-middle">
              {pagina}
            </td>
          </tr>

          {/* Linha 4: legenda institucional em largura total */}
          {showLegend && (
            <tr>
              <td
                colSpan={5}
                className="border border-black bg-[#e8e8e8] px-1.5 sm:px-2 py-1 text-center text-[5.5px] sm:text-[6.8px] font-bold uppercase leading-snug tracking-tight"
              >
                {FREQUENCIA_LEGENDA_INSTITUCIONAL}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
