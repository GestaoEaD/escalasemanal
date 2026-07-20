import React, { useState, useMemo, useEffect } from "react";
import { getWeeksForYear, WeekInfo } from "../utils/dateUtils";
import { EscalaStatus, Usuario } from "../types";
import { db, collection, getDocs, query, where } from "../firebase";
import { canAccessConfig, isGestor } from "../utils/permissions";
import { normalizeEscalaStatus } from "../utils/approvalService";
import StatusBadge from "./StatusBadge";
import { Calendar, LogOut, ChevronRight, Settings, Link2 } from "lucide-react";
import { motion } from "motion/react";

interface WeekSelectorProps {
  usuario: Usuario;
  onSelectWeek: (year: number, week: WeekInfo) => void;
  onLogout: () => void;
  onOpenConfig?: () => void;
  onOpenApproval?: (escalaId: string) => void;
}

export default function WeekSelector({
  usuario,
  onSelectWeek,
  onLogout,
  onOpenConfig,
  onOpenApproval,
}: WeekSelectorProps) {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [statusByWeek, setStatusByWeek] = useState<Record<string, EscalaStatus>>({});

  const today = useMemo(() => new Date(), []);

  const weeks = useMemo(() => {
    return getWeeksForYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    let cancelled = false;
    const loadStatuses = async () => {
      try {
        const q = query(collection(db, "escalas_semanais"), where("ano", "==", selectedYear));
        const snap = await getDocs(q);
        const map: Record<string, EscalaStatus> = {};
        snap.forEach((d) => {
          const data = d.data();
          const id = (data.id as string) || d.id;
          map[id] = normalizeEscalaStatus(data.status);
        });
        if (!cancelled) setStatusByWeek(map);
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

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
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
                <p className="text-[11px] text-gray-500 mt-1 hidden sm:block">Escalas Semanais Digitais</p>
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
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {weeks.map((week) => {
            const state = getWeekState(week);
            const approvalStatus = statusByWeek[week.id] || "em_edicao";

            let btnClass = "";
            let titleClass = "";
            let periodClass = "";
            let chevronColor = "";
            let badge = null;

            if (state === "current") {
              btnClass = "border-blue-600 bg-blue-50/70 shadow-md ring-2 ring-blue-500/20 hover:bg-blue-100/50";
              titleClass = "text-blue-900 font-extrabold";
              periodClass = "text-blue-700 font-bold";
              chevronColor = "text-blue-600";
              badge = (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white uppercase tracking-tight">
                  Semana Atual
                </span>
              );
            } else if (state === "past") {
              btnClass = "border-gray-200 bg-gray-100/60 opacity-85 hover:bg-gray-200/40 hover:opacity-100";
              titleClass = "text-gray-500 font-bold";
              periodClass = "text-gray-400 font-medium";
              chevronColor = "text-gray-400";
              badge = (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-500 uppercase tracking-tight">
                  Concluída
                </span>
              );
            } else {
              btnClass = "border-gray-200 bg-white hover:border-blue-400 hover:shadow-xs";
              titleClass = "text-gray-900 font-bold";
              periodClass = "text-gray-600 font-semibold";
              chevronColor = "text-gray-400";
            }

            return (
              <motion.div
                key={week.id}
                whileHover={{ scale: 1.015, translateY: -2 }}
                className={`text-left p-4 rounded-lg border flex flex-col justify-between min-h-28 transition-all ${btnClass}`}
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
                    <div className="mt-1.5">
                      <StatusBadge status={approvalStatus} />
                    </div>
                  </div>

                  <div className="flex justify-between items-center w-full mt-2 border-t border-gray-100/50 pt-2">
                    <span className={`text-xs ${periodClass}`}>{week.periodo}</span>
                    <ChevronRight size={16} className={chevronColor} />
                  </div>
                </button>

                {isGestor(usuario) &&
                  approvalStatus === "aguardando_aprovacao" &&
                  onOpenApproval && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenApproval(week.id);
                      }}
                      className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer"
                    >
                      <Link2 size={12} />
                      Abrir aprovação
                    </button>
                  )}
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
