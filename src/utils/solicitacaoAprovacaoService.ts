/**
 * Coleção solicitacoes_aprovacao — links exclusivos com token aleatório.
 */
import { db, doc, getDoc, setDoc, Timestamp } from "../firebase";
import {
  SolicitacaoAprovacao,
  SolicitacaoAprovacaoResultado,
  SolicitacaoAprovacaoStatus,
  SolicitacaoTipoDocumento,
  TipoEscalaDocumento,
  Usuario,
} from "../types";
import { prepareFirestoreWrite } from "./firestoreSanitize";

export const SOLICITACOES_COLLECTION = "solicitacoes_aprovacao";
export const APPROVAL_LINK_EXPIRY_DAYS = 30;

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function formatParts(date: Date = new Date()): {
  timestamp: ReturnType<typeof Timestamp.fromDate>;
  data: string;
  hora: string;
} {
  const timestamp = Timestamp.fromDate(date);
  const data =
    String(date.getDate()).padStart(2, "0") +
    "/" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "/" +
    date.getFullYear();
  const hora =
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0");
  return { timestamp, data, hora };
}

/** Gera token aleatório não previsível (ex.: 8F3A9D2KX71). */
export function createApprovalToken(length = 11): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i]! % TOKEN_ALPHABET.length];
  }
  return out;
}

export function tipoDocumentoFromEscala(
  tipo: TipoEscalaDocumento
): SolicitacaoTipoDocumento {
  return tipo === "alteracao" ? "ESCALA_ALTERACAO" : "ESCALA_SEMANAL";
}

export function tipoEscalaFromDocumento(
  tipo: SolicitacaoTipoDocumento
): TipoEscalaDocumento {
  return tipo === "ESCALA_ALTERACAO" ? "alteracao" : "semanal";
}

export function buildTokenApprovalPath(token: string): string {
  return `/aprovacao/${encodeURIComponent(token)}`;
}

export function getTokenApprovalUrl(token: string): string {
  const path = buildTokenApprovalPath(token);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function parseAnoSemana(escalaId: string): { ano: number; semana: number } {
  const m = String(escalaId || "").match(/^(\d{4})_(\d{1,2})$/);
  if (!m) return { ano: new Date().getFullYear(), semana: 1 };
  return { ano: Number(m[1]), semana: Number(m[2]) };
}

export async function createSolicitacaoAprovacao(options: {
  token: string;
  tipo: TipoEscalaDocumento;
  escalaId: string;
  versao: number;
  usuario: Usuario;
  expiryDays?: number;
}): Promise<SolicitacaoAprovacao> {
  const now = new Date();
  const days = options.expiryDays ?? APPROVAL_LINK_EXPIRY_DAYS;
  const expira = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const { ano, semana } = parseAnoSemana(options.escalaId);

  const sol: SolicitacaoAprovacao = {
    token: options.token,
    tipoDocumento: tipoDocumentoFromEscala(options.tipo),
    semana,
    ano,
    escalaId: options.escalaId,
    versao: options.versao,
    status: "AGUARDANDO",
    criadoPor: {
      nome: options.usuario.nome || "",
      re: options.usuario.re || "",
      postoGrad: options.usuario.postoGrad || "",
    },
    criadoEm: Timestamp.fromDate(now),
    expiraEm: Timestamp.fromDate(expira),
    utilizado: false,
    resultado: null,
    finalizadoPor: null,
  };

  await setDoc(
    doc(db, SOLICITACOES_COLLECTION, options.token),
    prepareFirestoreWrite(
      `${SOLICITACOES_COLLECTION}/${options.token}`,
      sol as unknown as Record<string, unknown>
    )
  );

  return sol;
}

export async function getSolicitacaoByToken(
  token: string
): Promise<SolicitacaoAprovacao | null> {
  const t = String(token || "").trim();
  if (!t) return null;
  const snap = await getDoc(doc(db, SOLICITACOES_COLLECTION, t));
  if (!snap.exists()) return null;
  return { ...(snap.data() as SolicitacaoAprovacao), token: snap.id };
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

export function isSolicitacaoExpired(sol: SolicitacaoAprovacao): boolean {
  const ms = toMillis(sol.expiraEm);
  if (ms == null) return false;
  return Date.now() > ms;
}

export type SolicitacaoAccessError =
  | "INEXISTENTE"
  | "EXPIRADA"
  | "FINALIZADA";

export function evaluateSolicitacaoAccess(
  sol: SolicitacaoAprovacao | null
): { ok: true; sol: SolicitacaoAprovacao } | { ok: false; code: SolicitacaoAccessError; sol?: SolicitacaoAprovacao } {
  if (!sol) return { ok: false, code: "INEXISTENTE" };
  if (sol.status === "FINALIZADA" || sol.utilizado) {
    return { ok: false, code: "FINALIZADA", sol };
  }
  if (isSolicitacaoExpired(sol)) {
    return { ok: false, code: "EXPIRADA", sol };
  }
  if (sol.status !== "AGUARDANDO") {
    return { ok: false, code: "FINALIZADA", sol };
  }
  return { ok: true, sol };
}

export function solicitacaoErrorMessage(code: SolicitacaoAccessError): string {
  switch (code) {
    case "INEXISTENTE":
      return "Solicitação inexistente.";
    case "EXPIRADA":
      return "Esta solicitação expirou.\n\nSolicite um novo link ao responsável.";
    case "FINALIZADA":
      return "Esta solicitação já foi finalizada.";
  }
}

export async function finalizeSolicitacaoAprovacao(options: {
  token: string;
  resultado: Exclude<SolicitacaoAprovacaoResultado, null>;
  usuario: Usuario;
}): Promise<void> {
  const t = String(options.token || "").trim();
  if (!t) return;
  const ref = doc(db, SOLICITACOES_COLLECTION, t);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const { timestamp, data, hora } = formatParts();
  await setDoc(
    ref,
    prepareFirestoreWrite(`${SOLICITACOES_COLLECTION}/${t}/finalize`, {
      status: "FINALIZADA" as SolicitacaoAprovacaoStatus,
      utilizado: true,
      resultado: options.resultado,
      finalizadoPor: {
        nome: options.usuario.nome || "",
        re: options.usuario.re || "",
        postoGrad: options.usuario.postoGrad || "",
      },
      finalizadoEm: timestamp,
      dataFinalizacao: data,
      horaFinalizacao: hora,
    }),
    { merge: true }
  );
}
