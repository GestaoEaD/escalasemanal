import React, { useEffect, useMemo, useRef, useState } from "react";
import { Secao, Usuario } from "../types";
import { loadSecoes } from "../utils/frequenciaService";
import { resolveActiveDivisaoId } from "../utils/divisaoContext";
import { setActiveSecaoInSession } from "../utils/sessionService";
import {
  ArrowLeft,
  Building2,
  Briefcase,
  ClipboardList,
  ChevronRight,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

interface Props {
  usuario: Usuario;
  onSelectSecao: (secao: Secao) => void;
  onLogout: () => void;
}

const SECTION_ICONS: LucideIcon[] = [
  Building2,
  Users,
  ClipboardList,
  Shield,
  Briefcase,
];

function iconForSecao(nome: string, index: number): LucideIcon {
  let hash = 0;
  for (let i = 0; i < nome.length; i += 1) {
    hash = (hash + nome.charCodeAt(i) * (i + 1)) % SECTION_ICONS.length;
  }
  return SECTION_ICONS[(hash + index) % SECTION_ICONS.length]!;
}

export default function SecaoSelector({ usuario, onSelectSecao, onLogout }: Props) {
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [loading, setLoading] = useState(true);
  const autoSelected = useRef(false);

  const divisaoId = useMemo(() => resolveActiveDivisaoId(usuario), [usuario]);

  useEffect(() => {
    let cancelled = false;
    autoSelected.current = false;
    (async () => {
      setLoading(true);
      try {
        const list = await loadSecoes(divisaoId, usuario);
        if (!cancelled) {
          setSecoes(list);
        }
      } catch (err) {
        console.error("Falha ao carregar seções:", err);
        if (!cancelled) setSecoes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [divisaoId, usuario]);

  useEffect(() => {
    if (loading || autoSelected.current || secoes.length !== 1) return;
    autoSelected.current = true;
    const next = secoes[0];
    if (!next) return;
    setActiveSecaoInSession(usuario, next.id);
    onSelectSecao(next);
  }, [loading, secoes, onSelectSecao, usuario]);

  return (
    <div className="flex-1 bg-gray-50 pb-12 w-full max-w-full min-w-0">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 w-full min-w-0">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold leading-7 text-gray-900 sm:text-2xl sm:truncate">
              Selecione a Seção de Serviço
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Escolha a seção para abrir a semana de serviço correspondente.
            </p>
          </div>
          <div className="mt-4 flex sm:mt-0 sm:ml-4 items-center space-x-3">
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer"
            >
              <ArrowLeft size={14} />
              Sair
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando seções...</p>
        ) : secoes.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            Nenhuma seção ativa encontrada nesta Divisão.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {secoes.map((secao, idx) => {
              const Icon = iconForSecao(secao.nome, idx);
              return (
                <button
                  key={secao.id}
                  type="button"
                  onClick={() => {
                    setActiveSecaoInSession(usuario, secao.id);
                    onSelectSecao(secao);
                  }}
                  className="group text-left bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-2xl p-5 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors">
                      <Icon size={22} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="text-sm font-bold text-gray-900 leading-snug group-hover:text-blue-800 transition-colors">
                        {secao.nome}
                      </div>
                      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 group-hover:text-blue-500">
                        Abrir semanas
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 shrink-0 mt-1" />
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
