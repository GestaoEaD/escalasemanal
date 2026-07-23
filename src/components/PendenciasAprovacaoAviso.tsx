import React from "react";
import { TipoEscalaDocumento, TIPO_ESCALA_LABELS } from "../types";
import { PendingApprovalsSummary } from "../utils/pendingApprovalsService";
import { Bell, X } from "lucide-react";

interface Props {
  summary: PendingApprovalsSummary;
  onVerPendencias: () => void;
  onAgoraNao: () => void;
}

export default function PendenciasAprovacaoAviso({
  summary,
  onVerPendencias,
  onAgoraNao,
}: Props) {
  if (summary.total <= 0) return null;

  const linhas = (Object.keys(summary.byTipo) as TipoEscalaDocumento[])
    .filter((t) => summary.byTipo[t] > 0)
    .map((t) => ({
      tipo: t,
      label: TIPO_ESCALA_LABELS[t],
      count: summary.byTipo[t],
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-labelledby="pendencias-aviso-title"
        className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full overflow-hidden"
      >
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <Bell size={18} />
            </div>
            <div className="min-w-0">
              <h2
                id="pendencias-aviso-title"
                className="text-sm font-bold text-amber-950 uppercase tracking-wide"
              >
                Aprovações pendentes
              </h2>
              <p className="mt-1 text-xs text-amber-900/90 leading-relaxed">
                Existem{" "}
                <span className="font-bold">{summary.total}</span>{" "}
                {summary.total === 1 ? "documento aguardando" : "documentos aguardando"}{" "}
                sua aprovação.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAgoraNao}
            className="shrink-0 p-1 rounded-md text-amber-800/70 hover:bg-amber-100 cursor-pointer"
            aria-label="Fechar aviso"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3">
          <ul className="space-y-1.5">
            {linhas.map((l) => (
              <li
                key={l.tipo}
                className="flex items-center justify-between gap-2 text-xs text-gray-800 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
              >
                <span className="font-semibold">{l.label}</span>
                <span className="font-bold text-amber-800 tabular-nums">
                  {l.count}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end bg-gray-50/80">
          <button
            type="button"
            onClick={onAgoraNao}
            className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={onVerPendencias}
            className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-lg cursor-pointer"
          >
            Ver pendências
          </button>
        </div>
      </div>
    </div>
  );
}
