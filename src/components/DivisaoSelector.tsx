/**
 * Home de seleção de Divisão (tenant) — cartões.
 */
import React, { useEffect, useState } from "react";
import { Divisao, Usuario } from "../types";
import { db, collection, getDocs, getDoc, doc } from "../firebase";
import {
  canEnterDivisao,
  sortDivisoes,
  usuarioDivisaoCadastro,
} from "../utils/divisaoContext";
import { canAccessAnyDivisao, canAccessConfig } from "../utils/permissions";
import { Building2, Lock, ChevronRight, Settings } from "lucide-react";
import { motion } from "motion/react";

interface DivisaoSelectorProps {
  usuario: Usuario;
  onSelectDivisao: (divisao: Divisao) => void;
  onLogout: () => void;
  /** Gerente usa para cadastrar a primeira Divisão sem precisar entrar em nenhuma. */
  onOpenConfig?: () => void;
}

export default function DivisaoSelector({
  usuario,
  onSelectDivisao,
  onLogout,
  onOpenConfig,
}: DivisaoSelectorProps) {
  const [divisoes, setDivisoes] = useState<Divisao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isGerente = canAccessAnyDivisao(usuario);
  const showConfig = Boolean(onOpenConfig) && canAccessConfig(usuario);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list: Divisao[] = [];
        if (isGerente) {
          const snap = await getDocs(collection(db, "divisoes"));
          snap.forEach((d) => {
            const data = d.data() as Divisao;
            list.push({
              codigo: String(data.codigo || d.id),
              nome: String(data.nome || d.id),
              descricao: data.descricao,
              ativo: data.ativo !== false,
            });
          });
        } else {
          // Não-Gerente só pode ler o documento da própria Divisão.
          const codigo = usuarioDivisaoCadastro(usuario);
          const snap = await getDoc(doc(db, "divisoes", codigo));
          if (snap.exists()) {
            const data = snap.data() as Divisao;
            list.push({
              codigo: String(data.codigo || snap.id),
              nome: String(data.nome || snap.id),
              descricao: data.descricao,
              ativo: data.ativo !== false,
            });
          }
        }
        if (!cancelled) {
          setDivisoes(sortDivisoes(list.filter((x) => x.ativo !== false)));
          setLoading(false);
        }
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) {
          setError("Não foi possível carregar as Divisões.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGerente, usuario]);

  return (
    <div className="bg-gray-50 flex-1 pb-10">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 sm:mt-12">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Selecione a Divisão
            </h1>
            <p className="mt-2 text-sm text-gray-500 max-w-2xl">
              {isGerente
                ? "Como Gerente, você pode entrar em qualquer Divisão ou abrir Configurações para cadastrar novas."
                : "Entre na Divisão vinculada ao seu cadastro. As demais permanecem bloqueadas."}
            </p>
          </div>
          {showConfig && (
            <button
              type="button"
              id="divisao-config-btn"
              onClick={onOpenConfig}
              className="inline-flex items-center justify-center gap-1.5 self-start px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer border border-blue-200 shadow-xs"
              title="Abrir Configurações"
            >
              <Settings size={15} />
              <span>Configurações</span>
            </button>
          )}
        </div>

        {loading && (
          <p className="text-sm text-gray-500 font-medium">Carregando Divisões…</p>
        )}
        {error && (
          <p className="text-sm text-red-600 font-semibold">{error}</p>
        )}

        {!loading && !error && divisoes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {divisoes.map((d, i) => {
              const allowed = canEnterDivisao(usuario, d.codigo);
              return (
                <motion.button
                  key={d.codigo}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  disabled={!allowed}
                  onClick={() => allowed && onSelectDivisao(d)}
                  className={
                    allowed
                      ? "text-left rounded-xl border border-blue-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
                      : "text-left rounded-xl border border-gray-200 bg-gray-100/80 p-5 opacity-55 cursor-not-allowed grayscale"
                  }
                  title={
                    allowed
                      ? `Entrar em ${d.nome}`
                      : "Você não tem acesso a esta Divisão"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={
                          allowed
                            ? "bg-blue-600 text-white p-2.5 rounded-lg shrink-0"
                            : "bg-gray-400 text-white p-2.5 rounded-lg shrink-0"
                        }
                      >
                        {allowed ? (
                          <Building2 className="w-5 h-5" />
                        ) : (
                          <Lock className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold text-gray-900 truncate">
                          {d.nome}
                        </div>
                        <div className="text-xs font-semibold text-gray-500 mt-0.5 tabular-nums">
                          Código {d.codigo}
                        </div>
                        {d.descricao?.trim() && (
                          <p className="mt-2 text-xs text-gray-500 line-clamp-2">
                            {d.descricao}
                          </p>
                        )}
                      </div>
                    </div>
                    {allowed && (
                      <ChevronRight className="w-5 h-5 text-blue-500 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {!loading && divisoes.length === 0 && !error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 max-w-xl">
            <p className="text-sm text-amber-900 font-semibold">
              Nenhuma Divisão cadastrada.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {isGerente
                ? "Abra Configurações → Divisões e cadastre a primeira Divisão (com as seções). Depois volte aqui para entrar nela."
                : "Aguarde o Gerente cadastrar a Divisão do seu vínculo."}
            </p>
            {showConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer shadow-xs"
              >
                <Settings size={14} />
                Abrir Configurações
              </button>
            )}
          </div>
        )}

        <div className="mt-10 flex justify-end">
          <button
            type="button"
            onClick={onLogout}
            className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
          >
            Sair
          </button>
        </div>
      </main>
    </div>
  );
}
