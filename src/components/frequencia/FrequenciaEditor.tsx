import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ControleFrequenciaDocument,
  ControleFrequenciaObservacao,
  FrequenciaCelula,
  MESES_NOMES,
  TipoEscalaDocumento,
  Usuario,
} from "../../types";
import {
  approveFrequencia,
  auditSyncFrequencia,
  cancelFrequenciaApproval,
  ensureAndSyncControleFrequencia,
  loadLegendas,
  reopenFrequencia,
  requestFrequenciaRevision,
  saveControleFrequencia,
  submitFrequenciaForApproval,
} from "../../utils/frequenciaService";
import { daysInMonth, dayKey } from "../../utils/frequenciaIds";
import { recalcAllRows, buildLegendaLookup, listValoresControleFrequencia } from "../../utils/frequenciaCalculo";
import {
  displayFrequenciaCelula,
  isWeekendDay,
  weekendCellClass,
} from "../../utils/frequenciaDisplay";
import { normalizeEscalaStatus } from "../../utils/approvalService";
import { getTokenApprovalUrl } from "../../utils/solicitacaoAprovacaoService";
import {
  canCancelApprovalRequest,
  canEditFrequencia,
  canReopenApprovedScale,
  canSubmitForApproval,
  isGestor,
} from "../../utils/permissions";
import { Legenda } from "../../types";
import StatusBadge from "../StatusBadge";
import {
  ArrowLeft,
  CheckCircle,
  Link2,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";

interface Props {
  usuario: Usuario;
  year: number;
  month: number;
  secao: string;
  onBack: () => void;
  onOpenApproval?: (escalaId: string, tipo?: TipoEscalaDocumento) => void;
}

function stampNow(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export default function FrequenciaEditor({
  usuario,
  year,
  month,
  secao,
  onBack,
  onOpenApproval,
}: Props) {
  const [docData, setDocData] = useState<ControleFrequenciaDocument | null>(null);
  const [legendas, setLegendas] = useState<Legenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [obsDraft, setObsDraft] = useState("");
  const [obsReDraft, setObsReDraft] = useState("");
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editingObsText, setEditingObsText] = useState("");
  const [revisaoMotivo, setRevisaoMotivo] = useState("");
  const [revisaoOpen, setRevisaoOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenMotivo, setReopenMotivo] = useState("");

  const nDays = daysInMonth(year, month);
  const dayKeys = useMemo(
    () => Array.from({ length: nDays }, (_, i) => dayKey(i + 1)),
    [nDays]
  );
  const weekendByKey = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (let d = 1; d <= nDays; d++) {
      map[dayKey(d)] = isWeekendDay(year, month, d);
    }
    return map;
  }, [year, month, nDays]);

  const status = normalizeEscalaStatus(docData?.status);
  const editable = canEditFrequencia(usuario, year, month, status);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [legs, result] = await Promise.all([
        loadLegendas(),
        ensureAndSyncControleFrequencia({
          ano: year,
          mes: month,
          secao,
          usuario,
          forceResync: false,
        }),
      ]);
      setLegendas(legs);
      let next = result.doc;
      if (result.synced) {
        next = {
          ...next,
          rows: recalcAllRows(next.rows, legs),
        };
        if (result.created) {
          next = await saveControleFrequencia(next, usuario);
          await auditSyncFrequencia(next, usuario);
          setSuccess("Controle criado e sincronizado com as escalas.");
        } else {
          setDirty(true);
        }
      }
      setDocData(next);
      setDirty(result.synced && !result.created);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao carregar controle.");
    } finally {
      setLoading(false);
    }
  }, [year, month, secao, usuario]);

  useEffect(() => {
    void load();
  }, [load]);

  const setCell = (re: string, key: string, valorRaw: string) => {
    if (!docData || !editable) return;
    // Permite vazio; não reconverte para hífen. Trim só remove espaços laterais.
    const valor = valorRaw.trim();
    setDocData((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((row) => {
        if (row.re !== re) return row;
        const prevCel = row.dias[key];
        const cel: FrequenciaCelula = {
          valor,
          origem: "edicao_manual",
          editadoManualmente: true,
          valorEscalaOriginal: prevCel?.valorEscalaOriginal,
        };
        return {
          ...row,
          dias: { ...row.dias, [key]: cel },
        };
      });
      return { ...prev, rows: recalcAllRows(rows, legendas) };
    });
    setDirty(true);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!docData || !editable) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveControleFrequencia(docData, usuario);
      setDocData(saved);
      setDirty(false);
      setSuccess("Controle de Frequência salvo.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!editable) return;
    if (
      !confirm(
        "Sincronizar novamente com as escalas? Células editadas manualmente serão preservadas. Continuar?"
      )
    ) {
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const result = await ensureAndSyncControleFrequencia({
        ano: year,
        mes: month,
        secao,
        usuario,
        forceResync: true,
      });
      let next = {
        ...result.doc,
        rows: recalcAllRows(result.doc.rows, legendas),
        observacoes: result.doc.observacoes,
      };
      if (docData) {
        const mergedRows = result.doc.rows.map((r) => {
          const local = docData.rows.find((x) => x.re === r.re);
          if (!local) return r;
          const dias = { ...r.dias };
          for (const [k, cel] of Object.entries(local.dias || {}) as [
            string,
            FrequenciaCelula,
          ][]) {
            if (cel.editadoManualmente) dias[k] = cel;
          }
          return { ...r, dias };
        });
        next = { ...next, rows: recalcAllRows(mergedRows, legendas) };
      }
      setDocData(next);
      setDirty(true);
      await auditSyncFrequencia(next, usuario);
      setSuccess("Sincronização concluída (edições manuais preservadas).");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async () => {
    if (!docData) return;
    if (dirty) {
      alert("Salve as alterações antes de enviar para aprovação.");
      return;
    }
    try {
      const { doc: next, url } = await submitFrequenciaForApproval(docData, usuario);
      setDocData(next);
      setSuccess(`Enviado para aprovação. Link: ${url}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao enviar.");
    }
  };

  const handleCancelSolic = async () => {
    if (!docData) return;
    try {
      const next = await cancelFrequenciaApproval(docData, usuario);
      setDocData(next);
      setSuccess("Solicitação cancelada.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao cancelar.");
    }
  };

  const handleApprove = async () => {
    if (!docData) return;
    try {
      const next = await approveFrequencia(docData, usuario);
      setDocData(next);
      setSuccess("Controle aprovado.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao aprovar.");
    }
  };

  const handleRevision = async () => {
    if (!docData || !revisaoMotivo.trim()) return;
    try {
      const next = await requestFrequenciaRevision(docData, usuario, revisaoMotivo.trim());
      setDocData(next);
      setRevisaoOpen(false);
      setRevisaoMotivo("");
      setSuccess("Revisão solicitada.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao solicitar revisão.");
    }
  };

  const handleReopen = async () => {
    if (!docData || !reopenMotivo.trim()) return;
    try {
      const next = await reopenFrequencia(docData, usuario, reopenMotivo.trim());
      setDocData(next);
      setReopenOpen(false);
      setReopenMotivo("");
      setSuccess("Controle reaberto para edição.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao reabrir.");
    }
  };

  const selectedObsColab = useMemo(() => {
    if (!docData || !obsReDraft) return null;
    return docData.rows.find((r) => r.re === obsReDraft) || null;
  }, [docData, obsReDraft]);

  const addObs = () => {
    if (!docData || !editable || !obsDraft.trim() || !obsReDraft) return;
    const colab = docData.rows.find((r) => r.re === obsReDraft);
    if (!colab) return;
    const obs: ControleFrequenciaObservacao = {
      id: `obs_manual_${Date.now()}`,
      texto: obsDraft.trim(),
      origem: "manual",
      re: colab.re,
      criadoPor: `${usuario.postoGrad} ${usuario.nome}`,
      criadoEm: stampNow(),
    };
    setDocData({ ...docData, observacoes: [...docData.observacoes, obs] });
    setObsDraft("");
    setObsReDraft("");
    setDirty(true);
  };

  const startEditObs = (o: ControleFrequenciaObservacao) => {
    setEditingObsId(o.id);
    setEditingObsText(o.texto);
  };

  const saveEditObs = (id: string) => {
    if (!docData || !editable) return;
    setDocData({
      ...docData,
      observacoes: docData.observacoes.map((o) =>
        o.id === id
          ? {
              ...o,
              texto: editingObsText,
              editadoPor: `${usuario.postoGrad} ${usuario.nome}`,
              editadoEm: stampNow(),
            }
          : o
      ),
    });
    setEditingObsId(null);
    setEditingObsText("");
    setDirty(true);
  };

  const deleteObs = (id: string) => {
    if (!docData || !editable) return;
    if (!confirm("Excluir esta observação?")) return;
    setDocData({
      ...docData,
      observacoes: docData.observacoes.map((o) =>
        o.id === id
          ? {
              ...o,
              excluido: true,
              editadoPor: `${usuario.postoGrad} ${usuario.nome}`,
              editadoEm: stampNow(),
            }
          : o
      ),
    });
    setDirty(true);
  };

  const resolveObsIdent = (o: ControleFrequenciaObservacao) => {
    const row = o.re ? docData?.rows.find((r) => r.re === o.re) : undefined;
    return {
      postoGrad: row?.postoGrad || "—",
      re: o.re || "—",
      nome: row?.nome || "—",
    };
  };

  const visibleObs = (docData?.observacoes || []).filter((o) => !o.excluido);
  const lookup = useMemo(() => buildLegendaLookup(legendas), [legendas]);
  const optionValues = useMemo(() => {
    const allowed = listValoresControleFrequencia(legendas);
    return ["", "-", ...allowed];
  }, [legendas]);

  const showSubmit =
    canSubmitForApproval(usuario) &&
    (status === "em_edicao" || status === "revisao_solicitada") &&
    !dirty &&
    !!docData?.lastSaved;
  const showCancel = canCancelApprovalRequest(usuario, status);
  const showReopen = canReopenApprovedScale(usuario, status);
  const showGestorActions =
    isGestor(usuario) && status === "aguardando_aprovacao";

  if (loading || !docData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">
          {loading ? "Carregando Controle de Frequência…" : "Documento indisponível."}
        </p>
      </div>
    );
  }

  const idSticky =
    "bg-white print:bg-white group-hover:bg-gray-50 print:group-hover:bg-white";
  const sepId = "border-r-2 border-r-gray-500";
  const sepTotais = "border-l-2 border-l-gray-500";
  // Sticky offsets alinhados aos min-width das colunas de identificação
  const stickyPosto = "sticky left-0 z-[1] print:static";
  const stickyRe = "sticky left-[4.75rem] z-[1] print:static";
  const stickyNome = "sticky left-[9rem] z-[1] print:static";
  const stickyPostoHead = "sticky left-0 z-20 bg-gray-100 print:static";
  const stickyReHead = "sticky left-[4.75rem] z-20 bg-gray-100 print:static";
  const stickyNomeHead = "sticky left-[9rem] z-20 bg-gray-100 print:static";

  return (
    <div className="min-h-screen bg-gray-50 pb-16 frequencia-print-root">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-xs print:static print:shadow-none">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 h-auto py-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer print:hidden"
          >
            <ArrowLeft size={15} />
            Seções
          </button>
          <div className="h-4 w-px bg-gray-200 print:hidden" />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-gray-900 truncate">
              Controle de Frequência — {secao}
            </h1>
            <p className="text-[11px] text-gray-500">
              {MESES_NOMES[month - 1]} / {year}
            </p>
          </div>
          <StatusBadge status={status} size="sm" />
          <div className="flex flex-wrap gap-1.5 print:hidden">
            {editable && (
              <>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !dirty}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md cursor-pointer ${
                    dirty
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  <Save size={13} />
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSync()}
                  disabled={syncing}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
                >
                  <RefreshCw size={13} />
                  {syncing ? "Sincronizando…" : "Sincronizar escalas"}
                </button>
              </>
            )}
            {showSubmit && (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md bg-amber-600 text-white hover:bg-amber-500 cursor-pointer"
              >
                <Send size={13} />
                Enviar para Aprovação
              </button>
            )}
            {showCancel && (
              <button
                type="button"
                onClick={() => void handleCancelSolic()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md border border-amber-200 bg-amber-50 text-amber-800 cursor-pointer"
              >
                <XCircle size={13} />
                Cancelar solicitação
              </button>
            )}
            {showCancel && docData.aprovacao?.solicitacaoId && (
              <button
                type="button"
                onClick={() => {
                  const url = getTokenApprovalUrl(docData.aprovacao!.solicitacaoId!);
                  void navigator.clipboard.writeText(url);
                  setSuccess("Link copiado.");
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md border border-amber-200 bg-amber-50 text-amber-700 cursor-pointer"
              >
                <Link2 size={13} />
                Link
              </button>
            )}
            {showGestorActions && (
              <>
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md bg-emerald-600 text-white cursor-pointer"
                >
                  <CheckCircle size={13} />
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => setRevisaoOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md bg-orange-600 text-white cursor-pointer"
                >
                  Solicitar Revisão
                </button>
                {onOpenApproval && docData.aprovacao?.solicitacaoId && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenApproval(docData.aprovacao!.solicitacaoId!, "frequencia")
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md bg-emerald-700 text-white cursor-pointer"
                  >
                    Abrir Aprovação
                  </button>
                )}
              </>
            )}
            {showReopen && (
              <button
                type="button"
                onClick={() => setReopenOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md bg-orange-600 text-white cursor-pointer"
              >
                <RotateCcw size={13} />
                Reabrir
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md border border-gray-300 bg-white text-gray-800 cursor-pointer"
            >
              <Printer size={13} />
              Imprimir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-3 sm:px-4 mt-4 space-y-4">
        {(error || success) && (
          <div
            className={`text-xs font-semibold rounded-lg px-3 py-2 print:hidden ${
              error
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200"
            }`}
          >
            {error || success}
          </div>
        )}

        <div className="hidden print:block text-center mb-2">
          <div className="text-[10px] font-bold uppercase tracking-wide">
            Polícia Militar do Estado de São Paulo
          </div>
          <div className="text-sm font-bold uppercase">Controle de Frequência</div>
          <div className="text-[11px]">
            OPM: {secao} · {MESES_NOMES[month - 1]}/{year}
          </div>
        </div>

        <div className="bg-white border border-gray-300 rounded-xl overflow-hidden shadow-xs print:shadow-none print:border-black print:rounded-none">
          <div className="overflow-x-auto table-scroll">
            <table className="frequencia-table border-collapse text-[11px] leading-tight min-w-max w-full">
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th
                    colSpan={3}
                    className={`px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-wider ${sepId}`}
                  >
                    Identificação
                  </th>
                  <th
                    colSpan={dayKeys.length}
                    className="px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-wider"
                  >
                    Frequência
                  </th>
                  <th
                    colSpan={2}
                    className={`px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-wider ${sepTotais}`}
                  >
                    Totais
                  </th>
                </tr>
                <tr className="bg-gray-100 text-gray-900 sticky top-0 z-10 print:static">
                  <th
                    className={`border border-gray-300 px-1.5 py-1 text-left font-bold whitespace-nowrap min-w-[4.75rem] ${stickyPostoHead}`}
                  >
                    POSTO/GRAD.
                  </th>
                  <th
                    className={`border border-gray-300 px-1.5 py-1 text-left font-bold whitespace-nowrap min-w-[4.25rem] ${stickyReHead}`}
                  >
                    RE
                  </th>
                  <th
                    className={`border border-gray-300 px-1.5 py-1 text-left font-bold whitespace-nowrap min-w-[7rem] ${stickyNomeHead} ${sepId}`}
                  >
                    NOME
                  </th>
                  {dayKeys.map((k) => (
                    <th
                      key={k}
                      className={`border border-gray-300 px-0 py-1 text-center font-bold min-w-[1.5rem] w-6 align-middle ${weekendCellClass(weekendByKey[k])}`}
                    >
                      {Number(k)}
                    </th>
                  ))}
                  <th
                    className={`border border-gray-300 px-1 py-1 text-center font-bold whitespace-nowrap min-w-[2.75rem] align-middle ${sepTotais}`}
                  >
                    1/2 DIÁRIA
                  </th>
                  <th className="border border-gray-300 px-1 py-1 text-center font-bold whitespace-nowrap min-w-[2.25rem] align-middle">
                    A.A.
                  </th>
                </tr>
              </thead>
              <tbody>
                {docData.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + dayKeys.length + 2}
                      className="border border-gray-200 px-3 py-4 text-center text-gray-400"
                    >
                      Nenhum colaborador ativo nesta seção. Sincronize ou verifique o cadastro.
                    </td>
                  </tr>
                ) : (
                  docData.rows.map((row) => (
                    <tr key={row.re} className="group hover:bg-gray-50/80 print:hover:bg-transparent">
                      <td
                        className={`border border-gray-200 px-1.5 py-0.5 text-left font-semibold whitespace-nowrap align-middle ${stickyPosto} ${idSticky}`}
                      >
                        {row.postoGrad}
                      </td>
                      <td
                        className={`border border-gray-200 px-1.5 py-0.5 text-left font-mono whitespace-nowrap align-middle ${stickyRe} ${idSticky}`}
                      >
                        {row.re}
                      </td>
                      <td
                        className={`border border-gray-200 px-1.5 py-0.5 text-left font-bold whitespace-nowrap align-middle ${stickyNome} ${idSticky} ${sepId}`}
                      >
                        {row.nome}
                      </td>
                      {dayKeys.map((k) => {
                        const cel = row.dias[k] || {
                          valor: "",
                          origem: "vazio" as const,
                          editadoManualmente: false,
                        };
                        const shown = displayFrequenciaCelula(cel);
                        const weekend = weekendByKey[k];
                        return (
                          <td
                            key={k}
                            className={`border border-gray-200 p-0 text-center align-middle ${weekendCellClass(weekend)}`}
                          >
                            {editable ? (
                              <input
                                value={shown}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  const wasEmptyNonManual =
                                    !cel.editadoManualmente && !String(cel.valor || "").trim();
                                  // Evita gravar o hífen visual como edição se o usuário só reexibiu "-"
                                  if (wasEmptyNonManual && next === "-") return;
                                  setCell(row.re, k, next);
                                }}
                                onFocus={(e) => {
                                  if (e.target.value === "-") e.target.select();
                                }}
                                list={`freq-opts-${row.re}`}
                                title={
                                  cel.editadoManualmente
                                    ? "Edição manual (preservada na sincronização)"
                                    : undefined
                                }
                                aria-label={`Dia ${Number(k)} — ${row.nome}`}
                                className={`w-full min-w-[1.35rem] h-6 px-0 text-center text-[11px] leading-none font-bold border border-transparent rounded-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-300 align-middle ${
                                  cel.editadoManualmente ? "text-blue-800 bg-blue-50/40" : "text-gray-900"
                                }`}
                              />
                            ) : (
                              <span
                                className={`inline-flex items-center justify-center w-full min-h-[1.5rem] font-bold leading-none ${
                                  cel.editadoManualmente ? "text-blue-800" : "text-gray-900"
                                }`}
                              >
                                {shown}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td
                        className={`border border-gray-200 px-1 py-0.5 text-center font-bold align-middle ${sepTotais}`}
                      >
                        {row.meiaDiaria}
                      </td>
                      <td className="border border-gray-200 px-1 py-0.5 text-center font-bold align-middle">
                        {row.aa}
                      </td>
                      <datalist id={`freq-opts-${row.re}`}>
                        {optionValues.map((v) => (
                          <option key={`${row.re}-${v || "empty"}`} value={v} />
                        ))}
                      </datalist>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Observações — tabela */}
        <section className="bg-white border border-gray-300 rounded-xl overflow-hidden shadow-xs print:shadow-none print:border-black print:rounded-none">
          <div className="px-3 py-1.5 border-b border-gray-200 bg-gray-50">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-800">
              Observações
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] leading-tight border-collapse min-w-[640px]">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-1.5 py-1 text-left font-bold whitespace-nowrap min-w-[4.75rem]">
                    POSTO/GRAD.
                  </th>
                  <th className="border border-gray-300 px-1.5 py-1 text-left font-bold whitespace-nowrap min-w-[4.25rem]">
                    RE
                  </th>
                  <th className="border border-gray-300 px-1.5 py-1 text-left font-bold min-w-[14rem]">
                    NOME / OBSERVAÇÃO
                  </th>
                  {editable && (
                    <th className="border border-gray-300 px-1 py-1 text-center font-bold w-20 print:hidden">
                      Ações
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleObs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={editable ? 4 : 3}
                      className="border border-gray-200 px-3 py-3 text-center text-gray-400"
                    >
                      Nenhuma observação.
                    </td>
                  </tr>
                ) : (
                  visibleObs.map((o) => {
                    const ident = resolveObsIdent(o);
                    return (
                      <tr key={o.id} className="hover:bg-gray-50/80 print:hover:bg-transparent">
                        <td className="border border-gray-200 px-1.5 py-1 text-left font-semibold align-middle whitespace-nowrap">
                          {ident.postoGrad}
                        </td>
                        <td className="border border-gray-200 px-1.5 py-1 text-left font-mono align-middle whitespace-nowrap">
                          {ident.re}
                        </td>
                        <td className="border border-gray-200 px-1.5 py-1 text-left align-middle">
                          {editingObsId === o.id ? (
                            <textarea
                              value={editingObsText}
                              onChange={(e) => setEditingObsText(e.target.value)}
                              className="w-full border border-gray-300 rounded-md p-1.5 text-xs min-h-[2.5rem] leading-snug"
                              rows={2}
                            />
                          ) : (
                            <div className="leading-snug">
                              <span className="font-bold text-gray-900">{ident.nome}</span>
                              <span className="text-gray-500"> — </span>
                              <span className="text-gray-800 whitespace-pre-wrap">{o.texto}</span>
                            </div>
                          )}
                        </td>
                        {editable && (
                          <td className="border border-gray-200 px-1 py-1 text-center align-middle print:hidden">
                            {editingObsId === o.id ? (
                              <div className="flex flex-col gap-0.5 items-center">
                                <button
                                  type="button"
                                  className="text-[10px] font-bold text-blue-700 cursor-pointer"
                                  onClick={() => saveEditObs(o.id)}
                                >
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  className="text-[10px] font-bold text-gray-500 cursor-pointer"
                                  onClick={() => {
                                    setEditingObsId(null);
                                    setEditingObsText("");
                                  }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-1.5 justify-center items-center">
                                <button
                                  type="button"
                                  className="text-[10px] font-bold text-blue-700 cursor-pointer"
                                  onClick={() => startEditObs(o)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="text-red-600 cursor-pointer"
                                  onClick={() => deleteObs(o.id)}
                                  aria-label="Excluir observação"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {editable && (
            <div className="border-t border-gray-200 px-2.5 py-2 print:hidden bg-gray-50/60">
              <div className="grid gap-1.5 sm:grid-cols-[minmax(6.5rem,8rem)_minmax(4.5rem,6rem)_minmax(6rem,9rem)_1fr_auto] items-end">
                <label className="block">
                  <span className="block text-[9px] font-bold text-gray-500 uppercase mb-0.5">
                    Selecionar RE
                  </span>
                  <select
                    value={obsReDraft}
                    onChange={(e) => setObsReDraft(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs bg-white cursor-pointer"
                  >
                    <option value="">—</option>
                    {docData.rows.map((r) => (
                      <option key={r.re} value={r.re}>
                        {r.re}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[9px] font-bold text-gray-500 uppercase mb-0.5">
                    Posto/Grad.
                  </span>
                  <input
                    readOnly
                    value={selectedObsColab?.postoGrad || ""}
                    placeholder="Automático"
                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs bg-gray-100 text-gray-700"
                  />
                </label>
                <label className="block">
                  <span className="block text-[9px] font-bold text-gray-500 uppercase mb-0.5">
                    Nome
                  </span>
                  <input
                    readOnly
                    value={selectedObsColab?.nome || ""}
                    placeholder="Automático"
                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs bg-gray-100 text-gray-700"
                  />
                </label>
                <label className="block">
                  <span className="block text-[9px] font-bold text-gray-500 uppercase mb-0.5">
                    Nova observação
                  </span>
                  <input
                    value={obsDraft}
                    onChange={(e) => setObsDraft(e.target.value)}
                    placeholder="Texto da observação…"
                    className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={addObs}
                  disabled={!obsReDraft || !obsDraft.trim()}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-bold bg-blue-600 text-white rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed h-[30px]"
                >
                  <Plus size={13} />
                  Adicionar
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="grid sm:grid-cols-2 gap-3 print:grid-cols-2">
          <div className="bg-white border border-gray-300 rounded-xl p-4 text-xs print:border-black print:rounded-none">
            <div className="font-bold uppercase text-gray-500 mb-2 tracking-wider">
              Responsável pela edição
            </div>
            {docData.responsavelEdicao ? (
              <>
                <div className="font-bold text-gray-900">
                  {docData.responsavelEdicao.postoGrad} {docData.responsavelEdicao.nome}
                </div>
                <div className="text-gray-600">RE {docData.responsavelEdicao.re}</div>
                <div className="text-gray-500">
                  {docData.responsavelEdicao.data} {docData.responsavelEdicao.hora}
                </div>
              </>
            ) : (
              <div className="text-gray-400">Ainda sem edição salva</div>
            )}
          </div>
          <div className="bg-white border border-gray-300 rounded-xl p-4 text-xs print:border-black print:rounded-none">
            <div className="font-bold uppercase text-gray-500 mb-2 tracking-wider">
              Responsável pela aprovação
            </div>
            {docData.responsavelAprovacao ? (
              <>
                <div className="font-bold text-gray-900">
                  {docData.responsavelAprovacao.postoGrad}{" "}
                  {docData.responsavelAprovacao.nome}
                </div>
                <div className="text-gray-600">RE {docData.responsavelAprovacao.re}</div>
                <div className="text-gray-500">
                  {docData.responsavelAprovacao.data} {docData.responsavelAprovacao.hora}
                </div>
              </>
            ) : (
              <div className="text-amber-700 font-semibold">Pendente de aprovação</div>
            )}
          </div>
        </section>

        {lookup.size === 0 && (
          <p className="text-[11px] text-gray-400 print:hidden">
            Dica: configure representações e regras nas Legendas para 1/2 Diária e A.A.
          </p>
        )}
      </main>

      {revisaoOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3">
            <h3 className="text-sm font-bold">Motivo da revisão</h3>
            <textarea
              value={revisaoMotivo}
              onChange={(e) => setRevisaoMotivo(e.target.value)}
              className="w-full border rounded-lg p-2 text-xs"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-bold bg-gray-100 rounded-lg cursor-pointer"
                onClick={() => setRevisaoOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-bold bg-orange-600 text-white rounded-lg cursor-pointer"
                onClick={() => void handleRevision()}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {reopenOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3">
            <h3 className="text-sm font-bold">Motivo da reabertura</h3>
            <textarea
              value={reopenMotivo}
              onChange={(e) => setReopenMotivo(e.target.value)}
              className="w-full border rounded-lg p-2 text-xs"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-bold bg-gray-100 rounded-lg cursor-pointer"
                onClick={() => setReopenOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-bold bg-orange-600 text-white rounded-lg cursor-pointer"
                onClick={() => void handleReopen()}
              >
                Reabrir
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 6mm; }
          body * { visibility: hidden; }
          .frequencia-print-root, .frequencia-print-root * { visibility: visible; }
          .frequencia-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .frequencia-table { font-size: 7px !important; line-height: 1.1 !important; }
          .frequencia-table th, .frequencia-table td { padding: 1px 2px !important; }
          .frequencia-table input {
            border: none !important;
            background: transparent !important;
            height: 12px !important;
            min-height: 0 !important;
            font-size: 7px !important;
          }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
