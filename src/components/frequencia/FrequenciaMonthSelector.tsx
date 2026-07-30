import React, { useEffect, useState } from "react";
import { Bell, CheckCircle2, RotateCcw } from "lucide-react";
import { EscalaStatus, MESES_NOMES, Usuario } from "../../types";
import {
  FrequenciaMonthCardInfo,
  FrequenciaMonthNotification,
  loadFrequenciaMonthStatuses,
} from "../../utils/frequenciaService";
import {
  cardBorderStyle,
  resolveMonthCardTone,
} from "../../utils/cardBorderTone";
import { ArrowLeft, CalendarDays } from "lucide-react";
import StatusBadge from "../StatusBadge";

interface Props {
  usuario: Usuario;
  year: number;
  /** Obrigatório no fluxo Seção → Mês: status e notificações daquela seção. */
  secaoId: string;
  secao?: string;
  onBack: () => void;
  onSelectMonth: (mes: number) => void;
}

function monthCardStatus(
  info: FrequenciaMonthCardInfo | undefined
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

function notificationTone(kind: FrequenciaMonthNotification["kind"]): {
  wrap: string;
  Icon: typeof Bell;
} {
  if (kind === "aprovacao") {
    return {
      wrap: "bg-emerald-50 border-emerald-200 text-emerald-800",
      Icon: CheckCircle2,
    };
  }
  if (kind === "revisao") {
    return {
      wrap: "bg-orange-50 border-orange-200 text-orange-900",
      Icon: RotateCcw,
    };
  }
  return {
    wrap: "bg-amber-50 border-amber-200 text-amber-900",
    Icon: Bell,
  };
}

export default function FrequenciaMonthSelector({
  usuario,
  year,
  secaoId,
  secao = "",
  onBack,
  onSelectMonth,
}: Props) {
  const [byMonth, setByMonth] = useState<Record<number, FrequenciaMonthCardInfo>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { resolveActiveDivisaoId } = await import("../../utils/divisaoContext");
        const divisaoId = resolveActiveDivisaoId(usuario);
        const map = await loadFrequenciaMonthStatuses(year, secaoId, divisaoId);
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

  const secaoLabel = secao || secaoId;

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
              {secaoLabel ? ` · ${secaoLabel}` : ""}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 w-full min-w-0">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Selecione o mês</h2>
        <p className="text-sm text-gray-500 mb-6">
          Abra o controle da Seção{secaoLabel ? ` “${secaoLabel}”` : ""} no mês desejado.
          Ações recentes de aprovação ou revisão aparecem no card correspondente.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando meses…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MESES_NOMES.map((nome, idx) => {
              const mes = idx + 1;
              const card = byMonth[mes];
              const info = monthCardStatus(card);
              const tone = resolveMonthCardTone({
                status: info.status,
                year,
                month: mes,
                now,
              });
              const notif = card?.notification || null;
              const notifStyle = notif ? notificationTone(notif.kind) : null;
              return (
                <button
                  key={mes}
                  type="button"
                  onClick={() => onSelectMonth(mes)}
                  className="text-left bg-white rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-400 relative"
                  style={cardBorderStyle(tone)}
                >
                  {notif && (
                    <span
                      className={`absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-white ${
                        notif.kind === "aprovacao"
                          ? "bg-emerald-500"
                          : notif.kind === "revisao"
                            ? "bg-orange-500"
                            : "bg-amber-500"
                      }`}
                      title={notif.label}
                      aria-hidden
                    />
                  )}
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
                  {notif && notifStyle && (
                    <div
                      className={`mt-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-semibold leading-snug ${notifStyle.wrap}`}
                    >
                      <notifStyle.Icon size={12} className="shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        {notif.label}
                        {notif.data ? ` · ${notif.data}` : ""}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
