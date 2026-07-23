/**
 * Shell global autenticado: cabeçalho persistente + rodapé institucional.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Usuario } from "../types";
import { canAccessConfig, canApproveScales } from "../utils/permissions";
import { loadPendingApprovalsForGestor } from "../utils/pendingApprovalsService";
import { Bell, Calendar, LogOut, Settings } from "lucide-react";

export interface AppShellProps {
  usuario: Usuario;
  children: React.ReactNode;
  onHome: () => void;
  onLogout: () => void;
  onOpenConfig?: () => void;
  onOpenPendencias?: () => void;
  /** Esconde o botão de aprovações (ex.: já na lista). */
  hidePendenciasBtn?: boolean;
}

export default function AppShell({
  usuario,
  children,
  onHome,
  onLogout,
  onOpenConfig,
  onOpenPendencias,
  hidePendenciasBtn = false,
}: AppShellProps) {
  const canApprove = canApproveScales(usuario);
  const [pendingTotal, setPendingTotal] = useState(0);

  const refreshPendencias = useCallback(async () => {
    if (!canApprove) {
      setPendingTotal(0);
      return;
    }
    try {
      const summary = await loadPendingApprovalsForGestor(usuario);
      setPendingTotal(summary.total);
    } catch (err) {
      console.error("Falha ao carregar badge de pendências:", err);
    }
  }, [canApprove, usuario]);

  useEffect(() => {
    void refreshPendencias();
  }, [refreshPendencias]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshPendencias();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshPendencias]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs print:hidden">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex justify-between gap-2 min-h-14 py-2 sm:py-0 sm:h-14 items-center">
            <button
              type="button"
              id="app-home-btn"
              onClick={onHome}
              className="flex items-center space-x-2 sm:space-x-3 min-w-0 text-left cursor-pointer rounded-lg hover:bg-gray-50 px-1 py-1 -ml-1 transition-colors"
              title="Voltar à tela principal"
            >
              <div className="bg-blue-600 p-2 rounded-lg text-white shrink-0">
                <Calendar size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-bold text-gray-900 tracking-tight leading-none truncate">
                  Sistema de Escala de Serviço
                </div>
                <p className="text-[11px] text-gray-500 mt-1 hidden sm:block">
                  Divisão de Educação a Distância
                </p>
              </div>
            </button>

            <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
              <div className="hidden md:block text-right">
                <div className="text-sm font-semibold text-gray-800">
                  {usuario.postoGrad} {usuario.nome}
                </div>
                <div className="text-xs text-gray-500">
                  R.E. {usuario.re} · {usuario.perfil || "Operador"} ·{" "}
                  {usuario.secao}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {canApprove && onOpenPendencias && !hidePendenciasBtn && (
                  <button
                    id="aprovacoes-pendentes-btn"
                    type="button"
                    onClick={onOpenPendencias}
                    className="relative inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors cursor-pointer border border-amber-200"
                    title="Aprovações pendentes"
                  >
                    <Bell size={14} />
                    <span className="hidden sm:inline">Aprovações</span>
                    {pendingTotal > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold tabular-nums">
                        {pendingTotal}
                      </span>
                    )}
                  </button>
                )}

                {canAccessConfig(usuario) && onOpenConfig && (
                  <button
                    id="config-btn"
                    type="button"
                    onClick={onOpenConfig}
                    className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer border border-blue-100"
                  >
                    <Settings size={14} />
                    <span className="hidden sm:inline">Configurações</span>
                  </button>
                )}

                <button
                  id="logout-btn"
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
                >
                  <LogOut size={14} />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">{children}</div>

      <footer className="mt-auto border-t border-gray-200 bg-white print:hidden">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-3 text-center">
          <p className="text-[11px] font-semibold text-gray-500 tracking-wide">
            Criado por Gestão Educacional - 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
