import React, { useMemo, useState } from "react";
import { Usuario } from "../types";
import {
  buildAllTestCases,
  runTestCases,
  summarizeAsMarkdown,
} from "../utils/testCenter";
import { COMMAND_INVENTORY } from "../utils/testCenter/inventory";
import { TestResult, TestSuiteSummary } from "../utils/testCenter/types";
import {
  Play,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
  FileText,
  Download,
} from "lucide-react";

interface CentralTestesProps {
  usuario: Usuario;
}

function statusLabel(status: TestResult["status"]) {
  if (status === "PASSOU") return "OK";
  if (status === "FALHOU") return "ERRO";
  if (status === "NAO_EXECUTADO") return "NÃO EXECUTADO";
  return "BLOQUEADO POR PERMISSÃO";
}

function statusBadge(status: TestResult["status"]) {
  const map: Record<TestResult["status"], string> = {
    PASSOU: "bg-emerald-50 text-emerald-800 border-emerald-200",
    FALHOU: "bg-red-50 text-red-800 border-red-200",
    NAO_EXECUTADO: "bg-gray-50 text-gray-600 border-gray-200",
    BLOQUEADO_POR_PERMISSAO: "bg-amber-50 text-amber-900 border-amber-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${map[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

export default function CentralTestes({ usuario }: CentralTestesProps) {
  const [allowWrite, setAllowWrite] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<TestSuiteSummary | null>(null);
  const [filter, setFilter] = useState<"TODOS" | TestResult["status"]>("TODOS");
  const [showInventory, setShowInventory] = useState(false);

  const cases = useMemo(
    () =>
      buildAllTestCases({
        currentUser: usuario,
        allowFirestoreWriteTests: allowWrite,
      }),
    [usuario, allowWrite]
  );

  const filtered = useMemo(() => {
    if (!summary) return [];
    if (filter === "TODOS") return summary.resultados;
    return summary.resultados.filter((r) => r.status === filter);
  }, [summary, filter]);

  const handleRun = async () => {
    setRunning(true);
    setSummary(null);
    setProgress({ done: 0, total: cases.length });
    try {
      const result = await runTestCases(cases, (done, total) => {
        setProgress({ done, total });
      });
      setSummary(result);
    } finally {
      setRunning(false);
    }
  };

  const handleDownloadReport = () => {
    if (!summary) return;
    const md = summarizeAsMarkdown(summary);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-central-testes-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Central de Testes</h2>
          <p className="text-xs text-gray-500 max-w-2xl">
            Executa verificações funcionais seguras (permissões, sanitização, autenticação,
            aprovação, exportação e inventário). Não altera semanas reais.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowInventory((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <FileText size={14} />
            Inventário
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer disabled:opacity-50"
          >
            <Play size={14} />
            {running ? `Executando ${progress.done}/${progress.total}` : "Executar testes"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 flex items-start gap-2">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <div className="space-y-1">
          <label className="inline-flex items-center gap-2 cursor-pointer font-semibold">
            <input
              type="checkbox"
              checked={allowWrite}
              onChange={(e) => setAllowWrite(e.target.checked)}
              className="rounded border-amber-400"
            />
            Permitir escrita controlada em documento{" "}
            <code className="font-mono">configuracoes/central_testes_probe</code>
          </label>
          <p className="text-[11px] text-amber-900/80">
            Mesmo habilitado, o probe é criado e apagado imediatamente. Semanas reais nunca são
            usadas.
          </p>
        </div>
      </div>

      {showInventory && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="px-3 py-2 bg-gray-50 border-b text-[10px] font-bold uppercase text-gray-500 tracking-wider">
            Inventário de comandos ({COMMAND_INVENTORY.length})
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full min-w-[900px] text-[11px]">
              <thead className="bg-gray-900 text-white sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left">Tela</th>
                  <th className="px-2 py-1.5 text-left">Botão/Comando</th>
                  <th className="px-2 py-1.5 text-left">Função esperada</th>
                  <th className="px-2 py-1.5 text-left">Perfil</th>
                  <th className="px-2 py-1.5 text-left">Firestore</th>
                  <th className="px-2 py-1.5 text-left">Log?</th>
                </tr>
              </thead>
              <tbody>
                {COMMAND_INVENTORY.map((item, idx) => (
                  <tr key={`${item.tela}-${item.botao}-${idx}`} className={idx % 2 ? "bg-gray-50" : "bg-white"}>
                    <td className="px-2 py-1.5 font-semibold">{item.tela}</td>
                    <td className="px-2 py-1.5">{item.botao}</td>
                    <td className="px-2 py-1.5 text-gray-700">{item.funcaoEsperada}</td>
                    <td className="px-2 py-1.5">{item.perfilPermitido}</td>
                    <td className="px-2 py-1.5">{item.acaoFirestore}</td>
                    <td className="px-2 py-1.5">{item.geraLog}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-[10px] uppercase text-gray-400 font-bold">Total</div>
              <div className="text-lg font-extrabold text-gray-900">{summary.total}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[10px] uppercase text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle size={12} /> OK
              </div>
              <div className="text-lg font-extrabold text-emerald-900">{summary.passou}</div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="text-[10px] uppercase text-red-700 font-bold flex items-center gap-1">
                <XCircle size={12} /> Erro
              </div>
              <div className="text-lg font-extrabold text-red-900">{summary.falhou}</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-[10px] uppercase text-amber-800 font-bold flex items-center gap-1">
                <Ban size={12} /> Bloqueado
              </div>
              <div className="text-lg font-extrabold text-amber-950">{summary.bloqueado}</div>
            </div>
            <div className="rounded-lg border bg-gray-50 p-3">
              <div className="text-[10px] uppercase text-gray-500 font-bold flex items-center gap-1">
                <Clock size={12} /> Não exec.
              </div>
              <div className="text-lg font-extrabold text-gray-800">{summary.naoExecutado}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-1">
              {(["TODOS", "PASSOU", "FALHOU", "BLOQUEADO_POR_PERMISSAO", "NAO_EXECUTADO"] as const).map(
                (f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md border cursor-pointer ${
                      filter === f
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {f === "TODOS" ? "TODOS" : statusLabel(f)}
                  </button>
                )
              )}
            </div>
            <button
              type="button"
              onClick={handleDownloadReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <Download size={14} />
              Baixar relatório (.md)
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-[11px]">
                <thead className="bg-gray-900 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Teste</th>
                    <th className="px-2 py-2 text-left">Categoria</th>
                    <th className="px-2 py-2 text-left">Perfil</th>
                    <th className="px-2 py-2 text-left">Ação</th>
                    <th className="px-2 py-2 text-left">Mensagem</th>
                    <th className="px-2 py-2 text-left">Duração</th>
                    <th className="px-2 py-2 text-left">Data/Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 ? "bg-gray-50" : "bg-white"}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{statusBadge(r.status)}</td>
                      <td className="px-2 py-1.5 font-semibold text-gray-900">{r.nome}</td>
                      <td className="px-2 py-1.5">{r.categoria}</td>
                      <td className="px-2 py-1.5">{r.perfil}</td>
                      <td className="px-2 py-1.5 text-gray-600">{r.acao}</td>
                      <td className="px-2 py-1.5 text-gray-700">
                        {r.mensagem}
                        {r.erro ? (
                          <div className="text-red-700 mt-0.5 font-mono text-[10px]">{r.erro}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.duracaoMs} ms</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.dataHora}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!summary && !running && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-xs text-gray-500">
          Clique em <strong>Executar testes</strong> para gerar o relatório funcional.
        </div>
      )}
    </div>
  );
}
