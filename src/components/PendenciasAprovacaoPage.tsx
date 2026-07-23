import React, { useCallback, useEffect, useState } from "react";
import { TipoEscalaDocumento, Usuario } from "../types";
import {
  loadPendingApprovalsForGestor,
  PendingApprovalItem,
  PendingApprovalsSummary,
} from "../utils/pendingApprovalsService";
import { ArrowLeft, Bell, ChevronRight, RefreshCw } from "lucide-react";

interface Props {
  usuario: Usuario;
  onBack: () => void;
  onOpenApproval: (token: string, tipo?: TipoEscalaDocumento) => void;
  onSummaryChange?: (summary: PendingApprovalsSummary) => void;
}

export default function PendenciasAprovacaoPage({
  usuario,
  onBack,
  onOpenApproval,
  onSummaryChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [total, setTotal] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await loadPendingApprovalsForGestor(usuario);
      setItems(summary.items);
      setTotal(summary.total);
      onSummaryChange?.(summary);
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar as pendências de aprovação.");
    } finally {
      setLoading(false);
    }
  }, [usuario, onSummaryChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="flex-1 bg-gray-50 pb-12">
      <header className="bg-white border-b border-gray-200 sticky top-14 z-10 shadow-xs">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Bell size={16} className="text-amber-600 shrink-0" />
            <h1 className="text-sm font-bold text-gray-900 truncate">
              Aprovações pendentes
            </h1>
            {total > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-600 text-white text-[10px] font-bold tabular-nums">
                {total}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 mt-6 space-y-3">
        <p className="text-sm text-gray-500">
          Selecione um documento para abrir a tela de aprovação. Somente solicitações
          ativas e válidas são listadas.
        </p>

        {error && (
          <div className="text-xs font-semibold rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Carregando pendências…</p>
        ) : items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center">
            <p className="text-sm font-semibold text-gray-700">
              Nenhuma aprovação pendente
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Quando houver novos envios, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.token}>
                <button
                  type="button"
                  onClick={() => onOpenApproval(item.token, item.tipo)}
                  className="w-full text-left bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 rounded-xl px-4 py-3 cursor-pointer transition-all flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      {item.titulo}
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-gray-900 truncate">
                      {item.subtitulo}
                    </div>
                    <div className="mt-0.5 text-[10px] font-mono text-gray-400 truncate">
                      {item.escalaId}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
