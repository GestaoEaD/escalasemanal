import React, { useState, useEffect } from "react";
import { db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, Timestamp } from "../firebase";
import { 
  Usuario, 
  ScheduleRow, 
  EscalaDocument, 
  Colaborador, 
  AuditLog, 
  OPCOES_ESCALA,
  POSTOS_GRADUACOES
} from "../types";
import { WeekInfo, formatTimestamp } from "../utils/dateUtils";
import { exportToExcelCustom, exportToPDFCustom } from "../utils/exportUtils";
import CollaboratorModal from "./CollaboratorModal";
import ConcurrencyModal from "./ConcurrencyModal";
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
  Copy
} from "lucide-react";
import { motion } from "motion/react";

interface ScheduleEditorProps {
  usuario: Usuario;
  year: number;
  week: WeekInfo;
  onBack: () => void;
  onLogout: () => void;
  onOpenConfig?: () => void;
}

export default function ScheduleEditor({
  usuario,
  year,
  week,
  onBack,
  onLogout,
  onOpenConfig,
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

  // Track if local state has unsaved changes
  const isDirty = React.useMemo(() => {
    return (
      JSON.stringify(localWeeklyRows) !== JSON.stringify(dbWeeklyRows) ||
      JSON.stringify(localAlterationRows) !== JSON.stringify(dbAlterationRows) ||
      weeklyObservacoes !== dbWeeklyObservacoes ||
      alterationObservacoes !== dbAlterationObservacoes
    );
  }, [localWeeklyRows, dbWeeklyRows, localAlterationRows, dbAlterationRows, weeklyObservacoes, dbWeeklyObservacoes, alterationObservacoes, dbAlterationObservacoes]);

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
        setDbWeeklyRows(data.rows || []);
        setLocalWeeklyRows(data.rows || []);
        setDbWeeklySaved(data.lastSaved);
        setLoadedWeeklyTimestamp(data.lastSaved?.timestamp || null);
        
        const obs = data.observacoes || "";
        setWeeklyObservacoes(obs);
        setDbWeeklyObservacoes(obs);

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
          observacao: c.observacao || ""
        }));
        
        const docData = {
          id: docId,
          ano: year,
          semana: week.numero,
          periodo: week.periodo,
          rows: rows,
          lastSaved: null,
          observacoes: ""
        };
        await setDoc(weeklyDocRef, docData);
        
        setDbWeeklyRows(rows);
        setLocalWeeklyRows(rows);
        setDbWeeklySaved(null);
        setLoadedWeeklyTimestamp(null);
        setWeeklyObservacoes("");
        setDbWeeklyObservacoes("");
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
        } else {
          // Create automatically as an empty list (NEW BEHAVIOR)
          const rows: ScheduleRow[] = [];
          
          const docData = {
            id: docId,
            ano: year,
            semana: week.numero,
            periodo: week.periodo,
            rows: rows,
            lastSaved: null,
            observacoes: ""
          };
          await setDoc(alterationDocRef, docData);

          setDbAlterationRows(rows);
          setLocalAlterationRows(rows);
          setDbAlterationSaved(null);
          setLoadedAlterationTimestamp(null);
          setAlterationObservacoes("");
          setDbAlterationObservacoes("");
        }
      } else {
        // Escala Alteração is empty / not saved yet
        setDbAlterationRows([]);
        setLocalAlterationRows([]);
        setDbAlterationSaved(null);
        setLoadedAlterationTimestamp(null);
        setAlterationObservacoes("");
        setDbAlterationObservacoes("");
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
        await setDoc(doc(db, "colaboradores", col.re), newColDoc);
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
      observacao: col.observacao || ""
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
      
      await setDoc(doc(db, "colaboradores", updated.re), updatedColDoc);
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
      setLocalWeeklyRows((prev) => prev.filter((r) => r.re !== reToDelete));
    } else {
      setLocalAlterationRows((prev) => prev.filter((r) => r.re !== reToDelete));
    }
  };

  // Copy a specific row from Escala Semanal to Escala de Alteração
  const handleCopyToAlteration = (row: ScheduleRow) => {
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

  // Verification and Concurrency-aware Save Trigger
  const handleSaveTrigger = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // 1. Query Firestore for the current database state of both documents
      const weeklyDocRef = doc(db, "escalas_semanais", docId);
      const alterationDocRef = doc(db, "escalas_alteracao", docId);

      const [weeklySnap, alterationSnap] = await Promise.all([
        getDoc(weeklyDocRef),
        getDoc(alterationDocRef),
      ]);

      let conflictFound = false;
      let conflictSavedInfo: any = null;

      // Check Weekly Scale conflict
      if (weeklySnap.exists()) {
        const serverData = weeklySnap.data() as EscalaDocument;
        const serverTimestamp = serverData.lastSaved?.timestamp;
        
        // If server timestamp exists and is newer than what we loaded
        if (serverTimestamp && loadedWeeklyTimestamp) {
          const serverTimeMs = serverTimestamp.toMillis ? serverTimestamp.toMillis() : new Date(serverTimestamp).getTime();
          const loadedTimeMs = loadedWeeklyTimestamp.toMillis ? loadedWeeklyTimestamp.toMillis() : new Date(loadedWeeklyTimestamp).getTime();
          
          if (serverTimeMs > loadedTimeMs) {
            conflictFound = true;
            conflictSavedInfo = serverData.lastSaved;
          }
        }
      }

      // Check Alterations Scale conflict
      if (!conflictFound && alterationSnap.exists()) {
        const serverData = alterationSnap.data() as EscalaDocument;
        const serverTimestamp = serverData.lastSaved?.timestamp;

        if (serverTimestamp && loadedAlterationTimestamp) {
          const serverTimeMs = serverTimestamp.toMillis ? serverTimestamp.toMillis() : new Date(serverTimestamp).getTime();
          const loadedTimeMs = loadedAlterationTimestamp.toMillis ? loadedAlterationTimestamp.toMillis() : new Date(loadedAlterationTimestamp).getTime();

          if (serverTimeMs > loadedTimeMs) {
            conflictFound = true;
            conflictSavedInfo = serverData.lastSaved;
          }
        }
      }

      if (conflictFound) {
        // Concurrency conflict detected! Show modal.
        setConcurrencyConflictDoc(conflictSavedInfo);
        setIsConcurrencyModalOpen(true);
        setSaving(false);
        return;
      }

      // No conflict! Perform save directly
      await performSaveAndLog();

    } catch (err: any) {
      console.error("Save validation failed:", err);
      setSaveError("Erro de comunicação ao salvar. Tente novamente.");
      setSaving(false);
    }
  };

  // Perform Firestore updates and write logs
  const performSaveAndLog = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const now = new Date();
      const timestamp = Timestamp.fromDate(now);
      const dataStr = String(now.getDate()).padStart(2, "0") + "/" + String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();
      const horaStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

      const savedMetadata = {
        nome: usuario.nome,
        postoGrad: usuario.postoGrad,
        re: usuario.re,
        timestamp: timestamp,
        data: dataStr,
        hora: horaStr
      };

      const isWeeklyRowsDirty = JSON.stringify(localWeeklyRows) !== JSON.stringify(dbWeeklyRows);
      const isWeeklyObsDirty = weeklyObservacoes !== dbWeeklyObservacoes;
      const isWeeklyDirty = isWeeklyRowsDirty || isWeeklyObsDirty || dbWeeklySaved === null;

      const isAlterationRowsDirty = JSON.stringify(localAlterationRows) !== JSON.stringify(dbAlterationRows);
      const isAlterationObsDirty = alterationObservacoes !== dbAlterationObservacoes;
      const isAlterationDirty = isAlterationRowsDirty || isAlterationObsDirty;

      // 1. Generate Audit Logs for individual changes
      const auditLogsList: AuditLog[] = [];

      let rowsToSaveWeekly = localWeeklyRows;
      let rowsToSaveAlteration = localAlterationRows;

      const generateDiffLogs = (
        panelName: "Escala Semanal" | "Escala Alteração",
        localRows: ScheduleRow[],
        dbRows: ScheduleRow[]
      ) => {
        // Find added & updated
        localRows.forEach((row) => {
          const oldRow = dbRows.find((r) => r.re === row.re);

          if (!oldRow) {
            // Added collaborator row
            auditLogsList.push({
              timestamp,
              data: dataStr,
              hora: horaStr,
              usuario: usuario.nome,
              re: usuario.re,
              painel: panelName,
              colaborador: `${row.postoGrad} ${row.nome} (R.E. ${row.re})`,
              campoAlterado: "Colaborador Adicionado",
              valorAnterior: "",
              novoValor: `Seção: ${row.secao}`,
              anoSemana: docId,
            });
          } else {
            // Compare daily cells and observacao
            const days: ("seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom")[] = [
              "seg", "ter", "qua", "qui", "sex", "sab", "dom"
            ];
            
            days.forEach((day) => {
              if (row[day] !== oldRow[day]) {
                auditLogsList.push({
                  timestamp,
                  data: dataStr,
                  hora: horaStr,
                  usuario: usuario.nome,
                  re: usuario.re,
                  painel: panelName,
                  colaborador: `${row.postoGrad} ${row.nome} (R.E. ${row.re})`,
                  campoAlterado: day.toUpperCase(),
                  valorAnterior: oldRow[day],
                  novoValor: row[day],
                  anoSemana: docId,
                });
              }
            });

            if (row.observacao !== oldRow.observacao) {
              auditLogsList.push({
                timestamp,
                data: dataStr,
                hora: horaStr,
                usuario: usuario.nome,
                re: usuario.re,
                painel: panelName,
                colaborador: `${row.postoGrad} ${row.nome} (R.E. ${row.re})`,
                campoAlterado: "Observação",
                valorAnterior: oldRow.observacao || "Vazio",
                novoValor: row.observacao || "Vazio",
                anoSemana: docId,
              });
            }
          }
        });

        // Find removed
        dbRows.forEach((oldRow) => {
          const exists = localRows.some((r) => r.re === oldRow.re);
          if (!exists) {
            auditLogsList.push({
              timestamp,
              data: dataStr,
              hora: horaStr,
              usuario: usuario.nome,
              re: usuario.re,
              painel: panelName,
              colaborador: `${oldRow.postoGrad} ${oldRow.nome} (R.E. ${oldRow.re})`,
              campoAlterado: "Colaborador Removido",
              valorAnterior: `${oldRow.postoGrad} ${oldRow.nome} (R.E. ${oldRow.re})`,
              novoValor: "",
              anoSemana: docId,
            });
          }
        });
      };

      if (isWeeklyDirty) {
        generateDiffLogs("Escala Semanal", rowsToSaveWeekly, dbWeeklyRows);
      }
      if (isAlterationDirty) {
        generateDiffLogs("Escala Alteração", rowsToSaveAlteration, dbAlterationRows);
      }

      if (isWeeklyObsDirty) {
        auditLogsList.push({
          timestamp,
          data: dataStr,
          hora: horaStr,
          usuario: usuario.nome,
          re: usuario.re,
          painel: "Escala Semanal",
          colaborador: "Geral",
          campoAlterado: "Observações do Painel",
          valorAnterior: dbWeeklyObservacoes || "Vazio",
          novoValor: weeklyObservacoes || "Vazio",
          anoSemana: docId,
        });
      }

      if (isAlterationObsDirty) {
        auditLogsList.push({
          timestamp,
          data: dataStr,
          hora: horaStr,
          usuario: usuario.nome,
          re: usuario.re,
          painel: "Escala Alteração",
          colaborador: "Geral",
          campoAlterado: "Observações do Painel",
          valorAnterior: dbAlterationObservacoes || "Vazio",
          novoValor: alterationObservacoes || "Vazio",
          anoSemana: docId,
        });
      }

      // 2. Perform Saves
      const weeklyDocRef = doc(db, "escalas_semanais", docId);
      const weeklyDocData: EscalaDocument = {
        id: docId,
        ano: year,
        semana: week.numero,
        periodo: week.periodo,
        rows: rowsToSaveWeekly,
        lastSaved: savedMetadata,
        observacoes: weeklyObservacoes
      };
      await setDoc(weeklyDocRef, weeklyDocData);

      const alterationDocRef = doc(db, "escalas_alteracao", docId);
      const alterationDocData: EscalaDocument = {
        id: docId,
        ano: year,
        semana: week.numero,
        periodo: week.periodo,
        rows: rowsToSaveAlteration,
        lastSaved: savedMetadata,
        observacoes: alterationObservacoes
      };
      await setDoc(alterationDocRef, alterationDocData);

      // 3. Save generated logs to Firestore
      const logsCollectionRef = collection(db, "logs");
      await Promise.all(
        auditLogsList.map((log) => {
          const logDocRef = doc(logsCollectionRef); // Auto-generated ID
          return setDoc(logDocRef, log);
        })
      );

      // 4. Update memory tracking to match new database state
      setDbWeeklyRows(JSON.parse(JSON.stringify(rowsToSaveWeekly)));
      setLocalWeeklyRows(JSON.parse(JSON.stringify(rowsToSaveWeekly)));

      setDbAlterationRows(JSON.parse(JSON.stringify(rowsToSaveAlteration)));
      setLocalAlterationRows(JSON.parse(JSON.stringify(rowsToSaveAlteration)));

      setDbWeeklySaved(savedMetadata);
      setDbAlterationSaved(savedMetadata);
      setLoadedWeeklyTimestamp(timestamp);
      setLoadedAlterationTimestamp(timestamp);

      setDbWeeklyObservacoes(weeklyObservacoes);
      setDbAlterationObservacoes(alterationObservacoes);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);

    } catch (err: any) {
      console.error("Failed perform save:", err);
      setSaveError("Erro ao gravar dados no Firestore. Tente novamente.");
    } finally {
      setSaving(false);
      setIsConcurrencyModalOpen(false);
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

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Top bar header */}
      <header className="bg-[#111827] text-white border-b border-gray-800 sticky top-0 z-20 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            {/* Back & Week details */}
            <div className="flex items-center space-x-3">
              <button
                id="back-btn"
                onClick={handleBackWithCheck}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
                title="Voltar para Seleção de Semanas"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                    {week.label}
                  </h1>
                  <span className="text-[10px] sm:text-xs text-blue-400 font-bold bg-blue-950 px-2 py-0.5 rounded border border-blue-900">
                    {week.periodo}
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs text-gray-400 mt-1">
                  Usuário logado: <b className="text-gray-200">{usuario.postoGrad} {usuario.nome} (R.E. {usuario.re})</b>
                </div>
              </div>
            </div>

            {/* Main Editor Action Buttons */}
            <div className="flex items-center space-x-2">
              {/* Unsaved Changes status dot */}
              {isDirty && (
                <span className="hidden lg:flex items-center space-x-1.5 bg-amber-950 border border-amber-900 text-amber-400 px-2 py-1 rounded text-[10px] font-bold uppercase animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                  <span>Não Salvo</span>
                </span>
              )}

              <button
                id="save-scale-btn"
                onClick={handleSaveTrigger}
                disabled={saving || !isDirty}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all shadow-sm cursor-pointer ${
                  isDirty 
                    ? "bg-blue-600 hover:bg-blue-500 text-white" 
                    : "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                }`}
              >
                <Save size={14} />
                <span>{saving ? "Salvando..." : "Salvar"}</span>
              </button>

              <button
                id="export-scale-btn"
                onClick={() => setIsExportModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-gray-300 bg-gray-800 hover:bg-gray-750 hover:text-white rounded-md border border-gray-750 transition-colors cursor-pointer"
              >
                <Download size={14} />
                <span>Exportar</span>
              </button>

              {usuario.perfil === "Administrador" && onOpenConfig && (
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
                  className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-bold text-blue-400 bg-gray-800 hover:bg-gray-750 hover:text-blue-300 rounded-md border border-gray-750 transition-colors cursor-pointer"
                >
                  <Settings size={14} />
                  <span>Configurações</span>
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
                className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/45 hover:bg-red-950 rounded-md transition-colors border border-red-900/50 cursor-pointer"
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

        {saveError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 flex items-center space-x-3 text-sm font-semibold">
            <AlertCircle className="text-red-600" size={20} />
            <span>{saveError}</span>
          </div>
        )}

        {isDirty && (
          <div className="mb-6 lg:hidden bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-semibold flex items-center space-x-2 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            <span>Atenção: Você tem alterações pendentes em memória. Clique em Salvar no topo para gravar.</span>
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
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                  <h2 className="text-base font-extrabold text-gray-950 uppercase tracking-wider flex items-center space-x-2">
                    <span className="h-2.5 w-2.5 bg-blue-600 rounded-full"></span>
                    <span>1. Escala Semanal</span>
                  </h2>
                  {renderPanelHeaderMetadata(dbWeeklySaved, "blue")}
                </div>
              </div>

              {/* Table Weekly Scale */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Posto</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">R.E.</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nome</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Seg</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ter</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qua</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qui</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sex</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sáb</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dom</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Observação</th>
                      <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ações</th>
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
                            <td key={day} className="p-1">
                              <select
                                value={row[day]}
                                onChange={(e) => handleCellChange("semanal", row.re, day, e.target.value)}
                                className="w-[68px] mx-auto block border rounded text-[11px] py-1 text-center font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
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
                              className="w-full max-w-xs border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                            />
                          </td>

                          {/* Actions Column */}
                          <td className="px-3 py-2 whitespace-nowrap text-center">
                            <button
                              onClick={() => handleCopyToAlteration(row)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md border border-purple-200 transition-all cursor-pointer shadow-3xs"
                              title="Copiar militar para a Escala de Alteração"
                            >
                              <Copy size={12} />
                              <span>Alterar</span>
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
                  onChange={(e) => setWeeklyObservacoes(e.target.value)}
                  placeholder="Digite aqui as observações gerais para a Escala Semanal desta semana..."
                  rows={4}
                  className="w-full text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg p-3 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none shadow-3xs"
                />
              </div>
            </section>


            {/* PANEL 2: ESCALA ALTERACAO */}
            <section className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden" id="alteracao-panel-section">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                  <h2 className="text-base font-extrabold text-gray-950 uppercase tracking-wider flex items-center space-x-2">
                    <span className="h-2.5 w-2.5 bg-purple-600 rounded-full"></span>
                    <span>2. Escala Alteração</span>
                  </h2>
                  {dbWeeklySaved && renderPanelHeaderMetadata(dbAlterationSaved, "purple")}
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
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Posto</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">R.E.</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nome</th>
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Seg</th>
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ter</th>
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qua</th>
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qui</th>
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sex</th>
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sáb</th>
                          <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dom</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Observação</th>
                          <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ações</th>
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
                              <td className="px-3 py-2 whitespace-nowrap font-bold text-gray-900">{row.postoGrad}</td>
                              <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-500">{row.re}</td>
                              <td className="px-3 py-2 whitespace-nowrap font-bold text-gray-800" title={`Seção: ${row.secao}`}>
                                {row.nome}
                              </td>
                              
                              {/* Days Cells */}
                              {(["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const).map((day) => (
                                <td key={day} className="p-1">
                                  <select
                                    value={row[day]}
                                    onChange={(e) => handleCellChange("alteracao", row.re, day, e.target.value)}
                                    className="w-[68px] mx-auto block border rounded text-[11px] py-1 text-center font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
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
                                  onChange={(e) => handleCellChange("alteracao", row.re, "observacao", e.target.value)}
                                  className="w-full max-w-xs border border-gray-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                                />
                              </td>

                              {/* Actions Column */}
                              <td className="px-3 py-2 whitespace-nowrap text-center">
                                <button
                                  onClick={() => handleDeleteCol("alteracao", row.re)}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-all cursor-pointer shadow-3xs"
                                  title="Remover militar da Escala de Alteração"
                                >
                                  <Trash2 size={12} />
                                  <span>Remover</span>
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
                      onChange={(e) => setAlterationObservacoes(e.target.value)}
                      placeholder="Digite aqui as observações gerais para a Escala de Alteração desta semana..."
                      rows={4}
                      className="w-full text-xs font-semibold text-gray-800 border border-gray-200 rounded-lg p-3 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none shadow-3xs"
                    />
                  </div>
                </>
              )}
            </section>

          </div>
        )}
      </main>

      {/* MODALS */}
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
        onForceSave={performSaveAndLog}
        onReload={loadData}
        serverLastSaved={concurrencyConflictDoc}
      />

      {/* EXPORT MODAL */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-200">
            <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
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

            <div className="p-6 space-y-6">
              {/* Select Scales */}
              <div>
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Selecione as Escalas
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
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-end space-x-3 border-t border-gray-150">
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
                  if (exportFormat === "pdf") {
                    exportToPDFCustom(
                      year,
                      week.label,
                      week.periodo,
                      resolvedWeeklyRows,
                      resolvedAlterationRows,
                      dbWeeklySaved,
                      dbAlterationSaved,
                      exportWeekly,
                      exportAlteration,
                      weeklyObservacoes,
                      alterationObservacoes,
                      legendasList
                    );
                  } else {
                    exportToExcelCustom(
                      year,
                      week.label,
                      week.periodo,
                      resolvedWeeklyRows,
                      resolvedAlterationRows,
                      exportWeekly,
                      exportAlteration,
                      weeklyObservacoes,
                      alterationObservacoes
                    );
                  }
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
