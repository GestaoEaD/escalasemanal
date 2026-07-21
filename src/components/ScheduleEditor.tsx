import React, { useState, useEffect } from "react";
import { db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, Timestamp } from "../firebase";
import { 
  Usuario, 
  ScheduleRow, 
  EscalaDocument, 
  Colaborador, 
  AuditAlteracao,
  OPCOES_ESCALA,
  POSTOS_GRADUACOES,
  EscalaStatus,
  EscalaAprovacao,
  HistoricoEscalaEvento,
  TipoEscalaDocumento,
} from "../types";
import { WeekInfo, formatTimestamp } from "../utils/dateUtils";
import { exportToExcelCustom, exportToPDFCustom } from "../utils/exportUtils";
import {
  buildHistoricoEvento,
  cancelApprovalRequest,
  formatHomologacaoResumo,
  getEscalaDocumentoLabel,
  getRevisaoInfo,
  normalizeEscalaStatus,
  reopenApprovedScale,
  resolveActiveApprovalToken,
  submitScaleForApproval,
} from "../utils/approvalService";
import { getTokenApprovalUrl } from "../utils/solicitacaoAprovacaoService";
import { auditExportacao, auditSalvarEscala, statusLabel } from "../utils/auditService";
import {
  canAccessConfig,
  canCancelApprovalRequest,
  canEditScale,
  canReopenApprovedScale,
  canSubmitForApproval,
  isGestor,
} from "../utils/permissions";
import { normalizeRe } from "../utils/reUtils";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";
import {
  cleanAprovacao,
  cleanHistorico,
  cleanLastSaved,
  cleanScheduleRow,
} from "../utils/escalaPayload";
import CollaboratorModal from "./CollaboratorModal";
import ConcurrencyModal from "./ConcurrencyModal";
import StatusBadge from "./StatusBadge";
import { 
  ArrowLeft, 
  Save, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Plus, 
  Trash2, 
  Edit, 
  User, 
  AlertCircle, 
  CheckCircle,
  HelpCircle,
  Settings,
  Copy,
  Check,
  Send,
  Link2,
  History,
  Clock,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";

const AUTO_SYSTEM_USER_OBSERVACAO = /^usu[aá]rio do sistema$/i;

function sanitizeWeeklyObservacao(observacao?: string): string {
  if (!observacao?.trim()) return "";
  return AUTO_SYSTEM_USER_OBSERVACAO.test(observacao.trim()) ? "" : observacao;
}

interface ScheduleEditorProps {
  usuario: Usuario;
  year: number;
  week: WeekInfo;
  onBack: () => void;
  onLogout: () => void;
  onOpenConfig?: () => void;
  onOpenApproval?: (escalaId: string, tipo?: TipoEscalaDocumento) => void;
}

export default function ScheduleEditor({
  usuario,
  year,
  week,
  onBack,
  onLogout,
  onOpenConfig,
  onOpenApproval,
}: ScheduleEditorProps) {
  // Document IDs in Firestore
  const docId = week.id; // Format: "year_week" e.g., "2026_01"

  // Master lists from Firestore (originally loaded)
  const [dbWeeklyRows, setDbWeeklyRows] = useState<ScheduleRow[]>([]);
  const [dbAlterationRows, setDbAlterationRows] = useState<ScheduleRow[]>([]);
  const [dbWeeklySaved, setDbWeeklySaved] = useState<any | null>(null);
  const [dbAlterationSaved, setDbAlterationSaved] = useState<any | null>(null);

  // Local editable memory states
  const [localWeeklyRows, setLocalWeeklyRows] = useState<ScheduleRow[]>([]);
  const [localAlterationRows, setLocalAlterationRows] = useState<ScheduleRow[]>([]);

  // Metadata timestamps for concurrency tracking
  const [loadedWeeklyTimestamp, setLoadedWeeklyTimestamp] = useState<any | null>(null);
  const [loadedAlterationTimestamp, setLoadedAlterationTimestamp] = useState<any | null>(null);

  // Independent approval workflow — Escala Semanal
  const [weeklyStatus, setWeeklyStatus] = useState<EscalaStatus>("em_edicao");
  const [weeklyVersao, setWeeklyVersao] = useState(1);
  const [weeklyAprovacao, setWeeklyAprovacao] = useState<EscalaAprovacao | null>(null);
  const [weeklyHistorico, setWeeklyHistorico] = useState<HistoricoEscalaEvento[]>([]);

  // Independent approval workflow — Escala Alteração
  const [altStatus, setAltStatus] = useState<EscalaStatus>("em_edicao");
  const [altVersao, setAltVersao] = useState(1);
  const [altAprovacao, setAltAprovacao] = useState<EscalaAprovacao | null>(null);
  const [altHistorico, setAltHistorico] = useState<HistoricoEscalaEvento[]>([]);

  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalLinkWeekly, setApprovalLinkWeekly] = useState<string | null>(null);
  const [approvalLinkAlt, setApprovalLinkAlt] = useState<string | null>(null);
  const [linkModalUrl, setLinkModalUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showWeeklyHistorico, setShowWeeklyHistorico] = useState(false);
  const [showAltHistorico, setShowAltHistorico] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenTipo, setReopenTipo] = useState<TipoEscalaDocumento>("semanal");
  const [reopenMotivo, setReopenMotivo] = useState("");
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [submitConfirmTipo, setSubmitConfirmTipo] = useState<TipoEscalaDocumento | null>(null);
  const [pendingSavePanel, setPendingSavePanel] = useState<TipoEscalaDocumento | null>(null);
  const [savingPanel, setSavingPanel] = useState<TipoEscalaDocumento | null>(null);

  // Master collaborators pool (for modal dropdown selection)
  const [collaboratorsPool, setCollaboratorsPool] = useState<Colaborador[]>([]);

  // Dynamic legendas pool (from database)
  const [legendasList, setLegendasList] = useState<{ sigla: string; descricao: string; cor: string; ordem?: number }[]>([]);

  // Independent panel observations
  const [weeklyObservacoes, setWeeklyObservacoes] = useState("");
  const [alterationObservacoes, setAlterationObservacoes] = useState("");
  const [dbWeeklyObservacoes, setDbWeeklyObservacoes] = useState("");
  const [dbAlterationObservacoes, setDbAlterationObservacoes] = useState("");

  // UI Control states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [highlightedRe, setHighlightedRe] = useState<string | null>(null);

  // Modal controls
  const [isColModalOpen, setIsColModalOpen] = useState(false);
  const [activePanelForModal, setActivePanelForModal] = useState<"semanal" | "alteracao">("semanal");
  const [editColTarget, setEditColTarget] = useState<Colaborador | null>(null);

  // Concurrency modal controls
  const [isConcurrencyModalOpen, setIsConcurrencyModalOpen] = useState(false);
  const [concurrencyConflictDoc, setConcurrencyConflictDoc] = useState<any | null>(null);

  // Export modal controls
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportWeekly, setExportWeekly] = useState(true);
  const [exportAlteration, setExportAlteration] = useState(true);
  const [exportFormat, setExportFormat] = useState<"pdf" | "excel">("pdf");
  const [exportSelectedRes, setExportSelectedRes] = useState<string[]>([]);

  // Independent dirty / editability per panel
  const isWeeklyDirty = React.useMemo(
    () =>
      JSON.stringify(localWeeklyRows) !== JSON.stringify(dbWeeklyRows) ||
      weeklyObservacoes !== dbWeeklyObservacoes,
    [localWeeklyRows, dbWeeklyRows, weeklyObservacoes, dbWeeklyObservacoes]
  );

  const isAltDirty = React.useMemo(
    () =>
      JSON.stringify(localAlterationRows) !== JSON.stringify(dbAlterationRows) ||
      alterationObservacoes !== dbAlterationObservacoes,
    [localAlterationRows, dbAlterationRows, alterationObservacoes, dbAlterationObservacoes]
  );

  const isDirty = isWeeklyDirty || isAltDirty;

  const isWeeklyEditable = React.useMemo(
    () => canEditScale(usuario, week, weeklyStatus),
    [usuario, week, weeklyStatus]
  );

  const isAltEditable = React.useMemo(
    () => canEditScale(usuario, week, altStatus),
    [usuario, week, altStatus]
  );

  const showSubmitWeekly =
    canSubmitForApproval(usuario) &&
    (weeklyStatus === "em_edicao" || weeklyStatus === "revisao_solicitada") &&
    !isWeeklyDirty &&
    dbWeeklySaved !== null;

  const showSubmitAlt =
    canSubmitForApproval(usuario) &&
    (altStatus === "em_edicao" || altStatus === "revisao_solicitada") &&
    !isAltDirty &&
    dbWeeklySaved !== null &&
    (dbAlterationSaved !== null || localAlterationRows.length > 0);

  const showCancelWeekly = canCancelApprovalRequest(usuario, weeklyStatus);
  const showCancelAlt = canCancelApprovalRequest(usuario, altStatus);
  const showReopenWeekly = canReopenApprovedScale(usuario, weeklyStatus);
  const showReopenAlt = canReopenApprovedScale(usuario, altStatus);

  // Dynamically resolve and sort rows based on the up-to-date collaborators pool!
  const resolvedWeeklyRows = React.useMemo(() => {
    return localWeeklyRows.map((row) => {
      const col = collaboratorsPool.find((c) => c.re === row.re);
      if (col) {
        return {
          ...row,
          postoGrad: col.postoGrad,
          nome: col.nome, // Nome de Guerra
          secao: col.secao,
          ordem: col.ordem ?? 999,
          observacao: sanitizeWeeklyObservacao(row.observacao),
        };
      }
      return {
        ...row,
        ordem: 999,
        observacao: sanitizeWeeklyObservacao(row.observacao),
      };
    }).filter((row) => {
      // Keep only rows of collaborators that exist in the master pool!
      return collaboratorsPool.some((c) => c.re === row.re);
    }).sort((a, b) => a.ordem - b.ordem);
  }, [localWeeklyRows, collaboratorsPool]);

  const resolvedAlterationRows = React.useMemo(() => {
    return localAlterationRows.map((row) => {
      const col = collaboratorsPool.find((c) => c.re === row.re);
      if (col) {
        return {
          ...row,
          postoGrad: col.postoGrad,
          nome: col.nome, // Nome de Guerra
          secao: col.secao,
          ordem: col.ordem ?? 999
        };
      }
      return {
        ...row,
        ordem: 999
      };
    }).filter((row) => {
      // Keep only rows of collaborators that exist in the master pool!
      return collaboratorsPool.some((c) => c.re === row.re);
    }).sort((a, b) => a.ordem - b.ordem);
  }, [localAlterationRows, collaboratorsPool]);

  /** Colaboradores da escala aberta, na ordem de exibição (semanal primeiro, depois exclusivos da alteração). */
  const exportCollaborators = React.useMemo(() => {
    const seen = new Set<string>();
    const list: { re: string; label: string }[] = [];
    for (const row of resolvedWeeklyRows) {
      if (seen.has(row.re)) continue;
      seen.add(row.re);
      list.push({ re: row.re, label: `${row.postoGrad} ${row.nome}`.trim() });
    }
    for (const row of resolvedAlterationRows) {
      if (seen.has(row.re)) continue;
      seen.add(row.re);
      list.push({ re: row.re, label: `${row.postoGrad} ${row.nome}`.trim() });
    }
    return list;
  }, [resolvedWeeklyRows, resolvedAlterationRows]);

  const exportAllSelected =
    exportCollaborators.length > 0 &&
    exportCollaborators.every((c) => exportSelectedRes.includes(c.re));

  const openExportModal = () => {
    setExportWeekly(true);
    setExportAlteration(true);
    setExportFormat("pdf");
    setExportSelectedRes(exportCollaborators.map((c) => c.re));
    setIsExportModalOpen(true);
  };

  const toggleExportAllCollaborators = (checked: boolean) => {
    setExportSelectedRes(checked ? exportCollaborators.map((c) => c.re) : []);
  };

  const toggleExportCollaborator = (re: string, checked: boolean) => {
    setExportSelectedRes((prev) => {
      if (checked) {
        return prev.includes(re) ? prev : [...prev, re];
      }
      return prev.filter((r) => r !== re);
    });
  };

  // Handle unload alert for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "Você possui alterações não salvas. Se recarregar a página, as alterações serão descartadas.";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Fetch initial weekly data and collaborators pool
  const loadData = async () => {
    setLoading(true);
    setSaveError(null);
    try {
      // 1. Fetch Collaborators Pool
      const colSnapshot = await getDocs(collection(db, "colaboradores"));
      const colList: Colaborador[] = [];
      colSnapshot.forEach((doc) => {
        colList.push(doc.data() as Colaborador);
      });
      // Sort by official order field
      const sortedCols = colList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      setCollaboratorsPool(sortedCols);

      // 2. Fetch Legendas Pool
      const legSnapshot = await getDocs(collection(db, "legendas"));
      const legList: any[] = [];
      legSnapshot.forEach((doc) => {
        legList.push(doc.data());
      });
      legList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      setLegendasList(legList);

      // 3. Fetch scales documents from Firestore
      const weeklyDocRef = doc(db, "escalas_semanais", docId);
      const alterationDocRef = doc(db, "escalas_alteracao", docId);

      const [weeklySnap, alterationSnap] = await Promise.all([
        getDoc(weeklyDocRef),
        getDoc(alterationDocRef),
      ]);

      const activeCols = sortedCols.filter(c => c.ativo !== false);

      let hasWeeklySaved = false;

      // Process Weekly Scale
      if (weeklySnap.exists()) {
        const data = weeklySnap.data() as EscalaDocument;
        const loadedRows = (data.rows || []).map((row) => ({
          ...row,
          observacao: sanitizeWeeklyObservacao(row.observacao),
        }));
        setDbWeeklyRows(loadedRows);
        setLocalWeeklyRows(loadedRows);
        setDbWeeklySaved(data.lastSaved);
        setLoadedWeeklyTimestamp(data.lastSaved?.timestamp || null);
        
        const obs = data.observacoes || "";
        setWeeklyObservacoes(obs);
        setDbWeeklyObservacoes(obs);

        setWeeklyStatus(normalizeEscalaStatus(data.status));
        setWeeklyVersao(data.versao && data.versao > 0 ? data.versao : 1);
        setWeeklyAprovacao(data.aprovacao || null);
        setWeeklyHistorico(Array.isArray(data.historico) ? data.historico : []);

        if (data.lastSaved) {
          hasWeeklySaved = true;
        }
      } else {
        // Create automatically in Firestore & set state based on all active collaborators
        const rows = activeCols.map((c) => ({
          re: c.re,
          postoGrad: c.postoGrad,
          nome: c.nome,
          secao: c.secao,
          seg: "EN",
          ter: "EN",
          qua: "EN",
          qui: "EN",
          sex: "EN",
          sab: "EN",
          dom: "EN",
          observacao: sanitizeWeeklyObservacao(c.observacao)
        }));

        const criacao = buildHistoricoEvento({
          tipo: "criacao",
          descricao: "Escala Semanal criada",
          usuario,
          versao: 1,
        });
        
        const docData = {
          id: docId,
          ano: year,
          semana: week.numero,
          periodo: week.periodo,
          rows: rows,
          lastSaved: null,
          observacoes: "",
          status: "em_edicao" as EscalaStatus,
          versao: 1,
          aprovacao: null,
          historico: [criacao],
        };
        await setDoc(
          weeklyDocRef,
          prepareFirestoreWrite(`escalas_semanais/${docId}/create`, docData as unknown as Record<string, unknown>)
        );
        
        setDbWeeklyRows(rows);
        setLocalWeeklyRows(rows);
        setDbWeeklySaved(null);
        setLoadedWeeklyTimestamp(null);
        setWeeklyObservacoes("");
        setDbWeeklyObservacoes("");
        setWeeklyStatus("em_edicao");
        setWeeklyVersao(1);
        setWeeklyAprovacao(null);
        setWeeklyHistorico([criacao]);
      }

      // Process Alterations Scale
      if (hasWeeklySaved) {
        if (alterationSnap.exists()) {
          const data = alterationSnap.data() as EscalaDocument;
          setDbAlterationRows(data.rows || []);
          setLocalAlterationRows(data.rows || []);
          setDbAlterationSaved(data.lastSaved);
          setLoadedAlterationTimestamp(data.lastSaved?.timestamp || null);
          
          const obs = data.observacoes || "";
          setAlterationObservacoes(obs);
          setDbAlterationObservacoes(obs);

          const hasStatusField = data.status !== undefined && data.status !== null;
          setAltStatus(hasStatusField ? normalizeEscalaStatus(data.status) : "em_edicao");
          setAltVersao(data.versao && data.versao > 0 ? data.versao : 1);
          setAltAprovacao(data.aprovacao || null);
          setAltHistorico(
            Array.isArray(data.historico)
              ? data.historico
              : hasStatusField
                ? []
                : []
          );
        } else {
          // Create automatically as an empty list with independent approval cycle
          const rows: ScheduleRow[] = [];
          const criacaoAlt = buildHistoricoEvento({
            tipo: "criacao",
            descricao: "Escala Alteração criada",
            usuario,
            versao: 1,
          });
          
          const docData = {
            id: docId,
            ano: year,
            semana: week.numero,
            periodo: week.periodo,
            rows: rows,
            lastSaved: null,
            observacoes: "",
            status: "em_edicao" as EscalaStatus,
            versao: 1,
            aprovacao: null,
            historico: [criacaoAlt],
          };
          await setDoc(
            alterationDocRef,
            prepareFirestoreWrite(`escalas_alteracao/${docId}/create`, docData as unknown as Record<string, unknown>)
          );

          setDbAlterationRows(rows);
          setLocalAlterationRows(rows);
          setDbAlterationSaved(null);
          setLoadedAlterationTimestamp(null);
          setAlterationObservacoes("");
          setDbAlterationObservacoes("");
          setAltStatus("em_edicao");
          setAltVersao(1);
          setAltAprovacao(null);
          setAltHistorico([criacaoAlt]);
        }
      } else {
        // Escala Alteração is empty / not saved yet
        setDbAlterationRows([]);
        setLocalAlterationRows([]);
        setDbAlterationSaved(null);
        setLoadedAlterationTimestamp(null);
        setAlterationObservacoes("");
        setDbAlterationObservacoes("");
        setAltStatus("em_edicao");
        setAltVersao(1);
        setAltAprovacao(null);
        setAltHistorico([]);
      }

    } catch (err: any) {
      console.error("Error loading escala data:", err);
      setSaveError("Erro ao carregar dados do Firestore. Verifique as regras de segurança.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [docId]);

  // Open modal to add collaborator
  const handleOpenAddCol = (panel: "semanal" | "alteracao") => {
    setActivePanelForModal(panel);
    setEditColTarget(null);
    setIsColModalOpen(true);
  };

  // Open modal to edit collaborator
  const handleOpenEditCol = (panel: "semanal" | "alteracao", row: ScheduleRow) => {
    setActivePanelForModal(panel);
    setEditColTarget({
      re: row.re,
      nome: row.nome,
      postoGrad: row.postoGrad,
      secao: row.secao,
      observacao: row.observacao
    });
    setIsColModalOpen(true);
  };

  // Add collaborator confirmed in modal
  const handleAddColConfirm = async (col: Colaborador) => {
    const panelEditable = activePanelForModal === "semanal" ? isWeeklyEditable : isAltEditable;
    if (!panelEditable) return;
    // 1. Instantly register in pool if it doesn't exist
    const existsInPool = collaboratorsPool.some((p) => p.re === col.re);
    if (!existsInPool) {
      try {
        const maxOrdem = collaboratorsPool.reduce((max, c) => (c.ordem && c.ordem > max) ? c.ordem : max, 0);
        const nextOrdem = maxOrdem + 1;
        const newColDoc = {
          re: col.re,
          postoGrad: col.postoGrad,
          nome: col.nome,
          secao: col.secao,
          observacao: col.observacao || "",
          ativo: true,
          ordem: nextOrdem,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        await setDoc(
          doc(db, "colaboradores", col.re),
          prepareFirestoreWrite(`colaboradores/${col.re}`, newColDoc as unknown as Record<string, unknown>)
        );
        setCollaboratorsPool((prev) => [...prev, newColDoc].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));
      } catch (err) {
        console.error("Failed to add new collaborator to global pool:", err);
      }
    }

    // 2. Add row in local state
    const newRow: ScheduleRow = {
      re: col.re,
      postoGrad: col.postoGrad,
      nome: col.nome,
      secao: col.secao,
      seg: "EN",
      ter: "EN",
      qua: "EN",
      qui: "EN",
      sex: "EN",
      sab: "EN",
      dom: "EN",
      observacao: activePanelForModal === "semanal"
        ? sanitizeWeeklyObservacao(col.observacao)
        : col.observacao || ""
    };

    if (activePanelForModal === "semanal") {
      setLocalWeeklyRows((prev) => [...prev, newRow]);
    } else {
      setLocalAlterationRows((prev) => [...prev, newRow]);
    }
  };

  // Update collaborator info confirmed in modal
  const handleUpdateColConfirm = async (oldRe: string, updated: Colaborador) => {
    try {
      const existing = collaboratorsPool.find((c) => c.re === oldRe);
      const updatedColDoc = {
        re: updated.re,
        postoGrad: updated.postoGrad,
        nome: updated.nome,
        secao: updated.secao,
        observacao: updated.observacao || "",
        ativo: existing?.ativo !== undefined ? existing.ativo : true,
        ordem: existing?.ordem !== undefined ? existing.ordem : 1,
        createdAt: existing?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      await setDoc(
        doc(db, "colaboradores", updated.re),
        prepareFirestoreWrite(`colaboradores/${updated.re}`, updatedColDoc as unknown as Record<string, unknown>)
      );
      if (oldRe !== updated.re) {
        await deleteDoc(doc(db, "colaboradores", oldRe));
      }

      setCollaboratorsPool((prev) => 
        prev.map((c) => (c.re === oldRe ? updatedColDoc : c))
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      );
    } catch (err) {
      console.error("Failed to update collaborator in global pool:", err);
    }

    const updateRows = (prev: ScheduleRow[]) =>
      prev.map((r) => {
        if (r.re === oldRe) {
          return {
            ...r,
            re: updated.re,
            postoGrad: updated.postoGrad,
            nome: updated.nome,
            secao: updated.secao,
            observacao: updated.observacao || r.observacao
          };
        }
        return r;
      });

    if (activePanelForModal === "semanal") {
      setLocalWeeklyRows(updateRows);
    } else {
      setLocalAlterationRows(updateRows);
    }
  };

  // Delete collaborator row
  const handleDeleteCol = (panel: "semanal" | "alteracao", reToDelete: string) => {
    if (panel === "semanal") {
      if (!isWeeklyEditable) return;
      setLocalWeeklyRows((prev) => prev.filter((r) => r.re !== reToDelete));
    } else {
      if (!isAltEditable) return;
      setLocalAlterationRows((prev) => prev.filter((r) => r.re !== reToDelete));
    }
  };

  // Copy a specific row from Escala Semanal to Escala de Alteração
  const handleCopyToAlteration = (row: ScheduleRow) => {
    if (!isAltEditable) return;
    // Check if already exists in alteration rows
    const exists = localAlterationRows.some((r) => r.re === row.re);
    if (exists) {
      setHighlightedRe(row.re);
      // Scroll to the alteration panel
      const section = document.getElementById("alteracao-panel-section");
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
      setTimeout(() => {
        setHighlightedRe(null);
      }, 3000);
      return;
    }

    // Create a deep copy of the row
    const copiedRow: ScheduleRow = {
      re: row.re,
      postoGrad: row.postoGrad,
      nome: row.nome,
      secao: row.secao,
      seg: row.seg,
      ter: row.ter,
      qua: row.qua,
      qui: row.qui,
      sex: row.sex,
      sab: row.sab,
      dom: row.dom,
      observacao: row.observacao || ""
    };

    setLocalAlterationRows((prev) => [...prev, copiedRow]);
    setHighlightedRe(row.re);

    // Scroll to alteration section
    setTimeout(() => {
      const section = document.getElementById("alteracao-panel-section");
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    }, 150);

    setTimeout(() => {
      setHighlightedRe(null);
    }, 3150);
  };

  // Update a day cell or observations in a row
  const handleCellChange = (
    panel: "semanal" | "alteracao",
    reRow: string,
    field: "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom" | "observacao",
    value: string
  ) => {
    if (panel === "semanal" && !isWeeklyEditable) return;
    if (panel === "alteracao" && !isAltEditable) return;
    const updateRows = (prev: ScheduleRow[]) =>
      prev.map((r) => {
        if (r.re === reRow) {
          return { ...r, [field]: value };
        }
        return r;
      });

    if (panel === "semanal") {
      setLocalWeeklyRows(updateRows);
    } else {
      setLocalAlterationRows(updateRows);
    }
  };

  // Verification and Concurrency-aware Save Trigger (per panel)
  const handleSaveTrigger = async (panel: TipoEscalaDocumento) => {
    const editable = panel === "semanal" ? isWeeklyEditable : isAltEditable;
    const label = getEscalaDocumentoLabel(panel);
    if (!editable) {
      setSaveError(`Você não possui permissão para editar a ${label}.`);
      return;
    }
    setSaving(true);
    setSavingPanel(panel);
    setSaveError(null);
    setSaveSuccess(false);
    setPendingSavePanel(panel);

    try {
      if (panel === "semanal") {
        const weeklyDocRef = doc(db, "escalas_semanais", docId);
        const weeklySnap = await getDoc(weeklyDocRef);
        if (weeklySnap.exists()) {
          const serverData = weeklySnap.data() as EscalaDocument;
          const serverStatus = normalizeEscalaStatus(serverData.status);
          if (serverStatus === "aprovada" || serverStatus === "aguardando_aprovacao") {
            setWeeklyStatus(serverStatus);
            setWeeklyVersao(serverData.versao && serverData.versao > 0 ? serverData.versao : 1);
            setWeeklyAprovacao(serverData.aprovacao || null);
            setWeeklyHistorico(Array.isArray(serverData.historico) ? serverData.historico : []);
            setSaveError(
              serverStatus === "aprovada"
                ? "A Escala Semanal está aprovada e não pode ser editada. Solicite a um Gestor a reabertura."
                : "A Escala Semanal está aguardando aprovação e não pode ser editada. Cancele a solicitação antes de alterar."
            );
            setSaving(false);
            setSavingPanel(null);
            return;
          }
          const serverTimestamp = serverData.lastSaved?.timestamp;
          if (serverTimestamp && loadedWeeklyTimestamp) {
            const serverTimeMs = serverTimestamp.toMillis
              ? serverTimestamp.toMillis()
              : new Date(serverTimestamp).getTime();
            const loadedTimeMs = loadedWeeklyTimestamp.toMillis
              ? loadedWeeklyTimestamp.toMillis()
              : new Date(loadedWeeklyTimestamp).getTime();
            if (serverTimeMs > loadedTimeMs) {
              setConcurrencyConflictDoc(serverData.lastSaved);
              setIsConcurrencyModalOpen(true);
              setSaving(false);
              setSavingPanel(null);
              return;
            }
          }
        }
      } else {
        const alterationDocRef = doc(db, "escalas_alteracao", docId);
        const alterationSnap = await getDoc(alterationDocRef);
        if (alterationSnap.exists()) {
          const serverData = alterationSnap.data() as EscalaDocument;
          const serverStatus = normalizeEscalaStatus(serverData.status);
          if (serverStatus === "aprovada" || serverStatus === "aguardando_aprovacao") {
            setAltStatus(serverStatus);
            setAltVersao(serverData.versao && serverData.versao > 0 ? serverData.versao : 1);
            setAltAprovacao(serverData.aprovacao || null);
            setAltHistorico(Array.isArray(serverData.historico) ? serverData.historico : []);
            setSaveError(
              serverStatus === "aprovada"
                ? "A Escala Alteração está aprovada e não pode ser editada. Solicite a um Gestor a reabertura."
                : "A Escala Alteração está aguardando aprovação e não pode ser editada. Cancele a solicitação antes de alterar."
            );
            setSaving(false);
            setSavingPanel(null);
            return;
          }
          const serverTimestamp = serverData.lastSaved?.timestamp;
          if (serverTimestamp && loadedAlterationTimestamp) {
            const serverTimeMs = serverTimestamp.toMillis
              ? serverTimestamp.toMillis()
              : new Date(serverTimestamp).getTime();
            const loadedTimeMs = loadedAlterationTimestamp.toMillis
              ? loadedAlterationTimestamp.toMillis()
              : new Date(loadedAlterationTimestamp).getTime();
            if (serverTimeMs > loadedTimeMs) {
              setConcurrencyConflictDoc(serverData.lastSaved);
              setIsConcurrencyModalOpen(true);
              setSaving(false);
              setSavingPanel(null);
              return;
            }
          }
        }
      }

      await performSaveAndLog(panel);
    } catch (err: any) {
      console.error("Save validation failed:", err);
      setSaveError("Erro de comunicação ao salvar. Tente novamente.");
      setSaving(false);
      setSavingPanel(null);
    }
  };

  const performSaveAndLog = async (panel?: TipoEscalaDocumento) => {
    const target = panel || pendingSavePanel || "semanal";
    const editable = target === "semanal" ? isWeeklyEditable : isAltEditable;
    const label = getEscalaDocumentoLabel(target);
    if (!editable) {
      setSaveError(`A ${label} não pode ser editada no status atual.`);
      setSaving(false);
      setSavingPanel(null);
      return;
    }
    setSaving(true);
    setSavingPanel(target);
    setSaveError(null);

    try {
      const now = new Date();
      const timestamp = Timestamp.fromDate(now);
      const dataStr =
        String(now.getDate()).padStart(2, "0") +
        "/" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "/" +
        now.getFullYear();
      const horaStr =
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0");

      const savedMetadata = cleanLastSaved({
        nome: usuario.nome || "",
        postoGrad: usuario.postoGrad || "",
        re: usuario.re || "",
        timestamp,
        data: dataStr,
        hora: horaStr,
      });

      const alteracoes: AuditAlteracao[] = [];
      const dayLabels: Record<string, string> = {
        seg: "Segunda",
        ter: "Terça",
        qua: "Quarta",
        qui: "Quinta",
        sex: "Sexta",
        sab: "Sábado",
        dom: "Domingo",
      };

      const collectDiffs = (localRows: ScheduleRow[], dbRows: ScheduleRow[]) => {
        localRows.forEach((row) => {
          const colLabel = `${row.postoGrad} ${row.nome} (R.E. ${row.re})`;
          const oldRow = dbRows.find((r) => r.re === row.re);
          if (!oldRow) {
            alteracoes.push({
              campo: "Colaborador",
              antes: "",
              depois: "Adicionado",
              colaborador: colLabel,
            });
          } else {
            (["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const).forEach((day) => {
              if (row[day] !== oldRow[day]) {
                alteracoes.push({
                  campo: dayLabels[day] || day.toUpperCase(),
                  antes: oldRow[day],
                  depois: row[day],
                  colaborador: colLabel,
                });
              }
            });
            if (row.observacao !== oldRow.observacao) {
              alteracoes.push({
                campo: "Observação",
                antes: oldRow.observacao || "",
                depois: row.observacao || "",
                colaborador: colLabel,
              });
            }
          }
        });
        dbRows.forEach((oldRow) => {
          if (!localRows.some((r) => r.re === oldRow.re)) {
            alteracoes.push({
              campo: "Colaborador",
              antes: `${oldRow.postoGrad} ${oldRow.nome}`,
              depois: "Removido",
              colaborador: `${oldRow.postoGrad} ${oldRow.nome} (R.E. ${oldRow.re})`,
            });
          }
        });
      };

      let savedStatus = "";
      let savedVersao = 1;

      if (target === "semanal") {
        const isWeeklyRowsDirty =
          JSON.stringify(localWeeklyRows) !== JSON.stringify(dbWeeklyRows);
        const isWeeklyObsDirty = weeklyObservacoes !== dbWeeklyObservacoes;
        const contentDirty = isWeeklyRowsDirty || isWeeklyObsDirty;

        collectDiffs(localWeeklyRows, dbWeeklyRows);
        if (isWeeklyObsDirty) {
          alteracoes.push({
            campo: "Observações do Painel",
            antes: dbWeeklyObservacoes || "",
            depois: weeklyObservacoes || "",
          });
        }

        let nextStatus = normalizeEscalaStatus(weeklyStatus);
        const nextVersao = weeklyVersao > 0 ? weeklyVersao : 1;
        const nextAprovacao: EscalaAprovacao | null = weeklyAprovacao;
        let nextHistorico = [...weeklyHistorico];

        if (nextStatus === "aprovada" || nextStatus === "aguardando_aprovacao") {
          setSaveError(
            nextStatus === "aprovada"
              ? "A Escala Semanal está aprovada e não pode ser editada."
              : "A Escala Semanal está aguardando aprovação e não pode ser editada."
          );
          setSaving(false);
          setSavingPanel(null);
          return;
        }
        // Mantém revisao_solicitada até novo envio para aprovação
        if (contentDirty) {
          nextHistorico = [
            ...nextHistorico,
            buildHistoricoEvento({
              tipo: "alteracao",
              descricao: "Alterações salvas na Escala Semanal",
              usuario,
              versao: nextVersao,
              date: now,
            }),
          ];
        }

        await setDoc(
          doc(db, "escalas_semanais", docId),
          prepareFirestoreWrite(`escalas_semanais/${docId}`, {
            id: docId,
            ano: year,
            semana: week.numero,
            periodo: week.periodo,
            rows: localWeeklyRows.map(cleanScheduleRow),
            lastSaved: savedMetadata,
            observacoes: weeklyObservacoes ?? "",
            status: nextStatus,
            versao: nextVersao,
            aprovacao: cleanAprovacao(nextAprovacao),
            historico: cleanHistorico(nextHistorico),
          } as unknown as Record<string, unknown>)
        );

        setDbWeeklyRows(JSON.parse(JSON.stringify(localWeeklyRows)));
        setLocalWeeklyRows(JSON.parse(JSON.stringify(localWeeklyRows)));
        setDbWeeklySaved(savedMetadata);
        setLoadedWeeklyTimestamp(timestamp);
        setDbWeeklyObservacoes(weeklyObservacoes);
        setWeeklyStatus(nextStatus);
        setWeeklyVersao(nextVersao);
        setWeeklyAprovacao(nextAprovacao);
        setWeeklyHistorico(nextHistorico);
        savedStatus = statusLabel(nextStatus);
        savedVersao = nextVersao;
      } else {
        const isAltRowsDirty =
          JSON.stringify(localAlterationRows) !== JSON.stringify(dbAlterationRows);
        const isAltObsDirty = alterationObservacoes !== dbAlterationObservacoes;
        const contentDirty = isAltRowsDirty || isAltObsDirty;

        collectDiffs(localAlterationRows, dbAlterationRows);
        if (isAltObsDirty) {
          alteracoes.push({
            campo: "Observações do Painel",
            antes: dbAlterationObservacoes || "",
            depois: alterationObservacoes || "",
          });
        }

        let nextStatus = normalizeEscalaStatus(altStatus);
        const nextVersao = altVersao > 0 ? altVersao : 1;
        const nextAprovacao: EscalaAprovacao | null = altAprovacao;
        let nextHistorico = [...altHistorico];

        if (nextStatus === "aprovada" || nextStatus === "aguardando_aprovacao") {
          setSaveError(
            nextStatus === "aprovada"
              ? "A Escala Alteração está aprovada e não pode ser editada."
              : "A Escala Alteração está aguardando aprovação e não pode ser editada."
          );
          setSaving(false);
          setSavingPanel(null);
          return;
        }
        // Mantém revisao_solicitada até novo envio para aprovação
        if (contentDirty) {
          nextHistorico = [
            ...nextHistorico,
            buildHistoricoEvento({
              tipo: "alteracao",
              descricao: "Alterações salvas na Escala Alteração",
              usuario,
              versao: nextVersao,
              date: now,
            }),
          ];
        }

        await setDoc(
          doc(db, "escalas_alteracao", docId),
          prepareFirestoreWrite(`escalas_alteracao/${docId}`, {
            id: docId,
            ano: year,
            semana: week.numero,
            periodo: week.periodo,
            rows: localAlterationRows.map(cleanScheduleRow),
            lastSaved: savedMetadata,
            observacoes: alterationObservacoes ?? "",
            status: nextStatus,
            versao: nextVersao,
            aprovacao: cleanAprovacao(nextAprovacao),
            historico: cleanHistorico(nextHistorico),
          } as unknown as Record<string, unknown>)
        );

        setDbAlterationRows(JSON.parse(JSON.stringify(localAlterationRows)));
        setLocalAlterationRows(JSON.parse(JSON.stringify(localAlterationRows)));
        setDbAlterationSaved(savedMetadata);
        setLoadedAlterationTimestamp(timestamp);
        setDbAlterationObservacoes(alterationObservacoes);
        setAltStatus(nextStatus);
        setAltVersao(nextVersao);
        setAltAprovacao(nextAprovacao);
        setAltHistorico(nextHistorico);
        savedStatus = statusLabel(nextStatus);
        savedVersao = nextVersao;
      }

      await auditSalvarEscala({
        usuario,
        tipoDoc: target,
        anoSemana: docId,
        versao: savedVersao,
        statusAnterior: savedStatus,
        statusAtual: savedStatus,
        alteracoes,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error("Failed perform save:", err);
      setSaveError("Erro ao gravar dados no Firestore. Tente novamente.");
    } finally {
      setSaving(false);
      setSavingPanel(null);
      setIsConcurrencyModalOpen(false);
      setPendingSavePanel(null);
    }
  };

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

  // Helper for background style based on scale option selected and custom legend colors
  const getCellStyle = (val: string) => {
    const legend = legendasList.find((l) => l.sigla === val);
    if (legend && legend.cor) {
      const translatedCor = translateColorToHex(legend.cor);
      const hex = translatedCor.replace("#", "");
      let textColor = "#000000";
      if (hex.length === 7 && hex.startsWith("#")) {
        const rawHex = hex.substring(1);
        const r = parseInt(rawHex.substr(0, 2), 16);
        const g = parseInt(rawHex.substr(2, 2), 16);
        const b = parseInt(rawHex.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        textColor = (yiq >= 128) ? "#000000" : "#ffffff";
      } else if (hex.length === 6) {
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        textColor = (yiq >= 128) ? "#000000" : "#ffffff";
      }
      return {
        backgroundColor: translatedCor,
        color: textColor,
        borderColor: "rgba(0, 0, 0, 0.15)"
      };
    }

    if (!val || val.toLowerCase() === "en") {
      return {
        backgroundColor: "#ffffff",
        color: "#111827",
        borderColor: "#d1d5db"
      };
    }

    // Fallback based on default legend sigla values
    if (val === "F") return { backgroundColor: "#fef08a", color: "#854d0e", borderColor: "#fef08a" };
    if (val === "FC") return { backgroundColor: "#fed7aa", color: "#c2410c", borderColor: "#fed7aa" };
    if (val === "Férias") return { backgroundColor: "#bbf7d0", color: "#166534", borderColor: "#bbf7d0" };
    
    return {
      backgroundColor: "#f3f4f6", // light gray (cinza claro)
      color: "#1f2937",
      borderColor: "#d1d5db"
    };
  };

  // Helper to get description of a legend for hover tooltips (title)
  const getLegendDescription = (val: string) => {
    if (!val) return "";
    const legend = legendasList.find((l) => l.sigla === val);
    if (legend && legend.descricao) {
      return legend.descricao;
    }
    // Fallbacks for standard options
    const fallbacks: Record<string, string> = {
      "EN": "Expediente Normal / Escala Normal",
      "F": "Folga",
      "FC": "Folga Complementar / Folga Chefe",
      "FDS": "Fim de Semana",
      "Dispensa": "Dispensa de Serviço",
      "Licença": "Licença",
      "Curso": "Curso",
      "Férias": "Férias",
      "Outro": "Outro"
    };
    return fallbacks[val] || val;
  };

  const getSavedDetails = (saved: any) => {
    if (!saved) return null;
    let data = saved.data;
    let hora = saved.hora;
    if (!data || !hora) {
      const date = saved.timestamp?.toDate ? saved.timestamp.toDate() : new Date(saved.timestamp);
      data = String(date.getDate()).padStart(2, "0") + "/" + String(date.getMonth() + 1).padStart(2, "0") + "/" + date.getFullYear();
      hora = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    }
    return {
      postoGrad: saved.postoGrad || "",
      nome: saved.nome || "",
      re: saved.re || "",
      data,
      hora
    };
  };

  const renderPanelHeaderMetadata = (saved: any, panelColorClass: string) => {
    const details = getSavedDetails(saved);
    return (
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 bg-white p-3 rounded-md border border-gray-150 shadow-2xs text-[11px] text-gray-700 font-semibold">
        <div className="bg-gray-50/55 p-2 rounded border border-gray-100">
          <span className="block font-bold text-gray-400 uppercase tracking-wider text-[8px] mb-0.5">Semana</span>
          <span className="text-gray-950 font-extrabold">{week.label}</span>
        </div>
        <div className="bg-gray-50/55 p-2 rounded border border-gray-100">
          <span className="block font-bold text-gray-400 uppercase tracking-wider text-[8px] mb-0.5">Período da Semana</span>
          <span className="text-blue-700 font-bold">{week.periodo}</span>
        </div>
        <div className="bg-gray-50/55 p-2 rounded border border-gray-100 col-span-2">
          <span className="block font-bold text-gray-400 uppercase tracking-wider text-[8px] mb-0.5">Último Salvamento - Usuário</span>
          {details ? (
            <span className="text-gray-950 font-extrabold uppercase">{details.postoGrad} {details.nome}</span>
          ) : (
            <span className="text-gray-400 italic font-medium">Nenhum registro</span>
          )}
        </div>
        <div className="bg-gray-50/55 p-2 rounded border border-gray-100">
          <span className="block font-bold text-gray-400 uppercase tracking-wider text-[8px] mb-0.5">R.E.</span>
          {details ? (
            <span className="text-gray-950 font-mono font-bold">{details.re}</span>
          ) : (
            <span className="text-gray-400 italic font-medium">--</span>
          )}
        </div>
        <div className="bg-gray-50/55 p-2 rounded border border-gray-100">
          <span className="block font-bold text-gray-400 uppercase tracking-wider text-[8px] mb-0.5">Data e Hora</span>
          {details ? (
            <span className="text-gray-950 font-bold">{details.data} às {details.hora}</span>
          ) : (
            <span className="text-gray-400 italic font-medium">--</span>
          )}
        </div>
      </div>
    );
  };

  const handleBackWithCheck = () => {
    if (isDirty) {
      if (confirm("Você possui alterações não salvas nesta escala. Deseja realmente voltar? Suas alterações serão descartadas.")) {
        onBack();
      }
    } else {
      onBack();
    }
  };

  const requestSubmitForApproval = (tipo: TipoEscalaDocumento) => {
    if (!canSubmitForApproval(usuario)) {
      alert("Somente Administradores podem enviar escalas para aprovação.");
      return;
    }
    const dirty = tipo === "semanal" ? isWeeklyDirty : isAltDirty;
    if (dirty) {
      alert("Salve as alterações deste painel antes de enviar para aprovação.");
      return;
    }
    setSubmitConfirmTipo(tipo);
  };

  const handleConfirmSubmitForApproval = async () => {
    const tipo = submitConfirmTipo;
    if (!tipo) return;
    setSubmittingApproval(true);
    setSaveError(null);
    try {
      const result = await submitScaleForApproval(docId, usuario, tipo);
      if (tipo === "semanal") {
        setWeeklyStatus(result.status);
        setWeeklyVersao(result.versao);
        setWeeklyAprovacao(result.aprovacao);
        setWeeklyHistorico(result.historico);
        setApprovalLinkWeekly(result.url);
      } else {
        setAltStatus(result.status);
        setAltVersao(result.versao);
        setAltAprovacao(result.aprovacao);
        setAltHistorico(result.historico);
        setApprovalLinkAlt(result.url);
      }
      setSubmitConfirmTipo(null);
      setLinkCopied(false);
      setLinkModalUrl(result.url);
    } catch (err: any) {
      setSaveError(err?.message || "Falha ao enviar para aprovação.");
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleCancelApprovalRequest = async (tipo: TipoEscalaDocumento) => {
    const canCancel = tipo === "semanal" ? showCancelWeekly : showCancelAlt;
    if (!canCancel) {
      alert("Somente Administradores podem cancelar a solicitação de aprovação.");
      return;
    }
    const label = getEscalaDocumentoLabel(tipo);
    if (
      !confirm(
        `Cancelar a solicitação de aprovação da ${label}? Ela voltará para Em edição e o link de aprovação será invalidado.`
      )
    ) {
      return;
    }

    setCancelBusy(true);
    setSaveError(null);
    try {
      const result = await cancelApprovalRequest(docId, usuario, tipo);
      if (tipo === "semanal") {
        setWeeklyStatus(result.status);
        setWeeklyVersao(result.versao);
        setWeeklyAprovacao(result.aprovacao);
        setWeeklyHistorico(result.historico);
        setApprovalLinkWeekly(null);
      } else {
        setAltStatus(result.status);
        setAltVersao(result.versao);
        setAltAprovacao(result.aprovacao);
        setAltHistorico(result.historico);
        setApprovalLinkAlt(null);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || "Falha ao cancelar a solicitação.");
    } finally {
      setCancelBusy(false);
    }
  };

  const openReopenModal = (tipo: TipoEscalaDocumento) => {
    const canReopen = tipo === "semanal" ? showReopenWeekly : showReopenAlt;
    if (!canReopen) return;
    setReopenTipo(tipo);
    setReopenMotivo("");
    setReopenError(null);
    setIsReopenModalOpen(true);
  };

  const handleConfirmReopen = async () => {
    const motivo = reopenMotivo.trim();
    if (!motivo) {
      setReopenError("Informe o motivo da reabertura.");
      return;
    }
    const canReopen = reopenTipo === "semanal" ? showReopenWeekly : showReopenAlt;
    if (!canReopen) {
      setReopenError("Somente Gestores podem reabrir uma escala aprovada.");
      return;
    }

    setReopenBusy(true);
    setReopenError(null);
    try {
      const result = await reopenApprovedScale(docId, usuario, motivo, reopenTipo);
      if (reopenTipo === "semanal") {
        setWeeklyStatus(result.status);
        setWeeklyVersao(result.versao);
        setWeeklyAprovacao(result.aprovacao);
        setWeeklyHistorico(result.historico);
      } else {
        setAltStatus(result.status);
        setAltVersao(result.versao);
        setAltAprovacao(result.aprovacao);
        setAltHistorico(result.historico);
      }
      setIsReopenModalOpen(false);
      setReopenMotivo("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setReopenError(err?.message || "Falha ao reabrir a escala.");
    } finally {
      setReopenBusy(false);
    }
  };

  const openLinkModal = async (tipo: TipoEscalaDocumento) => {
    setLinkCopied(false);
    const cached = tipo === "semanal" ? approvalLinkWeekly : approvalLinkAlt;
    if (cached) {
      setLinkModalUrl(cached);
      return;
    }
    const aprovacao = tipo === "semanal" ? weeklyAprovacao : altAprovacao;
    const token = String(aprovacao?.solicitacaoId || "").trim();
    if (token) {
      const url = getTokenApprovalUrl(token);
      if (tipo === "semanal") setApprovalLinkWeekly(url);
      else setApprovalLinkAlt(url);
      setLinkModalUrl(url);
      return;
    }
    try {
      const resolved = await resolveActiveApprovalToken(docId, tipo);
      if (!resolved) {
        alert("Não há link ativo para esta solicitação.");
        return;
      }
      const url = getTokenApprovalUrl(resolved);
      if (tipo === "semanal") setApprovalLinkWeekly(url);
      else setApprovalLinkAlt(url);
      setLinkModalUrl(url);
    } catch (err) {
      console.error(err);
      alert("Não foi possível obter o link de aprovação.");
    }
  };

  const handleCopyLinkModal = async () => {
    if (!linkModalUrl) return;
    try {
      await navigator.clipboard.writeText(linkModalUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      alert("Não foi possível copiar. Selecione o link manualmente.");
    }
  };

  const renderHistoricoAccordion = (
    historico: HistoricoEscalaEvento[],
    open: boolean,
    setOpen: (v: boolean | ((prev: boolean) => boolean)) => void,
    title: string
  ) => (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 cursor-pointer"
      >
        <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-700">
          <History size={12} className="text-gray-500" />
          {title}
          <span className="text-gray-400 font-semibold normal-case tracking-normal">
            ({historico.length})
          </span>
        </span>
        <span className="text-[10px] font-bold text-blue-600">
          {open ? "Ocultar" : "Exibir"}
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 max-h-48 overflow-y-auto divide-y divide-gray-50">
          {historico.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400 italic">Nenhum evento registrado.</p>
          ) : (
            [...historico].reverse().map((ev) => (
              <div key={ev.id} className="px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-gray-400 font-medium">
                    <Clock size={11} />
                    {ev.data} {ev.hora}
                  </span>
                  <span className="font-bold text-gray-800">{ev.descricao}</span>
                  {typeof ev.versao === "number" && (
                    <span className="text-[10px] font-mono text-gray-400">v{ev.versao}</span>
                  )}
                </div>
                <div className="text-gray-500 mt-0.5">
                  {ev.postoGrad ? `${ev.postoGrad} ` : ""}
                  {ev.usuario} (RE {normalizeRe(ev.re)})
                  {ev.detalhes ? ` · ${ev.detalhes}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderStatusBanner = (
    status: EscalaStatus,
    aprovacao: EscalaAprovacao | null,
    label: string,
    showReopen: boolean,
    _onReopen: () => void
  ) => {
    const st = normalizeEscalaStatus(status);
    if (st === "aguardando_aprovacao") {
      return (
        <div className="mt-3 bg-amber-50 border border-amber-300 text-amber-950 rounded-lg p-3 text-xs font-semibold">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusBadge status="aguardando_aprovacao" size="sm" />
            <span>{label}: aguardando decisão do Gestor — edição bloqueada</span>
          </div>
          {aprovacao?.enviadoPor && (
            <p className="text-[11px] font-medium text-amber-800 mt-1">
              Enviado por {aprovacao.enviadoPor.postoGrad} {aprovacao.enviadoPor.nome} em{" "}
              {aprovacao.enviadoPor.data} às {aprovacao.enviadoPor.hora}
            </p>
          )}
        </div>
      );
    }
    if (st === "aprovada") {
      return (
        <div className="mt-3 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-lg p-3 text-xs font-semibold">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusBadge status="aprovada" size="sm" />
            <span>{label}: documento oficial — edição direta bloqueada</span>
          </div>
          {aprovacao?.aprovadoPor ? (
            <p className="text-[11px] font-medium text-emerald-800 mt-1">
              Aprovado por{" "}
              <b>
                {aprovacao.aprovadoPor.postoGrad} {aprovacao.aprovadoPor.nome}
              </b>{" "}
              (RE {normalizeRe(aprovacao.aprovadoPor.re)}) em {aprovacao.aprovadoPor.data} às{" "}
              {aprovacao.aprovadoPor.hora}
              {typeof aprovacao.versaoAprovada === "number" && (
                <span> · versão v{aprovacao.versaoAprovada}</span>
              )}
            </p>
          ) : (
            <p className="text-[11px] font-medium text-emerald-800 mt-1">Aprovação registrada.</p>
          )}
          {showReopen && (
            <p className="text-[11px] font-medium text-emerald-700 mt-2">
              Para alterar, use Reabrir Escala (gera nova versão e exige nova aprovação).
            </p>
          )}
        </div>
      );
    }
    if (st === "revisao_solicitada") {
      const { por, motivo } = getRevisaoInfo(aprovacao);
      return (
        <div className="mt-3 bg-orange-50 border-2 border-orange-400 text-orange-950 rounded-lg p-3 text-xs font-semibold shadow-sm">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <StatusBadge status="revisao_solicitada" size="sm" />
            <span className="uppercase tracking-wide font-extrabold">Revisão solicitada</span>
          </div>
          {por && (
            <div className="text-[11px] font-medium text-orange-900 space-y-0.5">
              <p>
                <span className="text-orange-700 font-bold">Gestor:</span> {por.postoGrad}{" "}
                {por.nome} (RE {normalizeRe(por.re)})
              </p>
              <p>
                <span className="text-orange-700 font-bold">Data:</span> {por.data} {por.hora}
              </p>
            </div>
          )}
          {motivo && (
            <div className="mt-2 bg-white/70 border border-orange-200 rounded-md p-2">
              <div className="text-[10px] font-bold text-orange-700 uppercase mb-1">Motivo</div>
              <p className="text-[11px] font-medium text-orange-950 whitespace-pre-wrap">
                {motivo}
              </p>
            </div>
          )}
          <p className="text-[11px] font-medium text-orange-800 mt-2">
            Corrija o documento e envie novamente para aprovação. Este aviso permanece até o novo
            envio.
          </p>
        </div>
      );
    }
    return null;
  };

  const renderTopRevisaoAlert = (
    status: EscalaStatus,
    aprovacao: EscalaAprovacao | null,
    label: string
  ) => {
    if (normalizeEscalaStatus(status) !== "revisao_solicitada") return null;
    const { por, motivo } = getRevisaoInfo(aprovacao);
    return (
      <div className="mb-4 bg-orange-100 border-2 border-orange-400 text-orange-950 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-lg" aria-hidden>
            🟠
          </span>
          <h3 className="text-sm font-extrabold uppercase tracking-wider">
            Revisão solicitada — {label}
          </h3>
          <StatusBadge status="revisao_solicitada" size="sm" />
        </div>
        {por && (
          <div className="text-xs font-semibold space-y-1">
            <p>
              <span className="text-orange-800">Gestor:</span> {por.postoGrad} {por.nome}
            </p>
            <p>
              <span className="text-orange-800">Data:</span> {por.data} {por.hora}
            </p>
          </div>
        )}
        {motivo && (
          <blockquote className="mt-3 text-xs font-medium bg-white/80 border border-orange-300 rounded-lg px-3 py-2 whitespace-pre-wrap italic text-orange-950">
            “{motivo}”
          </blockquote>
        )}
      </div>
    );
  };

  const renderPanelActionButtons = (tipo: TipoEscalaDocumento) => {
    const editable = tipo === "semanal" ? isWeeklyEditable : isAltEditable;
    const dirty = tipo === "semanal" ? isWeeklyDirty : isAltDirty;
    const showSubmit = tipo === "semanal" ? showSubmitWeekly : showSubmitAlt;
    const showCancel = tipo === "semanal" ? showCancelWeekly : showCancelAlt;
    const showReopen = tipo === "semanal" ? showReopenWeekly : showReopenAlt;
    const status = tipo === "semanal" ? weeklyStatus : altStatus;
    const label = getEscalaDocumentoLabel(tipo);
    const isSavingThis = saving && savingPanel === tipo;

    return (
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {editable && (
          <button
            type="button"
            onClick={() => handleSaveTrigger(tipo)}
            disabled={isSavingThis || !dirty}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-md transition-all shadow-sm cursor-pointer ${
              dirty
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
            }`}
          >
            <Save size={14} />
            <span>{isSavingThis ? "Salvando..." : "Salvar"}</span>
          </button>
        )}
        {showSubmit && (
          <button
            type="button"
            onClick={() => requestSubmitForApproval(tipo)}
            disabled={submittingApproval}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-md cursor-pointer disabled:opacity-50"
          >
            <Send size={14} />
            <span>
              {submittingApproval && submitConfirmTipo === tipo
                ? "Enviando..."
                : `Enviar ${label} para Aprovação`}
            </span>
          </button>
        )}
        {showCancel && (
          <button
            type="button"
            onClick={() => handleCancelApprovalRequest(tipo)}
            disabled={cancelBusy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md border border-amber-200 cursor-pointer disabled:opacity-50"
          >
            <XCircle size={14} />
            <span>{cancelBusy ? "Cancelando..." : "Cancelar solicitação"}</span>
          </button>
        )}
        {showCancel && (
          <button
            type="button"
            onClick={() => openLinkModal(tipo)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50/70 hover:bg-amber-100 rounded-md border border-amber-200 cursor-pointer"
            title="Copiar link de aprovação"
          >
            <Link2 size={14} />
            <span>Link</span>
          </button>
        )}
        {isGestor(usuario) && status === "aguardando_aprovacao" && onOpenApproval && (
          <button
            type="button"
            onClick={() => {
              const token = (tipo === "semanal" ? weeklyAprovacao : altAprovacao)?.solicitacaoId;
              if (token) onOpenApproval(token, tipo);
              else onOpenApproval(docId, tipo);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md cursor-pointer"
          >
            <CheckCircle size={14} />
            <span>Abrir Aprovação</span>
          </button>
        )}
        {showReopen && (
          <button
            type="button"
            onClick={() => openReopenModal(tipo)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-md cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Reabrir Escala</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Top bar header */}
      <header className="bg-[#111827] text-white border-b border-gray-800 sticky top-0 z-20 shadow-md no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:min-h-16 sm:items-center sm:justify-between">
            
            {/* Back & Week details */}
            <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0">
              <button
                id="back-btn"
                onClick={handleBackWithCheck}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
                title="Voltar para Seleção de Semanas"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider truncate">
                    {week.label}
                  </h1>
                  <span className="text-[10px] sm:text-xs text-blue-400 font-bold bg-blue-950 px-2 py-0.5 rounded border border-blue-900 whitespace-nowrap">
                    {week.periodo}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[9px] text-gray-400 font-bold uppercase">Sem</span>
                    <StatusBadge status={weeklyStatus} />
                    <span className="text-[10px] text-gray-400 font-mono">v{weeklyVersao}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[9px] text-gray-400 font-bold uppercase">Alt</span>
                    <StatusBadge status={altStatus} />
                    <span className="text-[10px] text-gray-400 font-mono">v{altVersao}</span>
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs text-gray-400 mt-1 truncate">
                  Usuário: <b className="text-gray-200">{usuario.postoGrad} {usuario.nome}</b>
                  <span className="hidden sm:inline"> (R.E. {usuario.re})</span>
                  <span className="ml-2 text-gray-500">· {usuario.perfil || "Operador"}</span>
                </div>
              </div>
            </div>

            {/* Main Editor Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {isDirty && (isWeeklyEditable || isAltEditable) && (
                <span className="hidden lg:flex items-center space-x-1.5 bg-amber-950 border border-amber-900 text-amber-400 px-2 py-1 rounded text-[10px] font-bold uppercase animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                  <span>Não Salvo</span>
                </span>
              )}

              <button
                id="export-scale-btn"
                onClick={openExportModal}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-gray-300 bg-gray-800 hover:bg-gray-750 hover:text-white rounded-md border border-gray-750 transition-colors cursor-pointer"
              >
                <Download size={14} />
                <span className="hidden xs:inline sm:inline">Exportar</span>
              </button>

              {canAccessConfig(usuario) && onOpenConfig && (
                <button
                  id="config-editor-btn"
                  onClick={() => {
                    if (isDirty) {
                      if (confirm("Você possui alterações não salvas neste editor de escalas. Deseja realmente sair para as configurações administrativas?")) {
                        onOpenConfig();
                      }
                    } else {
                      onOpenConfig();
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-blue-400 bg-gray-800 hover:bg-gray-750 hover:text-blue-300 rounded-md border border-gray-750 transition-colors cursor-pointer"
                >
                  <Settings size={14} />
                  <span className="hidden md:inline">Configurações</span>
                </button>
              )}

              <button
                id="sair-btn"
                onClick={() => {
                  if (isDirty) {
                    if (confirm("Você possui alterações não salvas. Deseja realmente sair do sistema? Suas alterações serão perdidas.")) {
                      onLogout();
                    }
                  } else {
                    onLogout();
                  }
                }}
                className="inline-flex items-center px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/45 hover:bg-red-950 rounded-md transition-colors border border-red-900/50 cursor-pointer"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        
        {/* Alerts Center */}
        {saveSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 flex items-center space-x-3 text-sm font-semibold">
            <CheckCircle className="text-green-600" size={20} />
            <span>As informações foram salvas no sistema</span>
          </div>
        )}

        {!loading &&
          renderTopRevisaoAlert(weeklyStatus, weeklyAprovacao, "Escala Semanal")}
        {!loading &&
          renderTopRevisaoAlert(altStatus, altAprovacao, "Escala Alteração")}

        {saveError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 flex items-center space-x-3 text-sm font-semibold">
            <AlertCircle className="text-red-600" size={20} />
            <span>{saveError}</span>
          </div>
        )}

        {isDirty && (
          <div className="mb-6 lg:hidden bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-semibold flex items-center space-x-2 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            <span>Atenção: Você tem alterações pendentes em memória. Use Salvar em cada painel para gravar.</span>
          </div>
        )}


        {/* LOADING INDICATOR */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white rounded-lg border border-gray-200 shadow-xs">
            <span className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3"></span>
            <p className="text-sm font-semibold text-gray-500">Acessando banco de dados...</p>
          </div>
        ) : (
          <div className="flex flex-col space-y-8">
            
            {/* PANEL 1: ESCALA SEMANAL */}
            <section className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden" id="semanal-panel-section">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-extrabold text-gray-950 uppercase tracking-wider flex items-center space-x-2">
                      <span className="h-2.5 w-2.5 bg-blue-600 rounded-full"></span>
                      <span>1. Escala Semanal</span>
                    </h2>
                    <StatusBadge status={weeklyStatus} />
                    <span className="text-[10px] text-gray-500 font-mono">v{weeklyVersao}</span>
                  </div>
                  {renderPanelHeaderMetadata(dbWeeklySaved, "blue")}
                  {renderStatusBanner(weeklyStatus, weeklyAprovacao, "Escala Semanal", showReopenWeekly, () => openReopenModal("semanal"))}
                  {renderPanelActionButtons("semanal")}
                  {renderHistoricoAccordion(weeklyHistorico, showWeeklyHistorico, setShowWeeklyHistorico, "Histórico — Escala Semanal")}
                </div>
              </div>

              {/* Table Weekly Scale */}
              <div className="table-scroll">
                <table className="w-full min-w-[760px] divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Posto</th>
                      <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">R.E.</th>
                      <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nome</th>
                      <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Seg</th>
                      <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ter</th>
                      <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qua</th>
                      <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qui</th>
                      <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sex</th>
                      <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sáb</th>
                      <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dom</th>
                      <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Observação</th>
                      <th className="px-2 sm:px-3 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200 text-xs">
                    {resolvedWeeklyRows.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-6 py-12 text-center text-gray-400 italic">
                          Nenhum colaborador adicionado à Escala Semanal nesta semana.
                        </td>
                      </tr>
                    ) : (
                      resolvedWeeklyRows.map((row) => (
                        <tr key={row.re} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-gray-900">{row.postoGrad}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-500">{row.re}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-gray-800" title={`Seção: ${row.secao}`}>
                            {row.nome}
                          </td>
                          
                          {/* Days Cells */}
                          {(["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const).map((day) => (
                            <td
                              key={day}
                              className={`p-1 ${day === "sab" || day === "dom" ? "border-2 border-red-500" : ""}`}
                            >
                              <select
                                value={row[day]}
                                onChange={(e) => handleCellChange("semanal", row.re, day, e.target.value)}
                                disabled={!isWeeklyEditable}
                                className="w-14 sm:w-[68px] mx-auto block border rounded text-[10px] sm:text-[11px] py-1 text-center font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-80"
                                style={getCellStyle(row[day])}
                                title={getLegendDescription(row[day])}
                              >
                                {(legendasList.length > 0 ? legendasList.map((l) => l.sigla) : OPCOES_ESCALA).map((opt) => (
                                  <option key={opt} value={opt} title={getLegendDescription(opt)}>{opt}</option>
                                ))}
                              </select>
                            </td>
                          ))}

                          {/* Observations Input */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.observacao}
                              placeholder="Observações..."
                              onChange={(e) => handleCellChange("semanal", row.re, "observacao", e.target.value)}
                              disabled={!isWeeklyEditable}
                              className="w-full max-w-xs border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium disabled:bg-gray-50 disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* Actions Column */}
                          <td className="px-3 py-2 whitespace-nowrap text-center">
                            <button
                              onClick={() => isAltEditable && handleCopyToAlteration(row)}
                              disabled={!isAltEditable}
                              className="inline-flex items-center space-x-1 px-2 sm:px-2.5 py-1 text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md border border-purple-200 transition-all cursor-pointer shadow-3xs disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Copiar militar para a Escala de Alteração"
                            >
                              <Copy size={12} />
                              <span className="hidden sm:inline">Alterar</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Seção de Observações Independentes */}
              <div className="px-4 py-4 sm:px-6 bg-gray-50 border-t border-gray-200">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Observações Gerais da Semana (Exclusivo Escala Semanal)
                </label>
                <textarea
                  value={weeklyObservacoes}
                  onChange={(e) => isWeeklyEditable && setWeeklyObservacoes(e.target.value)}
                  disabled={!isWeeklyEditable}
                  placeholder="Digite aqui as observações gerais para a Escala Semanal desta semana..."
                  rows={4}
                  className="w-full text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg p-3 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none shadow-3xs disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </section>


            {/* PANEL 2: ESCALA ALTERACAO */}
            <section className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden" id="alteracao-panel-section">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-extrabold text-gray-950 uppercase tracking-wider flex items-center space-x-2">
                      <span className="h-2.5 w-2.5 bg-purple-600 rounded-full"></span>
                      <span>2. Escala Alteração</span>
                    </h2>
                    <StatusBadge status={altStatus} />
                    <span className="text-[10px] text-gray-500 font-mono">v{altVersao}</span>
                  </div>
                  {dbWeeklySaved && renderPanelHeaderMetadata(dbAlterationSaved, "purple")}
                  {dbWeeklySaved && renderStatusBanner(altStatus, altAprovacao, "Escala Alteração", showReopenAlt, () => openReopenModal("alteracao"))}
                  {dbWeeklySaved && renderPanelActionButtons("alteracao")}
                  {dbWeeklySaved && renderHistoricoAccordion(altHistorico, showAltHistorico, setShowAltHistorico, "Histórico — Escala Alteração")}
                </div>
              </div>

              {!dbWeeklySaved ? (
                <div className="px-6 py-16 flex flex-col items-center justify-center text-center bg-gray-50/40 border-t border-gray-150">
                  <AlertCircle className="text-purple-400 mb-3 animate-pulse" size={32} />
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">Aguardando Escala Semanal</h3>
                  <p className="text-xs font-semibold text-gray-400 max-w-md">
                    Esta seção de alterações operacionais ficará habilitada assim que você realizar o primeiro salvamento da Escala Semanal acima.
                  </p>
                </div>
              ) : (
                <>
                  {/* Table Alteration Scale */}
                  <div className="table-scroll">
                    <table className="w-full min-w-[760px] divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Posto</th>
                          <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">R.E.</th>
                          <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nome</th>
                          <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Seg</th>
                          <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ter</th>
                          <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qua</th>
                          <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qui</th>
                          <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sex</th>
                          <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sáb</th>
                          <th className="px-1 sm:px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dom</th>
                          <th className="px-2 sm:px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Observação</th>
                          <th className="px-2 sm:px-3 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200 text-xs">
                        {resolvedAlterationRows.length === 0 ? (
                          <tr>
                            <td colSpan={12} className="px-6 py-12 text-center text-gray-400 italic font-medium">
                              Não há alterações cadastradas para esta semana.
                            </td>
                          </tr>
                        ) : (
                          resolvedAlterationRows.map((row) => (
                            <tr
                              key={row.re}
                              className={`transition-colors duration-500 hover:bg-gray-50/50 ${
                                highlightedRe === row.re ? "bg-purple-100" : ""
                              }`}
                            >
                              <td className="px-2 sm:px-3 py-2 whitespace-nowrap font-bold text-gray-900">{row.postoGrad}</td>
                              <td className="px-2 sm:px-3 py-2 whitespace-nowrap font-mono text-gray-500">{row.re}</td>
                              <td className="px-2 sm:px-3 py-2 whitespace-nowrap font-bold text-gray-800" title={`Seção: ${row.secao}`}>
                                {row.nome}
                              </td>
                              
                              {/* Days Cells */}
                              {(["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const).map((day) => (
                                <td
                                  key={day}
                                  className={`p-1 ${day === "sab" || day === "dom" ? "border-2 border-red-500" : ""}`}
                                >
                                  <select
                                    value={row[day]}
                                    onChange={(e) => handleCellChange("alteracao", row.re, day, e.target.value)}
                                    disabled={!isAltEditable}
                                    className="w-14 sm:w-[68px] mx-auto block border rounded text-[10px] sm:text-[11px] py-1 text-center font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-80"
                                    style={getCellStyle(row[day])}
                                    title={getLegendDescription(row[day])}
                                  >
                                    {(legendasList.length > 0 ? legendasList.map((l) => l.sigla) : OPCOES_ESCALA).map((opt) => (
                                      <option key={opt} value={opt} title={getLegendDescription(opt)}>{opt}</option>
                                    ))}
                                  </select>
                                </td>
                              ))}

                              {/* Observations Input */}
                              <td className="px-2 sm:px-3 py-2 whitespace-nowrap">
                                <input
                                  type="text"
                                  value={row.observacao}
                                  placeholder="Observações..."
                                  onChange={(e) => handleCellChange("alteracao", row.re, "observacao", e.target.value)}
                                  disabled={!isAltEditable}
                                  className="w-full max-w-[10rem] sm:max-w-xs border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium disabled:bg-gray-50 disabled:cursor-not-allowed"
                                />
                              </td>

                              {/* Actions Column */}
                              <td className="px-2 sm:px-3 py-2 whitespace-nowrap text-center">
                                <button
                                  onClick={() => isAltEditable && handleDeleteCol("alteracao", row.re)}
                                  disabled={!isAltEditable}
                                  className="inline-flex items-center space-x-1 px-2 sm:px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-all cursor-pointer shadow-3xs disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Remover militar da Escala de Alteração"
                                >
                                  <Trash2 size={12} />
                                  <span className="hidden sm:inline">Remover</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Seção de Observações Independentes */}
                  <div className="px-4 py-4 sm:px-6 bg-gray-50 border-t border-gray-200">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Observações Gerais de Alterações (Exclusivo Escala Alteração)
                    </label>
                    <textarea
                      value={alterationObservacoes}
                      onChange={(e) => isAltEditable && setAlterationObservacoes(e.target.value)}
                      disabled={!isAltEditable}
                      placeholder="Digite aqui as observações gerais para a Escala de Alteração desta semana..."
                      rows={4}
                      className="w-full text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg p-3 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none shadow-3xs disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              )}
            </section>

          </div>
        )}
      </main>

      {/* MODALS */}
      {/* SUBMIT FOR APPROVAL CONFIRMATION */}
      {submitConfirmTipo && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200">
            <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Send size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Confirmar envio para aprovação
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !submittingApproval && setSubmitConfirmTipo(null)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer text-lg"
                disabled={submittingApproval}
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              {submitConfirmTipo === "semanal" ? (
                <div className="text-xs text-gray-600 leading-relaxed space-y-2">
                  <p>
                    Você está prestes a enviar a <b>Escala Semanal</b> para aprovação do Gestor.
                  </p>
                  <p>
                    Após a aprovação, esta escala será considerada o planejamento oficial da semana
                    e <b>não poderá mais ser alterada</b>.
                  </p>
                  <p>
                    Caso existam informações pendentes, cancele esta operação e conclua a revisão
                    antes de prosseguir.
                  </p>
                  <p className="font-semibold text-gray-800">
                    Deseja realmente enviar esta Escala Semanal para aprovação?
                  </p>
                </div>
              ) : (
                <div className="text-xs text-gray-600 leading-relaxed space-y-2">
                  <p>
                    Você está prestes a enviar a <b>Escala Alteração</b> para aprovação do Gestor.
                  </p>
                  <p>
                    Esta aprovação formaliza todas as alterações realizadas na escala durante a
                    semana.
                  </p>
                  <p>
                    Após a aprovação, a Escala Alteração <b>não poderá mais ser modificada</b>.
                  </p>
                  <p>Verifique cuidadosamente todas as alterações antes de prosseguir.</p>
                  <p className="font-semibold text-gray-800">
                    Deseja realmente enviar esta Escala Alteração para aprovação?
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSubmitConfirmTipo(null)}
                  disabled={submittingApproval}
                  className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmitForApproval}
                  disabled={submittingApproval}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-md cursor-pointer disabled:opacity-50"
                >
                  <Send size={14} />
                  {submittingApproval ? "Enviando..." : "Enviar para Aprovação"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LINK DE APROVAÇÃO — após envio ou botão Link */}
      {linkModalUrl && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-gray-200">
            <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Link2 size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Solicitação criada com sucesso
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLinkModalUrl(null);
                  setLinkCopied(false);
                }}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Encaminhe este link ao Gestor responsável.
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <p className="text-[11px] font-mono text-gray-800 break-all select-all">
                  {linkModalUrl}
                </p>
              </div>
              {linkCopied && (
                <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                  <Check size={14} />
                  Link copiado com sucesso.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setLinkModalUrl(null);
                    setLinkCopied(false);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleCopyLinkModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-md cursor-pointer"
                >
                  <Copy size={14} />
                  Copiar Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN APPROVED SCALE MODAL */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200">
            <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RotateCcw size={18} className="text-orange-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Reabrir Escala</h3>
              </div>
              <button
                type="button"
                onClick={() => !reopenBusy && setIsReopenModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer text-lg"
                disabled={reopenBusy}
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                A escala voltará para <b>Em edição</b>, a aprovação atual será removida e a versão
                será incrementada (v{reopenTipo === "semanal" ? weeklyVersao : altVersao} → v
                {(reopenTipo === "semanal" ? weeklyVersao : altVersao) + 1}). Nova aprovação será
                obrigatória para a {getEscalaDocumentoLabel(reopenTipo)}.
              </p>
              <div>
                <label
                  htmlFor="reopen-motivo"
                  className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2"
                >
                  Motivo da reabertura *
                </label>
                <textarea
                  id="reopen-motivo"
                  value={reopenMotivo}
                  onChange={(e) => {
                    setReopenMotivo(e.target.value);
                    if (reopenError) setReopenError(null);
                  }}
                  rows={3}
                  placeholder="Ex.: Alteração de efetivo."
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none"
                  disabled={reopenBusy}
                />
              </div>
              {reopenError && (
                <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  {reopenError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(false)}
                  disabled={reopenBusy}
                  className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  id="confirm-reopen-btn"
                  onClick={handleConfirmReopen}
                  disabled={reopenBusy || !reopenMotivo.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-md cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  {reopenBusy ? "Reabrindo..." : "Confirmar reabertura"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CollaboratorModal
        isOpen={isColModalOpen}
        onClose={() => setIsColModalOpen(false)}
        onConfirm={handleAddColConfirm}
        onUpdate={handleUpdateColConfirm}
        collaboratorsPool={collaboratorsPool}
        currentReList={activePanelForModal === "semanal" 
          ? localWeeklyRows.map((r) => r.re) 
          : localAlterationRows.map((r) => r.re)}
        editCollaborator={editColTarget}
      />

      <ConcurrencyModal
        isOpen={isConcurrencyModalOpen}
        onClose={() => setIsConcurrencyModalOpen(false)}
        onForceSave={() => performSaveAndLog(pendingSavePanel || "semanal")}
        onReload={loadData}
        serverLastSaved={concurrencyConflictDoc}
      />

      {/* EXPORT MODAL */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200 max-h-[90vh] flex flex-col">
            <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Download size={18} className="text-blue-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Exportar Escala</h3>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Select Scales */}
              <div>
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Tipo de relatório
                </span>
                <div className="space-y-3">
                  <label className="flex items-center space-x-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={exportWeekly}
                      onChange={(e) => setExportWeekly(e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-gray-700 group-hover:text-gray-900">
                      Escala Semanal
                    </span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={exportAlteration}
                      onChange={(e) => setExportAlteration(e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-gray-700 group-hover:text-gray-900">
                      Escala Alteração
                    </span>
                  </label>
                </div>
              </div>

              <div className="border-t border-gray-150" />

              {/* Collaborator selection */}
              <div>
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Colaboradores a exportar
                </span>
                {exportCollaborators.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    Nenhum colaborador na escala desta semana.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <label className="flex items-center space-x-3 px-3 py-2.5 bg-gray-50 border-b border-gray-200 cursor-pointer sticky top-0">
                      <input
                        type="checkbox"
                        checked={exportAllSelected}
                        onChange={(e) => toggleExportAllCollaborators(e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-xs font-bold text-gray-800">Todos</span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {exportSelectedRes.length}/{exportCollaborators.length}
                      </span>
                    </label>
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                      {exportCollaborators.map((col) => {
                        const checked = exportSelectedRes.includes(col.re);
                        return (
                          <label
                            key={col.re}
                            className="flex items-center space-x-3 px-3 py-2 cursor-pointer hover:bg-gray-50 group"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleExportCollaborator(col.re, e.target.checked)}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 shrink-0"
                            />
                            <span className="text-xs font-medium text-gray-700 group-hover:text-gray-900 truncate">
                              {col.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-150" />

              {/* Format selection */}
              <div>
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Formato de Saída
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center justify-center space-x-2 p-3 border rounded-lg cursor-pointer transition-all ${
                      exportFormat === "pdf"
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "border-gray-200 hover:bg-gray-50 text-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportFormat"
                      value="pdf"
                      checked={exportFormat === "pdf"}
                      onChange={() => setExportFormat("pdf")}
                      className="sr-only"
                    />
                    <FileText size={16} className={exportFormat === "pdf" ? "text-blue-600" : "text-gray-400"} />
                    <span className="text-xs font-bold">Documento PDF</span>
                  </label>

                  <label
                    className={`flex items-center justify-center space-x-2 p-3 border rounded-lg cursor-pointer transition-all ${
                      exportFormat === "excel"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "border-gray-200 hover:bg-gray-50 text-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportFormat"
                      value="excel"
                      checked={exportFormat === "excel"}
                      onChange={() => setExportFormat("excel")}
                      className="sr-only"
                    />
                    <FileSpreadsheet size={16} className={exportFormat === "excel" ? "text-emerald-600" : "text-gray-400"} />
                    <span className="text-xs font-bold">Planilha Excel</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-end space-x-3 border-t border-gray-150 shrink-0">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!exportWeekly && !exportAlteration) {
                    alert("Selecione pelo menos uma escala para exportar.");
                    return;
                  }
                  if (exportSelectedRes.length === 0) {
                    alert("Selecione pelo menos um colaborador para exportar.");
                    return;
                  }
                  const selectedSet = new Set(exportSelectedRes);
                  const filteredWeekly = resolvedWeeklyRows.filter((r) => selectedSet.has(r.re));
                  const filteredAlteration = resolvedAlterationRows.filter((r) => selectedSet.has(r.re));
                  if (exportFormat === "pdf") {
                    exportToPDFCustom(
                      year,
                      week.label,
                      week.periodo,
                      filteredWeekly,
                      filteredAlteration,
                      dbWeeklySaved,
                      dbAlterationSaved,
                      exportWeekly,
                      exportAlteration,
                      weeklyObservacoes,
                      alterationObservacoes,
                      legendasList,
                      { nome: usuario.nome, re: usuario.re, postoGrad: usuario.postoGrad },
                      formatHomologacaoResumo(weeklyStatus, weeklyAprovacao, weeklyVersao),
                      formatHomologacaoResumo(altStatus, altAprovacao, altVersao)
                    );
                  } else {
                    exportToExcelCustom(
                      year,
                      week.label,
                      week.periodo,
                      filteredWeekly,
                      filteredAlteration,
                      exportWeekly,
                      exportAlteration,
                      weeklyObservacoes,
                      alterationObservacoes,
                      formatHomologacaoResumo(weeklyStatus, weeklyAprovacao, weeklyVersao),
                      formatHomologacaoResumo(altStatus, altAprovacao, altVersao)
                    );
                  }
                  void auditExportacao({
                    usuario,
                    anoSemana: docId,
                    detalhes: `Formato: ${exportFormat.toUpperCase()} · Semanal: ${exportWeekly} · Alteração: ${exportAlteration} · Colaboradores: ${exportSelectedRes.length}`,
                  }).catch((err) => console.warn("Falha ao auditar exportação:", err));
                  setIsExportModalOpen(false);
                }}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
