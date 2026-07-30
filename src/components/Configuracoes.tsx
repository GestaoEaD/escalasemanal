import React, { useState, useEffect, useMemo } from "react";
import { db, collection, getDocs, getDoc, doc, query, where } from "../firebase";
import { Usuario, Colaborador, AuditAlteracao, AuditOperation, Legenda, Secao, Divisao, DIVISAO_EAD_ID } from "../types";
import {
  Users,
  Shield,
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
  FileSpreadsheet,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";
import { loadAuditOperations } from "../utils/auditService";
import {
  saveConfiguracoesBatch,
  normalizeColaborador,
  reconcileColaboradoresUsuariosSecao,
  type RemocaoCatalogo,
  type TenantLegenda,
} from "../services/configuracaoService";
import {
  displayUserEmail,
  isValidEmailFormat,
  normalizeEmail,
  prepareUsuarioDocument,
  validateUsuarioEmail,
} from "../utils/usuarioHelpers";
import {
  createEmptyLegendaForm,
  normalizeLegenda,
  toLegendaFormState,
} from "../utils/legendaModel";
import { exportUsuariosToExcel } from "../utils/exportUtils";
import { KNOWN_SECAO_CODIGOS } from "../utils/seedData";
import { normalizeSecaoNome, secoesIguais } from "../utils/secaoMatch";
import { normalizeAtivoFlag } from "../utils/ativoFlag";
import { toSessionUser, writeSession } from "../utils/sessionService";
import {
  canAccessTestCenter,
  canEditConfigGerais,
  canManageDivisoes,
  canManageCadastrosDivisao,
  canManageColaboradores,
  canManageSecoes,
  canManagePostos,
  canManageUsuarios,
  canManageLegendasGlobais,
  canManageUsuarioInDivisao,
  canViewLogs,
  assignablePerfis,
  isGerente,
  isAdministrador,
} from "../utils/permissions";
import {
  resolveActiveDivisaoId,
  filterByDivisaoId,
  sortDivisoes,
} from "../utils/divisaoContext";
import { normalizeDivisaoId, divisaoDocId } from "../utils/divisaoIds";
import { DivisionIcon, SectionIcon } from "../utils/categoryIcons";
import LogsAuditPanel from "./LogsAuditPanel";
import CentralTestes from "./CentralTestes";

/** Normaliza código da seção para dígitos apenas. */
function normalizeSecaoCodigo(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function withSecaoCodigo(
  s: Record<string, unknown>,
  activeDivisaoId: string = DIVISAO_EAD_ID,
  id: string = ""
): Secao {
  const src = s as Partial<Secao>;
  const nome = String(s.nome || "");
  const raw = normalizeSecaoCodigo(s.codigo);
  return {
    ...(s as unknown as Secao),
    id: String(id || src.id || "").trim(),
    nome,
    codigo: raw || KNOWN_SECAO_CODIGOS[nome] || "",
    divisaoId: String(s.divisaoId || activeDivisaoId),
    ativo: s.ativo !== false,
    ordem: typeof s.ordem === "number" ? s.ordem : Number(s.ordem) || 0,
  };
}

interface ConfiguracoesProps {
  usuario: Usuario;
  onBack: () => void;
  onUsuarioUpdate?: (usuario: Usuario) => void;
}

type MenuTab =
  | "colaboradores"
  | "usuarios"
  | "postos"
  | "secoes"
  | "legendas"
  | "divisoes"
  | "gerais"
  | "registros"
  | "testes";
/** Seção editada dentro do modal de Divisão. */
type SecaoDivisaoForm = { id: string; nome: string; codigo: string; ordem: number; ativo: boolean; divisaoId: string };
type LegendaModalSection = "basicas" | "representacoes" | "regras";

/** Select tri-estado para campos booleanos opcionais (não configurado / sim / não). */
function OptionalBoolSelect({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  hint?: string;
}) {
  const selectValue = value === true ? "true" : value === false ? "false" : "";
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : v === "true");
        }}
        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
      >
        <option value="">Não configurado</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
      {hint && <p className="mt-1 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

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

export default function Configuracoes({ usuario, onBack, onUsuarioUpdate }: ConfiguracoesProps) {
  const activeDivisaoId = resolveActiveDivisaoId(usuario);
  const canDivisoes = canManageDivisoes(usuario);
  const canCadastrosDivisao = canManageCadastrosDivisao(usuario);
  const canColaboradores = canManageColaboradores(usuario);
  const canSecoes = canManageSecoes(usuario);
  const canPostos = canManagePostos(usuario);
  const canUsuarios = canManageUsuarios(usuario);
  const canLegendas = canManageLegendasGlobais(usuario);
  const canGerais = canEditConfigGerais(usuario);
  const canTestes = canAccessTestCenter(usuario);
  const canLogs = canViewLogs(usuario);
  const perfilOptions = assignablePerfis(usuario);
  const listSecoesDaDivisao = (divisaoId: string): Secao[] =>
    secoes
      .filter((s) => normalizeDivisaoId(s.divisaoId) === normalizeDivisaoId(divisaoId))
      .slice()
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  const listPostosDaDivisao = (divisaoId: string) =>
    postos
      .filter((p) => normalizeDivisaoId(p.divisaoId) === normalizeDivisaoId(divisaoId))
      .slice()
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  const nomeDivisao = (divisaoId: string): string => {
    const codigo = normalizeDivisaoId(divisaoId);
    return divisoesList.find((d) => d.codigo === codigo)?.nome || codigo || "—";
  };

  const opcoesDivisaoSelect = (): Divisao[] => {
    if (isGerente(usuario)) return divisoesList;
    const own = divisoesList.find((d) => d.codigo === activeDivisaoId);
    return own
      ? [own]
      : [{ codigo: activeDivisaoId, nome: nomeDivisao(activeDivisaoId), ativo: true }];
  };

  // Ordem final do menu lateral, respeitando a matriz de permissões.
  const MENU_ITENS: { id: MenuTab; label: string; icone: LucideIcon; visivel: boolean }[] = [
    { id: "divisoes", label: "Divisões", icone: DivisionIcon, visivel: canDivisoes },
    { id: "secoes", label: "Seções", icone: SectionIcon, visivel: canSecoes },
    { id: "colaboradores", label: "Colaboradores", icone: Users, visivel: canColaboradores },
    { id: "usuarios", label: "Permissão", icone: Shield, visivel: canUsuarios },
    { id: "postos", label: "Postos", icone: Briefcase, visivel: canPostos },
    { id: "legendas", label: "Legendas", icone: Activity, visivel: canLegendas },
    { id: "registros", label: "Logs", icone: FileText, visivel: canLogs },
    { id: "testes", label: "Central de Testes", icone: FlaskConical, visivel: canTestes },
    { id: "gerais", label: "Gerais", icone: Settings, visivel: canGerais },
  ];

  // Active module tab
  const [activeTab, setActiveTab] = useState<MenuTab>(() =>
    isGerente(usuario) ? "divisoes" : "secoes"
  );
  const visibleMenuItems = MENU_ITENS.filter((item) => item.visivel);

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
  const [origLegendas, setOrigLegendas] = useState<Legenda[]>([]);
  const [origDivisoes, setOrigDivisoes] = useState<Divisao[]>([]);
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
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [legendas, setLegendas] = useState<TenantLegenda[]>([]);
  const [divisoesList, setDivisoesList] = useState<Divisao[]>([]);
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
  // Catálogos guardam a Divisão junto da chave: o ID do documento depende dela.
  const [removedPostos, setRemovedPostos] = useState<RemocaoCatalogo[]>([]);
  const [removedSecoes, setRemovedSecoes] = useState<RemocaoCatalogo[]>([]);
  const [removedLegendas, setRemovedLegendas] = useState<RemocaoCatalogo[]>([]);
  const [removedDivisoes, setRemovedDivisoes] = useState<string[]>([]);

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
  /** RE original na edição de colaborador (null = inclusão). Permite alterar o RE. */
  const [colOriginalRe, setColOriginalRe] = useState<string | null>(null);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  /** RE original na edição de permissão (null = inclusão). Permite alterar o RE. */
  const [userOriginalRe, setUserOriginalRe] = useState<string | null>(null);

  const [postoModalOpen, setPostoModalOpen] = useState(false);
  const [currentPosto, setCurrentPosto] = useState<any | null>(null);
  // Sigla original do posto em edição (null = inclusão de novo posto)
  const [postoOriginalSigla, setPostoOriginalSigla] = useState<string | null>(null);

  const [secaoModalOpen, setSecaoModalOpen] = useState(false);
  const [currentSecao, setCurrentSecao] = useState<Secao | null>(null);
  const [secaoOriginalId, setSecaoOriginalId] = useState<string | null>(null);

  const [secaoRenames, setSecaoRenames] = useState<{ id: string; from: string; to: string; divisaoId: string }[]>([]);

  const [legendaModalOpen, setLegendaModalOpen] = useState(false);
  const [currentLegenda, setCurrentLegenda] = useState<Legenda | null>(null);
  // Sigla original da legenda em edição (null = inclusão de nova legenda)
  const [legendaOriginalSigla, setLegendaOriginalSigla] = useState<string | null>(null);
  const [legendaModalSection, setLegendaModalSection] = useState<LegendaModalSection>("basicas");
  const [divisaoModalOpen, setDivisaoModalOpen] = useState(false);
  const [currentDivisao, setCurrentDivisao] = useState<Divisao | null>(null);
  const [divisaoOriginalCodigo, setDivisaoOriginalCodigo] = useState<string | null>(null);
  // Seções da Divisão aberta no modal (único lugar de criação/edição de seções).
  const [divisaoSecoes, setDivisaoSecoes] = useState<SecaoDivisaoForm[]>([]);
  const [divisaoSecoesRemovidas, setDivisaoSecoesRemovidas] = useState<string[]>([]);
  const [divisaoSecoesCarregando, setDivisaoSecoesCarregando] = useState(false);
  const [novaSecaoNome, setNovaSecaoNome] = useState("");
  const [novaSecaoCodigo, setNovaSecaoCodigo] = useState("");
  /** Quando preenchido, o formulário de seção no modal de Divisão está em modo edição. */
  const [editandoSecaoId, setEditandoSecaoId] = useState<string | null>(null);

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<{ type: MenuTab; id: string; label: string } | null>(null);

  // Load all configuration data from firestore
  const loadAllData = async () => {
    setLoading(true);
    setSaveError(null);
    try {
      // 1. Fetch Secoes — Gerente carrega todas (para lotar usuários em qualquer Divisão);
      // Admin/outros só a Divisão ativa.
      const secoesSnap = canDivisoes
        ? await getDocs(collection(db, "secoes"))
        : await getDocs(
            query(collection(db, "secoes"), where("divisaoId", "==", activeDivisaoId))
          );
      const secoesList: Secao[] = [];
      secoesSnap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const divisaoId = String(data.divisaoId || activeDivisaoId);
        secoesList.push(withSecaoCodigo(data, divisaoId, docSnap.id));
      });
      const tenantSecoesList = canDivisoes
        ? secoesList
        : filterByDivisaoId(secoesList, activeDivisaoId, usuario);
      tenantSecoesList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      const secaoPorId = new Map(tenantSecoesList.map((s) => [String(s.id || "").trim(), s]));
      const secaoPorNome = new Map(
        tenantSecoesList.map((s) => [normalizeSecaoNome(s.nome), s])
      );

      // 2. Fetch Collaborators — Gerente vê todas as Divisões; demais só a ativa.
      const colSnap = canDivisoes
        ? await getDocs(collection(db, "colaboradores"))
        : await getDocs(
            query(collection(db, "colaboradores"), where("divisaoId", "==", activeDivisaoId))
          );
      const colList: Colaborador[] = [];
      colSnap.forEach((docSnap) => {
        const data = docSnap.data() as Colaborador;
        const secaoInfo =
          secaoPorId.get(String(data.secaoId || "").trim()) ||
          secaoPorNome.get(normalizeSecaoNome(data.secao));
        colList.push(
          normalizeColaborador({
            ...data,
            secao: String(data.secao || secaoInfo?.nome || ""),
            secaoId: String(data.secaoId || secaoInfo?.id || ""),
            divisaoId: String(data.divisaoId || activeDivisaoId),
          })
        );
      });
      const tenantColList = canDivisoes
        ? colList
        : filterByDivisaoId(colList, activeDivisaoId, usuario);
      tenantColList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // 3. Fetch Users — Gerente vê todas; demais só a ativa.
      const userSnap = canDivisoes
        ? await getDocs(collection(db, "usuarios"))
        : await getDocs(
            query(collection(db, "usuarios"), where("divisaoId", "==", activeDivisaoId))
          );
      const userList: Usuario[] = [];
      userSnap.forEach((d) => {
        const data = d.data() as Usuario;
        const secaoInfo =
          secaoPorId.get(String(data.secaoId || "").trim()) ||
          secaoPorNome.get(normalizeSecaoNome(data.secao));
        userList.push(
          prepareUsuarioDocument({
            ...data,
            re: data.re || d.id,
            uid: d.id,
            secao: String(data.secao || secaoInfo?.nome || ""),
            secaoId: String(data.secaoId || secaoInfo?.id || ""),
            divisaoId: String(data.divisaoId || activeDivisaoId),
          })
        );
      });
      const tenantUserList = canDivisoes
        ? userList
        : filterByDivisaoId(userList, activeDivisaoId, usuario);
      tenantUserList.sort((a, b) => a.nome.localeCompare(b.nome));

      // 4. Fetch Postos — Gerente vê todas; demais só a ativa.
      const postosSnap = canDivisoes
        ? await getDocs(collection(db, "postos"))
        : await getDocs(
            query(collection(db, "postos"), where("divisaoId", "==", activeDivisaoId))
          );
      const postosList: any[] = [];
      postosSnap.forEach((doc) => {
        const data = doc.data();
        postosList.push({ ...data, divisaoId: String(data.divisaoId || activeDivisaoId) });
      });
      const tenantPostosList = canDivisoes
        ? postosList
        : filterByDivisaoId(postosList, activeDivisaoId, usuario);
      tenantPostosList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // 5. Fetch Legendas (tenant)
      const legendasSnap = await getDocs(collection(db, "legendas"));
      const legendasList: TenantLegenda[] = [];
      legendasSnap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        legendasList.push({
          ...normalizeLegenda(data),
        });
      });
      const tenantLegendasList = [...legendasList];
      tenantLegendasList.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

      // 6. Fetch Divisões (Gerente vê todas; Admin só a própria)
      const loadedDivisoes: Divisao[] = [];
      if (canDivisoes) {
        const divisoesSnap = await getDocs(collection(db, "divisoes"));
        divisoesSnap.forEach((docSnap) => {
          const data = docSnap.data() as Divisao;
          loadedDivisoes.push({
            ...data,
            codigo: normalizeDivisaoId(data.codigo || docSnap.id),
            nome: String(data.nome || ""),
            descricao: data.descricao || "",
            ativo: data.ativo !== false,
          });
        });
      } else {
        const ownSnap = await getDoc(doc(db, "divisoes", activeDivisaoId));
        if (ownSnap.exists()) {
          const data = ownSnap.data() as Divisao;
          loadedDivisoes.push({
            ...data,
            codigo: normalizeDivisaoId(data.codigo || ownSnap.id),
            nome: String(data.nome || ""),
            descricao: data.descricao || "",
            ativo: data.ativo !== false,
          });
        }
      }
      const sortedDivisoes = sortDivisoes(loadedDivisoes);

      // 7. Fetch Gerais config
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
      setOrigColaboradores(JSON.parse(JSON.stringify(tenantColList)));
      setOrigUsuarios(JSON.parse(JSON.stringify(tenantUserList)));
      setOrigPostos(JSON.parse(JSON.stringify(tenantPostosList)));
      setOrigSecoes(JSON.parse(JSON.stringify(tenantSecoesList)));
      setOrigLegendas(JSON.parse(JSON.stringify(tenantLegendasList)));
      setOrigDivisoes(JSON.parse(JSON.stringify(sortedDivisoes)));
      setOrigGerais(JSON.parse(JSON.stringify(geraisData)));

      // Set working states
      setColaboradores(tenantColList);
      setUsuarios(tenantUserList);
      setPostos(tenantPostosList);
      setSecoes(tenantSecoesList);
      setLegendas(tenantLegendasList);
      setDivisoesList(sortedDivisoes);
      setGerais(geraisData);

      // Reset removed logs
      setRemovedColaboradores([]);
      setRemovedUsuarios([]);
      setRemovedPostos([]);
      setRemovedSecoes([]);
      setRemovedLegendas([]);
      setRemovedDivisoes([]);
      setSecaoRenames([]);

    } catch (err: any) {
      console.error("Erro ao carregar dados administrativos:", err);
      setSaveError("Não foi possível carregar as configurações do Firestore.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [activeDivisaoId]);

  const loadLogs = async () => {
    if (!canLogs) {
      setLogsList([]);
      return;
    }
    setLogsLoading(true);
    try {
      const list = await loadAuditOperations(isGerente(usuario) ? undefined : activeDivisaoId);
      setLogsList(list);
    } catch (err) {
      console.error("Erro ao carregar logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "registros" && canLogs) {
      loadLogs();
    }
  }, [activeTab, canLogs]);

  useEffect(() => {
    if (visibleMenuItems.length === 0) return;
    if (!visibleMenuItems.some((item) => item.id === activeTab)) {
      setActiveTab(isGerente(usuario) ? "divisoes" : visibleMenuItems[0].id);
    }
  }, [activeTab, usuario, visibleMenuItems]);

  // Determine if there are unsaved changes
  const isDirty = useMemo(() => {
    return (
      JSON.stringify(colaboradores) !== JSON.stringify(origColaboradores) ||
      JSON.stringify(usuarios) !== JSON.stringify(origUsuarios) ||
      JSON.stringify(postos) !== JSON.stringify(origPostos) ||
      JSON.stringify(secoes) !== JSON.stringify(origSecoes) ||
      JSON.stringify(legendas) !== JSON.stringify(origLegendas) ||
      JSON.stringify(divisoesList) !== JSON.stringify(origDivisoes) ||
      JSON.stringify(gerais) !== JSON.stringify(origGerais) ||
      removedColaboradores.length > 0 ||
      removedUsuarios.length > 0 ||
      removedPostos.length > 0 ||
      removedSecoes.length > 0 ||
      removedLegendas.length > 0 ||
      removedDivisoes.length > 0 ||
      secaoRenames.length > 0
    );
  }, [
    colaboradores, origColaboradores,
    usuarios, origUsuarios,
    postos, origPostos,
    secoes, origSecoes,
    legendas, origLegendas, divisoesList, origDivisoes,
    gerais, origGerais,
    removedColaboradores, removedUsuarios, removedPostos, removedSecoes, removedLegendas, removedDivisoes,
    secaoRenames
  ]);

  // Handle Undo/Discard changes
  const handleDiscardChanges = () => {
    if (confirm("Deseja realmente descartar todas as alterações não salvas?")) {
      setColaboradores(JSON.parse(JSON.stringify(origColaboradores)));
      setUsuarios(JSON.parse(JSON.stringify(origUsuarios)));
      setPostos(JSON.parse(JSON.stringify(origPostos)));
      setSecoes(JSON.parse(JSON.stringify(origSecoes)));
      setLegendas(JSON.parse(JSON.stringify(origLegendas)));
      setDivisoesList(JSON.parse(JSON.stringify(origDivisoes)));
      setGerais(JSON.parse(JSON.stringify(origGerais)));

      setRemovedColaboradores([]);
      setRemovedUsuarios([]);
      setRemovedPostos([]);
      setRemovedSecoes([]);
      setRemovedLegendas([]);
      setRemovedDivisoes([]);
      setSecaoRenames([]);

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
      const divisaoId = String(postos.find((p) => p.sigla === id)?.divisaoId || activeDivisaoId);
      setPostos((prev) => {
        const filtered = prev.filter((p) => p.sigla !== id);
        return updateOrderFields(filtered);
      });
      setRemovedPostos((prev) => [...prev, { chave: id, divisaoId }]);
    } else if (type === "secoes") {
      const target = secoes.find((s) => s.id === id);
      if (!target) {
        setConfirmDeleteOpen(null);
        return;
      }
      const ativasNaDivisao = secoes.filter(
        (s) =>
          s.id !== id &&
          s.ativo !== false &&
          normalizeDivisaoId(s.divisaoId) === normalizeDivisaoId(target.divisaoId)
      );
      if (ativasNaDivisao.length === 0 && target.ativo !== false) {
        alert("Cada Divisão precisa de pelo menos uma Seção ativa.");
        setConfirmDeleteOpen(null);
        return;
      }
      const referenced =
        colaboradores.some((c) => c.secaoId === target.id || secoesIguais(c.secao, target.nome)) ||
        usuarios.some((u) => u.secaoId === target.id || secoesIguais(u.secao, target.nome));
      if (referenced) {
        setSecoes((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ativo: false } : s))
        );
        alert(
          "Esta seção está em uso por colaboradores ou permissões e foi inativada em vez de excluída."
        );
        setConfirmDeleteOpen(null);
        return;
      }
      setSecoes((prev) => updateOrderFields(prev.filter((s) => s.id !== id)));
      setRemovedSecoes((prev) =>
        prev.some((r) => r.chave === id)
          ? prev
          : [...prev, { chave: id, divisaoId: target.divisaoId }]
      );
    } else if (type === "legendas") {
      if (!canLegendas) {
        setConfirmDeleteOpen(null);
        return;
      }
      setLegendas((prev) => {
        const filtered = prev.filter((l) => l.sigla !== id);
        return updateOrderFields(filtered);
      });
      setRemovedLegendas((prev) => [...prev, { chave: id }]);
    } else if (type === "divisoes") {
      setDivisoesList((prev) => prev.filter((d) => d.codigo !== id));
      setRemovedDivisoes((prev) => [...prev, id]);
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
      const result = await saveConfiguracoesBatch({
        usuario,
        activeDivisaoId,
        colaboradores: {
          current: colaboradores,
          original: origColaboradores,
          removed: removedColaboradores,
        },
        usuarios: {
          current: usuarios,
          original: origUsuarios,
          removed: removedUsuarios,
        },
        postos: {
          current: postos,
          original: origPostos,
          removed: removedPostos,
        },
        secoes: {
          current: secoes,
          original: origSecoes,
          removed: removedSecoes,
        },
        legendas: {
          current: legendas,
          original: origLegendas,
          removed: removedLegendas,
        },
        divisoes: {
          current: divisoesList,
          original: origDivisoes,
          removed: removedDivisoes,
        },
        gerais: {
          current: gerais,
          original: origGerais,
        },
      });

      setColaboradores(result.colaboradores);
      setUsuarios(result.usuarios);

      // Set original states only for what was actually saved.
      if (canColaboradores || canUsuarios) {
        setOrigColaboradores(JSON.parse(JSON.stringify(result.colaboradores)));
        setOrigUsuarios(JSON.parse(JSON.stringify(result.usuarios)));
        setRemovedColaboradores([]);
        setRemovedUsuarios([]);
      }
      if (canPostos) {
        setOrigPostos(JSON.parse(JSON.stringify(postos)));
        setRemovedPostos([]);
      }
      if (canSecoes) {
        setOrigSecoes(JSON.parse(JSON.stringify(secoes)));
        setRemovedSecoes([]);
      }
      if (canLegendas) {
        setOrigLegendas(JSON.parse(JSON.stringify(legendas)));
        setRemovedLegendas([]);
      }
      if (canDivisoes) {
        setOrigDivisoes(JSON.parse(JSON.stringify(divisoesList)));
        setRemovedDivisoes([]);
        setSecaoRenames([]);
      }
      if (canGerais) {
        setOrigGerais(JSON.parse(JSON.stringify(gerais)));
      }

      // Atualiza seção na sessão se o usuário logado foi afetado por rename
      const renameSessao = result.secaoRenames.find(
        (r) => String(r.id || "").trim() === String(usuario.secaoId || "").trim() || secoesIguais(r.from, usuario.secao)
      );
      if (renameSessao) {
        const updated = toSessionUser({ ...usuario, secao: renameSessao.to, secaoId: renameSessao.id });
        writeSession(updated);
        onUsuarioUpdate?.(updated);
      }

      setSaveSuccess(true);
      // Auto-hide success alert in 4 seconds
      setTimeout(() => setSaveSuccess(false), 4000);

    } catch (err: any) {
      console.error("Erro ao salvar alterações no banco:", err);
      setSaveError(
        err?.message
          ? String(err.message)
          : "Ocorreu um erro ao salvar as alterações no Firestore. Verifique suas regras."
      );
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

    const novaRe = String(currentCol.re || "").trim();
    const email = normalizeEmail(currentCol.email);
    if (email && !isValidEmailFormat(email)) {
      alert("Informe um e-mail Google válido (ex.: joao.silva@exemplo.com).");
      return;
    }
    if (email) {
      const emailDuplicado = colaboradores.some(
        (c) => c.re !== colOriginalRe && normalizeEmail(c.email) === email
      );
      if (emailDuplicado) {
        alert("Este e-mail Google já está vinculado a outro colaborador.");
        return;
      }
    }

    const targetDivisaoId = String(currentCol.divisaoId || activeDivisaoId);
    const targetSecaoId = String(currentCol.secaoId || "").trim();
    const targetSecao = secoes.find(
      (s) => s.id === targetSecaoId && String(s.divisaoId || targetDivisaoId) === targetDivisaoId
    );
    if (!targetSecao) {
      alert("Selecione uma seção válida desta Divisão.");
      return;
    }

    const normalized = normalizeColaborador({
      ...currentCol,
      re: novaRe,
      email,
      secao: targetSecao.nome,
      secaoId: targetSecao.id,
      divisaoId: targetDivisaoId,
    });

    const duplicada = colaboradores.some(
      (c) => c.re === novaRe && c.re !== colOriginalRe
    );
    if (duplicada) {
      alert("Já existe um colaborador com este R.E.");
      return;
    }

    let updatedList = [...colaboradores];

    if (colOriginalRe !== null) {
      const editIndex = colaboradores.findIndex((c) => c.re === colOriginalRe);
      if (editIndex < 0) {
        alert("Colaborador original não encontrado.");
        return;
      }
      updatedList[editIndex] = {
        ...normalized,
        ordem: colaboradores[editIndex].ordem ?? normalized.ordem,
      };
      if (colOriginalRe !== novaRe) {
        setRemovedColaboradores((prev) =>
          prev.includes(colOriginalRe) ? prev : [...prev, colOriginalRe]
        );
      }
    } else {
      const maxOrdem = colaboradores.reduce((max, c) => (c.ordem && c.ordem > max ? c.ordem : max), 0);
      updatedList.push({
        ...normalized,
        ordem: maxOrdem + 1,
      });
    }

    setColaboradores(updatedList);
    setColModalOpen(false);
    setCurrentCol(null);
    setColOriginalRe(null);
    setColPage(1);
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!currentUser.re.trim() || !currentUser.nomeCompleto?.trim() || !currentUser.nome.trim()) {
      alert("Por favor, preencha todos os campos obrigatórios (*).");
      return;
    }

    const novaRe = String(currentUser.re || "").trim();
    const isNew = userOriginalRe === null;
    const targetDivisaoId = String(currentUser.divisaoId || activeDivisaoId);
    const targetSecaoId = String(currentUser.secaoId || "").trim();
    if (!canManageUsuarioInDivisao(usuario, targetDivisaoId)) {
      alert("Você não pode gerenciar usuários desta Divisão.");
      return;
    }
    const targetSecao = secoes.find(
      (s) => s.id === targetSecaoId && String(s.divisaoId || targetDivisaoId) === targetDivisaoId
    );
    if (!targetSecao) {
      alert("Selecione uma seção válida desta Divisão.");
      return;
    }

    const allowedPerfis = assignablePerfis(usuario);
    if (!allowedPerfis.includes(currentUser.perfil as any)) {
      alert("Perfil não permitido para o seu nível de acesso.");
      return;
    }

    const duplicada = usuarios.some((u) => u.re === novaRe && u.re !== userOriginalRe);
    if (duplicada) {
      alert("Já existe uma permissão cadastrada para este R.E.");
      return;
    }

    const emailCheck = validateUsuarioEmail({
      email: currentUser.email,
      re: novaRe,
      isNew,
      existingUsers: usuarios.filter((u) => u.re !== userOriginalRe),
    });
    if (emailCheck.ok === false) {
      alert(emailCheck.message);
      return;
    }

    const prepared = prepareUsuarioDocument({
      ...currentUser,
      re: novaRe,
      divisaoId: targetDivisaoId,
      secao: targetSecao.nome,
      secaoId: targetSecao.id,
      email: emailCheck.email,
      perfil: currentUser.perfil || "Operador",
      ativo: currentUser.ativo !== undefined ? currentUser.ativo : true,
      authProvider: currentUser.authProvider || (emailCheck.email ? "google" : "local"),
      ultimoLogin: currentUser.ultimoLogin ?? null,
      emailVerificado: currentUser.emailVerificado === true,
    });

    let updatedList = [...usuarios];
    if (userOriginalRe !== null) {
      const editIndex = usuarios.findIndex((u) => u.re === userOriginalRe);
      if (editIndex < 0) {
        alert("Permissão original não encontrada.");
        return;
      }
      updatedList[editIndex] = prepared;
      if (userOriginalRe !== novaRe) {
        setRemovedUsuarios((prev) =>
          prev.includes(userOriginalRe) ? prev : [...prev, userOriginalRe]
        );
      }
    } else {
      updatedList.push(prepared);
    }

    setUsuarios(updatedList);
    setUserModalOpen(false);
    setCurrentUser(null);
    setUserOriginalRe(null);
    setUserPage(1);
  };

  const handlePostoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPosto) return;

    const novaSigla = String(currentPosto.sigla || "").trim();
    if (!novaSigla || !currentPosto.descricao.trim()) {
      alert("Por favor, preencha todos os campos obrigatórios (*).");
      return;
    }

    const duplicada = postos.some(
      (p) => p.sigla === novaSigla && p.sigla !== postoOriginalSigla
    );
    if (duplicada) {
      alert("Já existe um posto/graduação com esta sigla.");
      return;
    }

    let updatedList = [...postos];
    const editIndex = postoOriginalSigla !== null
      ? postos.findIndex((p) => p.sigla === postoOriginalSigla)
      : -1;

    if (editIndex > -1) {
      updatedList[editIndex] = {
        ...currentPosto,
        sigla: novaSigla,
        divisaoId: String(currentPosto.divisaoId || activeDivisaoId),
      };
      if (postoOriginalSigla !== null && postoOriginalSigla !== novaSigla) {
        const divisaoId = String(currentPosto.divisaoId || activeDivisaoId);
        setRemovedPostos((prev) =>
          prev.some((r) => r.chave === postoOriginalSigla)
            ? prev
            : [...prev, { chave: postoOriginalSigla, divisaoId }]
        );
      }
    } else {
      const maxOrdem = postos.reduce((max, p) => (p.ordem && p.ordem > max ? p.ordem : max), 0);
      updatedList.push({
        ...currentPosto,
        sigla: novaSigla,
        divisaoId: String(currentPosto.divisaoId || activeDivisaoId),
        ordem: maxOrdem + 1
      });
    }

    setPostos(updatedList);
    setPostoModalOpen(false);
    setCurrentPosto(null);
    setPostoOriginalSigla(null);
  };

  const handleSecaoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSecao || !canSecoes) return;

    const nome = normalizeSecaoNome(currentSecao.nome);
    const codigo = normalizeSecaoCodigo(currentSecao.codigo);
    const divisaoId = String(
      isGerente(usuario)
        ? currentSecao.divisaoId || activeDivisaoId
        : activeDivisaoId
    ).trim();

    if (!nome) {
      alert("Informe o nome da Seção.");
      return;
    }
    if (!codigo) {
      alert("Informe o Código da OPM (somente números) da seção.");
      return;
    }
    if (!divisaoId) {
      alert("Informe a Divisão da Seção.");
      return;
    }
    if (!canManageUsuarioInDivisao(usuario, divisaoId) && !isGerente(usuario)) {
      alert("Você só pode cadastrar Seções da sua Divisão.");
      return;
    }

    const editId = secaoOriginalId;
    if (
      secoes.some(
        (s) =>
          secoesIguais(s.nome, nome) &&
          normalizeDivisaoId(s.divisaoId) === normalizeDivisaoId(divisaoId) &&
          s.id !== editId
      )
    ) {
      alert("Esta Divisão já possui uma seção com este nome.");
      return;
    }
    if (
      secoes.some(
        (s) => normalizeSecaoCodigo(s.codigo) === codigo && s.id !== editId
      )
    ) {
      alert(`O código ${codigo} já está em uso por outra seção.`);
      return;
    }

    if (editId) {
      const original = secoes.find((s) => s.id === editId);
      if (original && !secoesIguais(original.nome, nome)) {
        setSecaoRenames((prev) => [
          ...prev.filter((r) => r.id !== editId),
          { id: editId, from: original.nome, to: nome, divisaoId },
        ]);
        setColaboradores((prev) =>
          prev.map((c) =>
            String(c.secaoId || "").trim() === editId || secoesIguais(c.secao, original.nome)
              ? { ...c, secao: nome, secaoId: editId, divisaoId }
              : c
          )
        );
        setUsuarios((prev) =>
          prev.map((u) =>
            String(u.secaoId || "").trim() === editId || secoesIguais(u.secao, original.nome)
              ? { ...u, secao: nome, secaoId: editId, divisaoId }
              : u
          )
        );
      }
      setSecoes((prev) =>
        updateOrderFields(
          prev.map((s) =>
            s.id === editId
              ? { ...s, nome, codigo, divisaoId, ativo: currentSecao.ativo !== false }
              : s
          )
        )
      );
    } else {
      const maxOrdem = secoes
        .filter((s) => normalizeDivisaoId(s.divisaoId) === normalizeDivisaoId(divisaoId))
        .reduce((max, s) => (s.ordem && s.ordem > max ? s.ordem : max), 0);
      const id = doc(collection(db, "secoes")).id;
      setSecoes((prev) =>
        updateOrderFields([
          ...prev,
          {
            id,
            nome,
            codigo,
            divisaoId,
            ordem: maxOrdem + 1,
            ativo: currentSecao.ativo !== false,
          },
        ])
      );
    }

    setSecaoModalOpen(false);
    setCurrentSecao(null);
    setSecaoOriginalId(null);
  };

  /**
   * Abre o modal de Divisão com as seções dela. Preferência: estado local
   * (já carregado / editado na sessão); senão busca no Firestore.
   */
  const abrirModalDivisao = async (divisao: Divisao | null) => {
    setCurrentDivisao(divisao ? { ...divisao } : { codigo: "", nome: "", descricao: "", ativo: true });
    setDivisaoOriginalCodigo(divisao?.codigo || null);
    limparFormSecaoDivisao();
    setDivisaoModalOpen(true);
    setDivisaoSecoesRemovidas([]);

    if (!divisao?.codigo) {
      setDivisaoSecoes([]);
      return;
    }

    const fromState = listSecoesDaDivisao(divisao.codigo).map((s, idx) => ({
      id: s.id,
      nome: normalizeSecaoNome(s.nome),
      codigo: normalizeSecaoCodigo(s.codigo),
      ordem: typeof s.ordem === "number" ? s.ordem : idx + 1,
      ativo: s.ativo !== false,
      divisaoId: String(s.divisaoId || divisao.codigo),
    }));
    if (fromState.length > 0 || canDivisoes) {
      // Com catálogo completo (Gerente), o estado local é a fonte da verdade na sessão.
      setDivisaoSecoes(fromState);
      return;
    }

    setDivisaoSecoesCarregando(true);
    setDivisaoSecoes([]);
    try {
      const snap = await getDocs(
        query(collection(db, "secoes"), where("divisaoId", "==", divisao.codigo))
      );
      const lista: SecaoDivisaoForm[] = snap.docs.map((d, idx) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          nome: normalizeSecaoNome(String(data.nome || "")),
          codigo: normalizeSecaoCodigo(String(data.codigo || "")),
          ordem: typeof data.ordem === "number" ? data.ordem : idx + 1,
          ativo: data.ativo !== false,
          divisaoId: String(data.divisaoId || divisao.codigo),
        };
      });
      lista.sort((a, b) => a.ordem - b.ordem);
      setDivisaoSecoes(lista);
    } catch (err) {
      console.warn("Falha ao carregar seções da Divisão:", err);
      setSaveError("Não foi possível carregar as seções desta Divisão.");
    } finally {
      setDivisaoSecoesCarregando(false);
    }
  };

  const limparFormSecaoDivisao = () => {
    setNovaSecaoNome("");
    setNovaSecaoCodigo("");
    setEditandoSecaoId(null);
  };

  const iniciarEdicaoSecaoDivisao = (secao: SecaoDivisaoForm) => {
    setEditandoSecaoId(secao.id);
    setNovaSecaoNome(secao.nome);
    setNovaSecaoCodigo(secao.codigo || "");
  };

  const salvarSecaoDivisao = () => {
    const nome = normalizeSecaoNome(novaSecaoNome);
    if (!nome) return;
    const codigo = normalizeSecaoCodigo(novaSecaoCodigo);
    if (!codigo) {
      alert("Informe o Código da OPM (somente números) da seção.");
      return;
    }
    const editId = editandoSecaoId;

    if (
      divisaoSecoes.some(
        (s) => secoesIguais(s.nome, nome) && s.id !== editId
      )
    ) {
      alert("Esta Divisão já possui uma seção com este nome.");
      return;
    }
    if (
      secoes.some(
        (s) =>
          normalizeSecaoCodigo(s.codigo) === codigo &&
          s.id !== editId &&
          !divisaoSecoesRemovidas.includes(s.id)
      ) ||
      divisaoSecoes.some(
        (s) => normalizeSecaoCodigo(s.codigo) === codigo && s.id !== editId
      )
    ) {
      alert(`O código ${codigo} já está em uso por outra seção.`);
      return;
    }

    if (editId) {
      setDivisaoSecoes((prev) =>
        prev.map((s) =>
          s.id === editId
            ? { ...s, nome, codigo, ativo: s.ativo !== false }
            : s
        )
      );
    } else {
      const maxOrdem = divisaoSecoes.reduce((max, s) => (s.ordem > max ? s.ordem : max), 0);
      setDivisaoSecoes((prev) => [
        ...prev,
        {
          id: doc(collection(db, "secoes")).id,
          nome,
          codigo,
          ordem: maxOrdem + 1,
          ativo: true,
          divisaoId: String(currentDivisao?.codigo || activeDivisaoId),
        },
      ]);
    }
    limparFormSecaoDivisao();
  };

  const removerSecaoDivisao = (id: string) => {
    const target = divisaoSecoes.find((s) => s.id === id) || secoes.find((s) => s.id === id);
    if (!target) return;
    const ativasRestantes = divisaoSecoes.filter(
      (s) => s.id !== id && s.ativo !== false
    );
    if (ativasRestantes.length === 0 && target.ativo !== false) {
      alert("Cada Divisão precisa de pelo menos uma Seção ativa.");
      return;
    }
    const referenced =
      colaboradores.some((c) => c.secaoId === target.id || secoesIguais(c.secao, target.nome)) ||
      usuarios.some((u) => u.secaoId === target.id || secoesIguais(u.secao, target.nome));
    if (referenced) {
      setDivisaoSecoes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ativo: false } : s))
      );
      if (editandoSecaoId === id) limparFormSecaoDivisao();
      alert(
        "Esta seção está em uso por colaboradores ou permissões e foi inativada em vez de excluída."
      );
      return;
    }
    setDivisaoSecoes((prev) => prev.filter((s) => s.id !== id));
    setDivisaoSecoesRemovidas((prev) => (prev.includes(id) ? prev : [...prev, id]));
    if (editandoSecaoId === id) limparFormSecaoDivisao();
  };

  const handleDivisaoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDivisao || !canDivisoes) return;

    const codigo = divisaoDocId(currentDivisao.codigo);
    const nome = String(currentDivisao.nome || "").trim();
    if (!codigo || !nome) {
      alert("Informe o código e o nome da Divisão.");
      return;
    }
    if (
      divisoesList.some(
        (d) => d.codigo === codigo && d.codigo !== divisaoOriginalCodigo
      )
    ) {
      alert("Já existe uma Divisão com este código.");
      return;
    }

    const ativas = divisaoSecoes.filter((s) => s.ativo !== false);
    if (ativas.length === 0) {
      alert("Cadastre pelo menos uma Seção ativa antes de salvar a Divisão.");
      return;
    }

    const payload: Divisao = {
      ...currentDivisao,
      codigo,
      nome,
      descricao: String(currentDivisao.descricao || "").trim(),
      ativo: currentDivisao.ativo !== false,
    };
    if (divisaoOriginalCodigo) {
      setDivisoesList((prev) =>
        sortDivisoes(
          prev.map((d) => (d.codigo === divisaoOriginalCodigo ? payload : d))
        )
      );
      if (divisaoOriginalCodigo !== codigo) {
        setRemovedDivisoes((prev) => [...prev, divisaoOriginalCodigo]);
      }
    } else {
      setDivisoesList((prev) => sortDivisoes([...prev, payload]));
    }

    const secoesDaDivisao = updateOrderFields(
      divisaoSecoes.map((s) => ({ ...s, divisaoId: codigo }))
    ) as SecaoDivisaoForm[];

    // Detecta renomes para cascata em colaboradores/usuários/escalas.
    for (const secao of secoesDaDivisao) {
      const anterior =
        secoes.find((s) => s.id === secao.id) ||
        origSecoes.find((s) => s.id === secao.id);
      if (anterior && !secoesIguais(anterior.nome, secao.nome)) {
        setSecaoRenames((prev) => [
          ...prev.filter((r) => r.id !== secao.id),
          {
            id: secao.id,
            from: anterior.nome,
            to: secao.nome,
            divisaoId: codigo,
          },
        ]);
        setColaboradores((prev) =>
          prev.map((c) =>
            String(c.secaoId || "").trim() === secao.id ||
            secoesIguais(c.secao, anterior.nome)
              ? { ...c, secao: secao.nome, secaoId: secao.id }
              : c
          )
        );
        setUsuarios((prev) =>
          prev.map((u) =>
            String(u.secaoId || "").trim() === secao.id ||
            secoesIguais(u.secao, anterior.nome)
              ? { ...u, secao: secao.nome, secaoId: secao.id }
              : u
          )
        );
      }
    }

    // Catálogo único de seções: substitui as da Divisão editada e mantém as demais.
    const codigoAnterior = divisaoOriginalCodigo || codigo;
    setSecoes((prev) =>
      updateOrderFields([
        ...prev.filter(
          (s) =>
            normalizeDivisaoId(s.divisaoId) !== normalizeDivisaoId(codigoAnterior) &&
            normalizeDivisaoId(s.divisaoId) !== normalizeDivisaoId(codigo) &&
            !divisaoSecoesRemovidas.includes(s.id)
        ),
        ...secoesDaDivisao,
      ])
    );
    setRemovedSecoes((prev) => [
      ...prev,
      ...divisaoSecoesRemovidas
        .filter((secaoId) => !prev.some((r) => r.chave === secaoId))
        .map((secaoId) => ({ chave: secaoId, divisaoId: codigo })),
    ]);

    setDivisaoModalOpen(false);
    setCurrentDivisao(null);
    setDivisaoOriginalCodigo(null);
    limparFormSecaoDivisao();
  };

  const handleLegendaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLegenda) return;
    if (!canLegendas) {
      alert("Somente Gerente pode cadastrar, editar ou excluir legendas globais.");
      return;
    }

    const novaSigla = String(currentLegenda.sigla || "").trim();
    if (!novaSigla || !String(currentLegenda.descricao || "").trim()) {
      alert("Por favor, preencha os campos obrigatórios (*).");
      return;
    }

    // Não permitir sigla duplicada (ignorando a própria legenda em edição)
    const duplicada = legendas.some(
      (l) => l.sigla === novaSigla && l.sigla !== legendaOriginalSigla
    );
    if (duplicada) {
      alert("Já existe uma legenda com esta sigla.");
      return;
    }

    // Normaliza: omite campos opcionais vazios (compatível com documentos legados)
    const cleaned: TenantLegenda = normalizeLegenda({ ...currentLegenda, sigla: novaSigla });

    let updatedList = [...legendas];
    const editIndex =
      legendaOriginalSigla !== null
        ? legendas.findIndex((l) => l.sigla === legendaOriginalSigla)
        : -1;

    if (editIndex > -1) {
      updatedList[editIndex] = { ...cleaned, ordem: legendas[editIndex].ordem };
      if (legendaOriginalSigla !== null && legendaOriginalSigla !== novaSigla) {
        setRemovedLegendas((prev) =>
          prev.some((r) => r.chave === legendaOriginalSigla)
            ? prev
            : [...prev, { chave: legendaOriginalSigla }]
        );
      }
    } else {
      const maxOrdem = legendas.reduce((max, l) => (l.ordem && l.ordem > max ? l.ordem : max), 0);
      updatedList.push({
        ...cleaned,
        ordem: maxOrdem + 1,
        ativo: cleaned.ativo !== false,
      });
    }

    setLegendas(updatedList);
    setLegendaModalOpen(false);
    setCurrentLegenda(null);
    setLegendaOriginalSigla(null);
    setLegendaModalSection("basicas");
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
          c.secao.toLowerCase().includes(query) ||
          normalizeEmail(c.email).includes(query)
      );
    }
    if (colActiveFilter === "ativos") {
      list = list.filter((c) => normalizeAtivoFlag(c.ativo));
    } else if (colActiveFilter === "inativos") {
      list = list.filter((c) => !normalizeAtivoFlag(c.ativo));
    }
    // "todos" = sem filtro de situação (ativos + inativos)
    return list;
  }, [colaboradores, colSearch, colActiveFilter]);

  const totalColPages = Math.ceil(filteredColaboradores.length / colPerPage) || 1;

  // Corrige página inválida (ex.: Inativos com 1 item enquanto colPage ainda era 2)
  useEffect(() => {
    if (colPage > totalColPages) {
      setColPage(totalColPages);
    }
  }, [colPage, totalColPages]);

  const pagedColaboradores = useMemo(() => {
    const safePage = Math.min(Math.max(colPage, 1), totalColPages);
    const startIndex = (safePage - 1) * colPerPage;
    return filteredColaboradores.slice(startIndex, startIndex + colPerPage);
  }, [filteredColaboradores, colPage, totalColPages]);

  const filteredUsuarios = useMemo(() => {
    // Login é por e-mail Google: a lista de permissão mostra só quem já tem e-mail.
    let list = usuarios.filter((u) => Boolean(normalizeEmail(u.email)));
    if (userSearch.trim()) {
      const query = userSearch.toLowerCase();
      list = list.filter(
        (u) =>
          u.nome.toLowerCase().includes(query) ||
          u.re.toLowerCase().includes(query) ||
          (u.nomeCompleto && u.nomeCompleto.toLowerCase().includes(query)) ||
          u.postoGrad.toLowerCase().includes(query) ||
          u.secao.toLowerCase().includes(query) ||
          (u.perfil || "").toLowerCase().includes(query) ||
          normalizeEmail(u.email).includes(query)
      );
    }
    return list;
  }, [usuarios, userSearch]);

  const pagedUsuarios = useMemo(() => {
    const startIndex = (userPage - 1) * userPerPage;
    return filteredUsuarios.slice(startIndex, startIndex + userPerPage);
  }, [filteredUsuarios, userPage]);

  const totalUserPages = Math.ceil(filteredUsuarios.length / userPerPage) || 1;

  useEffect(() => {
    if (userPage > totalUserPages) {
      setUserPage(totalUserPages);
    }
  }, [userPage, totalUserPages]);

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
    <div className="flex-1 bg-gray-50 pb-16 w-full max-w-full min-w-0">
      {/* Top Header */}
      <header className="bg-slate-900 text-white sticky sticky-below-app-header z-10 shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 w-full min-w-0">
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 w-full min-w-0">
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

              {MENU_ITENS.filter((item) => item.visivel).map((item) => (
                <button
                  key={item.id}
                  id={`tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    activeTab === item.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <item.icone size={16} />
                  <span>{item.label}</span>
                </button>
              ))}
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
                    <p className="text-xs text-gray-500">
                      Efetivo policial lotado por Divisão e Seção. A lotação determina em quais
                      escalas o militar entra. Inativar remove das escalas, sem retirar eventual
                      permissão no módulo Permissão.
                    </p>
                  </div>
                  <button
                    id="new-col-btn"
                    onClick={() => {
                      const secaoInicial = listSecoesDaDivisao(activeDivisaoId).find(
                        (s) => s.ativo !== false
                      );
                      const postoInicial = listPostosDaDivisao(activeDivisaoId)[0];
                      setCurrentCol({
                        re: "",
                        postoGrad: postoInicial?.sigla || "SD PM",
                        nomeCompleto: "",
                        nome: "",
                        email: "",
                        secao: secaoInicial?.nome || "",
                        secaoId: secaoInicial?.id || "",
                        divisaoId: activeDivisaoId,
                        observacao: "",
                        ativo: true
                      });
                      setColOriginalRe(null);
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
                      placeholder="Pesquisar por RE, Nome, E-mail, Seção..."
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
                      onClick={() => {
                        setColActiveFilter("todos");
                        setColPage(1);
                      }}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        colActiveFilter === "todos" ? "bg-white text-blue-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      id="col-filter-ativos"
                      onClick={() => {
                        setColActiveFilter("ativos");
                        setColPage(1);
                      }}
                      className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        colActiveFilter === "ativos" ? "bg-white text-blue-700 shadow-xs" : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      Ativos
                    </button>
                    <button
                      id="col-filter-inativos"
                      onClick={() => {
                        setColActiveFilter("inativos");
                        setColPage(1);
                      }}
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
                        <th className="px-4 py-3">E-mail Google</th>
                        <th className="px-4 py-3">Nome Completo</th>
                        <th className="px-4 py-3">Seção</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {pagedColaboradores.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-6 text-center text-gray-400 font-semibold">Nenhum colaborador correspondente encontrado.</td>
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
                              <td className="px-4 py-3 text-gray-500 text-[11px] lowercase">
                                {displayUserEmail(col.email) === "Não informado" ? (
                                  <span className="text-gray-400 normal-case">Não informado</span>
                                ) : (
                                  displayUserEmail(col.email)
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-[11px]">{col.nomeCompleto || "Não informado"}</td>
                              <td className="px-4 py-3 text-gray-600 font-medium">
                                {col.secao}
                                <span className="block text-[10px] text-gray-400 font-semibold">
                                  {nomeDivisao(String(col.divisaoId || activeDivisaoId))}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  normalizeAtivoFlag(col.ativo) ? "bg-green-150 text-green-800" : "bg-red-150 text-red-800"
                                }`}>
                                  {normalizeAtivoFlag(col.ativo) ? "ATIVO" : "INATIVO"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right space-x-1">
                                <button
                                  onClick={() => {
                                    setCurrentCol({
                                      ...col,
                                      secaoId:
                                        col.secaoId ||
                                        listSecoesDaDivisao(String(col.divisaoId || activeDivisaoId)).find((s) =>
                                          secoesIguais(s.nome, col.secao)
                                        )?.id ||
                                        "",
                                    });
                                    setColOriginalRe(col.re);
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

            {/* 2. MODULE: PERMISSÃO */}
            {activeTab === "usuarios" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Módulo Permissão</h2>
                    <p className="text-xs text-gray-500">
                      Conceda acesso ao sistema (Operador, Administrador ou Gestor). Exibe apenas
                      cadastros com e-mail Google — vínculo do login. Em seguida, as permissões
                      poderão ser criadas a partir dos colaboradores já cadastrados.
                    </p>
                  </div>
                  <div className="mt-3 sm:mt-0 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        exportUsuariosToExcel(
                          usuarios.filter((u) => Boolean(normalizeEmail(u.email)))
                        )
                      }
                      className="inline-flex items-center space-x-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                      title="Exportar permissões"
                    >
                      <FileSpreadsheet size={14} />
                      <span>Exportar</span>
                    </button>
                    <button
                    id="new-user-btn"
                    onClick={() => {
                      const secaoInicial = listSecoesDaDivisao(activeDivisaoId)[0];
                      setCurrentUser({
                        re: "",
                        postoGrad: postos[0]?.sigla || "SD PM",
                        nomeCompleto: "",
                        nome: "",
                        email: "",
                        secao: secaoInicial?.nome || "",
                        secaoId: secaoInicial?.id || "",
                        divisaoId: activeDivisaoId,
                        perfil: "Operador",
                        ativo: true,
                        secoesResponsaveisIds: [],
                        authProvider: "google",
                        ultimoLogin: null,
                        emailVerificado: false,
                      });
                      setUserOriginalRe(null);
                      setUserModalOpen(true);
                    }}
                    className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Nova Permissão</span>
                  </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative mb-4">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <Search size={14} />
                  </span>
                  <input
                    id="user-search"
                    type="text"
                    placeholder="Pesquisar por RE, Nome, E-mail, Perfil..."
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
                        <th className="px-4 py-3">E-mail Google</th>
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
                          <td colSpan={9} className="px-4 py-6 text-center text-gray-400 font-semibold">
                            Nenhuma permissão com e-mail Google cadastrado.
                          </td>
                        </tr>
                      ) : (
                        pagedUsuarios.map((usr) => (
                          <tr key={usr.re} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-600 font-semibold">{usr.postoGrad}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">{usr.re}</td>
                              <td className="px-4 py-3 font-bold text-gray-800">{usr.nome}</td>
                              <td className="px-4 py-3 text-gray-500 text-[11px] lowercase">
                                {displayUserEmail(usr.email) === "Não informado" ? (
                                  <span className="text-gray-400 normal-case">Não informado</span>
                                ) : (
                                  displayUserEmail(usr.email)
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-[11px]">{usr.nomeCompleto || "Não informado"}</td>
                              <td className="px-4 py-3 text-gray-600 font-medium">
                                {usr.secao}
                                <span className="block text-[10px] text-gray-400 font-semibold">
                                  {nomeDivisao(String(usr.divisaoId || activeDivisaoId))}
                                </span>
                              </td>
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
                                    setCurrentUser({
                                      ...usr,
                                      email: usr.email || "",
                                      authProvider: usr.authProvider || "local",
                                      ultimoLogin: usr.ultimoLogin ?? null,
                                      emailVerificado: usr.emailVerificado === true,
                                    secaoId: usr.secaoId || listSecoesDaDivisao(String(usr.divisaoId || activeDivisaoId)).find((s) => secoesIguais(s.nome, usr.secao))?.id || "",
                                    secoesResponsaveisIds: [],
                                    });
                                    setUserOriginalRe(usr.re);
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

            {/* 2b. MODULE: SEÇÕES */}
            {activeTab === "secoes" && canSecoes && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Seções</h2>
                    <p className="text-xs text-gray-500">
                      Cada Seção pertence a uma Divisão. Colaboradores e permissões são lotados na Seção.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentSecao({
                        id: "",
                        nome: "",
                        codigo: "",
                        divisaoId: activeDivisaoId,
                        ativo: true,
                        ordem: 0,
                      });
                      setSecaoOriginalId(null);
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
                        <th className="px-4 py-3">Divisão</th>
                        <th className="px-4 py-3">Código</th>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {secoes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-gray-400 font-semibold">
                            Nenhuma Seção cadastrada.
                          </td>
                        </tr>
                      ) : (
                        secoes
                          .slice()
                          .sort((a, b) => {
                            const da = nomeDivisao(a.divisaoId).localeCompare(nomeDivisao(b.divisaoId));
                            if (da !== 0) return da;
                            return (a.ordem || 0) - (b.ordem || 0);
                          })
                          .map((s) => (
                            <tr key={s.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">{nomeDivisao(s.divisaoId)}</td>
                              <td className="px-4 py-3 font-mono font-bold">{s.codigo || "—"}</td>
                              <td className="px-4 py-3">{s.nome}</td>
                              <td className="px-4 py-3 text-center">{s.ativo !== false ? "ATIVA" : "INATIVA"}</td>
                              <td className="px-4 py-3 text-right space-x-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCurrentSecao({ ...s });
                                    setSecaoOriginalId(s.id);
                                    setSecaoModalOpen(true);
                                  }}
                                  className="p-1.5 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDelete("secoes", s.id, s.nome)}
                                  className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-900 rounded cursor-pointer"
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

            {/* 3. MODULE: POSTOS E GRADUAÇÕES */}
            {activeTab === "postos" && canPostos && (
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
                      setPostoOriginalSigla(null);
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
                                  setPostoOriginalSigla(p.sigla);
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

            {/* 4. MODULE: LEGENDAS DA ESCALA */}
            {activeTab === "legendas" && canLegendas && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Módulo Legendas da Escala</h2>
                    <p className="text-xs text-gray-500">
                      Configure códigos, representações e regras operacionais. A Escala Consolidada será
                      preparada nesta configuração (sem geração automática nesta etapa).
                    </p>
                  </div>
                  <button
                    id="new-legenda-btn"
                    disabled={!canLegendas}
                    onClick={() => {
                      if (!canLegendas) return;
                      setCurrentLegenda(createEmptyLegendaForm());
                      setLegendaOriginalSigla(null);
                      setLegendaModalSection("basicas");
                      setLegendaModalOpen(true);
                    }}
                    className="mt-3 sm:mt-0 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 bg-blue-600 hover:bg-blue-500 text-white"
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
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Descrição</th>
                        <th className="px-4 py-3">Consolidada</th>
                        <th className="px-4 py-3">Visual/Cor</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {legendas.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-gray-400 font-semibold">Nenhuma legenda cadastrada.</td>
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
                            <td className="px-4 py-3 text-gray-600">{l.nome || "—"}</td>
                            <td className="px-4 py-3 text-gray-600">{l.descricao}</td>
                            <td className="px-4 py-3 font-mono text-gray-700">
                              {l.representacoes?.escalaConsolidada?.trim() || (
                                <span className="text-gray-400 font-sans">Não config.</span>
                              )}
                            </td>
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
                                disabled={!canLegendas}
                                onClick={() => {
                                  if (!canLegendas) return;
                                  setCurrentLegenda(toLegendaFormState(l));
                                  setLegendaOriginalSigla(l.sigla);
                                  setLegendaModalSection("basicas");
                                  setLegendaModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded transition-colors cursor-pointer inline-flex items-center disabled:cursor-not-allowed disabled:opacity-50"
                                title="Editar"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                disabled={!canLegendas}
                                onClick={() => {
                                  if (!canLegendas) return;
                                  requestDelete("legendas", l.sigla, l.sigla);
                                }}
                                className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-900 rounded transition-colors cursor-pointer inline-flex items-center disabled:cursor-not-allowed disabled:opacity-50"
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

            {/* 6. MODULE: DIVISÕES */}
            {activeTab === "divisoes" && canDivisoes && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-gray-150">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Divisões</h2>
                    <p className="text-xs text-gray-500">
                      Cadastre as Divisões e, dentro de cada uma, as seções de serviço.
                      Depois, em Colaboradores e Permissão, a lotação escolhe a seção
                      indicando a Divisão a que ela pertence.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void abrirModalDivisao(null)}
                    className="mt-3 sm:mt-0 inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Nova Divisão</span>
                  </button>
                </div>
                <div className="table-scroll border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs text-gray-500">
                    <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Código</th>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Descrição</th>
                        <th className="px-4 py-3 text-center">Situação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white text-gray-900 font-medium">
                      {divisoesList.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 font-semibold">Nenhuma Divisão cadastrada.</td></tr>
                      ) : (
                        divisoesList.map((divisao) => (
                          <tr key={divisao.codigo} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono font-bold">{divisao.codigo}</td>
                            <td className="px-4 py-3">{divisao.nome}</td>
                            <td className="px-4 py-3 text-gray-600">{divisao.descricao || "—"}</td>
                            <td className="px-4 py-3 text-center">{divisao.ativo !== false ? "ATIVA" : "INATIVA"}</td>
                            <td className="px-4 py-3 text-right space-x-1">
                              <button type="button" onClick={() => void abrirModalDivisao(divisao)} className="p-1.5 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded cursor-pointer" title="Editar">
                                <Edit2 size={13} />
                              </button>
                              <button type="button" onClick={() => requestDelete("divisoes", divisao.codigo, divisao.nome)} className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-900 rounded cursor-pointer" title="Excluir">
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

            {/* 7. MODULE: CONFIGURAÇÕES GERAIS */}
            {activeTab === "gerais" && canGerais && (
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
                        placeholder="Ex: Organização Exemplo S.A."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Unidade Administrativa</label>
                      <input
                        type="text"
                        value={gerais.unidade}
                        onChange={(e) => setGerais((prev: any) => ({ ...prev, unidade: e.target.value }))}
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                        placeholder="Ex: Diretoria / Setor Exemplo"
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
            {activeTab === "registros" && canLogs && (
              <LogsAuditPanel
                logs={logsList}
                loading={logsLoading}
                onReload={loadLogs}
                usuario={usuario}
              />
            )}

            {/* 8. MODULE: CENTRAL DE TESTES */}
            {activeTab === "testes" && canTestes && (
              <CentralTestes usuario={usuario} />
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
                  {colOriginalRe !== null ? "Editar Colaborador" : "Adicionar Colaborador"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setColModalOpen(false);
                    setColOriginalRe(null);
                  }}
                  className="text-gray-400 hover:text-white cursor-pointer"
                >
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
                      onChange={(e) => setCurrentCol({ ...currentCol, re: e.target.value })}
                      placeholder="Ex: 999888-0"
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
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
                      {listPostosDaDivisao(String(currentCol.divisaoId || activeDivisaoId)).map((p) => (
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
                    placeholder="Ex.: João da Silva"
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
                    placeholder="Ex.: SILVA"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    E-mail Google
                  </label>
                  <input
                    type="email"
                    value={currentCol.email || ""}
                    onChange={(e) =>
                      setCurrentCol({
                        ...currentCol,
                        email: e.target.value,
                      })
                    }
                    onBlur={(e) => {
                      const normalized = normalizeEmail(e.target.value);
                      setCurrentCol((prev) =>
                        prev ? { ...prev, email: normalized } : prev
                      );
                    }}
                    placeholder="joao.silva@exemplo.com"
                    autoComplete="email"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold lowercase"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Conta Google de acesso à plataforma. Ao conceder permissão, este e-mail é
                    aproveitado. Armazenado em minúsculas.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Divisão *
                    </label>
                    <select
                      value={currentCol.divisaoId || activeDivisaoId}
                      onChange={(e) => {
                        const nextDivisaoId = e.target.value;
                        const secoesDaDivisao = listSecoesDaDivisao(nextDivisaoId).filter(
                          (s) => s.ativo !== false
                        );
                        const postosDaDivisao = listPostosDaDivisao(nextDivisaoId);
                        setCurrentCol((prev) =>
                          prev
                            ? {
                                ...prev,
                                divisaoId: nextDivisaoId,
                                secaoId: secoesDaDivisao[0]?.id || "",
                                secao: secoesDaDivisao[0]?.nome || "",
                                postoGrad:
                                  postosDaDivisao.find((p) => p.sigla === prev.postoGrad)?.sigla ||
                                  postosDaDivisao[0]?.sigla ||
                                  prev.postoGrad,
                              }
                            : prev
                        );
                      }}
                      disabled={!isGerente(usuario)}
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white disabled:bg-gray-100 disabled:text-gray-500"
                      required
                    >
                      {opcoesDivisaoSelect().map((divisao) => (
                        <option key={divisao.codigo} value={divisao.codigo}>
                          {divisao.codigo} — {divisao.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Seção *
                    </label>
                    {(() => {
                      const divisaoCol = String(currentCol.divisaoId || activeDivisaoId);
                      const opcoes = listSecoesDaDivisao(divisaoCol).filter(
                        (s) => s.ativo !== false || s.id === currentCol.secaoId
                      );
                      return (
                        <>
                          <select
                            value={currentCol.secaoId || ""}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              const secao = opcoes.find((s) => s.id === nextId);
                              setCurrentCol({
                                ...currentCol,
                                secaoId: nextId,
                                secao: secao?.nome || "",
                                divisaoId: divisaoCol,
                              });
                            }}
                            className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white disabled:bg-gray-100"
                            required
                            disabled={opcoes.length === 0}
                          >
                            <option value="">Selecione a seção</option>
                            {opcoes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                                {s.codigo ? ` (${s.codigo})` : ""}
                              </option>
                            ))}
                          </select>
                          {opcoes.length === 0 && (
                            <p className="mt-1 text-[11px] text-amber-700 font-semibold">
                              Esta Divisão ainda não possui seções. Cadastre-as em Divisões antes de
                              vincular colaboradores.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={normalizeAtivoFlag(currentCol.ativo)}
                      onChange={(e) => setCurrentCol({ ...currentCol, ativo: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-xs font-bold text-gray-700 uppercase">Colaborador Ativo</span>
                  </label>
                  <p className="mt-1 text-[10px] text-gray-400 leading-snug">
                    Inativo = fora das escalas. Não remove permissão no módulo Permissão. A lotação
                    (Divisão + Seção) define em quais escalas o colaborador aparece.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Observações</label>
                  <input
                    type="text"
                    value={currentCol.observacao || ""}
                    onChange={(e) => setCurrentCol({ ...currentCol, observacao: e.target.value })}
                    placeholder="Ex: Apoio, motorista, etc."
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => {
                      setColModalOpen(false);
                      setColOriginalRe(null);
                    }}
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

        {/* PERMISSÃO ADD/EDIT MODAL */}
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
                  {userOriginalRe !== null ? "Editar Permissão" : "Nova Permissão"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setUserModalOpen(false);
                    setUserOriginalRe(null);
                  }}
                  className="text-gray-400 hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUserSubmit} className="p-6 space-y-4">
                {userOriginalRe === null && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Selecionar colaborador
                    </label>
                    <select
                      value={
                        colaboradores.some((c) => c.re === currentUser.re) ? currentUser.re : ""
                      }
                      onChange={(e) => {
                        const re = e.target.value;
                        if (!re) return;
                        const col = colaboradores.find((c) => c.re === re);
                        if (!col) return;
                        setCurrentUser((prev) =>
                          prev
                            ? {
                                ...prev,
                                re: col.re,
                                postoGrad: col.postoGrad,
                                nome: col.nome,
                                nomeCompleto: col.nomeCompleto || "",
                                secao: col.secao,
                                secaoId: col.secaoId || "",
                                divisaoId: String(col.divisaoId || activeDivisaoId),
                                email: normalizeEmail(col.email) || prev.email || "",
                              }
                            : prev
                        );
                      }}
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                    >
                      <option value="">Escolha alguém da lista de colaboradores…</option>
                      {colaboradores.map((c) => {
                        const jaTemPermissao = usuarios.some((u) => u.re === c.re);
                        return (
                          <option key={c.re} value={c.re}>
                            {c.postoGrad} {c.nome} — R.E. {c.re}
                            {!normalizeAtivoFlag(c.ativo) ? " (inativo na escala)" : ""}
                            {jaTemPermissao ? " (já tem permissão)" : ""}
                            {normalizeEmail(c.email) ? "" : " (sem e-mail)"}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-[10px] text-gray-400 leading-snug">
                      Lista todos os colaboradores cadastrados. Após selecionar, os campos (incluindo
                      e-mail Google) são preenchidos e podem ser ajustados.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
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

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">RE (Registro Estatístico) *</label>
                    <input
                      type="text"
                      value={currentUser.re}
                      onChange={(e) => setCurrentUser({ ...currentUser, re: e.target.value })}
                      placeholder="Ex: 999888-0"
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    value={currentUser.nomeCompleto || ""}
                    onChange={(e) => setCurrentUser({ ...currentUser, nomeCompleto: e.target.value })}
                    placeholder="Ex.: João da Silva"
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
                    placeholder="Ex.: SILVA"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    E-mail Google {userOriginalRe === null ? "*" : ""}
                  </label>
                  <input
                    type="email"
                    value={currentUser.email || ""}
                    onChange={(e) =>
                      setCurrentUser({
                        ...currentUser,
                        email: e.target.value,
                      })
                    }
                    onBlur={(e) => {
                      const normalized = normalizeEmail(e.target.value);
                      setCurrentUser((prev) =>
                        prev ? { ...prev, email: normalized } : prev
                      );
                    }}
                    placeholder="joao.silva@exemplo.com"
                    autoComplete="email"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold lowercase"
                    required={userOriginalRe === null}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Vínculo de acesso: o usuário entra somente com esta Conta Google. Armazenado em
                    minúsculas.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Divisão *</label>
                    <select
                      value={currentUser.divisaoId || activeDivisaoId}
                      onChange={(e) => {
                        const nextDivisaoId = e.target.value;
                        const secoesDaDivisao = listSecoesDaDivisao(nextDivisaoId).filter(
                          (s) => s.ativo !== false
                        );
                        setCurrentUser((prev) =>
                          prev
                            ? {
                                ...prev,
                                divisaoId: nextDivisaoId,
                                secaoId: secoesDaDivisao[0]?.id || "",
                                secao: secoesDaDivisao[0]?.nome || "",
                              }
                            : prev
                        );
                      }}
                      disabled={!isGerente(usuario)}
                      className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white disabled:bg-gray-100 disabled:text-gray-500"
                      required
                    >
                      {opcoesDivisaoSelect().map((divisao) => (
                        <option key={divisao.codigo} value={divisao.codigo}>
                          {divisao.codigo} — {divisao.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Seção *
                    </label>
                    {(() => {
                      const divisaoDoUsuario = String(currentUser.divisaoId || activeDivisaoId);
                      const opcoes = listSecoesDaDivisao(divisaoDoUsuario).filter(
                        (s) => s.ativo !== false || s.id === currentUser.secaoId
                      );
                      return (
                        <>
                          <select
                            value={currentUser.secaoId || ""}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              const secao = opcoes.find((s) => s.id === nextId);
                              setCurrentUser({
                                ...currentUser,
                                secaoId: nextId,
                                secao: secao?.nome || "",
                                divisaoId: divisaoDoUsuario,
                              });
                            }}
                            className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white disabled:bg-gray-100"
                            required
                            disabled={opcoes.length === 0}
                          >
                            <option value="">Selecione a seção</option>
                            {opcoes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                                {s.codigo ? ` (${s.codigo})` : ""}
                                {s.ativo === false ? " — inativa" : ""}
                              </option>
                            ))}
                          </select>
                          {opcoes.length === 0 && (
                            <p className="mt-1 text-[11px] text-amber-700 font-semibold">
                              Esta Divisão ainda não possui seções. Cadastre-as em Divisões
                              antes de conceder a permissão.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Perfil de Acesso *</label>
                  <select
                    value={currentUser.perfil || "Operador"}
                    onChange={(e) =>
                      setCurrentUser({
                        ...currentUser,
                        perfil: e.target.value as any,
                      })
                    }
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                    required
                  >
                    {perfilOptions.map((perfil) => (
                      <option key={perfil} value={perfil}>
                        {perfil}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-gray-400">
                    A lotação (Divisão + Seção) define o escopo do usuário nas escalas e no
                    Controle de Frequência.
                  </p>
                </div>

                <div className="pt-1">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentUser.ativo !== false}
                      onChange={(e) => setCurrentUser({ ...currentUser, ativo: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-xs font-bold text-gray-700 uppercase">Permissão Ativa (Acesso Liberado)</span>
                  </label>
                  <p className="mt-1 text-[10px] text-gray-400 leading-snug">
                    Independente de estar ativo como colaborador na escala.
                  </p>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => {
                      setUserModalOpen(false);
                      setUserOriginalRe(null);
                    }}
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

        {/* DIVISÃO ADD/EDIT MODAL */}
        {divisaoModalOpen && currentDivisao && canDivisoes && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {divisaoOriginalCodigo ? "Editar Divisão" : "Nova Divisão"}
                </h3>
                <button type="button" onClick={() => setDivisaoModalOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleDivisaoSubmit} className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Código *</label>
                  <input
                    type="text"
                    value={currentDivisao.codigo}
                    onChange={(e) => setCurrentDivisao({ ...currentDivisao, codigo: normalizeDivisaoId(e.target.value) })}
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-mono font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nome *</label>
                  <input
                    type="text"
                    value={currentDivisao.nome}
                    onChange={(e) => setCurrentDivisao({ ...currentDivisao, nome: e.target.value })}
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Descrição</label>
                  <input
                    type="text"
                    value={currentDivisao.descricao || ""}
                    onChange={(e) => setCurrentDivisao({ ...currentDivisao, descricao: e.target.value })}
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={currentDivisao.ativo !== false} onChange={(e) => setCurrentDivisao({ ...currentDivisao, ativo: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="ml-2 text-xs font-bold text-gray-700 uppercase">Divisão Ativa</span>
                </label>

                {/* Seções desta Divisão — lotação de colaboradores e permissões */}
                <div className="pt-4 border-t border-gray-150">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Seções desta Divisão
                  </label>
                  <p className="text-[11px] text-gray-500 mb-3">
                    Único lugar para criar e editar seções. Após confirmar e salvar, elas ficam
                    disponíveis em Colaboradores e Permissão, sempre vinculadas a esta Divisão.
                  </p>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <input
                      type="text"
                      value={novaSecaoNome}
                      onChange={(e) => setNovaSecaoNome(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          salvarSecaoDivisao();
                        }
                      }}
                      placeholder="Nome da seção"
                      className="flex-1 min-w-[8rem] border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                    />
                    <input
                      type="text"
                      value={novaSecaoCodigo}
                      onChange={(e) => setNovaSecaoCodigo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          salvarSecaoDivisao();
                        }
                      }}
                      placeholder="Cód. OPM"
                      className="w-28 border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-mono"
                    />
                    <button
                      type="button"
                      onClick={salvarSecaoDivisao}
                      disabled={!novaSecaoNome.trim() || !novaSecaoCodigo.trim()}
                      className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
                    >
                      {editandoSecaoId ? (
                        <>
                          <Check size={13} />
                          Atualizar
                        </>
                      ) : (
                        <>
                          <Plus size={13} />
                          Adicionar
                        </>
                      )}
                    </button>
                    {editandoSecaoId && (
                      <button
                        type="button"
                        onClick={limparFormSecaoDivisao}
                        className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                  {editandoSecaoId && (
                    <p className="text-[11px] text-blue-700 font-semibold mb-2">
                      Editando seção — corrija o nome ou o código OPM e clique em Atualizar.
                    </p>
                  )}

                  {divisaoSecoesCarregando ? (
                    <p className="text-[11px] text-gray-400 font-semibold py-2">
                      Carregando seções...
                    </p>
                  ) : divisaoSecoes.length === 0 ? (
                    <p className="text-[11px] text-gray-400 font-semibold py-2">
                      Nenhuma seção cadastrada nesta Divisão.
                    </p>
                  ) : (
                    <ul className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-48 overflow-y-auto">
                      {divisaoSecoes.map((secao) => (
                        <li
                          key={secao.id}
                          className={`flex items-center justify-between px-3 py-2 text-xs ${
                            editandoSecaoId === secao.id ? "bg-blue-50" : ""
                          }`}
                        >
                          <span className="font-semibold text-gray-900">
                            {secao.nome}
                            {secao.codigo && (
                              <span className="ml-2 font-mono text-[10px] text-gray-500">
                                {secao.codigo}
                              </span>
                            )}
                            {secao.ativo === false && (
                              <span className="ml-2 text-[10px] font-bold text-amber-700 uppercase">
                                Inativa
                              </span>
                            )}
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => iniciarEdicaoSecaoDivisao(secao)}
                              className="p-1 hover:bg-gray-150 text-gray-600 hover:text-gray-900 rounded cursor-pointer"
                              title="Editar seção"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removerSecaoDivisao(secao.id)}
                              className="p-1 hover:bg-red-50 text-red-600 rounded cursor-pointer"
                              title={secao.ativo === false ? "Remover seção inativa" : "Remover seção"}
                            >
                              <Trash2 size={13} />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button type="button" onClick={() => setDivisaoModalOpen(false)} className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer">Cancelar</button>
                  <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs cursor-pointer">Confirmar</button>
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
                  {postoOriginalSigla !== null ? "Editar Posto/Grad" : "Adicionar Posto/Grad"}
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
                    onChange={(e) => setCurrentPosto({ ...currentPosto, sigla: e.target.value })}
                    placeholder="Ex: 3º SGT"
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Descrição Completa *</label>
                  <input
                    type="text"
                    value={currentPosto.descricao}
                    onChange={(e) => setCurrentPosto({ ...currentPosto, descricao: e.target.value })}
                    placeholder="Ex: TERCEIRO SARGENTO"
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
        {secaoModalOpen && currentSecao && canSecoes && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {secaoOriginalId ? "Editar Seção" : "Nova Seção"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSecaoModalOpen(false);
                    setCurrentSecao(null);
                    setSecaoOriginalId(null);
                  }}
                  className="text-gray-400 hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSecaoSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Divisão *
                  </label>
                  <select
                    value={String(currentSecao.divisaoId || activeDivisaoId)}
                    onChange={(e) =>
                      setCurrentSecao({ ...currentSecao, divisaoId: e.target.value })
                    }
                    disabled={!isGerente(usuario)}
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white disabled:bg-gray-100"
                    required
                  >
                    {opcoesDivisaoSelect().map((d) => (
                      <option key={d.codigo} value={d.codigo}>
                        {d.nome} ({d.codigo})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={currentSecao.nome}
                    onChange={(e) =>
                      setCurrentSecao({ ...currentSecao, nome: e.target.value })
                    }
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Código da OPM *
                  </label>
                  <input
                    type="text"
                    value={currentSecao.codigo}
                    onChange={(e) =>
                      setCurrentSecao({ ...currentSecao, codigo: e.target.value })
                    }
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-mono font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Situação
                  </label>
                  <select
                    value={currentSecao.ativo === false ? "false" : "true"}
                    onChange={(e) =>
                      setCurrentSecao({
                        ...currentSecao,
                        ativo: e.target.value === "true",
                      })
                    }
                    className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold bg-white"
                  >
                    <option value="true">Ativa</option>
                    <option value="false">Inativa</option>
                  </select>
                </div>
                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => {
                      setSecaoModalOpen(false);
                      setCurrentSecao(null);
                      setSecaoOriginalId(null);
                    }}
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
              className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {legendaOriginalSigla !== null ? "Editar Legenda" : "Adicionar Legenda"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setLegendaModalOpen(false);
                    setLegendaModalSection("basicas");
                  }}
                  className="text-gray-400 hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
                {(
                  [
                    ["basicas", "Informações básicas"],
                    ["representacoes", "Representações"],
                    ["regras", "Regras de cálculo"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLegendaModalSection(id)}
                    className={`flex-1 px-2 py-2.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide cursor-pointer border-b-2 transition-colors ${
                      legendaModalSection === id
                        ? "border-blue-600 text-blue-700 bg-white"
                        : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleLegendaSubmit} className="p-6 space-y-4 overflow-y-auto">
                {legendaModalSection === "basicas" && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Código / Sigla *
                      </label>
                      <input
                        type="text"
                        value={currentLegenda.sigla}
                        onChange={(e) => setCurrentLegenda({ ...currentLegenda, sigla: e.target.value })}
                        placeholder="Ex: EN"
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                        required
                      />
                      <p className="mt-1 text-[10px] text-gray-400">
                        Campo legado `sigla` — usado nos dropdowns da Escala Semanal.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Nome
                      </label>
                      <input
                        type="text"
                        value={currentLegenda.nome || ""}
                        onChange={(e) => setCurrentLegenda({ ...currentLegenda, nome: e.target.value })}
                        placeholder="Ex: Expediente Normal (opcional)"
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Descrição *
                      </label>
                      <input
                        type="text"
                        value={currentLegenda.descricao}
                        onChange={(e) => setCurrentLegenda({ ...currentLegenda, descricao: e.target.value })}
                        placeholder="Ex: Expediente normal de trabalho"
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Cor da Legenda
                      </label>
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
                          placeholder="Ex: #3B82F6"
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

                    <div className="pt-1">
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
                  </>
                )}

                {legendaModalSection === "representacoes" && (
                  <>
                    <p className="text-[11px] text-gray-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      Preparação para a futura Escala Consolidada. Nenhum campo desta seção é
                      obrigatório. Se vazio, permanece como &quot;não configurado&quot;.
                    </p>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Representação na Escala Semanal
                      </label>
                      <input
                        type="text"
                        value={currentLegenda.representacoes?.escalaSemanal || ""}
                        onChange={(e) =>
                          setCurrentLegenda({
                            ...currentLegenda,
                            representacoes: {
                              ...currentLegenda.representacoes,
                              escalaSemanal: e.target.value,
                            },
                          })
                        }
                        placeholder={`Padrão implícito: ${currentLegenda.sigla || "sigla"}`}
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Representação no Controle de Frequência
                      </label>
                      <input
                        type="text"
                        value={currentLegenda.representacoes?.escalaConsolidada || ""}
                        onChange={(e) =>
                          setCurrentLegenda({
                            ...currentLegenda,
                            representacoes: {
                              ...currentLegenda.representacoes,
                              escalaConsolidada: e.target.value,
                            },
                          })
                        }
                        placeholder="Ex: 1 (opcional)"
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                      />
                      <p className="mt-1 text-[10px] text-gray-400">
                        Opcional. Valor exibido/somado no Controle de Frequência (e consolidação futura).
                      </p>
                    </div>
                  </>
                )}

                {legendaModalSection === "regras" && (
                  <>
                    <p className="text-[11px] text-gray-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      Regras futuras de cálculo. Todos os campos são opcionais. A.A. usará
                      &quot;É dia trabalhado?&quot; quando configurado; 1/2 Diária soma apenas
                      valores positivos com participação ativa.
                    </p>
                    <OptionalBoolSelect
                      label="É dia trabalhado?"
                      value={currentLegenda.regras?.diaTrabalhado}
                      onChange={(v) =>
                        setCurrentLegenda({
                          ...currentLegenda,
                          regras: { ...currentLegenda.regras, diaTrabalhado: v },
                        })
                      }
                      hint="Base futura do A.A. (dias trabalhados)."
                    />
                    <OptionalBoolSelect
                      label="Participa da 1/2 Diária?"
                      value={currentLegenda.regras?.meiaDiaria?.participa}
                      onChange={(v) =>
                        setCurrentLegenda({
                          ...currentLegenda,
                          regras: {
                            ...currentLegenda.regras,
                            meiaDiaria: {
                              ...currentLegenda.regras?.meiaDiaria,
                              participa: v,
                            },
                          },
                        })
                      }
                    />
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Valor da 1/2 Diária
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={
                          currentLegenda.regras?.meiaDiaria?.valor !== undefined &&
                          currentLegenda.regras?.meiaDiaria?.valor !== null
                            ? currentLegenda.regras.meiaDiaria.valor
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCurrentLegenda({
                            ...currentLegenda,
                            regras: {
                              ...currentLegenda.regras,
                              meiaDiaria: {
                                ...currentLegenda.regras?.meiaDiaria,
                                valor: raw === "" ? undefined : Number(raw),
                              },
                            },
                          });
                        }}
                        placeholder="Ex: 1 (opcional; 0 não soma)"
                        className="block w-full border border-gray-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 font-semibold"
                      />
                    </div>
                    <OptionalBoolSelect
                      label="Conta para A.A.?"
                      value={currentLegenda.regras?.aa?.contaDia}
                      onChange={(v) =>
                        setCurrentLegenda({
                          ...currentLegenda,
                          regras: {
                            ...currentLegenda.regras,
                            aa: { ...currentLegenda.regras?.aa, contaDia: v },
                          },
                        })
                      }
                      hint="Se não configurado, o futuro cálculo usará 'É dia trabalhado?'."
                    />
                  </>
                )}

                <div className="flex justify-end space-x-2 pt-4 border-t border-gray-150">
                  <button
                    type="button"
                    onClick={() => {
                      setLegendaModalOpen(false);
                      setLegendaModalSection("basicas");
                    }}
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
