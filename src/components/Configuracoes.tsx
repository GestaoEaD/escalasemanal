import React, { useState, useEffect, useMemo } from "react";
import { db, collection, getDocs, doc, setDoc, deleteDoc, writeBatch, Timestamp } from "../firebase";
import { Usuario, Colaborador, AuditAlteracao, AuditOperation } from "../types";
import {
  Users,
  Shield,
  Layers,
  Activity,
  Settings,
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  Save,
  X,
  Check,
  AlertCircle,
  Briefcase,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";
import { auditConfiguracao, loadAuditOperations } from "../utils/auditService";
import LogsAuditPanel from "./LogsAuditPanel";

interface ConfiguracoesProps {
  usuario: Usuario;
  onBack: () => void;
}

type MenuTab = "colaboradores" | "usuarios" | "postos" | "secoes" | "legendas" | "gerais" | "registros";

const translateColorToHex = (color: string): string => {
  if (!color) return "#ffffff";
  const trimmed = color.trim().toLowerCase();
  
  if (trimmed.startsWith("#")) {
    return color;
  }
  
  const map: Record<string, string> = {
    "verde": "#dcfce7",          // light green (green-100)
    "verde-escuro": "#bbf7d0",   // green-200
    "amarelo": "#fef08a",        // yellow-100
    "laranja": "#ffedd5",        // orange-100
    "azul-claro": "#eff6ff",     // blue-50
    "azul-medio": "#dbeafe",     // blue-100
    "roxo-claro": "#f3e8ff",     // purple-100
    "roxo-escuro": "#e9d5ff",     // purple-200
    "cinza": "#f3f4f6",          // gray-100
    "vermelho-claro": "#fee2e2", // red-100
    "vermelho": "#fca5a5",       // red-200
    "bordo": "#fca5a5",          // red-300
    "bordô": "#fca5a5",          // red-300
    "azul-escuro": "#bfdbfe",    // blue-200
    "cinza-escuro": "#e5e7eb",   // gray-200
    "branco": "#ffffff",
    "preto": "#374151"
  };
  
  return map[trimmed] || color;
};

export default function Configuracoes({ usuario, onBack }: ConfiguracoesProps) {
  // Active module tab
  const [activeTab, setActiveTab] = useState<MenuTab>("colaboradores");

  // Audit Logs Tab States
  const [logsList, setLogsList] = useState<AuditOperation[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // original db snapshot values (for diffing & discard checks)
  const [origColaboradores, setOrigColaboradores] = useState<Colaborador[]>([]);
  const [origUsuarios, setOrigUsuarios] = useState<Usuario[]>([]);
  const [origPostos, setOrigPostos] = useState<any[]>([]);
  const [origSecoes, setOrigSecoes] = useState<any[]>([]);
  const [origLegendas, setOrigLegendas] = useState<any[]>([]);
  const [origGerais, setOrigGerais] = useState<any>({
    nomeOrganizacao: "Polícia Militar do Estado de São Paulo",
    unidade: "CPI-1 / 1º BPM/I",
    pdfExportHeader: "ESCALA DE EXPEDIENTE",
    excelExportHeader: "ESCALA DE EXPEDIENTE",
    tema: "light",
    idioma: "pt-BR"
  });

  // current working values (editable in UI)
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [postos, setPostos] = useState<any[]>([]);
  const [secoes, setSecoes] = useState<any[]>([]);
  const [legendas, setLegendas] = useState<any[]>([]);
  const [gerais, setGerais] = useState<any>({
    nomeOrganizacao: "",
    unidade: "",
    pdfExportHeader: "",
    excelExportHeader: "",
    tema: "light",
    idioma: "pt-BR"
  });

  // Track removed documents keys to delete from Firestore on save
  const [removedColaboradores, setRemovedColaboradores] = useState<string[]>([]);
  const [removedUsuarios, setRemovedUsuarios] = useState<string[]>([]);
  const [removedPostos, setRemovedPostos] = useState<string[]>([]);
  const [removedSecoes, setRemovedSecoes] = useState<string[]>([]);
  const [removedLegendas, setRemovedLegendas] = useState<string[]>([]);

  // Search and Pagination local states
  const [colSearch, setColSearch] = useState("");
  const [colActiveFilter, setColActiveFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [colPage, setColPage] = useState(1);
  const colPerPage = 10;

  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const userPerPage = 10;

  // Modals visibility
  const [colModalOpen, setColModalOpen] = useState(false);
  const [currentCol, setCurrentCol] = useState<Colaborador | null>(null);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);

  const [postoModalOpen, setPostoModalOpen] = useState(false);
  const [currentPosto, setCurrentPosto] = useState<any | null>(null);

  const [secaoModalOpen, setSecaoModalOpen] = useState(false);
  const [currentSecao, setCurrentSecao] = useState<any | null>(null);

  const [legendaModalOpen, setLegendaModalOpen] = useState(false);
  const [currentLegenda, setCurrentLegenda] = useState<any | null>(null);

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<{ type: MenuTab; id: string; label: string } | null>(null);

  // Load all configuration data from firestore
  const loadAllData = async () => {
    setLoading(true);
    setSaveError(null);
    try {
      // 1. Fetch Collaborators
      const colSnap = await getDocs(collection(db, "colaboradores"));
      const colList: Colaborador[] = [];
      colSnap.forEach((doc) => {
        colList.push(doc.data() as Colaborador);
      });
      // Sort by order or name
      colList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // 2. Fetch Users
      const userSnap = await getDocs(collection(db, "usuarios"));
      const userList: Usuario[] = [];
      userSnap.forEach((doc) => {
        userList.push(doc.data() as Usuario);
      });
      userList.sort((a, b) => a.nome.localeCompare(b.nome));

      // 3. Fetch Postos
      const postosSnap = await getDocs(collection(db, "postos"));
      const postosList: any[] = [];
      postosSnap.forEach((doc) => {
        postosList.push(doc.data());
      });
      postosList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // 4. Fetch Secoes
      const secoesSnap = await getDocs(collection(db, "secoes"));
      const secoesList: any[] = [];
      secoesSnap.forEach((doc) => {
        secoesList.push(doc.data());
      });
      secoesList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // 5. Fetch Legendas
      const legendasSnap = await getDocs(collection(db, "legendas"));
      const legendasList: any[] = [];
      legendasSnap.forEach((doc) => {
        legendasList.push(doc.data());
      });
      legendasList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // 6. Fetch Gerais config
      const geraisSnap = await getDocs(collection(db, "configuracoes"));
      let geraisData = {
        nomeOrganizacao: "Polícia Militar do Estado de São Paulo",
        unidade: "CPI-1 / 1º BPM/I",
        pdfExportHeader: "ESCALA DE EXPEDIENTE",
        excelExportHeader: "ESCALA DE EXPEDIENTE",
        tema: "light",
        idioma: "pt-BR"
      };
      geraisSnap.forEach((doc) => {
        if (doc.id === "gerais") {
          geraisData = { ...geraisData, ...doc.data() };
        }
      });

      // Set original states
      setOrigColaboradores(JSON.parse(JSON.stringify(colList)));
      setOrigUsuarios(JSON.parse(JSON.stringify(userList)));
      setOrigPostos(JSON.parse(JSON.stringify(postosList)));
      setOrigSecoes(JSON.parse(JSON.stringify(secoesList)));
      setOrigLegendas(JSON.parse(JSON.stringify(legendasList)));
      setOrigGerais(JSON.parse(JSON.stringify(geraisData)));

      // Set working states
      setColaboradores(colList);
      setUsuarios(userList);
      setPostos(postosList);
      setSecoes(secoesList);
      setLegendas(legendasList);
      setGerais(geraisData);

      // Reset removed logs
      setRemovedColaboradores([]);
      setRemovedUsuarios([]);
      setRemovedPostos([]);
      setRemovedSecoes([]);
      setRemovedLegendas([]);

    } catch (err: any) {
      console.error("Erro ao carregar dados administrativos:", err);
      setSaveError("Não foi possível carregar as configurações do Firestore.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const list = await loadAuditOperations();
      setLogsList(list);
    } catch (err) {
      console.error("Erro ao carregar logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "registros") {
      loadLogs();
    }
  }, [activeTab]);

  // Determine if there are unsaved changes
  const isDirty = useMemo(() => {
    return (
      JSON.stringify(colaboradores) !== JSON.stringify(origColaboradores) ||
      JSON.stringify(usuarios) !== JSON.stringify(origUsuarios) ||
      JSON.stringify(postos) !== JSON.stringify(origPostos) ||
      JSON.stringify(secoes) !== JSON.stringify(origSecoes) ||
      JSON.stringify(legendas) !== JSON.stringify(origLegendas) ||
      JSON.stringify(gerais) !== JSON.stringify(origGerais) ||
      removedColaboradores.length > 0 ||
      removedUsuarios.length > 0 ||
      removedPostos.length > 0 ||
      removedSecoes.length > 0 ||
      removedLegendas.length > 0
    );
  }, [
    colaboradores, origColaboradores,
    usuarios, origUsuarios,
    postos, origPostos,
    secoes, origSecoes,
    legendas, origLegendas,
    gerais, origGerais,
    removedColaboradores, removedUsuarios, removedPostos, removedSecoes, removedLegendas
  ]);

  // Handle Undo/Discard changes
  const handleDiscardChanges = () => {
    if (confirm("Deseja realmente descartar todas as alterações não salvas?")) {
      setColaboradores(JSON.parse(JSON.stringify(origColaboradores)));
      setUsuarios(JSON.parse(JSON.stringify(origUsuarios)));
      setPostos(JSON.parse(JSON.stringify(origPostos)));
      setSecoes(JSON.parse(JSON.stringify(origSecoes)));
      setLegendas(JSON.parse(JSON.stringify(origLegendas)));
      setGerais(JSON.parse(JSON.stringify(origGerais)));

      setRemovedColaboradores([]);
      setRemovedUsuarios([]);
      setRemovedPostos([]);
      setRemovedSecoes([]);
      setRemovedLegendas([]);

      setSaveError(null);
      setSaveSuccess(false);
    }
  };

  // Safe Back Navigation Check
  const handleBackWithCheck = () => {
    if (isDirty) {
      if (confirm("Você possui alterações pendentes não salvas. Deseja realmente voltar? Suas modificações serão perdidas.")) {
        onBack();
      }
    } else {
      onBack();
    }
  };

  // Helper to re-arrange order field when items are moved or inserted
  const updateOrderFields = (list: any[]) => {
    return list.map((item, index) => ({ ...item, ordem: index + 1 }));
  };

  // Move item in array for order adjustments
  const handleMoveItem = (tab: MenuTab, index: number, direction: "up" | "down") => {
    let list: any[] = [];
    let setter: any = null;

    if (tab === "colaboradores") {
      list = [...colaboradores];
      setter = setColaboradores;
    } else if (tab === "postos") {
      list = [...postos];
      setter = setPostos;
    } else if (tab === "secoes") {
      list = [...secoes];
      setter = setSecoes;
    } else if (tab === "legendas") {
      list = [...legendas];
      setter = setLegendas;
    } else return;

    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === list.length - 1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    const orderedList = updateOrderFields(list);
    setter(orderedList);
  };

  // Open Delete Confirmation
  const requestDelete = (type: MenuTab, id: string, label: string) => {
    setConfirmDeleteOpen({ type, id, label });
  };

  // Execute Delete in local memory
  const handleExecuteDelete = () => {
    if (!confirmDeleteOpen) return;
    const { type, id } = confirmDeleteOpen;

    if (type === "colaboradores") {
      setColaboradores((prev) => prev.filter((c) => c.re !== id));
      setRemovedColaboradores((prev) => [...prev, id]);
    } else if (type === "usuarios") {
      setUsuarios((prev) => prev.filter((u) => u.re !== id));
      setRemovedUsuarios((prev) => [...prev, id]);
    } else if (type === "postos") {
      setPostos((prev) => {
        const filtered = prev.filter((p) => p.sigla !== id);
        return updateOrderFields(filtered);
      });
      setRemovedPostos((prev) => [...prev, id]);
    } else if (type === "secoes") {
      setSecoes((prev) => {
        const filtered = prev.filter((s) => s.nome !== id);
        return updateOrderFields(filtered);
      });
      setRemovedSecoes((prev) => [...prev, id]);
    } else if (type === "legendas") {
      setLegendas((prev) => {
        const filtered = prev.filter((l) => l.sigla !== id);
        return updateOrderFields(filtered);
      });
      setRemovedLegendas((prev) => [...prev, id]);
    }

    setConfirmDeleteOpen(null);
  };

  // Save all states to Firestore & audit in logs
  const handleSaveChanges = async () => {
    setConfirmSaveOpen(false);
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const batch = writeBatch(db);
      const alteracoes: AuditAlteracao[] = [];
      const now = new Date();
      const timestamp = Timestamp.now();

      const createAuditLog = (
        modulo: string,
        operacao: string,
        registro: string,
        campo: string,
        ant: string,
        nvo: string
      ) => {
        alteracoes.push({
          campo: `${operacao} — ${campo}`,
          antes: ant,
          depois: nvo,
          colaborador: `${modulo}: ${registro}`,
        });
      };

      // --- 1. AUDIT & SAVE: COLABORADORES ---
      // A. Handle deletes
      for (const reDel of removedColaboradores) {
        const original = origColaboradores.find((c) => c.re === reDel);
        const colLabel = original ? `${original.postoGrad} ${original.nome}` : reDel;
        batch.delete(doc(db, "colaboradores", reDel));
        createAuditLog("Colaboradores", "Exclusão", colLabel, "Todos", `${colLabel} (R.E. ${reDel})`, "");
      }
      // B. Handle creations and edits
      for (const col of colaboradores) {
        const original = origColaboradores.find((c) => c.re === col.re);
        const docRef = doc(db, "colaboradores", col.re);
        batch.set(docRef, prepareFirestoreWrite(`colaboradores/${col.re}`, {
          ...col,
          updatedAt: timestamp,
          createdAt: col.createdAt || timestamp
        }));

        const colLabel = `${col.postoGrad} ${col.nome}`;

        if (!original) {
          // Inclusion
          createAuditLog(
            "Colaboradores", 
            "Inclusão", 
            colLabel, 
            "Todos", 
            "", 
            `RE: ${col.re}, Posto: ${col.postoGrad}, Nome Completo: ${col.nomeCompleto || ""}, Guerra: ${col.nome}, Seção: ${col.secao}, Ordem: ${col.ordem}, Ativo: ${col.ativo ? "Sim" : "Não"}`
          );
        } else {
          // Edits
          if (col.postoGrad !== original.postoGrad) {
            createAuditLog("Colaboradores", "Edição", colLabel, "Posto/Graduação", original.postoGrad, col.postoGrad);
          }
          if (col.nome !== original.nome) {
            createAuditLog("Colaboradores", "Edição", colLabel, "Nome de Guerra", original.nome, col.nome);
          }
          if (col.nomeCompleto !== original.nomeCompleto) {
            createAuditLog("Colaboradores", "Edição", colLabel, "Nome Completo", original.nomeCompleto || "", col.nomeCompleto || "");
          }
          if (col.secao !== original.secao) {
            createAuditLog("Colaboradores", "Edição", colLabel, "Seção", original.secao, col.secao);
          }
          if (col.ativo !== original.ativo) {
            createAuditLog("Colaboradores", "Edição", colLabel, "Situação (Ativo)", original.ativo ? "Ativo" : "Inativo", col.ativo ? "Ativo" : "Inativo");
          }
          if (col.ordem !== original.ordem) {
            createAuditLog("Colaboradores", "Ordenação", colLabel, "Ordem", String(original.ordem || 0), String(col.ordem || 0));
          }
          if (col.observacao !== original.observacao) {
            createAuditLog("Colaboradores", "Edição", colLabel, "Observação", original.observacao || "", col.observacao || "");
          }
        }
      }

      // --- 2. AUDIT & SAVE: USUARIOS ---
      // A. Deletes
      for (const reDel of removedUsuarios) {
        const original = origUsuarios.find((u) => u.re === reDel);
        const userLabel = original ? `${original.postoGrad} ${original.nome}` : reDel;
        batch.delete(doc(db, "usuarios", reDel));
        createAuditLog("Usuários", "Exclusão", userLabel, "Todos", `${userLabel} (R.E. ${reDel})`, "");
      }
      // B. Creations and edits
      for (const usr of usuarios) {
        const original = origUsuarios.find((u) => u.re === usr.re);
        const docRef = doc(db, "usuarios", usr.re);
        batch.set(docRef, prepareFirestoreWrite(`usuarios/${usr.re}`, usr as unknown as Record<string, unknown>));

        const userLabel = `${usr.postoGrad} ${usr.nome}`;

        if (!original) {
          createAuditLog(
            "Usuários",
            "Inclusão",
            userLabel,
            "Todos",
            "",
            `RE: ${usr.re}, Posto: ${usr.postoGrad}, Nome Completo: ${usr.nomeCompleto || ""}, Guerra: ${usr.nome}, Seção: ${usr.secao}, Perfil: ${usr.perfil || "Operador"}, Ativo: ${usr.ativo ? "Sim" : "Não"}`
          );
        } else {
          if (usr.postoGrad !== original.postoGrad) {
            createAuditLog("Usuários", "Edição", userLabel, "Posto/Graduação", original.postoGrad, usr.postoGrad);
          }
          if (usr.nome !== original.nome) {
            createAuditLog("Usuários", "Edição", userLabel, "Nome de Guerra", original.nome, usr.nome);
          }
          if (usr.nomeCompleto !== original.nomeCompleto) {
            createAuditLog("Usuários", "Edição", userLabel, "Nome Completo", original.nomeCompleto || "", usr.nomeCompleto || "");
          }
          if (usr.secao !== original.secao) {
            createAuditLog("Usuários", "Edição", userLabel, "Seção", original.secao, usr.secao);
          }
          if (usr.perfil !== original.perfil) {
            createAuditLog("Usuários", "Edição", userLabel, "Perfil", original.perfil || "Operador", usr.perfil || "Operador");
          }
          if (usr.ativo !== original.ativo) {
            createAuditLog("Usuários", "Edição", userLabel, "Situação (Ativo)", original.ativo ? "Ativo" : "Inativo", usr.ativo ? "Ativo" : "Inativo");
          }
        }
      }

      // --- 3. AUDIT & SAVE: POSTOS ---
      // A. Deletes
      for (const siglaDel of removedPostos) {
        const docId = siglaDel.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        batch.delete(doc(db, "postos", docId));
        createAuditLog("Postos e Graduações", "Exclusão", siglaDel, "Todos", siglaDel, "");
      }
      // B. Creations and edits
      for (const p of postos) {
        const original = origPostos.find((op) => op.sigla === p.sigla);
        const docId = p.sigla.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        const docRef = doc(db, "postos", docId);
        batch.set(docRef, prepareFirestoreWrite(`postos/${docId}`, p as unknown as Record<string, unknown>));

        if (!original) {
          createAuditLog("Postos e Graduações", "Inclusão", p.sigla, "Todos", "", `Sigla: ${p.sigla}, Descricao: ${p.descricao}, Ordem: ${p.ordem}`);
        } else {
          if (p.descricao !== original.descricao) {
            createAuditLog("Postos e Graduações", "Edição", p.sigla, "Descrição", original.descricao, p.descricao);
          }
          if (p.ordem !== original.ordem) {
            createAuditLog("Postos e Graduações", "Ordenação", p.sigla, "Ordem", String(original.ordem || 0), String(p.ordem || 0));
          }
        }
      }

      // --- 4. AUDIT & SAVE: SECOES ---
      // A. Deletes
      for (const nomeDel of removedSecoes) {
        const docId = nomeDel.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        batch.delete(doc(db, "secoes", docId));
        createAuditLog("Seções", "Exclusão", nomeDel, "Todos", nomeDel, "");
      }
      // B. Creations and edits
      for (const s of secoes) {
        const original = origSecoes.find((os) => os.nome === s.nome);
        const docId = s.nome.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        const docRef = doc(db, "secoes", docId);
        batch.set(docRef, prepareFirestoreWrite(`secoes/${docId}`, s as unknown as Record<string, unknown>));

        if (!original) {
          createAuditLog("Seções", "Inclusão", s.nome, "Todos", "", `Nome: ${s.nome}, Ordem: ${s.ordem}, Ativo: ${s.ativo ? "Sim" : "Não"}`);
        } else {
          if (s.ordem !== original.ordem) {
            createAuditLog("Seções", "Ordenação", s.nome, "Ordem", String(original.ordem || 0), String(s.ordem || 0));
          }
          if (s.ativo !== original.ativo) {
            createAuditLog("Seções", "Edição", s.nome, "Ativo", original.ativo ? "Sim" : "Não", s.ativo ? "Sim" : "Não");
          }
        }
      }

      // --- 5. AUDIT & SAVE: LEGENDAS ---
      // A. Deletes
      for (const siglaDel of removedLegendas) {
        const docId = siglaDel.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        batch.delete(doc(db, "legendas", docId));
        createAuditLog("Legendas da Escala", "Exclusão", siglaDel, "Todos", siglaDel, "");
      }
      // B. Creations and edits
      for (const l of legendas) {
        const original = origLegendas.find((ol) => ol.sigla === l.sigla);
        const docId = l.sigla.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        const docRef = doc(db, "legendas", docId);
        batch.set(docRef, prepareFirestoreWrite(`legendas/${docId}`, l as unknown as Record<string, unknown>));

        if (!original) {
          createAuditLog("Legendas da Escala", "Inclusão", l.sigla, "Todos", "", `Sigla: ${l.sigla}, Descrição: ${l.descricao}, Cor: ${l.cor}, Ordem: ${l.ordem}, Ativo: ${l.ativo ? "Sim" : "Não"}`);
        } else {
          if (l.descricao !== original.descricao) {
            createAuditLog("Legendas da Escala", "Edição", l.sigla, "Descrição", original.descricao, l.descricao);
          }
          if (l.cor !== original.cor) {
            createAuditLog("Legendas da Escala", "Edição", l.sigla, "Cor", original.cor, l.cor);
          }
          if (l.ordem !== original.ordem) {
            createAuditLog("Legendas da Escala", "Ordenação", l.sigla, "Ordem", String(original.ordem || 0), String(l.ordem || 0));
          }
          if (l.ativo !== original.ativo) {
            createAuditLog("Legendas da Escala", "Edição", l.sigla, "Ativo", original.ativo ? "Sim" : "Não", l.ativo ? "Sim" : "Não");
          }
        }
      }

      // --- 6. AUDIT & SAVE: CONFIGS GERAIS ---
      if (JSON.stringify(gerais) !== JSON.stringify(origGerais)) {
        batch.set(
          doc(db, "configuracoes", "gerais"),
          prepareFirestoreWrite("configuracoes/gerais", {
            ...gerais,
            updatedAt: timestamp
          })
        );

        if (gerais.nomeOrganizacao !== origGerais.nomeOrganizacao) {
          createAuditLog("Configurações Gerais", "Edição", "Gerais", "Nome da Organização", origGerais.nomeOrganizacao, gerais.nomeOrganizacao);
        }
        if (gerais.unidade !== origGerais.unidade) {
          createAuditLog("Configurações Gerais", "Edição", "Gerais", "Unidade", origGerais.unidade, gerais.unidade);
        }
        if (gerais.pdfExportHeader !== origGerais.pdfExportHeader) {
          createAuditLog("Configurações Gerais", "Edição", "Gerais", "Cabeçalho PDF", origGerais.pdfExportHeader, gerais.pdfExportHeader);
        }
        if (gerais.excelExportHeader !== origGerais.excelExportHeader) {
          createAuditLog("Configurações Gerais", "Edição", "Gerais", "Cabeçalho Excel", origGerais.excelExportHeader, gerais.excelExportHeader);
        }
        if (gerais.tema !== origGerais.tema) {
          createAuditLog("Configurações Gerais", "Edição", "Gerais", "Tema", origGerais.tema, gerais.tema);
        }
        if (gerais.idioma !== origGerais.idioma) {
          createAuditLog("Configurações Gerais", "Edição", "Gerais", "Idioma", origGerais.idioma, gerais.idioma);
        }
      }

      // Commit the database batch
      await batch.commit();

      // Uma operação de auditoria com todas as alterações internas
      await auditConfiguracao({
        usuario,
        alteracoes,
        detalhes: "Salvamento de configurações administrativas",
      });

      // Set original states to the newly saved ones
      setOrigColaboradores(JSON.parse(JSON.stringify(colaboradores)));
      setOrigUsuarios(JSON.parse(JSON.stringify(usuarios)));
      setOrigPostos(JSON.parse(JSON.stringify(postos)));
      setOrigSecoes(JSON.parse(JSON.stringify(secoes)));
      setOrigLegendas(JSON.parse(JSON.stringify(legendas)));
      setOrigGerais(JSON.parse(JSON.stringify(gerais)));

      // Reset removed logs
      setRemovedColaboradores([]);
      setRemovedUsuarios([]);
      setRemovedPostos([]);
      setRemovedSecoes([]);
      setRemovedLegendas([]);

      setSaveSuccess(true);
      // Auto-hide success alert in 4 seconds
      setTimeout(() => setSaveSuccess(false), 4000);

    } catch (err: any) {
      console.error("Erro ao salvar alterações no banco:", err);
      setSaveError("Ocorreu um erro ao salvar as alterações no Firestore. Verifique suas regras.");
    } finally {
      setSaving(false);
    }
  };

  // --- MODAL SUBMISSIONS ---
  const handleColSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCol) return;

    if (!currentCol.re.trim() || !currentCol.nomeCompleto?.trim() || !currentCol.nome.trim()) {
      alert("Por favor, preencha todos os campos obrigatórios (*).");
      return;
    }

    // Check if adding and RE already exists in working list
    const isNew = !colaboradores.some((c) => c.re === currentCol.re);
    const existingIndex = colaboradores.findIndex((c) => c.re === currentCol.re);

    let updatedList = [...colaboradores];

    if (existingIndex > -1) {
      // Edit mode
      updatedList[existingIndex] = { ...currentCol };
    } else {
      // Add mode
      const maxOrdem = colaboradores.reduce((max, c) => (c.ordem && c.ordem > max ? c.ordem : max), 0);
      const newCol: Colaborador = {
        ...currentCol,
        ordem: maxOrdem + 1,
        ativo: currentCol.ativo !== undefined ? currentCol.ativo : true
      };
      updatedList.push(newCol);
    }

    setColaboradores(updatedList);
    setColModalOpen(false);
    setCurrentCol(null);
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!currentUser.re.trim() || !currentUser.nomeCompleto?.trim() || !currentUser.nome.trim()) {
      alert("Por favor, preencha todos os campos obrigatórios (*).");
      return;
    }

    const existingIndex = usuarios.findIndex((u) => u.re === currentUser.re);
    let updatedList = [...usuarios];

    if (existingIndex > -1) {
      updatedList[existingIndex] = { ...currentUser };
    } else {
      const newUser: Usuario = {
        ...currentUser,
        perfil: currentUser.perfil || "Operador",
        ativo: currentUser.ativo !== undefined ? currentUser.ativo : true
      };
      updatedList.push(newUser);
    }

    setUsuarios(updatedList);
    setUserModalOpen(false);
    setCurrentUser(null);
  };

  const handlePostoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPosto) return;

    if (!currentPosto.sigla.trim() || !currentPosto.descricao.trim()) {
      alert("Por favor, preencha todos os campos obrigatórios (*).");
      return;
    }

    const existingIndex = postos.findIndex((p) => p.sigla === currentPosto.sigla);
    let updatedList = [...postos];

    if (existingIndex > -1) {
      updatedList[existingIndex] = { ...currentPosto };
    } else {
      const maxOrdem = postos.reduce((max, p) => (p.ordem && p.ordem > max ? p.ordem : max), 0);
      updatedList.push({
        ...currentPosto,
        ordem: maxOrdem + 1
      });
    }

    setPostos(updatedList);
    setPostoModalOpen(false);
    setCurrentPosto(null);
  };

  const handleSecaoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSecao) return;

    if (!currentSecao.nome.trim()) {
      alert("Por favor, preencha o nome da seção.");
      return;
    }

    const existingIndex = secoes.findIndex((s) => s.nome === currentSecao.nome);
    let updatedList = [...secoes];

    if (existingIndex > -1) {
      updatedList[existingIndex] = { ...currentSecao };
    } else {
      const maxOrdem = secoes.reduce((max, s) => (s.ordem && s.ordem > max ? s.ordem : max), 0);
      updatedList.push({
        ...currentSecao,
        ordem: maxOrdem + 1,
        ativo: true
      });
    }

    setSecoes(updatedList);
    setSecaoModalOpen(false);
    setCurrentSecao(null);
  };

  const handleLegendaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLegenda) return;

    if (!currentLegenda.sigla.trim() || !currentLegenda.descricao.trim()) {
      alert("Por favor, preencha os campos obrigatórios (*).");
      return;
    }

    const existingIndex = legendas.findIndex((l) => l.sigla === currentLegenda.sigla);
    let updatedList = [...legendas];

    if (existingIndex > -1) {
      updatedList[existingIndex] = { ...currentLegenda };
    } else {
      const maxOrdem = legendas.reduce((max, l) => (l.ordem && l.ordem > max ? l.ordem : max), 0);
      updatedList.push({
        ...currentLegenda,
        ordem: maxOrdem + 1,
        ativo: true
      });
    }

    setLegendas(updatedList);
    setLegendaModalOpen(false);
    setCurrentLegenda(null);
  };

  // --- LIST COMPUTATIONS (SEARCH, FILTER & PAGINATION) ---
  const filteredColaboradores = useMemo(() => {
    let list = colaboradores;
    if (colSearch.trim()) {
      const query = colSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.nome.toLowerCase().includes(query) ||
          c.re.toLowerCase().includes(query) ||
          (c.nomeCompleto && c.nomeCompleto.toLowerCase().includes(query)) ||
          c.postoGrad.toLowerCase().includes(query) ||
          c.secao.toLowerCase().includes(query)
      );
    }
    if (colActiveFilter === "ativos") {
      list = list.filter((c) => c.ativo !== false);
    } else if (colActiveFilter === "inativos") {
      list = list.filter((c) => c.ativo === false);
    }
    return list;
  }, [colaboradores, colSearch, colActiveFilter]);

  const pagedColaboradores = useMemo(() => {
    const startIndex = (colPage - 1) * colPerPage;
    return filteredColaboradores.slice(startIndex, startIndex + colPerPage);
  }, [filteredColaboradores, colPage]);

  const totalColPages = Math.ceil(filteredColaboradores.length / colPerPage) || 1;

  const filteredUsuarios = useMemo(() => {
    let list = usuarios;
    if (userSearch.trim()) {
      const query = userSearch.toLowerCase();
      list = list.filter(
        (u) =>
          u.nome.toLowerCase().includes(query) ||
          u.re.toLowerCase().includes(query) ||
          (u.nomeCompleto && u.nomeCompleto.toLowerCase().includes(query)) ||
          u.postoGrad.toLowerCase().includes(query) ||
          u.secao.toLowerCase().includes(query)
      );
    }
    return list;
  }, [usuarios, userSearch]);

  const pagedUsuarios = useMemo(() => {
    const startIndex = (userPage - 1) * userPerPage;
    return filteredUsuarios.slice(startIndex, startIndex + userPerPage);
  }, [filteredUsuarios, userPage]);

  const totalUserPages = Math.ceil(filteredUsuarios.length / userPerPage) || 1;

  // Render Page Content
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-sm font-semibold text-gray-500">Carregando painel administrativo...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Top Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:min-h-16 sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              <button
                id="back-btn"
                onClick={handleBackWithCheck}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                title="Voltar"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold tracking-tight leading-none text-white truncate">
                  Painel de Configurações
                </h1>
                <p className="text-[11px] text-slate-400 mt-1 hidden sm:block">Administração do Sistema de Escalas</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-end">
              {isDirty && (
                <span className="flex items-center space-x-1.5 bg-amber-950/80 border border-amber-900 text-amber-400 px-2.5 py-1 rounded text-[10px] sm:text-xs font-bold uppercase animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                  <span className="hidden sm:inline">Alterações Pendentes</span>
                  <span className="sm:hidden">Pendente</span>
                </span>
              )}

              <button
                id="discard-config-btn"
                onClick={handleDiscardChanges}
                disabled={!isDirty || saving}
                className={`px-3 py-1.5 text-xs font-bold rounded-md border transition-all cursor-pointer ${
                  isDirty 
                    ? "bg-slate-800 hover:bg-slate-750 text-gray-300 border-gray-700" 
                    : "bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed"
                }`}
              >
                Descartar
              </button>

              <button
                id="save-config-btn"
                onClick={() => setConfirmSaveOpen(true)}
                disabled={!isDirty || saving}
                className={`inline-flex items-center space-x-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-md shadow-sm transition-all cursor-pointer ${
                  isDirty 
                    ? "bg-blue-600 hover:bg-blue-500 text-white border border-transparent" 
                    : "bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed"
                }`}
              >
                <Save size={14} />
                <span className="hidden sm:inline">Salvar Configurações</span>
                <span className="sm:hidden">Salvar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Wrapper */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Alerts */}
        {saveSuccess && (
          <div className="mb-6 rounded-md bg-emerald-50 border border-emerald-200 p-4">
            <div className="flex">
              <div className="flex-shrink-0 text-emerald-500">
                <Check size={20} />
              </div>
              <div className="ml-3">
                <p className="text-sm font-bold text-emerald-800">Sucesso!</p>
                <p className="text-xs text-emerald-700 mt-1">Todas as alterações foram gravadas e o registro de auditoria foi gerado com sucesso.</p>
              </div>
            </div>
          </div>
        )}

        {saveError && (
          <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4">
            <div className="flex">
              <div className="flex-shrink-0 text-red-500">
                <AlertCircle size={20} />
              </div>
              <div className="ml-3">
                <p className="text-sm font-bold text-red-800">Erro de Operação</p>
                <p className="text-xs text-red-700 mt-1">{saveError}</p>
              </div>
            </div>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-12 lg:gap-8">
          {/* Sidebar Tabs */}
          <aside className="lg:col-span-3 mb-6 lg:mb-0">
            <nav className="space-y-1 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">Módulos Administrativos</p>
              
              <button
                id="tab-colaboradores"
                onClick={() => setActiveTab("colaboradores")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeTab === "colaboradores"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Users size={16} />
                <span>Colaboradores</span>
              </button>

              {usuario.perfil === "Administrador" && (
                <button
                  id="tab-usuarios"
                  onClick={() => setActiveTab("usuarios")}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    activeTab === "usuarios"
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Shield size={16} />
                  <span>Usuários</span>
                </button>
              )}

              {usuario.perfil === "Administrador" && (
                <button
                  id="tab-registros"
                  onClick={() => setActiveTab("registros")}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    activeTab === "registros"
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <FileText size={16} />
                  <span>Registros (Logs)</span>
                </button>
              )}

              <button
                id="tab-postos"
                onClick={() => setActiveTab("postos")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeTab === "postos"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Briefcase size={16} />
                <span>Postos e Graduações</span>
              </button>

              <button
                id="tab-secoes"
                onClick={() => setActiveTab("secoes")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeTab === "secoes"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Layers size={16} />
                <span>Seções</span>
              </button>

              <button
                id="tab-legendas"
                onClick={() => setActiveTab("legendas")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeTab === "legendas"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Activity size={16} />
                <span>Legendas da Escala</span>
              </button>

              <button
                id="tab-gerais"
                onClick={() => setActiveTab("gerais")}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeTab === "gerais"
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Settings size={16} />
                <span>Configurações Gerais</span>
              </button>
            </nav>
          </aside>

          {/* Tab Work Panel Content */}
          <main className="lg:col-span-9 bg-white border border-gray-200 shadow-xs rounded-xl p-6">
            
            {/* 1. MODULE: COLABORADORES */}
            {activeTab === "colaboradores" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Módulo Colaboradores</h2>
                    <p className="text-xs text-gray-500">Gerenciamento da lista de efetivo policial e ordem de precedência.</p>
                  </div>
                  <button
                    id="new-col-btn"
                    onClick={() => {
                      setCurrentCol({
                        re: "",
                        postoGrad: postos[0]?.sigla || "SD PM",
                        nomeCompleto: "",
                        nome: "",
                        secao: secoes[0]?.nome || "Seç Gest Educ",
                        observacao: "",
                        ativo: true
                      });
                      setColModalOpen(true);
                    }}
                    className="mt-3 sm:mt-0 inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Novo Colaborador</span>
                  </button>
                </div>

                {/* Search & Filter bar */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                      <Search size={14} />
                    </span>
                    <input
                      id="col-search"
                      type="text"
                      placeholder="Pesquisar por RE, Nome, Seção..."
                      value={colSearch}
                      onChange={(e) => {
                        setColSearch(e.target.value);
                        setColPage(1);
                      }}
                      className="block w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center space-x-1 border border-gray-300 rounded-lg p-1 bg-gray-50">
                    <button
                      id="col-filter-todos"
                      onClick={() => setColActiveFilter("todos")}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        colActiveFilter === "todos" ? "bg-white text-blue-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      id="col-filter-ativos"
                      onClick={() => setColActiveFilter("ativos")}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        colActiveFilter === "ativos" ? "bg-white text-blue-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      Ativos
                    </button>
                    <button
                      id="col-filter-inativos"
                      onClick={() => setColActiveFilter("inativos")}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        colActiveFilter === "inativos" ? "bg-white text-blue-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      Inativos
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="table-scroll border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs text-gray-500">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-center w-16">Ordem</th>
                        <th className="px-4 py-3">Posto/Grad</th>
                        <th className="px-4 py-3">R.E.</th>
                        <th className="px-4 py-3">Nome de Guerra</th>
                        <th className="px-4 py-3">Nome Completo</th>
                        <th className="px-4 py-3">Seção</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {pagedColaboradores.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-gray-400 font-semibold">Nenhum colaborador correspondente encontrado.</td>
                        </tr>
                      ) : (
                        pagedColaboradores.map((col, index) => {
                          const actualIndex = colaboradores.findIndex((c) => c.re === col.re);
                          return (
                            <tr key={col.re} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center space-x-1.5">
                                  <span className="font-bold text-gray-500">{col.ordem || actualIndex + 1}</span>
                                  <div className="flex flex-col">
                                    <button
                                      onClick={() => handleMoveItem("colaboradores", actualIndex, "up")}
                                      disabled={actualIndex === 0}
                                      className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowUp size={11} />
                                    </button>
                                    <button
                                      onClick={() => handleMoveItem("colaboradores", actualIndex, "down")}
                                      disabled={actualIndex === colaboradores.length - 1}
                                      className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowDown size={11} />
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-600 font-semibold">{col.postoGrad}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">{col.re}</td>
                              <td className="px-4 py-3 font-bold text-blue-900">{col.nome}</td>
                              <td className="px-4 py-3 text-gray-500 text-[11px]">{col.nomeCompleto || "Não informado"}</td>
                              <td className="px-4 py-3 text-gray-600 font-medium">{col.secao}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  col.ativo !== false ? "bg-green-150 text-green-800" : "bg-red-150 text-red-800"
                                }`}>
                                  {col.ativo !== false ? "ATIVO" : "INATIVO"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right space-x-1">
                                <button
                                  onClick={() => {
                                    setCurrentCol({ ...col });
                                    setColModalOpen(true);
                                  }}
                                  className="p-1.5 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                  title="Editar"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => requestDelete("colaboradores", col.re, `${col.postoGrad} ${col.nome}`)}
                                  className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                  title="Excluir"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-gray-500">Mostrando de <b>{Math.min(filteredColaboradores.length, (colPage - 1) * colPerPage + 1)}</b> a <b>{Math.min(filteredColaboradores.length, colPage * colPerPage)}</b> de <b>{filteredColaboradores.length}</b> registros.</span>
                  <div className="inline-flex space-x-1.5">
                    <button
                      onClick={() => setColPage((p) => Math.max(1, p - 1))}
                      disabled={colPage === 1}
                      className="px-2.5 py-1 text-xs font-bold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft size={14} className="inline mr-0.5" /> Anterior
                    </button>
                    <button
                      onClick={() => setColPage((p) => Math.min(totalColPages, p + 1))}
                      disabled={colPage === totalColPages}
                      className="px-2.5 py-1 text-xs font-bold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                    >
                      Próxima <ChevronRight size={14} className="inline ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. MODULE: USUÁRIOS */}
            {activeTab === "usuarios" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Módulo Usuários</h2>
                    <p className="text-xs text-gray-500">Gerencie contas de usuários com permissões de Operador, Administrador ou Gestor.</p>
                  </div>
                  <button
                    id="new-user-btn"
                    onClick={() => {
                      setCurrentUser({
                        re: "",
                        postoGrad: postos[0]?.sigla || "SD PM",
                        nomeCompleto: "",
                        nome: "",
                        secao: secoes[0]?.nome || "Seç Gest Educ",
                        perfil: "Operador",
                        ativo: true
                      });
                      setUserModalOpen(true);
                    }}
                    className="mt-3 sm:mt-0 inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Novo Usuário</span>
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative mb-4">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <Search size={14} />
                  </span>
                  <input
                    id="user-search"
                    type="text"
                    placeholder="Pesquisar por RE, Nome, Perfil..."
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      setUserPage(1);
                    }}
                    className="block w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Table */}
                <div className="table-scroll border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs text-gray-500">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Posto/Grad</th>
                        <th className="px-4 py-3">R.E.</th>
                        <th className="px-4 py-3">Nome de Guerra</th>
                        <th className="px-4 py-3">Nome Completo</th>
                        <th className="px-4 py-3">Seção</th>
                        <th className="px-4 py-3 text-center">Perfil</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {pagedUsuarios.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-gray-400 font-semibold">Nenhum usuário correspondente encontrado.</td>
                        </tr>
                      ) : (
                        pagedUsuarios.map((usr) => (
                          <tr key={usr.re} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-600 font-semibold">{usr.postoGrad}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">{usr.re}</td>
                              <td className="px-4 py-3 font-bold text-gray-800">{usr.nome}</td>
                              <td className="px-4 py-3 text-gray-500 text-[11px]">{usr.nomeCompleto || "Não informado"}</td>
                              <td className="px-4 py-3 text-gray-600 font-medium">{usr.secao}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  usr.perfil === "Administrador" 
                                    ? "bg-purple-50 text-purple-700 border-purple-200" 
                                    : usr.perfil === "Gestor"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-blue-50 text-blue-700 border-blue-100"
                                }`}>
                                  {usr.perfil || "Operador"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  usr.ativo !== false ? "bg-green-150 text-green-800" : "bg-red-150 text-red-800"
                                }`}>
                                  {usr.ativo !== false ? "ATIVO" : "INATIVO"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right space-x-1">
                                <button
                                  onClick={() => {
                                    setCurrentUser({ ...usr });
                                    setUserModalOpen(true);
                                  }}
                                  className="p-1.5 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                  title="Editar"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => requestDelete("usuarios", usr.re, `${usr.postoGrad} ${usr.nome}`)}
                                  className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                  title="Excluir"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-gray-500">Mostrando de <b>{Math.min(filteredUsuarios.length, (userPage - 1) * userPerPage + 1)}</b> a <b>{Math.min(filteredUsuarios.length, userPage * userPerPage)}</b> de <b>{filteredUsuarios.length}</b> registros.</span>
                  <div className="inline-flex space-x-1.5">
                    <button
                      onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                      disabled={userPage === 1}
                      className="px-2.5 py-1 text-xs font-bold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft size={14} className="inline mr-0.5" /> Anterior
                    </button>
                    <button
                      onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                      disabled={userPage === totalUserPages}
                      className="px-2.5 py-1 text-xs font-bold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                    >
                      Próxima <ChevronRight size={14} className="inline ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. MODULE: POSTOS E GRADUAÇÕES */}
            {activeTab === "postos" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Módulo Postos e Graduações</h2>
                    <p className="text-xs text-gray-500">Cadastro de patentes e graduações utilizadas nos menus de seleção do sistema.</p>
                  </div>
                  <button
                    id="new-posto-btn"
                    onClick={() => {
                      setCurrentPosto({ sigla: "", descricao: "" });
                      setPostoModalOpen(true);
                    }}
                    className="mt-3 sm:mt-0 inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Novo Posto/Graduação</span>
                  </button>
                </div>

                <div className="table-scroll border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs text-gray-500">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-center w-24">Ordem</th>
                        <th className="px-4 py-3">Sigla</th>
                        <th className="px-4 py-3">Descrição Completa</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {postos.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-gray-400 font-semibold">Nenhum posto cadastrado.</td>
                        </tr>
                      ) : (
                        postos.map((p, idx) => (
                          <tr key={p.sigla} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                <span className="font-bold text-gray-500">{p.ordem || idx + 1}</span>
                                <div className="flex flex-col">
                                  <button
                                    onClick={() => handleMoveItem("postos", idx, "up")}
                                    disabled={idx === 0}
                                    className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowUp size={11} />
                                  </button>
                                  <button
                                    onClick={() => handleMoveItem("postos", idx, "down")}
                                    disabled={idx === postos.length - 1}
                                    className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowDown size={11} />
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-blue-900">{p.sigla}</td>
                            <td className="px-4 py-3 text-gray-600">{p.descricao}</td>
                            <td className="px-4 py-3 text-right space-x-1">
                              <button
                                onClick={() => {
                                  setCurrentPosto({ ...p });
                                  setPostoModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                title="Editar"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => requestDelete("postos", p.sigla, p.sigla)}
                                className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                title="Excluir"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. MODULE: SEÇÕES */}
            {activeTab === "secoes" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Módulo Seções de Serviço</h2>
                    <p className="text-xs text-gray-500">Configure as seções ou divisões administrativas onde os militares prestam serviços.</p>
                  </div>
                  <button
                    id="new-secao-btn"
                    onClick={() => {
                      setCurrentSecao({ nome: "", ativo: true });
                      setSecaoModalOpen(true);
                    }}
                    className="mt-3 sm:mt-0 inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Nova Seção</span>
                  </button>
                </div>

                <div className="table-scroll border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs text-gray-500">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-center w-24">Ordem</th>
                        <th className="px-4 py-3">Nome da Seção</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {secoes.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-gray-400 font-semibold">Nenhuma seção cadastrada.</td>
                        </tr>
                      ) : (
                        secoes.map((s, idx) => (
                          <tr key={s.nome} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                <span className="font-bold text-gray-500">{s.ordem || idx + 1}</span>
                                <div className="flex flex-col">
                                  <button
                                    onClick={() => handleMoveItem("secoes", idx, "up")}
                                    disabled={idx === 0}
                                    className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowUp size={11} />
                                  </button>
                                  <button
                                    onClick={() => handleMoveItem("secoes", idx, "down")}
                                    disabled={idx === secoes.length - 1}
                                    className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowDown size={11} />
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-gray-800">{s.nome}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                s.ativo !== false ? "bg-green-150 text-green-800" : "bg-red-150 text-red-800"
                              }`}>
                                {s.ativo !== false ? "ATIVO" : "INATIVO"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right space-x-1">
                              <button
                                onClick={() => {
                                  setCurrentSecao({ ...s });
                                  setSecaoModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                title="Editar"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => requestDelete("secoes", s.nome, s.nome)}
                                className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                title="Excluir"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. MODULE: LEGENDAS DA ESCALA */}
            {activeTab === "legendas" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Módulo Legendas da Escala</h2>
                    <p className="text-xs text-gray-500">Configure as opções de turnos de trabalho, folgas e licenças exibidas nos dropdowns das escalas.</p>
                  </div>
                  <button
                    id="new-legenda-btn"
                    onClick={() => {
                      setCurrentLegenda({ sigla: "", descricao: "", cor: "verde", ativo: true });
                      setLegendaModalOpen(true);
                    }}
                    className="mt-3 sm:mt-0 inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Nova Legenda</span>
                  </button>
                </div>

                <div className="table-scroll border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs text-gray-500">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-center w-24">Ordem</th>
                        <th className="px-4 py-3">Sigla</th>
                        <th className="px-4 py-3">Descrição Completa</th>
                        <th className="px-4 py-3">Visual/Cor</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {legendas.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-gray-400 font-semibold">Nenhuma legenda cadastrada.</td>
                        </tr>
                      ) : (
                        legendas.map((l, idx) => (
                          <tr key={l.sigla} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                <span className="font-bold text-gray-500">{l.ordem || idx + 1}</span>
                                <div className="flex flex-col">
                                  <button
                                    onClick={() => handleMoveItem("legendas", idx, "up")}
                                    disabled={idx === 0}
                                    className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowUp size={11} />
                                  </button>
                                  <button
                                    onClick={() => handleMoveItem("legendas", idx, "down")}
                                    disabled={idx === legendas.length - 1}
                                    className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowDown size={11} />
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-gray-800">{l.sigla}</td>
                            <td className="px-4 py-3 text-gray-600">{l.descricao}</td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center px-3 py-1 rounded text-[11px] font-bold border border-gray-300"
                                style={{
                                  backgroundColor: translateColorToHex(l.cor) || "#ffffff",
                                  color: "#000000"
                                }}
                              >
                                {l.sigla}
                              </span>
                              <span className="text-[10px] text-gray-500 font-mono ml-2">
                                {l.cor || "Sem Cor (Fundo Branco)"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                l.ativo !== false ? "bg-green-150 text-green-800" : "bg-red-150 text-red-800"
                              }`}>
                                {l.ativo !== false ? "ATIVO" : "INATIVO"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right space-x-1">
                              <button
                                onClick={() => {
                                  setCurrentLegenda({ ...l });
                                  setLegendaModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                title="Editar"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => requestDelete("legendas", l.sigla, l.sigla)}
                                className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-900 rounded transition-colors cursor-pointer inline-flex items-center"
                                title="Excluir"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. MODULE: CONFIGURAÇÕES GERAIS */}
            {activeTab === "gerais" && (
              <div>
                <div className="mb-6 pb-4 border-b border-gray-150">
                  <h2 className="text-base font-bold text-gray-900">Configurações Gerais da Aplicação</h2>
                  <p className="text-xs text-gray-500">Parâmetros globais, padrões de exportação e preferências visuais do sistema.</p>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nome da Organização</label>
                      <input
                        type="text"
                        value={gerais.nomeOrganizacao}
                        onChange={(e) => setGerais((prev: any) => ({ ...prev, nomeOrganizacao: e.target.value }))}
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                        placeholder="Ex: Polícia Militar do Estado de São Paulo"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Unidade Administrativa</label>
                      <input
                        type="text"
                        value={gerais.unidade}
                        onChange={(e) => setGerais((prev: any) => ({ ...prev, unidade: e.target.value }))}
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                        placeholder="Ex: CPI-1 / 1º BPM/I"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Título de Exportação em PDF</label>
                      <input
                        type="text"
                        value={gerais.pdfExportHeader}
                        onChange={(e) => setGerais((prev: any) => ({ ...prev, pdfExportHeader: e.target.value }))}
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Título de Exportação em Excel</label>
                      <input
                        type="text"
                        value={gerais.excelExportHeader}
                        onChange={(e) => setGerais((prev: any) => ({ ...prev, excelExportHeader: e.target.value }))}
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tema Preferencial (Futuro)</label>
                      <select
                        value={gerais.tema}
                        onChange={(e) => setGerais((prev: any) => ({ ...prev, tema: e.target.value }))}
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                      >
                        <option value="light">Tema Claro (Padrão)</option>
                        <option value="dark">Tema Escuro</option>
                        <option value="cosmic">Tema Slate Cósmico</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Idioma Padrão</label>
                      <select
                        value={gerais.idioma}
                        onChange={(e) => setGerais((prev: any) => ({ ...prev, idioma: e.target.value }))}
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                      >
                        <option value="pt-BR">Português (Brasil)</option>
                        <option value="en-US">English (United States)</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-6">
                    <h3 className="text-xs font-bold text-blue-800 flex items-center mb-1">
                      <Settings size={14} className="mr-1.5" />
                      Área Preparada para Configurações Futuras
                    </h3>
                    <p className="text-[11px] text-blue-700 leading-relaxed">
                      Esta área está parametrizada com persistência completa no Firestore na coleção <b>configuracoes</b> (documento <b>gerais</b>). Novos módulos de exportação personalizados, regras automáticas de precedência de serviço e fuso horário do sistema poderão ser configurados aqui no futuro.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 7. MODULE: REGISTROS DE AUDITORIA (LOGS) */}
            {activeTab === "registros" && usuario.perfil === "Administrador" && (
              <LogsAuditPanel
                logs={logsList}
                loading={logsLoading}
                onReload={loadLogs}
                usuario={usuario}
              />
            )}
          </main>
        </div>
      </div>

      {/* --- ALL MODALS DIALOGS --- */}
      <AnimatePresence>
        {/* COLABORADOR ADD/EDIT MODAL */}
        {colModalOpen && currentCol && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-lg w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {colaboradores.some((c) => c.re === currentCol.re) ? "Editar Colaborador" : "Adicionar Colaborador"}
                </h3>
                <button onClick={() => setColModalOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleColSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">RE (Reg. Estatístico) *</label>
                    <input
                      type="text"
                      value={currentCol.re}
                      disabled={colaboradores.some((c) => c.re === currentCol.re)}
                      onChange={(e) => setCurrentCol({ ...currentCol, re: e.target.value })}
                      placeholder="Ex: 124342-0"
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold disabled:bg-gray-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Posto/Graduação *</label>
                    <select
                      value={currentCol.postoGrad}
                      onChange={(e) => setCurrentCol({ ...currentCol, postoGrad: e.target.value })}
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                      required
                    >
                      {postos.map((p) => (
                        <option key={p.sigla} value={p.sigla}>{p.sigla}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    value={currentCol.nomeCompleto || ""}
                    onChange={(e) => setCurrentCol({ ...currentCol, nomeCompleto: e.target.value })}
                    placeholder="Alex Herlemann Ventura"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nome de Guerra (Exibição) *</label>
                  <input
                    type="text"
                    value={currentCol.nome}
                    onChange={(e) => setCurrentCol({ ...currentCol, nome: e.target.value })}
                    placeholder="VENTURA"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Seção de Serviço *</label>
                    <select
                      value={currentCol.secao}
                      onChange={(e) => setCurrentCol({ ...currentCol, secao: e.target.value })}
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                      required
                    >
                      {secoes.map((s) => (
                        <option key={s.nome} value={s.nome}>{s.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center h-full pt-6">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentCol.ativo !== false}
                        onChange={(e) => setCurrentCol({ ...currentCol, ativo: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-xs font-bold text-gray-700 uppercase">Colaborador Ativo</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Observações</label>
                  <input
                    type="text"
                    value={currentCol.observacao || ""}
                    onChange={(e) => setCurrentCol({ ...currentCol, observacao: e.target.value })}
                    placeholder="Ex: Motorista, Adjunto, etc."
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => setColModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* USUARIO ADD/EDIT MODAL */}
        {userModalOpen && currentUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-lg w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {usuarios.some((u) => u.re === currentUser.re) ? "Editar Usuário" : "Adicionar Usuário"}
                </h3>
                <button onClick={() => setUserModalOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUserSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">RE (Registro Estatístico) *</label>
                    <input
                      type="text"
                      value={currentUser.re}
                      disabled={usuarios.some((u) => u.re === currentUser.re)}
                      onChange={(e) => setCurrentUser({ ...currentUser, re: e.target.value })}
                      placeholder="Ex: 124342-0"
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold disabled:bg-gray-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Posto/Graduação *</label>
                    <select
                      value={currentUser.postoGrad}
                      onChange={(e) => setCurrentUser({ ...currentUser, postoGrad: e.target.value })}
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                      required
                    >
                      {postos.map((p) => (
                        <option key={p.sigla} value={p.sigla}>{p.sigla}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    value={currentUser.nomeCompleto || ""}
                    onChange={(e) => setCurrentUser({ ...currentUser, nomeCompleto: e.target.value })}
                    placeholder="Ex: Alex Herlemann Ventura"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nome de Guerra *</label>
                  <input
                    type="text"
                    value={currentUser.nome}
                    onChange={(e) => setCurrentUser({ ...currentUser, nome: e.target.value })}
                    placeholder="Ex: VENTURA"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Seção *</label>
                    <select
                      value={currentUser.secao}
                      onChange={(e) => setCurrentUser({ ...currentUser, secao: e.target.value })}
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                      required
                    >
                      {secoes.map((s) => (
                        <option key={s.nome} value={s.nome}>{s.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Perfil de Acesso *</label>
                    <select
                      value={currentUser.perfil || "Operador"}
                      onChange={(e) => setCurrentUser({ ...currentUser, perfil: e.target.value as any })}
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                      required
                    >
                      <option value="Operador">Operador</option>
                      <option value="Administrador">Administrador</option>
                      <option value="Gestor">Gestor</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentUser.ativo !== false}
                      onChange={(e) => setCurrentUser({ ...currentUser, ativo: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-xs font-bold text-gray-700 uppercase">Usuário Ativo (Acesso Liberado)</span>
                  </label>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => setUserModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* POSTO ADD/EDIT MODAL */}
        {postoModalOpen && currentPosto && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-sm w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {postos.some((p) => p.sigla === currentPosto.sigla) ? "Editar Posto/Grad" : "Adicionar Posto/Grad"}
                </h3>
                <button onClick={() => setPostoModalOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handlePostoSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Sigla *</label>
                  <input
                    type="text"
                    value={currentPosto.sigla}
                    disabled={postos.some((p) => p.sigla === currentPosto.sigla)}
                    onChange={(e) => setCurrentPosto({ ...currentPosto, sigla: e.target.value })}
                    placeholder="Ex: CB PM"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold disabled:bg-gray-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Descrição Completa *</label>
                  <input
                    type="text"
                    value={currentPosto.descricao}
                    onChange={(e) => setCurrentPosto({ ...currentPosto, descricao: e.target.value })}
                    placeholder="Ex: CABO"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => setPostoModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* SEÇÃO ADD/EDIT MODAL */}
        {secaoModalOpen && currentSecao && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-sm w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {secoes.some((s) => s.nome === currentSecao.nome) ? "Editar Seção" : "Adicionar Seção"}
                </h3>
                <button onClick={() => setSecaoModalOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSecaoSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nome da Seção *</label>
                  <input
                    type="text"
                    value={currentSecao.nome}
                    disabled={secoes.some((s) => s.nome === currentSecao.nome)}
                    onChange={(e) => setCurrentSecao({ ...currentSecao, nome: e.target.value })}
                    placeholder="Ex: Seç Tec Educ"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold disabled:bg-gray-100"
                    required
                  />
                </div>

                <div className="pt-2">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentSecao.ativo !== false}
                      onChange={(e) => setCurrentSecao({ ...currentSecao, ativo: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-xs font-bold text-gray-700 uppercase">Seção Ativa</span>
                  </label>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => setSecaoModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* LEGENDA ADD/EDIT MODAL */}
        {legendaModalOpen && currentLegenda && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-sm w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {legendas.some((l) => l.sigla === currentLegenda.sigla) ? "Editar Legenda" : "Adicionar Legenda"}
                </h3>
                <button onClick={() => setLegendaModalOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleLegendaSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Sigla *</label>
                  <input
                    type="text"
                    value={currentLegenda.sigla}
                    disabled={legendas.some((l) => l.sigla === currentLegenda.sigla)}
                    onChange={(e) => setCurrentLegenda({ ...currentLegenda, sigla: e.target.value })}
                    placeholder="Ex: EN"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold disabled:bg-gray-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Descrição Completa *</label>
                  <input
                    type="text"
                    value={currentLegenda.descricao}
                    onChange={(e) => setCurrentLegenda({ ...currentLegenda, descricao: e.target.value })}
                    placeholder="Ex: EXPEDIENTE NORMAL"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Cor da Legenda</label>
                  <div className="flex items-center space-x-3 mt-1">
                    <input
                      type="color"
                      value={translateColorToHex(currentLegenda.cor) || "#ffffff"}
                      onChange={(e) => setCurrentLegenda({ ...currentLegenda, cor: e.target.value })}
                      className="h-8 w-12 rounded border border-gray-300 cursor-pointer p-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={currentLegenda.cor || ""}
                      onChange={(e) => setCurrentLegenda({ ...currentLegenda, cor: e.target.value })}
                      placeholder="Ex: #00FF00"
                      className="block w-full border border-gray-300 rounded-lg py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-950 font-semibold font-mono"
                    />
                    {currentLegenda.cor && (
                      <button
                        type="button"
                        onClick={() => setCurrentLegenda({ ...currentLegenda, cor: "" })}
                        className="px-2 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors border border-red-200 cursor-pointer whitespace-nowrap"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentLegenda.ativo !== false}
                      onChange={(e) => setCurrentLegenda({ ...currentLegenda, ativo: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-xs font-bold text-gray-700 uppercase">Legenda Ativa</span>
                  </label>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => setLegendaModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* CONFIRM MASTER SAVE MODAL */}
        {confirmSaveOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4">
                <h3 className="text-sm font-bold uppercase tracking-wider flex items-center">
                  <AlertCircle size={16} className="text-amber-400 mr-2" />
                  Salvar Alterações de Configuração?
                </h3>
              </div>
              <div className="p-6">
                <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                  Você realizou alterações nas configurações.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed mt-1">
                  Deseja salvar as alterações? Esta ação irá gravar permanentemente todos os novos cadastros, edições, ordenações e exclusões no Firestore e registrará as operações no histórico de auditoria.
                </p>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setConfirmSaveOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm cursor-pointer"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* CONFIRM EXCLUSION MODAL */}
        {confirmDeleteOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full overflow-hidden"
            >
              <div className="bg-red-900 text-white px-6 py-4">
                <h3 className="text-sm font-bold uppercase tracking-wider flex items-center">
                  <Trash2 size={16} className="text-white mr-2" />
                  Confirmar Exclusão
                </h3>
              </div>
              <div className="p-6">
                <p className="text-xs text-gray-700 leading-relaxed font-semibold">
                  Tem certeza que deseja excluir este registro: <b className="text-red-950 font-bold">"{confirmDeleteOpen.label}"</b>?
                </p>
                <p className="text-xs text-gray-500 leading-relaxed mt-2">
                  Esta ação será registrada no histórico de auditoria ao salvar as configurações.
                </p>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setConfirmDeleteOpen(null)}
                    className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleExecuteDelete}
                    className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-sm cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
