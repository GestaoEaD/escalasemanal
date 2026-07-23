import React, { useEffect, useState } from "react";
import { EscalaStatus, MESES_NOMES, Usuario } from "../../types";
import { loadFrequenciaMonthStatuses } from "../../utils/frequenciaService";
import {
  cardBorderStyle,
  resolveMonthCardTone,
} from "../../utils/cardBorderTone";
import { ArrowLeft, Building2, CalendarDays } from "lucide-react";
import StatusBadge from "../StatusBadge";

interface Props {
  usuario: Usuario;
  year: number;
  secao: string;
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
  year,
  secao,
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
        const map = await loadFrequenciaMonthStatuses(year, secao);
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
  }, [year, secao]);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            <ArrowLeft size={16} />
            Seções
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={16} className="text-blue-600 shrink-0" />
            <h1 className="text-sm font-bold text-gray-900 truncate">
              {secao}
            </h1>
            <span className="text-gray-300">·</span>
            <CalendarDays size={16} className="text-gray-500 shrink-0" />
            <span className="text-sm font-semibold text-gray-600">{year}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Selecione o mês</h2>
        <p className="text-sm text-gray-500 mb-6">
          Controle de Frequência de{" "}
          <span className="font-semibold text-gray-700">{secao}</span> · {year}
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
              const isCurrent =
                year === now.getFullYear() && mes === now.getMonth() + 1;

              return (
                <button
                  key={mes}
                  type="button"
                  onClick={() => onSelectMonth(mes)}
                  style={cardBorderStyle(tone)}
                  className="text-left rounded-xl p-4 cursor-pointer transition-all shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`text-base font-bold ${
                        tone === "aprovada"
                          ? "text-emerald-900"
                          : tone === "aguardando"
                            ? "text-amber-950"
                            : tone === "atual"
                              ? "text-blue-900"
                              : tone === "futuro"
                                ? "text-gray-700"
                                : "text-gray-500"
                      }`}
                    >
                      {nome}
                    </div>
                    {isCurrent && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white uppercase tracking-tight shrink-0">
                        Atual
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {info.status ? (
                      <StatusBadge status={info.status} size="sm" />
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-gray-400">
                        {info.label}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
