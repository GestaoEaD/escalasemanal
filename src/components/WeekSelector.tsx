import React, { useState, useMemo, useEffect, useCallback } from "react";
import { getWeeksForYear, WeekInfo } from "../utils/dateUtils";
import { EscalaStatus, TipoEscalaDocumento, Usuario } from "../types";
import { db, collection, getDocs, query, where } from "../firebase";
import { canAccessConfig, canApproveScales, isGestor } from "../utils/permissions";
import { normalizeEscalaStatus } from "../utils/approvalService";
import {
  dismissPendenciasAviso,
  loadPendingApprovalsForGestor,
  PendingApprovalsSummary,
  wasPendenciasAvisoDismissed,
} from "../utils/pendingApprovalsService";
import StatusBadge from "./StatusBadge";
import PendenciasAprovacaoAviso from "./PendenciasAprovacaoAviso";
import {
  cardBorderStyle,
  resolveWeekCardTone,
} from "../utils/cardBorderTone";
import {
  Calendar,
  LogOut,
  ChevronRight,
  Settings,
  Link2,
  ClipboardList,
  Bell,
} from "lucide-react";
import { motion } from "motion/react";

interface WeekSelectorProps {
  usuario: Usuario;
  /** Ano inicial (ex.: restaurado da URL / navegação). */
  initialYear?: number;
  onSelectWeek: (year: number, week: WeekInfo) => void;
  onLogout: () => void;
  onOpenConfig?: () => void;
  onOpenApproval?: (escalaId: string, tipo?: TipoEscalaDocumento) => void;
  onOpenFrequencia?: (year: number) => void;
  onOpenPendencias?: () => void;
}

const EMPTY_SUMMARY: PendingApprovalsSummary = {
  total: 0,
  byTipo: { semanal: 0, alteracao: 0, frequencia: 0 },
  items: [],
};

