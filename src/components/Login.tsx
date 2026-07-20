import React, { useState } from "react";
import { Usuario } from "../types";
import { findUsuarioByRe } from "../utils/approvalService";
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
    const typedRe = re.trim();
    if (!typedRe) return;

    setLoading(true);
    setError(null);

    try {
      const userData = await findUsuarioByRe(typedRe);

      if (!userData) {
        setError(
          "R.E. não encontrado. Verifique se seu R.E. está cadastrado no sistema."
        );
        return;
      }

      if (userData.ativo === false) {
        setError("Sua conta de usuário está inativa. Entre em contato com um administrador.");
        return;
      }

      onLoginSuccess({
        ...userData,
        uid: userData.uid || userData.re,
        perfil: userData.perfil || "Operador",
      });
    } catch (err: any) {
      console.error(err);
      setError("Erro ao conectar com o servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
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
          Divisão EaD - Escala Semanal
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
                R.E.
              </label>
              <p className="mt-0.5 text-[11px] text-gray-400">
                Informe o R.E. sem o dígito
              </p>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Key size={18} />
                </div>
                <input
                  id="re-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  required
                  placeholder="000000"
                  value={re}
                  onChange={(e) => setRe(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 font-medium font-mono tracking-wider"
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
                disabled={loading || !re.trim()}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </div>
          </form>
        </motion.div>

        <p className="mt-6 text-center text-[11px] text-gray-400 font-medium tracking-wide">
          Versão 1.26
        </p>
      </div>
    </div>
  );
}
