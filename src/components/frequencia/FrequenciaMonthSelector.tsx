import React, { useEffect, useState } from "react";
import { EscalaStatus, MESES_NOMES, Usuario } from "../../types";
import { loadFrequenciaMonthStatuses } from "../../utils/frequenciaService";
import { ArrowLeft, CalendarDays } from "lucide-react";
import StatusBadge from "../StatusBadge";

interface Props {
  usuario: Usuario;
  year: number;
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
  onBack,
  onSelectMonth,
}: Props) {
  const [byMonth, setByMonth] = useState<
    Record<number, { count: number; statuses: EscalaStatus[] }>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const map = await loadFrequenciaMonthStatuses(year);
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
  }, [year]);

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
            Voltar
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays size={18} className="text-blue-600 shrink-0" />
            <h1 className="text-sm font-bold text-gray-900 truncate">
              Controle de Frequência · {year}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Selecione o mês</h2>
        <p className="text-sm text-gray-500 mb-6">
          Cada card representa o controle mensal. Os status refletem documentos já salvos.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando meses…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MESES_NOMES.map((nome, idx) => {
              const mes = idx + 1;
              const info = monthCardStatus(byMonth[mes]);
              return (
                <button
                  key={mes}
                  type="button"
                  onClick={() => onSelectMonth(mes)}
                  className="text-left bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm rounded-xl p-4 cursor-pointer transition-all"
                >
                  <div className="text-base font-bold text-gray-900">{nome}</div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {info.status ? (
                      <StatusBadge status={info.status} size="sm" />
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-gray-400">
                        {info.label}
                      </span>
                    )}
                    {byMonth[mes]?.count ? (
                      <span className="text-[10px] text-gray-500">
                        {byMonth[mes].count} seção(ões)
                      </span>
                    ) : null}
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