export default function WeekSelector({
  usuario,
  initialYear = 2026,
  onSelectWeek,
  onLogout,
  onOpenConfig,
  onOpenApproval,
  onOpenFrequencia,
  onOpenPendencias,
}: WeekSelectorProps) {
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [weeklyStatusByWeek, setWeeklyStatusByWeek] = useState<Record<string, EscalaStatus>>({});
  const [altStatusByWeek, setAltStatusByWeek] = useState<Record<string, EscalaStatus>>({});
  const [pendingSummary, setPendingSummary] =
    useState<PendingApprovalsSummary>(EMPTY_SUMMARY);
  const [showAviso, setShowAviso] = useState(false);

  const today = useMemo(() => new Date(), []);
  const canApprove = canApproveScales(usuario);

  const weeks = useMemo(() => {
    return getWeeksForYear(selectedYear);
  }, [selectedYear]);

  const refreshPendencias = useCallback(async () => {
    if (!canApprove) {
      setPendingSummary(EMPTY_SUMMARY);
      setShowAviso(false);
      return;
    }
    try {
      const summary = await loadPendingApprovalsForGestor(usuario);
      setPendingSummary(summary);
      if (summary.total > 0 && !wasPendenciasAvisoDismissed()) {
        setShowAviso(true);
      }
    } catch (err) {
      console.error("Falha ao carregar pendências de aprovação:", err);
    }
  }, [canApprove, usuario]);

  useEffect(() => {
    void refreshPendencias();
  }, [refreshPendencias]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPendencias();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshPendencias]);

  useEffect(() => {
    let cancelled = false;
    const loadStatuses = async () => {
      try {
        const [weeklySnap, altSnap] = await Promise.all([
          getDocs(query(collection(db, "escalas_semanais"), where("ano", "==", selectedYear))),
          getDocs(query(collection(db, "escalas_alteracao"), where("ano", "==", selectedYear))),
        ]);
        const weeklyMap: Record<string, EscalaStatus> = {};
        weeklySnap.forEach((d) => {
          const data = d.data();
          const id = (data.id as string) || d.id;
          weeklyMap[id] = normalizeEscalaStatus(data.status);
        });
        const altMap: Record<string, EscalaStatus> = {};
        altSnap.forEach((d) => {
          const data = d.data();
          const id = (data.id as string) || d.id;
          altMap[id] = normalizeEscalaStatus(data.status);
        });
        if (!cancelled) {
          setWeeklyStatusByWeek(weeklyMap);
          setAltStatusByWeek(altMap);
        }
      } catch (err) {
        console.error("Falha ao carregar status das escalas:", err);
      }
    };
    loadStatuses();
    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  const currentWeekId = useMemo(() => {
    const todayYear = today.getFullYear();
    if (todayYear !== selectedYear) return null;

    const currentWeek = weeks.find((w) => {
      const start = new Date(w.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(w.endDate);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });

    return currentWeek ? currentWeek.id : null;
  }, [selectedYear, weeks, today]);

  const getWeekState = (week: WeekInfo) => {
    const isCurrent = week.id === currentWeekId;
    if (isCurrent) return "current";

    const todayYear = today.getFullYear();
    if (selectedYear < todayYear) {
      return "past";
    }
    if (selectedYear > todayYear) {
      return "future";
    }

    const end = new Date(week.endDate);
    end.setHours(23, 59, 59, 999);
    if (end < today) {
      return "past";
    }
    return "future";
  };

  const handleAgoraNao = () => {
    dismissPendenciasAviso();
    setShowAviso(false);
  };

  const handleVerPendencias = () => {
    dismissPendenciasAviso();
    setShowAviso(false);
    onOpenPendencias?.();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {showAviso && canApprove && (
        <PendenciasAprovacaoAviso
          summary={pendingSummary}
          onVerPendencias={handleVerPendencias}
          onAgoraNao={handleAgoraNao}
        />
      )}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between gap-2 min-h-16 py-2 sm:py-0 sm:h-16 items-center">
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <div className="bg-blue-600 p-2 rounded-lg text-white shrink-0">
                <Calendar size={22} />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold text-gray-900 tracking-tight leading-none truncate">
                  Sistema de Escala de Serviço
                </h1>
                <p className="text-[11px] text-gray-500 mt-1 hidden sm:block">
                  Divisão de Educação a Distância
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
              <div className="hidden md:block text-right">
                <div className="text-sm font-semibold text-gray-800">
                  {usuario.postoGrad} {usuario.nome}
                </div>
                <div className="text-xs text-gray-500">
                  R.E. {usuario.re} · {usuario.perfil || "Operador"} · {usuario.secao}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {canApprove && onOpenPendencias && (
                  <button
                    id="aprovacoes-pendentes-btn"
                    type="button"
                    onClick={onOpenPendencias}
                    className="relative inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors cursor-pointer border border-amber-200"
                    title="Aprovações pendentes"
                  >
                    <Bell size={14} />
                    <span className="hidden sm:inline">Aprovações</span>
                    {pendingSummary.total > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold tabular-nums">
                        {pendingSummary.total}
                      </span>
                    )}
                  </button>
                )}

                {canAccessConfig(usuario) && onOpenConfig && (
                  <button
                    id="config-btn"
                    onClick={onOpenConfig}
                    className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer border border-blue-100"
                  >
                    <Settings size={14} />
                    <span className="hidden sm:inline">Configurações</span>
                  </button>
                )}

                <button
                  id="logout-btn"
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold leading-7 text-gray-900 sm:text-2xl sm:truncate">
              Selecione a Semana de Serviço
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Escolha o ano e clique na semana correspondente para abrir o editor de escala.
            </p>
          </div>

          <div className="mt-4 flex sm:mt-0 sm:ml-4 items-center space-x-3">
            <label htmlFor="year-select" className="text-sm font-semibold text-gray-700">
              Ano:
            </label>
            <select
              id="year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="block w-32 pl-3 pr-10 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-semibold"
            >
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
            {onOpenFrequencia && (
              <button
                type="button"
                id="controle-frequencia-btn"
                onClick={() => onOpenFrequencia(selectedYear)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-md cursor-pointer shadow-sm"
                title="Abrir Controle de Frequência do ano selecionado"
              >
                <ClipboardList size={14} />
                <span>CONTROLE DE FREQUÊNCIA</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {weeks.map((week) => {
            const state = getWeekState(week);
            const weeklyStatus = weeklyStatusByWeek[week.id] || "em_edicao";
            const altStatus = altStatusByWeek[week.id] || "em_edicao";
            const hasPending =
              weeklyStatus === "aguardando_aprovacao" || altStatus === "aguardando_aprovacao";
            const borderTone = resolveWeekCardTone({
              weeklyStatus,
              altStatus,
              temporal: state,
            });

            let titleClass = "";
            let periodClass = "";
            let chevronColor = "";
            let badge = null;

            if (borderTone === "atual" || state === "current") {
              titleClass = "text-blue-900 font-extrabold";
              periodClass = "text-blue-700 font-bold";
              chevronColor = "text-blue-600";
              if (state === "current") {
                badge = (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white uppercase tracking-tight">
                    Semana Atual
                  </span>
                );
              }
            } else if (borderTone === "aprovada") {
              titleClass = "text-emerald-900 font-bold";
              periodClass = "text-emerald-700 font-semibold";
              chevronColor = "text-emerald-600";
            } else if (borderTone === "aguardando") {
              titleClass = "text-amber-950 font-bold";
              periodClass = "text-amber-800 font-semibold";
              chevronColor = "text-amber-700";
            } else if (state === "past") {
              titleClass = "text-gray-500 font-bold";
              periodClass = "text-gray-400 font-medium";
              chevronColor = "text-gray-400";
              badge = (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-500 uppercase tracking-tight">
                  Concluída
                </span>
              );
            } else {
              titleClass = "text-gray-700 font-bold";
              periodClass = "text-gray-500 font-semibold";
              chevronColor = "text-gray-400";
            }

            return (
              <motion.div
                key={week.id}
                whileHover={{ scale: 1.015, translateY: -2 }}
                style={cardBorderStyle(borderTone)}
                className="text-left p-4 rounded-lg flex flex-col justify-between min-h-28 transition-all shadow-sm hover:shadow-md"
              >
                <button
                  id={`week-btn-${week.id}`}
                  type="button"
                  onClick={() => onSelectWeek(selectedYear, week)}
                  className="w-full text-left cursor-pointer"
                >
                  <div className="w-full">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {selectedYear}
                      </span>
                      {badge}
                    </div>
                    <h3 className={`text-base mt-1 ${titleClass}`}>{week.label}</h3>
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-bold text-gray-400 uppercase">Sem</span>
                        <StatusBadge status={weeklyStatus} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-bold text-gray-400 uppercase">Alt</span>
                        <StatusBadge status={altStatus} />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center w-full mt-2 border-t border-black/5 pt-2">
                    <span className={`text-xs ${periodClass}`}>{week.periodo}</span>
                    <ChevronRight size={16} className={chevronColor} />
                  </div>
                </button>

                {isGestor(usuario) && hasPending && onOpenApproval && (
                  <div className="mt-2 space-y-1.5">
                    {weeklyStatus === "aguardando_aprovacao" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenApproval(week.id, "semanal");
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer"
                      >
                        <Link2 size={12} />
                        Aprovar Semanal
                      </button>
                    )}
                    {altStatus === "aguardando_aprovacao" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenApproval(week.id, "alteracao");
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md cursor-pointer"
                      >
                        <Link2 size={12} />
                        Aprovar Alteração
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
