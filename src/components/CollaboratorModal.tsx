import React, { useState, useEffect, useMemo } from "react";
import { Colaborador, POSTOS_GRADUACOES } from "../types";
import { X, Search, UserPlus, ArrowLeft } from "lucide-react";
import { db, collection, getDocs } from "../firebase";

interface CollaboratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (collaborator: Colaborador) => void;
  onUpdate: (oldRe: string, updated: Colaborador) => void;
  collaboratorsPool: Colaborador[]; // All collaborators in database
  currentReList: string[]; // R.E.s currently in the active panel table to avoid duplicates
  editCollaborator: Colaborador | null; // Set when editing an existing row
}

export default function CollaboratorModal({
  isOpen,
  onClose,
  onConfirm,
  onUpdate,
  collaboratorsPool,
  currentReList,
  editCollaborator,
}: CollaboratorModalProps) {
  const [activeTab, setActiveTab] = useState<"select" | "new">("select");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [postosList, setPostosList] = useState<string[]>([]);
  const [secoesList, setSecoesList] = useState<string[]>([]);

  // Load postos and secoes from Firestore on mount/open
  useEffect(() => {
    if (isOpen) {
      const fetchList = async () => {
        try {
          const postosSnap = await getDocs(collection(db, "postos"));
          const postosData = postosSnap.docs
            .map((doc) => doc.data())
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
            .map((p) => p.sigla as string);
          setPostosList(postosData.length > 0 ? postosData : POSTOS_GRADUACOES);
        } catch (err) {
          console.error("Erro ao buscar postos:", err);
          setPostosList(POSTOS_GRADUACOES);
        }

        try {
          const secoesSnap = await getDocs(collection(db, "secoes"));
          const secoesData = secoesSnap.docs
            .map((doc) => doc.data())
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
            .map((s) => s.nome as string);
          setSecoesList(secoesData.length > 0 ? secoesData : ["Seç Gest Educ"]);
        } catch (err) {
          console.error("Erro ao buscar seções:", err);
          setSecoesList(["Seç Gest Educ"]);
        }
      };
      fetchList();
    }
  }, [isOpen]);

  // Form fields
  const [postoGrad, setPostoGrad] = useState("SD PM");
  const [re, setRe] = useState("");
  const [nome, setNome] = useState("");
  const [secao, setSecao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [formError, setFormError] = useState("");

  // Initialize fields on open/edit change or lists loaded
  useEffect(() => {
    if (editCollaborator) {
      setActiveTab("new"); // Use form for editing
      setPostoGrad(editCollaborator.postoGrad);
      setRe(editCollaborator.re);
      setNome(editCollaborator.nome);
      setSecao(editCollaborator.secao);
      setObservacao(editCollaborator.observacao || "");
    } else {
      setActiveTab("select");
      setPostoGrad(postosList[0] || "SD PM");
      setRe("");
      setNome("");
      setSecao(secoesList[0] || "Seç Gest Educ");
      setObservacao("");
    }
    setFormError("");
  }, [editCollaborator, isOpen, postosList, secoesList]);

  // Filter pool for select tab
  const availablePool = useMemo(() => {
    return collaboratorsPool.filter(
      (c) => !currentReList.includes(c.re)
    );
  }, [collaboratorsPool, currentReList]);

  const filteredPool = useMemo(() => {
    if (!searchTerm.trim()) return availablePool;
    const term = searchTerm.toLowerCase();
    return availablePool.filter(
      (c) =>
        c.nome.toLowerCase().includes(term) ||
        c.re.includes(term) ||
        c.postoGrad.toLowerCase().includes(term) ||
        c.secao.toLowerCase().includes(term)
    );
  }, [availablePool, searchTerm]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const cleanRe = re.trim();
    const cleanNome = nome.trim();
    const cleanSecao = secao.trim();

    if (!cleanRe || !cleanNome || !cleanSecao) {
      setFormError("Por favor, preencha todos os campos obrigatórios (*).");
      return;
    }

    // Check duplicate RE if creating a new one (and not editing)
    if (!editCollaborator) {
      if (currentReList.includes(cleanRe)) {
        setFormError("Este colaborador já está adicionado nesta escala.");
        return;
      }
    } else {
      // If editing and changing RE to an existing RE
      if (editCollaborator.re !== cleanRe && currentReList.includes(cleanRe)) {
        setFormError("Este R.E. já está sendo utilizado por outro colaborador nesta escala.");
        return;
      }
    }

    const collaboratorData: Colaborador = {
      re: cleanRe,
      postoGrad,
      nome: cleanNome,
      secao: cleanSecao,
      observacao: observacao.trim() || "",
    };

    if (editCollaborator) {
      onUpdate(editCollaborator.re, collaboratorData);
    } else {
      onConfirm(collaboratorData);
    }
    onClose();
  };

  const handleSelectPoolItem = (col: Colaborador) => {
    onConfirm(col);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" id="colaborador-modal-container">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity" 
        onClick={onClose}
      />

      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-gray-100">
          
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-gray-150 flex justify-between items-center">
            <h3 className="text-lg font-bold leading-6 text-gray-900" id="modal-title">
              {editCollaborator 
                ? "Editar Colaborador" 
                : activeTab === "select" 
                  ? "Adicionar Colaborador da Lista" 
                  : "Cadastrar Novo Colaborador"}
            </h3>
            <button
              onClick={onClose}
              className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tab Selector (only when NOT editing) */}
          {!editCollaborator && (
            <div className="flex border-b border-gray-150 bg-gray-50">
              <button
                type="button"
                onClick={() => setActiveTab("select")}
                className={`w-1/2 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
                  activeTab === "select"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                Selecionar Cadastrado ({availablePool.length})
              </button>
              <button
                type="button"
                id="tab-new-collaborator"
                onClick={() => setActiveTab("new")}
                className={`w-1/2 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
                  activeTab === "new"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center justify-center space-x-1.5">
                  <UserPlus size={14} />
                  <span>Novo Colaborador</span>
                </div>
              </button>
            </div>
          )}

          {/* Content Body */}
          <div className="px-4 py-5 sm:p-6 bg-white max-h-[60vh] overflow-y-auto">
            
            {activeTab === "select" && !editCollaborator ? (
              // Tab: Select Existing
              <div className="space-y-4">
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Search size={16} />
                  </div>
                  <input
                    type="text"
                    placeholder="Pesquisar por nome, R.E., posto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                  />
                </div>

                {filteredPool.length > 0 ? (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                    {filteredPool.map((col) => (
                      <button
                        key={col.re}
                        type="button"
                        onClick={() => handleSelectPoolItem(col)}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all flex justify-between items-center group cursor-pointer"
                      >
                        <div>
                          <div className="text-sm font-bold text-gray-900 flex items-center space-x-1.5">
                            <span className="text-blue-600 font-extrabold">{col.postoGrad}</span>
                            <span>{col.nome}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            R.E. {col.re} • Seção: {col.secao}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          Selecionar
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    {availablePool.length === 0 ? (
                      <p className="text-sm">Todos os colaboradores cadastrados já estão nesta escala.</p>
                    ) : (
                      <p className="text-sm">Nenhum colaborador encontrado para "{searchTerm}".</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveTab("new")}
                      className="mt-3 text-xs font-bold text-blue-600 hover:underline inline-flex items-center space-x-1 cursor-pointer"
                    >
                      <UserPlus size={14} />
                      <span>Cadastrar Novo Colaborador</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // Tab: Create/Edit Form
              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-xs font-semibold">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Posto / Graduação *
                    </label>
                    <select
                      value={postoGrad}
                      onChange={(e) => setPostoGrad(e.target.value)}
                      className="block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium bg-white"
                    >
                      {postosList.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Registro Estatístico (R.E.) *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 999888"
                      value={re}
                      onChange={(e) => setRe(e.target.value.replace(/\D/g, ""))} // Numbers only
                      disabled={!!editCollaborator} // Lock RE during edit
                      className="block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Nome Completo / Guerra *
                  </label>
                  <input
                    id="collaborator-name-input"
                    type="text"
                    placeholder="Ex.: SILVA"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Seção de Serviço *
                  </label>
                  <select
                    value={secao}
                    onChange={(e) => setSecao(e.target.value)}
                    className="block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium bg-white"
                  >
                    {secoesList.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Observação (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Observação de exemplo..."
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="block w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium"
                  />
                </div>

                {/* Submit Buttons */}
                <div className="pt-4 border-t border-gray-150 flex justify-end space-x-2">
                  {!editCollaborator && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("select")}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                    >
                      <ArrowLeft size={16} className="mr-1.5" />
                      <span>Voltar</span>
                    </button>
                  )}
                  <button
                    id="save-collaborator-btn"
                    type="submit"
                    className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm cursor-pointer"
                  >
                    {editCollaborator ? "Salvar Alterações" : "Adicionar à Escala"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
