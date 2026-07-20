import { ScheduleRow, EscalaAprovacao, HistoricoEscalaEvento, LastSaved, AprovacaoAtor } from "../types";

/** Monta uma linha da escala só com campos válidos (sem spread de props extras/undefined). */
export function cleanScheduleRow(row: ScheduleRow | Record<string, unknown>): ScheduleRow {
  const r = row as ScheduleRow;
  return {
    re: String(r.re ?? ""),
    postoGrad: String(r.postoGrad ?? ""),
    nome: String(r.nome ?? ""),
    secao: String(r.secao ?? ""),
    seg: String(r.seg ?? ""),
    ter: String(r.ter ?? ""),
    qua: String(r.qua ?? ""),
    qui: String(r.qui ?? ""),
    sex: String(r.sex ?? ""),
    sab: String(r.sab ?? ""),
    dom: String(r.dom ?? ""),
    observacao: String(r.observacao ?? ""),
  };
}

export function cleanAprovacaoAtor(ator: AprovacaoAtor | null | undefined): AprovacaoAtor | null {
  if (!ator) return null;
  const cleaned: AprovacaoAtor = {
    nome: String(ator.nome ?? ""),
    re: String(ator.re ?? ""),
    postoGrad: String(ator.postoGrad ?? ""),
    data: String(ator.data ?? ""),
    hora: String(ator.hora ?? ""),
  };
  if (ator.timestamp !== undefined && ator.timestamp !== null) {
    cleaned.timestamp = ator.timestamp;
  }
  return cleaned;
}

/** Reconstrói o bloco de aprovação sem propriedades undefined. */
export function cleanAprovacao(
  aprovacao: EscalaAprovacao | null | undefined
): EscalaAprovacao | null {
  if (!aprovacao) return null;

  const cleaned: EscalaAprovacao = {};

  if (aprovacao.solicitacaoId) cleaned.solicitacaoId = aprovacao.solicitacaoId;

  const enviado = cleanAprovacaoAtor(aprovacao.enviadoPor);
  if (enviado) cleaned.enviadoPor = enviado;
  else if (aprovacao.enviadoPor === null) cleaned.enviadoPor = null;

  const aprovado = cleanAprovacaoAtor(aprovacao.aprovadoPor);
  if (aprovado) cleaned.aprovadoPor = aprovado;
  else if (aprovacao.aprovadoPor === null) cleaned.aprovadoPor = null;

  const rejeitado = cleanAprovacaoAtor(aprovacao.rejeitadoPor);
  if (rejeitado) cleaned.rejeitadoPor = rejeitado;
  else if (aprovacao.rejeitadoPor === null) cleaned.rejeitadoPor = null;

  if (aprovacao.motivoRejeicao !== undefined && aprovacao.motivoRejeicao !== null) {
    cleaned.motivoRejeicao = String(aprovacao.motivoRejeicao);
  }
  if (aprovacao.observacaoAprovacao !== undefined && aprovacao.observacaoAprovacao !== null) {
    cleaned.observacaoAprovacao = String(aprovacao.observacaoAprovacao);
  }
  if (typeof aprovacao.versaoEnviada === "number") {
    cleaned.versaoEnviada = aprovacao.versaoEnviada;
  }
  if (typeof aprovacao.versaoAprovada === "number") {
    cleaned.versaoAprovada = aprovacao.versaoAprovada;
  }

  return cleaned;
}

export function cleanHistoricoEvento(
  ev: HistoricoEscalaEvento | Record<string, unknown>
): HistoricoEscalaEvento {
  const e = ev as HistoricoEscalaEvento;
  const cleaned: HistoricoEscalaEvento = {
    id: String(e.id ?? ""),
    tipo: e.tipo,
    descricao: String(e.descricao ?? ""),
    usuario: String(e.usuario ?? ""),
    re: String(e.re ?? ""),
    postoGrad: String(e.postoGrad ?? ""),
    data: String(e.data ?? ""),
    hora: String(e.hora ?? ""),
    timestamp: e.timestamp,
  };
  if (typeof e.versao === "number") cleaned.versao = e.versao;
  if (e.solicitacaoId) cleaned.solicitacaoId = String(e.solicitacaoId);
  if (e.detalhes) cleaned.detalhes = String(e.detalhes);
  return cleaned;
}

export function cleanHistorico(
  historico: HistoricoEscalaEvento[] | undefined | null
): HistoricoEscalaEvento[] {
  if (!Array.isArray(historico)) return [];
  return historico.map(cleanHistoricoEvento);
}

export function cleanLastSaved(meta: LastSaved | Record<string, unknown> | null): LastSaved | null {
  if (!meta) return null;
  const m = meta as LastSaved & { postoGrad?: string; data?: string; hora?: string };
  const cleaned: Record<string, unknown> = {
    nome: String(m.nome ?? ""),
    re: String(m.re ?? ""),
    timestamp: m.timestamp,
  };
  if ((m as any).postoGrad !== undefined) cleaned.postoGrad = String((m as any).postoGrad ?? "");
  if ((m as any).data !== undefined) cleaned.data = String((m as any).data ?? "");
  if ((m as any).hora !== undefined) cleaned.hora = String((m as any).hora ?? "");
  return cleaned as unknown as LastSaved;
}
