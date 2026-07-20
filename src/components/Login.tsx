import React, { useState } from "react";
import { Usuario } from "../types";
import { TEST_USER } from "../utils/seedData";
import { findUsuarioByRe } from "../utils/approvalService";
import { normalizeRe } from "../utils/reUtils";
import { Shield, Key, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

interface LoginProps {
  onLoginSuccess: (user: Usuario) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [re, setRe] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!re.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const userData = await findUsuarioByRe(re);

      if (userData) {
        if (userData.ativo === false) {
          setError("Sua conta de usuário está inativa. Entre em contato com um administrador.");
        } else {
          onLoginSuccess(userData);
        }
      } else if (
        normalizeRe(re) === normalizeRe(TEST_USER.re) ||
        normalizeRe(re) === "124342"
      ) {
        onLoginSuccess(TEST_USER);
      } else {
        setError(
          "R.E. não encontrado ou inativo. Verifique se seu R.E. está cadastrado no sistema."
        );
      }
    } catch (err: any) {
      console.error(err);
      setError("Erro ao conectar com o servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleFillTestUser = () => {
    setRe(normalizeRe(TEST_USER.re));
    setError(null);
  };

  return (
    <div id="login-screen" className="min-h-screen bg-gray-50 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-blue-600 p-3 rounded-xl shadow-md text-white">
            <Shield size={40} id="logo-shield" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Sistema de Escala de Serviço
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Primeira Versão — Escalas Digitais Policiais
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100"
        >
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label htmlFor="re-input" className="block text-sm font-medium text-gray-700">
                Registro Estatístico (R.E.)
              </label>
              <p className="mt-0.5 text-[11px] text-gray-400">
                Informe o R.E. sem o dígito (ex.: 124342)
              </p>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Key size={18} />
                </div>
                <input
                  id="re-input"
                  type="text"
                  required
                  placeholder="Ex: 124342"
                  value={re}
                  onChange={(e) => setRe(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 font-medium"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 border border-red-200">
                <div className="flex">
                  <div className="flex-shrink-0 text-red-400">
                    <AlertCircle size={20} />
                  </div>
                  <div className="ml-3">
                    <p className="text-xs font-medium text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <button
                id="login-btn"
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </div>
          </form>

          <div className="mt-8 border-t border-gray-150 pt-6">
            <h4 className="text-xs font-semibold text-gray-400 tracking-wider uppercase">
              Acesso Rápido de Teste
            </h4>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-bold text-gray-700">CB PM Ventura</div>
                  <div className="text-[11px] text-gray-500">
                    R.E. {normalizeRe(TEST_USER.re)} | Seç Gest Educ | Administrador
                  </div>
                </div>
                <button
                  id="fill-test-user-btn"
                  type="button"
                  onClick={handleFillTestUser}
                  className="inline-flex items-center px-2.5 py-1 border border-blue-600 text-xs font-semibold rounded-md text-blue-600 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                >
                  Usar Este
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
