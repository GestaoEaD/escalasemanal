import React, { useEffect, useState } from "react";
import { Usuario } from "../../types";
import { loadSecoes } from "../../utils/frequenciaService";
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  GraduationCap,
  Landmark,
  Layers,
  Shield,
  Users,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

interface Props {
  usuario: Usuario;
  year: number;
  onBack: () => void;
  onSelectSecao: (secao: string) => void;
}

const SECTION_ICONS: LucideIcon[] = [
  Building2,
  Users,
  GraduationCap,
  Landmark,
  Shield,
  Briefcase,
  Layers,
  ClipboardList,
];

function iconForSecao(nome: string, index: number): LucideIcon {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = (hash + nome.charCodeAt(i) * (i + 1)) % SECTION_ICONS.length;
  }
  return SECTION_ICONS[(hash + index) % SECTION_ICONS.length]!;
}

export default function FrequenciaSecaoSelector({
  year,
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
            Voltar
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList size={18} className="text-blue-600 shrink-0" />
            <h1 className="text-sm font-bold text-gray-900 truncate">
              Controle de Frequência · {year}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Selecione a seção</h2>
        <p className="text-sm text-gray-500 mb-6">
          Escolha a seção para abrir o controle mensal dos colaboradores vinculados.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando seções…</p>
        ) : secoes.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            Nenhuma seção ativa encontrada. Cadastre seções em Configurações.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {secoes.map((s, idx) => {
              const Icon = iconForSecao(s.nome, idx);
              return (
                <button
                  key={s.nome}
                  type="button"
                  onClick={() => onSelectSecao(s.nome)}
                  className="group text-left bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-2xl p-5 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors">
                      <Icon size={22} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="text-sm font-bold text-gray-900 leading-snug group-hover:text-blue-800 transition-colors">
                        {s.nome}
                      </div>
                      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 group-hover:text-blue-500">
                        Abrir meses
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
