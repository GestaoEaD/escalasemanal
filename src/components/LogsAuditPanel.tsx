import React, { useMemo, useState } from "react";
import {
  AuditOperacaoTipo,
  AuditOperation,
  AUDIT_OPERACAO_LABELS,
} from "../types";
import {
  auditOperationNumber,
  getDocumentoLabel,
  getOperacaoLabel,
} from "../utils/auditService";
import {
  Search,
  Calendar,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { exportAuditOperationsToExcel, exportAuditOperationsToPDF } from "../utils/exportUtils";
import { Usuario } from "../types";

interface LogsAuditPanelProps {
  logs: AuditOperation[];
  loading: boolean;
  onReload: () => void;
  usuario: Usuario;
}

export default function LogsAuditPanel({
  logs,
  loading,
  onReload,
  usuario,
}: LogsAuditPanelProps) {
  const [search, setSearch] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [filterDoc, setFilterDoc] = useState<string>("todos");
  const [filterSemana, setFilterSemana] = useState("");
  const [filterAno, setFilterAno] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const perPage = 20;

  const filtered = useMemo(() => {
    let list = [...logs];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((op) => {
        const blob = [
          op.id,
          op.usuario.nome,
          op.usuario.re,
          op.usuario.posto,
          op.usuario.perfil,
          getOperacaoLabel(op.tipo),
          op.tipo,
          getDocumentoLabel(op.escala),
          op.detalhes,
          op.motivo,
          op.statusAnterior,
          op.statusAtual,
          ...(op.alteracoes || []).flatMap((a) => [
            a.campo,
            a.antes,
            a.depois,
            a.colaborador,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }

    if (dateStart) {
      const start = new Date(dateStart);
      start.setHours(0, 0, 0, 0);
      list = list.filter((op) => {
        const d = op.timestamp?.toDate ? op.timestamp.toDate() : new Date(op.timestamp || 0);
        return d >= start;
      });
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      list = list.filter((op) => {
        const d = op.timestamp?.toDate ? op.timestamp.toDate() : new Date(op.timestamp || 0);
        return d <= end;
      });
    }

    if (filterUser.trim()) {
      const q = filterUser.toLowerCase();
      list = list.filter(
        (op) =>
          op.usuario.nome.toLowerCase().includes(q) ||
          op.usuario.re.toLowerCase().includes(q) ||
          `${op.usuario.posto} ${op.usuario.nome}`.toLowerCase().includes(q)
      );
    }

    if (filterTipo !== "todos") {
      list = list.filter((op) => op.tipo === filterTipo);
    }

    if (filterDoc === "SEMANAL") {
      list = list.filter((op) => op.escala === "SEMANAL");
    } else if (filterDoc === "ALTERACAO") {
      list = list.filter((op) => op.escala === "ALTERACAO");
    } else if (filterDoc === "CONFIGURACAO") {
      list = list.filter((op) => op.escala === "CONFIGURACAO");
    }

    if (filterSemana.trim()) {
      const n = Number(filterSemana);
      list = list.filter((op) => op.semana === n);
    }
    if (filterAno.trim()) {
      const n = Number(filterAno);
      list = list.filter((op) => op.ano === n);
    }

    return list;
  }, [
    logs,
    search,
    dateStart,
    dateEnd,
    filterUser,
    filterTipo,
    filterDoc,
    filterSemana,
    filterAno,
  ]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearFilters = () => {
    setSearch("");
    setDateStart("");
    setDateEnd("");
    setFilterUser("");
    setFilterTipo("todos");
    setFilterDoc("todos");
    setFilterSemana("");
    setFilterAno("");
    setPage(1);
  };

  const tipoOptions = Object.keys(AUDIT_OPERACAO_LABELS) as AuditOperacaoTipo[];

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 pb-4 border-b border-gray-150">
        <div>
          <h2 className="text-base font-bold text-gray-900">Registros de Auditoria</h2>
          <p className="text-xs text-gray-500">
            Uma linha por operação — expanda para ver as alterações internas.
          </p>
        </div>
        <div className="mt-3 md:mt-0 flex items-center space-x-2">
          <button
            onClick={onReload}
            disabled={loading}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-gray-150 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Atualizar</span>
          </button>
          <button
            onClick={() => exportAuditOperationsToExcel(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet size={13} />
            <span>Exportar Excel</span>
          </button>
          <button
            onClick={() =>
              exportAuditOperationsToPDF(filtered, {
                nome: usuario.nome,
                re: usuario.re,
                postoGrad: usuario.postoGrad,
              })
            }
            disabled={filtered.length === 0}
            className="inline-flex items-center space-x-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <FileText size={13} />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-250 rounded-xl p-4 mb-6">
        <h3 className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wider">
          Filtros
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              Pesquisa
            </label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Nome, RE, campo, operação..."
                className="w-full border border-gray-300 rounded-lg py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              Início
            </label>
            <div className="relative">
              <Calendar size={12} className="absolute left-2.5 top-2 text-gray-400" />
              <input
                type="date"
                value={dateStart}
                onChange={(e) => {
                  setDateStart(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              Fim
            </label>
            <div className="relative">
              <Calendar size={12} className="absolute left-2.5 top-2 text-gray-400" />
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => {
                  setDateEnd(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-gray-300 rounded-lg py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              Usuário
            </label>
            <input
              value={filterUser}
              onChange={(e) => {
                setFilterUser(e.target.value);
                setPage(1);
              }}
              placeholder="Nome ou RE"
              className="w-full border border-gray-300 rounded-lg py-1.5 px-3 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              Operação
            </label>
            <select
              value={filterTipo}
              onChange={(e) => {
                setFilterTipo(e.target.value);
                setPage(1);
              }}
              className="w-full border border-gray-300 rounded-lg py-1.5 px-2 text-xs"
            >
              <option value="todos">Todas</option>
              {tipoOptions.map((t) => (
                <option key={t} value={t}>
                  {AUDIT_OPERACAO_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              Documento
            </label>
            <select
              value={filterDoc}
              onChange={(e) => {
                setFilterDoc(e.target.value);
                setPage(1);
              }}
              className="w-full border border-gray-300 rounded-lg py-1.5 px-2 text-xs"
            >
              <option value="todos">Todos</option>
              <option value="SEMANAL">Escala Semanal</option>
              <option value="ALTERACAO">Escala Alteração</option>
              <option value="CONFIGURACAO">Configurações</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              Semana
            </label>
            <input
              value={filterSemana}
              onChange={(e) => {
                setFilterSemana(e.target.value);
                setPage(1);
              }}
              placeholder="Ex: 29"
              className="w-full border border-gray-300 rounded-lg py-1.5 px-3 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
              Ano
            </label>
            <input
              value={filterAno}
              onChange={(e) => {
                setFilterAno(e.target.value);
                setPage(1);
              }}
              placeholder="Ex: 2026"
              className="w-full border border-gray-300 rounded-lg py-1.5 px-3 text-xs"
            />
          </div>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold cursor-pointer"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-3 text-xs text-gray-500 font-semibold">Carregando auditoria...</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-2 py-2.5 w-8" />
                <th className="px-3 py-2.5">Data/Hora</th>
                <th className="px-3 py-2.5">Usuário</th>
                <th className="px-3 py-2.5">Operação</th>
                <th className="px-3 py-2.5">Documento</th>
                <th className="px-3 py-2.5">Semana</th>
                <th className="px-3 py-2.5 text-center">Alterações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400 italic">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                paged.map((op) => {
                  const isOpen = !!expanded[op.id];
                  const count = op.alteracoes?.length || 0;
                  const userLabel =
                    `${op.usuario.posto} ${op.usuario.nome}`.trim() || op.usuario.nome;
                  return (
                    <React.Fragment key={op.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggle(op.id)}
                      >
                        <td className="px-2 py-2.5 text-gray-400">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-gray-700">
                          {op.data} {op.hora}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-gray-900 whitespace-nowrap">
                          {userLabel}
                          <div className="text-[10px] font-mono text-gray-400 font-normal">
                            RE {op.usuario.re}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-gray-800 whitespace-nowrap">
                          {getOperacaoLabel(op.tipo)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                          {getDocumentoLabel(op.escala)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                          {op.semana != null ? op.semana : "-"}
                          {op.ano != null ? `/${op.ano}` : ""}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-gray-800">
                          {count > 0 ? count : "—"}
                        </td>
                      </tr>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={7} className="px-4 py-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="py-3 pl-6 border-l-2 border-blue-300 ml-2 my-2">
                                  <div className="text-[11px] font-semibold text-gray-700 mb-2">
                                    #{auditOperationNumber(op.id)} · {op.data} {op.hora} ·{" "}
                                    {userLabel} · {getOperacaoLabel(op.tipo)}
                                    {count > 0 ? ` · ${count} alterações` : ""}
                                  </div>
                                  {(op.statusAnterior || op.statusAtual || op.motivo) && (
                                    <p className="text-[11px] text-gray-600 mb-2">
                                      {op.statusAnterior && (
                                        <span>
                                          Status: {op.statusAnterior}
                                          {op.statusAtual ? ` → ${op.statusAtual}` : ""}
                                        </span>
                                      )}
                                      {op.motivo && (
                                        <span className="block mt-1">Motivo: {op.motivo}</span>
                                      )}
                                    </p>
                                  )}
                                  {count > 0 ? (
                                    <table className="w-full max-w-3xl text-[11px] border border-gray-200 rounded overflow-hidden bg-white">
                                      <thead className="bg-gray-100 text-gray-500 uppercase text-[9px]">
                                        <tr>
                                          <th className="px-2 py-1.5 text-left">Campo</th>
                                          <th className="px-2 py-1.5 text-left">Antes</th>
                                          <th className="px-2 py-1.5 text-left">Depois</th>
                                          <th className="px-2 py-1.5 text-left">Colaborador</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {op.alteracoes!.map((a, idx) => (
                                          <tr key={idx}>
                                            <td className="px-2 py-1.5 font-bold text-gray-800">
                                              {a.campo}
                                            </td>
                                            <td className="px-2 py-1.5 text-red-700/80 font-mono">
                                              {a.antes || "—"}
                                            </td>
                                            <td className="px-2 py-1.5 text-emerald-700 font-mono">
                                              {a.depois || "—"}
                                            </td>
                                            <td className="px-2 py-1.5 text-gray-600">
                                              {a.colaborador || "—"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p className="text-[11px] text-gray-500 italic">
                                      Operação sem alterações de campo
                                      {op.detalhes ? `: ${op.detalhes}` : "."}
                                    </p>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>

          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-gray-500">
              {filtered.length} operação(ões) · página {page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40 cursor-pointer"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40 cursor-pointer"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
