import React, { useEffect, useState } from "react";
import {
  Usuario,
  EscalaDocument,
  ControleFrequenciaDocument,
  ControleFrequenciaRow,
  ControleFrequenciaObservacao,
  ESCALA_STATUS_LABELS,
  ScheduleRow,
  TipoEscalaDocumento,
  TIPO_ESCALA_LABELS,
  MESES_NOMES,
} from "../types";
import { daysInMonth, dayKey } from "../utils/frequenciaIds";
import {
  getWeekDayColumnHeaders,
  getWeeksForYear,
  WeekDayKey,
} from "../utils/dateUtils";
import {
  displayFrequenciaCelula,
  isWeekendDay,
  weekendCellClass,
} from "../utils/frequenciaDisplay";
import {
  approveScale,
  getClosedApprovalMessage,
  getEscalaDocumentoLabel,
  getRevisaoInfo,
  isApprovalRequestOpen,
  loadEscalaDocumento,
  normalizeEscalaStatus,
  requestRevisionScale,
} from "../utils/approvalService";
import {
  evaluateSolicitacaoAccess,
  getSolicitacaoByToken,
  solicitacaoErrorMessage,
  tipoEscalaFromDocumento,
} from "../utils/solicitacaoAprovacaoService";
import { auditAbrirLinkAprovacao } from "../utils/auditService";
import { applyWeekendDefault } from "../utils/escalaPayload";
import { canApproveScales, confirmGestorRe } from "../utils/permissions";
import { normalizeRe } from "../utils/reUtils";
import {
  approveFrequencia,
  requestFrequenciaRevision,
} from "../utils/frequenciaService";
import { SolicitacaoAprovacao } from "../types";
import StatusBadge from "./StatusBadge";
import {
  CheckCircle,
  RotateCcw,
  ShieldAlert,
  ArrowLeft,
  AlertCircle,
  Lock,
} from "lucide-react";

interface AprovacaoPageProps {
  /** Token do link /aprovacao/{token} (preferencial). */
  token?: string | null;
  /** Legado: escalaId quando a URL antiga ainda é usada. */
  escalaId?: string | null;
  tipo?: TipoEscalaDocumento;
  usuario: Usuario;
  onBack: () => void;
  onLogout: () => void;
}

