import React from "react";
import { AlertTriangle, RefreshCw, Save, X } from "lucide-react";
import { formatTimestamp } from "../utils/dateUtils";

interface ConcurrencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onForceSave: () => void;
  onReload: () => void;
  serverLastSaved: {
    nome: string;
    re: string;
    timestamp: any;
    data?: string;
    hora?: string;
    postoGrad?: string;
  } | null;
}

export default function ConcurrencyModal({
  isOpen,
  onClose,
  onForceSave,
  onReload,
  serverLastSaved,
}: ConcurrencyModalProps) {
  if (!isOpen) return null;

  const getConflictMessageParts = () => {
    if (!serverLastSaved) {
      return {
        main: "Esta escala foi modificada por outro usuário.",
        sub: "Deseja sobrescrever essas alterações?"
      };
    }

    let d = serverLastSaved.data;
    let h = serverLastSaved.hora;
    if (!d || !h) {
      const date = serverLastSaved.timestamp?.toDate ? serverLastSaved.timestamp.toDate() : new Date(serverLastSaved.timestamp);
      d = String(date.getDate()).padStart(2, "0") + "/" + String(date.getMonth() + 1).padStart(2, "0") + "/" + date.getFullYear();
      h = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    }

    const pg = serverLastSaved.postoGrad ? serverLastSaved.postoGrad + " " : "";
    return {
      main: `Esta escala foi alterada por ${pg}${serverLastSaved.nome} (R.E. ${serverLastSaved.re}) em ${d} às ${h}.`,
      sub: "Deseja sobrescrever essas alterações?"
    };
  };

  const message = getConflictMessageParts();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" id="concurrency-modal-container">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity" 
        onClick={onClose}
      />

      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-red-100">
          
          {/* Header */}
          <div className="bg-red-50 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-red-100 flex items-center space-x-3 text-red-800">
            <div className="bg-red-100 p-2 rounded-full text-red-600">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold leading-6 text-red-900" id="concurrency-modal-title">
                CONFLITO DE CONCORRÊNCIA
              </h3>
              <p className="text-xs text-red-700">Controle de concorrência detectou alteração no servidor.</p>
            </div>
          </div>

          {/* Content Body */}
          <div className="px-4 py-5 sm:p-6 bg-white space-y-4">
            <div className="text-sm text-gray-800 font-medium space-y-2">
              <p className="text-red-700 font-bold leading-relaxed whitespace-pre-line">
                {message.main}
              </p>
              <p className="text-gray-900 font-extrabold text-base pt-2">
                {message.sub}
              </p>
            </div>

            {serverLastSaved && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-xs text-gray-800 space-y-1">
                <div className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">
                  Detalhes do Registro Concorrente
                </div>
                <div><b>Usuário:</b> {serverLastSaved.postoGrad || ""} {serverLastSaved.nome}</div>
                <div><b>R.E.:</b> {serverLastSaved.re}</div>
                <div><b>Data/Hora:</b> {serverLastSaved.data || "N/A"} às {serverLastSaved.hora || "N/A"}</div>
              </div>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 border-t border-gray-150 gap-2">
            <button
              type="button"
              id="force-save-btn"
              onClick={onForceSave}
              className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-700 sm:ml-3 sm:w-auto cursor-pointer flex items-center space-x-1.5"
            >
              <Save size={16} />
              <span>Sobrescrever e Salvar</span>
            </button>
            <button
              type="button"
              id="reload-page-btn"
              onClick={onReload}
              className="mt-3 inline-flex w-full justify-center rounded-md bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-semibold shadow-xs sm:mt-0 sm:w-auto cursor-pointer flex items-center space-x-1.5"
            >
              <RefreshCw size={16} />
              <span>Atualizar Escala</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto cursor-pointer flex items-center space-x-1.5"
            >
              <X size={16} />
              <span>Cancelar</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
