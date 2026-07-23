import React, { useEffect, useState } from "react";
import { MESES_NOMES, Usuario } from "../../types";
import { loadSecoes } from "../../utils/frequenciaService";
import { ArrowLeft, Building2 } from "lucide-react";

interface Props {
  usuario: Usuario;
  year: number;
  month: number;
  onBack: () => void;
  onSelectSecao: (secao: string) => void;
}

export default function FrequenciaSecaoSelector({
  year,
  month,
  onBack,
  onSelectSecao,
}: Props) {
  const [secoes, setSecoes] = useState<{ nome: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await loadSecoes();
        if (!cancelled) setSecoes(list);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            <ArrowLeft size={16} />
            Meses
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={18} className="text-blue-600 shrink-0" />
            <h1 className="text-sm font-bold text-gray-900 truncate">
              {MESES_NOMES[month - 1]} / {year} · Seção
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Selecione a seção</h2>
        <p className="text-sm text-gray-500 mb-6">
          O controle abrirá somente os colaboradores vinculados à seção escolhida.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando seções…</p>
        ) : secoes.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            Nenhuma seção ativa encontrada. Cadastre seções em Configurações.
          </p>
        ) : (
          <div className="space-y-2">
            {secoes.map((s) => (
              <button
                key={s.nome}
                type="button"
                onClick={() => onSelectSecao(s.nome)}
                className="w-full text-left bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 rounded-xl px-4 py-3 cursor-pointer transition-all"
              >
                <span className="text-sm font-bold text-gray-900">{s.nome}</span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