function ReadOnlyScheduleTable({
  title,
  rows,
  weekStart,
}: {
  title: string;
  rows: ScheduleRow[];
  weekStart?: Date | null;
}) {
  const rowsWithObs = rows.filter((row) => Boolean(row.observacao?.trim()));
  const dayHeaders = weekStart
    ? getWeekDayColumnHeaders(weekStart)
    : ([
        { key: "seg" as WeekDayKey, label: "SEG", dayOfMonth: 0 },
        { key: "ter" as WeekDayKey, label: "TER", dayOfMonth: 0 },
        { key: "qua" as WeekDayKey, label: "QUA", dayOfMonth: 0 },
        { key: "qui" as WeekDayKey, label: "QUI", dayOfMonth: 0 },
        { key: "sex" as WeekDayKey, label: "SEX", dayOfMonth: 0 },
        { key: "sab" as WeekDayKey, label: "SÁB", dayOfMonth: 0 },
        { key: "dom" as WeekDayKey, label: "DOM", dayOfMonth: 0 },
      ]);

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
              {dayHeaders.map((h) => (
                <th
                  key={h.key}
                  className="px-1 py-2 text-center font-bold text-[10px] leading-tight whitespace-nowrap"
                  title={h.label}
                >
                  {h.label}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-bold">Obs.</th>
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
              rows.map((row, idx) => {
                const hasObs = Boolean(row.observacao?.trim());
                return (
                  <tr key={row.re} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-2 py-1.5 font-bold text-gray-900">{row.postoGrad}</td>
                    <td className="px-2 py-1.5 font-mono text-gray-600">{row.re}</td>
                    <td className="px-2 py-1.5 font-semibold text-gray-800">{row.nome}</td>
                    {dayHeaders.map((h) => (
                      <td
                        key={h.key}
                        className={`px-1 py-1.5 text-center font-bold text-gray-700 ${
                          h.key === "sab" || h.key === "dom" ? "border-2 border-gray-400" : ""
                        }`}
                      >
                        {row[h.key]}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      {hasObs ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          Sim
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rowsWithObs.length > 0 && (
        <div className="border-t border-gray-200 px-4 py-3 space-y-2 bg-gray-50">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Observações por militar
          </div>
          {rowsWithObs.map((row) => (
            <div key={row.re} className="rounded-lg border border-gray-200 bg-white p-2.5">
              <div className="text-[11px] font-bold text-gray-900 mb-1">
                {`${row.postoGrad} ${row.re} ${row.nome}`.replace(/\s+/g, " ").trim()}
              </div>
              <div className="text-[11px] text-gray-700 whitespace-pre-wrap">{row.observacao}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReadOnlyFrequenciaTable({
  title,
  docData,
}: {
  title: string;
  docData: ControleFrequenciaDocument;
}) {
  const nDays = daysInMonth(docData.ano, docData.mes);
  const dayKeys = Array.from({ length: nDays }, (_, i) => dayKey(i + 1));
  const rows = (docData.rows || []) as ControleFrequenciaRow[];
  const observacoes = ((docData.observacoes || []) as ControleFrequenciaObservacao[]).filter(
    (o) => !o.excluido && o.texto?.trim()
  );
  const mesNome = MESES_NOMES[docData.mes - 1] || `Mês ${docData.mes}`;
  const sepId = "border-r-2 border-r-gray-500";
  const sepTotais = "border-l-2 border-l-gray-500";

  const resolveObsIdent = (o: ControleFrequenciaObservacao) => {
    const row = o.re ? rows.find((r) => r.re === o.re) : undefined;
    return {
      postoGrad: row?.postoGrad || "—",
      re: o.re || "—",
      nome: row?.nome || "—",
    };
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-700">
        {title} — {docData.secao} · {mesNome}/{docData.ano}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-[10px] border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th colSpan={3} className={`px-2 py-1.5 text-center font-bold uppercase ${sepId}`}>
                Identificação
              </th>
              <th colSpan={nDays} className="px-2 py-1.5 text-center font-bold uppercase">
                Frequência
              </th>
              <th colSpan={2} className={`px-2 py-1.5 text-center font-bold uppercase ${sepTotais}`}>
                Totais
              </th>
            </tr>
            <tr className="bg-gray-900 text-white">
              <th className="px-2 py-2 text-left font-bold">POSTO/GRAD.</th>
              <th className="px-2 py-2 text-left font-bold">RE</th>
              <th className={`px-2 py-2 text-left font-bold ${sepId}`}>NOME</th>
              {dayKeys.map((k) => {
                const weekend = isWeekendDay(docData.ano, docData.mes, Number(k));
                return (
                  <th
                    key={k}
                    className={`px-0.5 py-2 text-center font-bold tabular-nums min-w-[1.6rem] ${weekendCellClass(weekend)}`}
                  >
                    {Number(k)}
                  </th>
                );
              })}
              <th className={`px-1 py-2 text-center font-bold ${sepTotais}`}>1/2</th>
              <th className="px-1 py-2 text-center font-bold">A.A.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5 + nDays}
                  className="px-4 py-8 text-center text-gray-400 italic"
                >
                  Nenhum militar neste controle.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.re} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-2 py-1.5 font-bold text-gray-900 text-left align-middle">
                    {row.postoGrad}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-gray-600 text-left align-middle">
                    {row.re}
                  </td>
                  <td
                    className={`px-2 py-1.5 font-semibold text-gray-800 whitespace-nowrap text-left align-middle ${sepId}`}
                  >
                    {row.nome}
                  </td>
                  {dayKeys.map((k) => {
                    const weekend = isWeekendDay(docData.ano, docData.mes, Number(k));
                    const cel = row.dias?.[k];
                    return (
                      <td
                        key={k}
                        className={`px-0.5 py-1.5 text-center font-bold text-gray-700 align-middle ${weekendCellClass(weekend)}`}
                      >
                        {displayFrequenciaCelula(cel)}
                      </td>
                    );
                  })}
                  <td className={`px-1 py-1.5 text-center font-bold align-middle ${sepTotais}`}>
                    {row.meiaDiaria ?? 0}
                  </td>
                  <td className="px-1 py-1.5 text-center font-bold align-middle">
                    {row.aa ?? 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {observacoes.length > 0 && (
        <div className="border-t border-gray-200">
          <div className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50">
            Observações
          </div>
          <div className="overflow-x-auto">
            <table className="frequencia-obs-table w-full text-[11px] border-collapse">
              <colgroup>
                <col className="freq-id-posto" />
                <col className="freq-id-re" />
                <col className="freq-id-nome" />
                <col className="freq-obs-text" />
              </colgroup>
              <thead className="bg-gray-100">
                <tr>
                  <th className="freq-id-posto border border-gray-200 px-2 py-1.5 text-left font-bold">
                    Posto/Grad.
                  </th>
                  <th className="freq-id-re border border-gray-200 px-2 py-1.5 text-left font-bold">
                    RE
                  </th>
                  <th className="freq-id-nome border border-gray-200 px-2 py-1.5 text-left font-bold">
                    Nome
                  </th>
                  <th className="freq-obs-text border border-gray-200 px-2 py-1.5 text-left font-bold">
                    Observação
                  </th>
                </tr>
              </thead>
              <tbody>
                {observacoes.map((o) => {
                  const ident = resolveObsIdent(o);
                  return (
                    <tr key={o.id}>
                      <td className="freq-id-posto border border-gray-200 px-2 py-1.5 font-semibold truncate">
                        {ident.postoGrad}
                      </td>
                      <td className="freq-id-re border border-gray-200 px-2 py-1.5 font-mono">
                        {ident.re}
                      </td>
                      <td className="freq-id-nome border border-gray-200 px-2 py-1.5 font-bold truncate">
                        {ident.nome}
                      </td>
                      <td className="freq-obs-text border border-gray-200 px-2 py-1.5 whitespace-pre-wrap">
                        {o.texto}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AprovacaoPage({
  token,
  escalaId: legacyEscalaId,
  tipo: legacyTipo = "semanal",
  usuario,
  onBack,
  onLogout,
}: AprovacaoPageProps) {
  const [loading, setLoading] = useState(true);
  const [escala, setEscala] = useState<EscalaDocument | null>(null);
  const [escalaId, setEscalaId] = useState<string>(legacyEscalaId || "");
  const [tipo, setTipo] = useState<TipoEscalaDocumento>(legacyTipo);
  const [solicitacao, setSolicitacao] = useState<SolicitacaoAprovacao | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [consultaOnly, setConsultaOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirmMode, setConfirmMode] = useState<"approve" | "revisao" | null>(null);
  const [confirmRe, setConfirmRe] = useState("");
  const [observacao, setObservacao] = useState("");
  const [motivoRevisao, setMotivoRevisao] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const allowed = canApproveScales(usuario);
  const docLabel = getEscalaDocumentoLabel(tipo);
  const titleUpper =
    tipo === "alteracao"
      ? "APROVAÇÃO DA ESCALA ALTERAÇÃO"
      : tipo === "frequencia"
        ? "APROVAÇÃO DO CONTROLE DE FREQUÊNCIA"
        : "APROVAÇÃO DA ESCALA SEMANAL";

  const reload = async () => {
    setLoading(true);
    setError(null);
    setGateError(null);
    setConsultaOnly(false);
    try {
      let resolvedId = legacyEscalaId || "";
      let resolvedTipo: TipoEscalaDocumento = legacyTipo;
      let sol: SolicitacaoAprovacao | null = null;

      if (token) {
        sol = await getSolicitacaoByToken(token);
        const access = evaluateSolicitacaoAccess(sol);

        if (access.ok === false) {
          if (access.code === "INEXISTENTE") {
            setSolicitacao(null);
            setEscala(null);
            setGateError(solicitacaoErrorMessage("INEXISTENTE"));
            return;
          }
          if (!allowed) {
            setSolicitacao(access.sol || sol);
            setEscala(null);
            setGateError("Você não possui permissão para aprovar escalas.");
            return;
          }
          if (access.code === "EXPIRADA") {
            setSolicitacao(access.sol || sol);
            setEscala(null);
            setGateError(solicitacaoErrorMessage("EXPIRADA"));
            return;
          }
          // FINALIZADA → consulta
          sol = access.sol || sol;
          setConsultaOnly(true);
        }

        if (!sol) {
          setGateError(solicitacaoErrorMessage("INEXISTENTE"));
          return;
        }

        if (!allowed) {
          setSolicitacao(sol);
          setEscala(null);
          setGateError("Você não possui permissão para aprovar escalas.");
          return;
        }

        resolvedId = sol.escalaId;
        resolvedTipo = tipoEscalaFromDocumento(sol.tipoDocumento);
        setSolicitacao(sol);
        setEscalaId(resolvedId);
        setTipo(resolvedTipo);

        void auditAbrirLinkAprovacao({
          usuario,
          tipoDoc: resolvedTipo,
          anoSemana: resolvedId,
          versao: sol.versao,
          solicitacaoId: token,
          detalhes: access.ok
            ? "Abertura do link (solicitação ativa)"
            : `Abertura em consulta · ${sol.resultado || "FINALIZADA"}`,
        }).catch((err) => console.warn("Falha ao auditar abertura do link:", err));
      } else if (resolvedId) {
        if (!allowed) {
          setGateError("Você não possui permissão para aprovar escalas.");
          return;
        }
        setEscalaId(resolvedId);
        setTipo(resolvedTipo);
      } else {
        setGateError("Solicitação inexistente.");
        return;
      }

      const docData = await loadEscalaDocumento(resolvedId, resolvedTipo);
      if (!docData) {
        setEscala(null);
        setError(`${getEscalaDocumentoLabel(resolvedTipo)} não encontrada.`);
      } else {
        setEscala(docData);
        if (!isApprovalRequestOpen(docData)) {
          setConsultaOnly(true);
        }
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar a solicitação de aprovação.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, legacyEscalaId, legacyTipo, usuario.re]);

  const status = normalizeEscalaStatus(escala?.status);
  const requestOpen = isApprovalRequestOpen(escala) && !consultaOnly;
  const canAct = allowed && requestOpen && !busy;
  const semanaLabel = escala
    ? tipo === "frequencia"
      ? `${(escala as any).secao || ""} · ${String((escala as any).mes || "").padStart(2, "0")}/${escala.ano}`
      : `Semana ${String(escala.semana).padStart(2, "0")}/${escala.ano}`
    : escalaId;
  const revisaoInfo = getRevisaoInfo(escala?.aprovacao);

  const resultadoLabel =
    solicitacao?.resultado === "APROVADA"
      ? "APROVADA"
      : solicitacao?.resultado === "REVISAO_SOLICITADA"
        ? "REVISÃO SOLICITADA"
        : solicitacao?.resultado === "CANCELADA"
          ? "CANCELADA"
          : ESCALA_STATUS_LABELS[status]?.toUpperCase() || status;

  const openConfirm = (mode: "approve" | "revisao") => {
    if (!requestOpen) {
      setError(getClosedApprovalMessage(status, tipo));
      return;
    }
    setConfirmMode(mode);
    setConfirmRe("");
    setObservacao("");
    setMotivoRevisao("");
    setConfirmError(null);
  };

  const closeConfirm = () => {
    setConfirmMode(null);
    setConfirmRe("");
    setObservacao("");
    setMotivoRevisao("");
    setConfirmError(null);
  };

  const handleConfirm = async () => {
    if (!confirmMode || !escalaId) return;
    setConfirmError(null);

    if (!confirmGestorRe(usuario, confirmRe)) {
      setConfirmError(
        "O R.E. informado não corresponde ao usuário autenticado. Digite novamente seu R.E. (sem o dígito)."
      );
      return;
    }

    if (confirmMode === "revisao" && !motivoRevisao.trim()) {
      setConfirmError("Informe o motivo da revisão.");
      return;
    }

    setBusy(true);
    try {
      const fresh = await loadEscalaDocumento(escalaId, tipo);
      if (!isApprovalRequestOpen(fresh)) {
        throw new Error(
          getClosedApprovalMessage(normalizeEscalaStatus(fresh?.status), tipo)
        );
      }

      if (confirmMode === "approve") {
        if (tipo === "frequencia") {
          const freq = fresh as unknown as ControleFrequenciaDocument;
          await approveFrequencia(freq, usuario, observacao.trim());
        } else {
          await approveScale(escalaId, usuario, observacao.trim(), tipo);
        }
        setSuccess(`${docLabel} aprovada com sucesso.`);
      } else {
        if (tipo === "frequencia") {
          const freq = fresh as unknown as ControleFrequenciaDocument;
          await requestFrequenciaRevision(freq, usuario, motivoRevisao.trim());
        } else {
          await requestRevisionScale(escalaId, usuario, motivoRevisao.trim(), tipo);
        }
        setSuccess(`Revisão solicitada. A ${docLabel} foi devolvida para correção.`);
      }
      closeConfirm();
      await reload();
    } catch (e: any) {
      setConfirmError(e?.message || "Falha ao processar a ação.");
    } finally {
      setBusy(false);
    }
  };

  if (gateError && !loading) {
    const isPerm = gateError.includes("permissão");
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl shadow-sm max-w-md w-full p-8 text-center">
          <ShieldAlert className="mx-auto text-red-500 mb-4" size={40} />
          <h1 className="text-lg font-bold text-gray-900 mb-2">
            {isPerm ? "Acesso negado" : "Solicitação"}
          </h1>
          <p className="text-sm text-gray-600 mb-6 whitespace-pre-line">{gateError}</p>
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

  if (!allowed && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl shadow-sm max-w-md w-full p-8 text-center">
          <ShieldAlert className="mx-auto text-red-500 mb-4" size={40} />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Acesso negado</h1>
          <p className="text-sm text-gray-600 mb-6">
            Você não possui permissão para aprovar escalas.
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
    <div className="flex-1 bg-gray-50 pb-16">
      <header className="bg-[#111827] text-white border-b border-gray-800 sticky top-14 z-20">
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
                {titleUpper}
              </h1>
              <p className="text-[11px] text-gray-400 truncate">
                {semanaLabel}
                {escala?.periodo ? ` · ${escala.periodo}` : ""} · Gestor {usuario.postoGrad}{" "}
                {usuario.nome} · RE {normalizeRe(usuario.re)}
              </p>
            </div>
          </div>
          {escala && <StatusBadge status={status} size="md" />}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-6 space-y-4">
        {loading && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-sm text-gray-500">
            Carregando {docLabel.toLowerCase()}...
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

        {escala && !loading && (
          <div className="bg-blue-50 border border-blue-200 text-blue-950 rounded-lg p-4 text-sm font-semibold">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">
              Documento em análise
            </div>
            <div className="text-base font-extrabold uppercase tracking-wide">
              {TIPO_ESCALA_LABELS[tipo]}
            </div>
            <p className="text-xs font-medium text-blue-800 mt-1">
              {semanaLabel} — somente este documento será aprovado ou devolvido para revisão
              nesta tela.
            </p>
          </div>
        )}

        {escala && !loading && consultaOnly && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 flex items-start gap-2 text-sm font-semibold">
            <Lock className="shrink-0 mt-0.5 text-amber-600" size={18} />
            <div>
              <div>Esta solicitação já foi finalizada.</div>
              <p className="text-xs font-medium text-amber-800 mt-1">
                Status: <b>{resultadoLabel}</b>. O link permanece disponível apenas para consulta.
              </p>
              {status === "revisao_solicitada" && revisaoInfo.motivo && (
                <p className="text-xs font-medium text-orange-800 mt-2 whitespace-pre-wrap">
                  Motivo: {revisaoInfo.motivo}
                </p>
              )}
            </div>
          </div>
        )}

        {escala && !loading && !requestOpen && !consultaOnly && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 flex items-start gap-2 text-sm font-semibold">
            <Lock className="shrink-0 mt-0.5 text-amber-600" size={18} />
            <div>
              <div>{getClosedApprovalMessage(status, tipo)}</div>
              <p className="text-xs font-medium text-amber-800 mt-1">
                Status atual: {ESCALA_STATUS_LABELS[status]}. Nenhuma nova ação pode ser realizada
                por este link.
              </p>
              {status === "revisao_solicitada" && revisaoInfo.motivo && (
                <p className="text-xs font-medium text-orange-800 mt-2 whitespace-pre-wrap">
                  Motivo: {revisaoInfo.motivo}
                </p>
              )}
            </div>
          </div>
        )}

        {escala && !loading && (
          <>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{docLabel}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {semanaLabel}
                    {escala.periodo ? ` · ${escala.periodo}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>
                    Versão <b className="text-gray-800">v{escala.versao || 1}</b>
                  </div>
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
                  </div>
                )}

                {revisaoInfo.por && (
                  <div className="bg-orange-50 rounded-lg p-3 border border-orange-200 sm:col-span-2">
                    <div className="text-[10px] font-bold text-orange-800 uppercase mb-1">
                      Revisão solicitada por
                    </div>
                    <div className="font-semibold text-orange-950">
                      {revisaoInfo.por.postoGrad} {revisaoInfo.por.nome} (RE{" "}
                      {normalizeRe(revisaoInfo.por.re)}) · {revisaoInfo.por.data} às{" "}
                      {revisaoInfo.por.hora}
                    </div>
                    {revisaoInfo.motivo && (
                      <p className="mt-1 text-orange-900 whitespace-pre-wrap">
                        Motivo: {revisaoInfo.motivo}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Lock size={12} />
                Visualização somente leitura — {docLabel}
              </div>
              {tipo === "frequencia" ? (
                <ReadOnlyFrequenciaTable
                  title={docLabel}
                  docData={escala as unknown as ControleFrequenciaDocument}
                />
              ) : (
                <ReadOnlyScheduleTable
                  title={docLabel}
                  rows={(escala.rows || []).map(applyWeekendDefault)}
                  weekStart={
                    getWeeksForYear(escala.ano).find((w) => w.numero === escala.semana)
                      ?.startDate ?? null
                  }
                />
              )}
            </div>

            {requestOpen ? (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-wrap gap-3 justify-end">
                <button
                  disabled={!canAct}
                  onClick={() => openConfirm("revisao")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-orange-900 bg-orange-50 border border-orange-300 hover:bg-orange-100 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Solicitar Revisão
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

      {confirmMode === "approve" && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden border border-gray-200">
            <div className="bg-gray-900 text-white px-5 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Confirmar Aprovação — {docLabel}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-600">
                Você está homologando exclusivamente a <b>{docLabel}</b> ({semanaLabel}). Digite
                novamente seu R.E. (sem o dígito) para confirmar.
              </p>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                  Digite novamente seu RE
                </label>
                <input
                  type="text"
                  value={confirmRe}
                  onChange={(e) => setConfirmRe(e.target.value)}
                  placeholder="Ex: 999888"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                  Observações da aprovação (opcional)
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {confirmError && (
                <p className="text-xs font-semibold text-red-600">{confirmError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeConfirm}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md cursor-pointer disabled:opacity-50"
                >
                  {busy ? "Processando..." : "Confirmar aprovação"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmMode === "revisao" && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200">
            <div className="bg-gray-900 text-white px-5 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wider">Solicitar Revisão</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Você está devolvendo este documento (<b>{docLabel}</b> — {semanaLabel}) para
                correção.
              </p>
              <p className="text-xs text-gray-600">
                Informe o motivo da revisão. Esse motivo ficará registrado no histórico da escala.
              </p>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                  Digite novamente seu RE
                </label>
                <input
                  type="text"
                  value={confirmRe}
                  onChange={(e) => setConfirmRe(e.target.value)}
                  placeholder="Ex: 999888"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
              </div>
              <div>
                <label
                  htmlFor="motivo-revisao"
                  className="block text-[10px] font-bold text-orange-700 uppercase mb-1"
                >
                  Motivo da revisão *
                </label>
                <textarea
                  id="motivo-revisao"
                  value={motivoRevisao}
                  onChange={(e) => {
                    setMotivoRevisao(e.target.value);
                    if (confirmError) setConfirmError(null);
                  }}
                  rows={4}
                  placeholder="Descreva o que precisa ser corrigido..."
                  className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>
              {confirmError && (
                <p className="text-xs font-semibold text-red-600">{confirmError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeConfirm}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={busy || !motivoRevisao.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-md cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  {busy ? "Enviando..." : "Solicitar Revisão"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
