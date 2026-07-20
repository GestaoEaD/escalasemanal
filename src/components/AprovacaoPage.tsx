import React, { useEffect, useState } from "react";
import {
  Usuario,
  EscalaDocument,
  ESCALA_STATUS_LABELS,
  ScheduleRow,
} from "../types";
import {
  approveScale,
  getClosedApprovalMessage,
  isApprovalRequestOpen,
  loadAlterationEscala,
  loadWeeklyEscala,
  normalizeEscalaStatus,
  rejectScale,
} from "../utils/approvalService";
import { canApproveScales, confirmGestorRe } from "../utils/permissions";
import { normalizeRe } from "../utils/reUtils";
import StatusBadge from "./StatusBadge";
import {
  CheckCircle,
  XCircle,
  ShieldAlert,
  ArrowLeft,
  AlertCircle,
  Lock,
} from "lucide-react";

interface AprovacaoPageProps {
  escalaId: string;
  usuario: Usuario;
  onBack: () => void;
  onLogout: () => void;
}

function ReadOnlyScheduleTable({
  title,
  rows,
}: {
  title: string;
  rows: ScheduleRow[];
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-700">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[11px]">
          <thead className="bg-gray-900 text-white">
            <tr>
              <th className="px-2 py-2 text-left font-bold">Posto</th>
              <th className="px-2 py-2 text-left font-bold">R.E.</th>
              <th className="px-2 py-2 text-left font-bold">Nome</th>
              <th className="px-1 py-2 text-center font-bold">Seg</th>
              <th className="px-1 py-2 text-center font-bold">Ter</th>
              <th className="px-1 py-2 text-center font-bold">Qua</th>
              <th className="px-1 py-2 text-center font-bold">Qui</th>
              <th className="px-1 py-2 text-center font-bold">Sex</th>
              <th className="px-1 py-2 text-center font-bold">Sáb</th>
              <th className="px-1 py-2 text-center font-bold">Dom</th>
              <th className="px-2 py-2 text-left font-bold">Obs.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400 italic">
                  Nenhum colaborador nesta escala.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.re} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-2 py-1.5 font-bold text-gray-900">{row.postoGrad}</td>
                  <td className="px-2 py-1.5 font-mono text-gray-600">{row.re}</td>
                  <td className="px-2 py-1.5 font-semibold text-gray-800">{row.nome}</td>
                  {(["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const).map((d) => (
                    <td key={d} className="px-1 py-1.5 text-center font-bold text-gray-700">
                      {row[d]}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-gray-500">{row.observacao || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AprovacaoPage({
  escalaId,
  usuario,
  onBack,
  onLogout,
}: AprovacaoPageProps) {
  const [loading, setLoading] = useState(true);
  const [escala, setEscala] = useState<EscalaDocument | null>(null);
  const [alteracao, setAlteracao] = useState<EscalaDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirmMode, setConfirmMode] = useState<"approve" | "reject" | null>(null);
  const [confirmRe, setConfirmRe] = useState("");
  const [observacao, setObservacao] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const allowed = canApproveScales(usuario);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [weekly, alt] = await Promise.all([
        loadWeeklyEscala(escalaId),
        loadAlterationEscala(escalaId),
      ]);
      if (!weekly) {
        setEscala(null);
        setAlteracao(null);
        setError("Escala não encontrada.");
      } else {
        setEscala(weekly);
        setAlteracao(alt);
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar a escala.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [escalaId]);

  const status = normalizeEscalaStatus(escala?.status);
  const requestOpen = isApprovalRequestOpen(escala);
  const canAct = allowed && requestOpen && !busy;

  const openConfirm = (mode: "approve" | "reject") => {
    if (!requestOpen) {
      setError(getClosedApprovalMessage(status));
      return;
    }
    setConfirmMode(mode);
    setConfirmRe("");
    setObservacao("");
    setConfirmError(null);
  };

  const closeConfirm = () => {
    setConfirmMode(null);
    setConfirmRe("");
    setObservacao("");
    setConfirmError(null);
  };

  const handleConfirm = async () => {
    if (!confirmMode) return;
    setConfirmError(null);

    if (!confirmGestorRe(usuario, confirmRe)) {
      setConfirmError(
        "O R.E. informado não corresponde ao usuário autenticado. Digite novamente seu R.E. (sem o dígito)."
      );
      return;
    }

    setBusy(true);
    try {
      // Revalida no servidor (status pode ter mudado)
      const fresh = await loadWeeklyEscala(escalaId);
      if (!isApprovalRequestOpen(fresh)) {
        throw new Error(getClosedApprovalMessage(normalizeEscalaStatus(fresh?.status)));
      }

      if (confirmMode === "approve") {
        await approveScale(escalaId, usuario, observacao.trim());
        setSuccess("Escala aprovada com sucesso.");
      } else {
        await rejectScale(escalaId, usuario, observacao.trim());
        setSuccess("Escala rejeitada.");
      }
      closeConfirm();
      await reload();
    } catch (e: any) {
      setConfirmError(e?.message || "Falha ao processar a ação.");
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl shadow-sm max-w-md w-full p-8 text-center">
          <ShieldAlert className="mx-auto text-red-500 mb-4" size={40} />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Acesso negado</h1>
          <p className="text-sm text-gray-600 mb-6">
            Você não possui permissão para aprovar esta escala.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onBack}
              className="px-4 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
            >
              Voltar
            </button>
            <button
              onClick={onLogout}
              className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <header className="bg-[#111827] text-white border-b border-gray-800 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-bold uppercase tracking-wider truncate">
                {escala
                  ? `Semana ${String(escala.semana).padStart(2, "0")} · ${escala.ano}`
                  : "Aprovação de Escala"}
              </h1>
              <p className="text-[11px] text-gray-400 truncate">
                {escala?.periodo || escalaId} · Gestor {usuario.postoGrad} {usuario.nome} · RE{" "}
                {normalizeRe(usuario.re)}
              </p>
            </div>
          </div>
          {escala && <StatusBadge status={status} size="md" />}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-6 space-y-4">
        {loading && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-500">
            Carregando escala...
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 flex items-center gap-2 text-sm font-semibold">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle size={18} />
            {success}
          </div>
        )}

        {escala && !loading && !requestOpen && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 flex items-start gap-2 text-sm font-semibold">
            <Lock className="shrink-0 mt-0.5 text-amber-600" size={18} />
            <div>
              <div>{getClosedApprovalMessage(status)}</div>
              <p className="text-xs font-medium text-amber-800 mt-1">
                Status atual: {ESCALA_STATUS_LABELS[status]}. Nenhuma nova ação pode ser realizada por este link.
              </p>
            </div>
          </div>
        )}

        {escala && !loading && (
          <>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    Semana {String(escala.semana).padStart(2, "0")} · Ano {escala.ano}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">Período: {escala.periodo}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>
                    Versão <b className="text-gray-800">v{escala.versao || 1}</b>
                  </div>
                  {escala.aprovacao?.solicitacaoId && (
                    <div className="font-mono text-[10px] mt-0.5 max-w-[220px] truncate" title={escala.aprovacao.solicitacaoId}>
                      ID: {escala.aprovacao.solicitacaoId}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 py-4 grid sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 sm:col-span-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                    Enviado para aprovação por
                  </div>
                  {escala.aprovacao?.enviadoPor ? (
                    <div className="font-semibold text-gray-800">
                      {escala.aprovacao.enviadoPor.postoGrad} {escala.aprovacao.enviadoPor.nome}{" "}
                      (RE {normalizeRe(escala.aprovacao.enviadoPor.re)})
                      <span className="text-gray-500 font-normal">
                        {" "}
                        · {escala.aprovacao.enviadoPor.data} às {escala.aprovacao.enviadoPor.hora}
                      </span>
                    </div>
                  ) : (
                    <div className="text-gray-400 italic">Não informado</div>
                  )}
                </div>

                {escala.aprovacao?.aprovadoPor && (
                  <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100 sm:col-span-2">
                    <div className="text-[10px] font-bold text-emerald-700 uppercase mb-1">
                      Aprovado por
                    </div>
                    <div className="font-semibold text-emerald-900">
                      {escala.aprovacao.aprovadoPor.postoGrad} {escala.aprovacao.aprovadoPor.nome}{" "}
                      (RE {normalizeRe(escala.aprovacao.aprovadoPor.re)}) ·{" "}
                      {escala.aprovacao.aprovadoPor.data} às {escala.aprovacao.aprovadoPor.hora}
                    </div>
                    {escala.aprovacao.observacaoAprovacao && (
                      <p className="mt-1 text-emerald-800">
                        Observação: {escala.aprovacao.observacaoAprovacao}
                      </p>
                    )}
                  </div>
                )}

                {escala.aprovacao?.rejeitadoPor && (
                  <div className="bg-red-50 rounded-lg p-3 border border-red-100 sm:col-span-2">
                    <div className="text-[10px] font-bold text-red-700 uppercase mb-1">
                      Rejeitado por
                    </div>
                    <div className="font-semibold text-red-900">
                      {escala.aprovacao.rejeitadoPor.postoGrad} {escala.aprovacao.rejeitadoPor.nome}{" "}
                      (RE {normalizeRe(escala.aprovacao.rejeitadoPor.re)}) ·{" "}
                      {escala.aprovacao.rejeitadoPor.data} às {escala.aprovacao.rejeitadoPor.hora}
                    </div>
                    {escala.aprovacao.motivoRejeicao && (
                      <p className="mt-1 text-red-700">Motivo: {escala.aprovacao.motivoRejeicao}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Lock size={12} />
                Visualização somente leitura
              </div>
              <ReadOnlyScheduleTable title="1. Escala Semanal" rows={escala.rows || []} />
              {escala.observacoes && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-700">
                  <div className="font-bold text-gray-500 uppercase text-[10px] mb-1">
                    Observações da Escala Semanal
                  </div>
                  <div className="whitespace-pre-wrap">{escala.observacoes}</div>
                </div>
              )}
              <ReadOnlyScheduleTable
                title="2. Escala Alteração"
                rows={alteracao?.rows || []}
              />
              {alteracao?.observacoes && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-700">
                  <div className="font-bold text-gray-500 uppercase text-[10px] mb-1">
                    Observações da Escala Alteração
                  </div>
                  <div className="whitespace-pre-wrap">{alteracao.observacoes}</div>
                </div>
              )}
            </div>

            {requestOpen ? (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-wrap gap-3 justify-end">
                <button
                  disabled={!canAct}
                  onClick={() => openConfirm("reject")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <XCircle size={14} />
                  Rejeitar
                </button>
                <button
                  disabled={!canAct}
                  onClick={() => openConfirm("approve")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                  Aprovar
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>

      {confirmMode && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden border border-gray-200">
            <div className="bg-gray-900 text-white px-5 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wider">
                {confirmMode === "approve" ? "Confirmar Aprovação" : "Confirmar Rejeição"}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-600">
                Digite novamente seu R.E. (sem o dígito) para confirmar a ação.
              </p>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                  Digite novamente seu RE
                </label>
                <input
                  type="text"
                  value={confirmRe}
                  onChange={(e) => setConfirmRe(e.target.value)}
                  placeholder="Ex: 104585"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                  Observações da {confirmMode === "approve" ? "aprovação" : "rejeição"} (opcional)
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {confirmError && (
                <p className="text-xs text-red-600 font-semibold">{confirmError}</p>
              )}
            </div>
            <div className="bg-gray-50 px-5 py-3 flex justify-end gap-2 border-t border-gray-100">
              <button
                onClick={closeConfirm}
                disabled={busy}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={busy || !confirmRe.trim()}
                className={`px-4 py-2 text-xs font-bold text-white rounded-lg cursor-pointer disabled:opacity-50 ${
                  confirmMode === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-red-600 hover:bg-red-500"
                }`}
              >
                {busy
                  ? "Processando..."
                  : confirmMode === "approve"
                    ? "Aprovar"
                    : "Rejeitar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
