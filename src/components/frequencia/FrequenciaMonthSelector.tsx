import React, { useEffect, useState } from "react";
import { EscalaStatus, MESES_NOMES, Usuario } from "../../types";
import { loadFrequenciaMonthStatuses } from "../../utils/frequenciaService";
import {
  cardBorderStyle,
  resolveMonthCardTone,
} from "../../utils/cardBorderTone";
import { ArrowLeft, CalendarDays } from "lucide-react";
import StatusBadge from "../StatusBadge";

interface Props {
  usuario: Usuario;
  year: number;
  /** Quando informado, mostra status só daquela seção; senão, agrega a Divisão. */
  secaoId?: string;
  secao?: string;
  onBack: () => void;
  onSelectMonth: (mes: number) => void;
}

function monthCardStatus(
  info: { count: number; statuses: EscalaStatus[] } | undefined
): { label: string; status?: EscalaStatus } {
  if (!info || info.count === 0) return { label: "Sem dados" };
  if (info.statuses.every((s) => s === "aprovada")) {
    return { label: "Aprovado", status: "aprovada" };
  }
  if (info.statuses.some((s) => s === "aguardando_aprovacao")) {
    return { label: "Aguardando aprovação", status: "aguardando_aprovacao" };
  }
  if (info.statuses.some((s) => s === "revisao_solicitada")) {
    return { label: "Em revisão", status: "revisao_solicitada" };
  }
  if (info.count >= 1) {
    return { label: "Dados disponíveis", status: "em_edicao" };
  }
  return { label: "Sem dados" };
}

export default function FrequenciaMonthSelector({
  usuario,
  year,
  secaoId = "",
  onBack,
  onSelectMonth,
}: Props) {
  const [byMonth, setByMonth] = useState<
    Record<number, { count: number; statuses: EscalaStatus[] }>
  >({});
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { resolveActiveDivisaoId } = await import("../../utils/divisaoContext");
        const divisaoId = resolveActiveDivisaoId(usuario);
        const map = await loadFrequenciaMonthStatuses(year, secaoId || undefined, divisaoId);
        if (!cancelled) setByMonth(map);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, secaoId, usuario]);

  return (
    <div className="flex-1 bg-gray-50 pb-12 w-full max-w-full min-w-0">
      <header className="bg-white border-b border-gray-200 sticky sticky-below-app-header z-10 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3 w-full min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays size={16} className="text-blue-600 shrink-0" />
            <h1 className="text-sm font-bold text-gray-900 truncate">
              Controle de Frequência · {year}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 w-full min-w-0">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Selecione o mês</h2>
        <p className="text-sm text-gray-500 mb-6">
          Em seguida você escolherá a Seção do controle.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando meses…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MESES_NOMES.map((nome, idx) => {
              const mes = idx + 1;
              const info = monthCardStatus(byMonth[mes]);
              const tone = resolveMonthCardTone({
                status: info.status,
                year,
                month: mes,
                now,
              });
              return (
                <button
                  key={mes}
                  type="button"
                  onClick={() => onSelectMonth(mes)}
                  className="text-left bg-white rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={cardBorderStyle(tone)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-bold text-gray-900">{nome}</span>
                    {info.status ? (
                      <StatusBadge status={info.status} />
                    ) : (
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">
                        {info.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">{info.label}</p>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
