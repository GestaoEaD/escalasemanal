/**
 * Pendências de aprovação para o perfil Gestor.
 * Reutiliza solicitacoes_aprovacao + evaluateSolicitacaoAccess (sem fluxo paralelo).
 */
import { db, collection, getDocs, query, where } from "../firebase";
import {
  MESES_NOMES,
  SolicitacaoAprovacao,
  SolicitacaoTipoDocumento,
  TipoEscalaDocumento,
  TIPO_ESCALA_LABELS,
  Usuario,
} from "../types";
import { canApproveScales } from "./permissions";
import {
  evaluateSolicitacaoAccess,
  SOLICITACOES_COLLECTION,
  tipoEscalaFromDocumento,
} from "./solicitacaoAprovacaoService";
import { parseControleFrequenciaId } from "./frequenciaIds";

export type PendingApprovalItem = {
  token: string;
  tipo: TipoEscalaDocumento;
  tipoDocumento: SolicitacaoTipoDocumento;
  escalaId: string;
  ano: number;
  /** Semana ISO (escalas) ou mês (frequência). */
  semanaOuMes: number;
  titulo: string;
  subtitulo: string;
};

export type PendingApprovalsSummary = {
  total: number;
  byTipo: Record<TipoEscalaDocumento, number>;
  items: PendingApprovalItem[];
};

const EMPTY_SUMMARY: PendingApprovalsSummary = {
  total: 0,
  byTipo: { semanal: 0, alteracao: 0, frequencia: 0 },
  items: [],
};

function formatItem(sol: SolicitacaoAprovacao): PendingApprovalItem {
  const tipo = tipoEscalaFromDocumento(sol.tipoDocumento);
  const ano = Number(sol.ano) || new Date().getFullYear();
  const semanaOuMes = Number(sol.semana) || 1;
  const titulo = TIPO_ESCALA_LABELS[tipo];

  let subtitulo = "";
  if (tipo === "frequencia") {
    const parsed = parseControleFrequenciaId(sol.escalaId);
    const mes = parsed?.mes ?? semanaOuMes;
    const mesNome = MESES_NOMES[mes - 1] || `Mês ${mes}`;
    const secao = parsed?.secaoKey?.replace(/_/g, " ") || sol.escalaId;
    subtitulo = `${mesNome}/${ano} · ${secao}`;
  } else {
    subtitulo = `Semana ${String(semanaOuMes).padStart(2, "0")}/${ano}`;
  }

  return {
    token: sol.token,
    tipo,
    tipoDocumento: sol.tipoDocumento,
    escalaId: sol.escalaId,
    ano,
    semanaOuMes,
    titulo,
    subtitulo,
  };
}

/**
 * Lista solicitações AGUARDANDO válidas (não expiradas / não finalizadas)
 * que o usuário autenticado pode aprovar (somente Gestor).
 */
export async function loadPendingApprovalsForGestor(
  usuario: Usuario | null | undefined
): Promise<PendingApprovalsSummary> {
  if (!canApproveScales(usuario)) {
    return { ...EMPTY_SUMMARY, byTipo: { ...EMPTY_SUMMARY.byTipo } };
  }

  const snap = await getDocs(
    query(
      collection(db, SOLICITACOES_COLLECTION),
      where("status", "==", "AGUARDANDO")
    )
  );

  const items: PendingApprovalItem[] = [];
  const byTipo: Record<TipoEscalaDocumento, number> = {
    semanal: 0,
    alteracao: 0,
    frequencia: 0,
  };

  snap.forEach((d) => {
    const raw = d.data() as SolicitacaoAprovacao;
    const sol: SolicitacaoAprovacao = { ...raw, token: raw.token || d.id };
    const access = evaluateSolicitacaoAccess(sol);
    if (!access.ok) return;
    const item = formatItem(access.sol);
    items.push(item);
    byTipo[item.tipo] += 1;
  });

  items.sort((a, b) => {
    if (a.ano !== b.ano) return b.ano - a.ano;
    if (a.semanaOuMes !== b.semanaOuMes) return b.semanaOuMes - a.semanaOuMes;
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });

  return { total: items.length, byTipo, items };
}

export const AVISO_PENDENCIAS_DISMISS_KEY = "aprovacoes_aviso_dismissed_session";

export function wasPendenciasAvisoDismissed(): boolean {
  try {
    return sessionStorage.getItem(AVISO_PENDENCIAS_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPendenciasAviso(): void {
  try {
    sessionStorage.setItem(AVISO_PENDENCIAS_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearPendenciasAvisoDismiss(): void {
  try {
    sessionStorage.removeItem(AVISO_PENDENCIAS_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}
