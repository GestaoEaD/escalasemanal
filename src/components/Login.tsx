import React, { useState } from "react";
import { Usuario } from "../types";
import { findUsuarioByEmail } from "../utils/approvalService";
import {
  getGoogleAuthErrorMessage,
  GoogleAuthFlowError,
  signInWithGoogle,
  signOutGoogle,
  type FriendlyAuthMessage,
  type GoogleAuthErrorKind,
} from "../utils/googleAuthService";
import { Shield, AlertCircle, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LoginProps {
  onLoginSuccess: (user: Usuario) => void;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.05-.34-.08-.68-.08-1.03s.03-.69.08-1.03V8.19H2.18C1.43 9.55 1 11.22 1 13s.43 3.45 1.18 4.81l2.85-2.22.81-.5z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 8.19l3.66 2.84c.87-2.6 3.3-4.65 6.16-4.65z"
      />
    </svg>
  );
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<FriendlyAuthMessage | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const showKind = (kind: GoogleAuthErrorKind) => {
    setMessage(getGoogleAuthErrorMessage(kind));
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const { email } = await signInWithGoogle();
      let userData: Usuario | null = null;
      try {
        userData = await findUsuarioByEmail(email);
      } catch (err) {
        console.warn("Falha ao consultar cadastro após login Google:", err);
        await signOutGoogle();
        showKind("network");
        return;
      }

      if (!userData) {
        await signOutGoogle();
        showKind("not_registered");
        return;
      }

      onLoginSuccess({
        ...userData,
        uid: userData.uid || userData.re,
        perfil: userData.perfil || "Operador",
        email,
        authProvider: "google",
        emailVerificado: true,
      });
    } catch (err) {
      if (err instanceof GoogleAuthFlowError) {
        showKind(err.kind);
      } else {
        console.warn(err);
        showKind("temporary");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (!message) {
      await handleGoogleLogin();
      return;
    }
    if (message.actionLabel === "Tentar com outra conta Google") {
      await signOutGoogle();
    }
    await handleGoogleLogin();
  };

  return (
    <div
      id="login-screen"
      className="min-h-screen bg-gray-50 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8"
    >
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
          <div className="space-y-5">
            <p className="text-sm text-gray-600 text-center">
              Entre com a conta Google cadastrada no seu perfil. A senha é solicitada apenas pelo
              Google.
            </p>

            {message && (
              <div className="rounded-md bg-red-50 p-3 border border-red-200">
                <div className="flex gap-2">
                  <div className="flex-shrink-0 text-red-400 pt-0.5">
                    <AlertCircle size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-red-900">{message.title}</p>
                    <p className="mt-1 text-xs text-red-800 leading-relaxed">{message.body}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              id="login-google-btn"
              type="button"
              onClick={handlePrimaryAction}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-semibold text-gray-800 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <GoogleIcon className="w-5 h-5 shrink-0" />
              {loading
                ? "Autenticando..."
                : message
                  ? message.actionLabel
                  : "Entrar com Google"}
            </button>

            {message && message.actionLabel !== "Tentar novamente" && (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full text-center text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer disabled:opacity-50"
              >
                Tentar novamente
              </button>
            )}
          </div>

          <div className="mt-8 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-left text-xs font-semibold text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <HelpCircle size={14} />
                Está com dificuldade para entrar?
              </span>
              {showHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <AnimatePresence>
              {showHelp && (
                <motion.ol
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 space-y-2 text-[11px] text-gray-500 leading-relaxed list-decimal list-inside overflow-hidden"
                >
                  <li>Utilize a conta Google cadastrada no seu perfil.</li>
                  <li>
                    Se possuir várias contas Google abertas no navegador, verifique se está
                    escolhendo a conta correta.
                  </li>
                  <li>
                    Se o e-mail correto não for reconhecido, entre em contato com o administrador
                    para confirmar ou atualizar o e-mail cadastrado.
                  </li>
                  <li>O acesso não é mais realizado pelo RE e senha do sistema.</li>
                </motion.ol>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <p className="mt-6 text-center text-[11px] text-gray-400 font-medium tracking-wide">
          Versão 1.26
        </p>
      </div>
    </div>
  );
}
