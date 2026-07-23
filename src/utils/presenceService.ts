/**
 * Presença online em Firestore (heartbeat).
 * Coleção: presenca_online/{re}
 */
import {
  db,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "../firebase";
import { Usuario } from "../types";
import { normalizeEmail } from "./usuarioHelpers";
import { normalizeRe } from "./reUtils";

const COLLECTION = "presenca_online";
const HEARTBEAT_MS = 30_000;
/** Considera online se lastSeen está dentro desta janela. */
export const ONLINE_WINDOW_MS = 90_000;

export interface PresenceDoc {
  re: string;
  nome: string;
  postoGrad: string;
  email?: string;
  photoURL?: string | null;
  lastSeen?: Timestamp | { seconds: number; nanoseconds: number } | Date | null;
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let unloadHandler: (() => void) | null = null;
let activeRe: string | null = null;

function presenceDocId(re: string): string {
  return normalizeRe(re) || String(re || "").trim();
}

function buildPayload(usuario: Usuario): Record<string, unknown> {
  const email = normalizeEmail(usuario.email);
  return {
    re: usuario.re,
    nome: usuario.nome,
    postoGrad: usuario.postoGrad,
    email: email || null,
    photoURL: usuario.photoURL || null,
    lastSeen: serverTimestamp(),
  };
}

async function touchPresence(usuario: Usuario): Promise<void> {
  const id = presenceDocId(usuario.re);
  if (!id) return;
  try {
    await setDoc(doc(db, COLLECTION, id), buildPayload(usuario), { merge: true });
  } catch (err) {
    console.warn("Falha ao atualizar presença online:", err);
  }
}

async function removePresenceDoc(re: string): Promise<void> {
  const id = presenceDocId(re);
  if (!id) return;
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (err) {
    console.warn("Falha ao remover presença online:", err);
  }
}

function clearLocalPresenceTimers(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (unloadHandler) {
    window.removeEventListener("beforeunload", unloadHandler);
    unloadHandler = null;
  }
}

/**
 * Inicia heartbeat de presença para o usuário autenticado.
 * Chamar de novo com o mesmo usuário é idempotente (reinicia timers).
 */
export function startPresence(usuario: Usuario): void {
  const id = presenceDocId(usuario.re);
  if (!id) return;

  stopPresenceSync();
  activeRe = id;

  void touchPresence(usuario);

  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === "hidden") return;
    void touchPresence(usuario);
  }, HEARTBEAT_MS);

  visibilityHandler = () => {
    if (document.visibilityState === "visible") {
      void touchPresence(usuario);
    }
  };
  document.addEventListener("visibilitychange", visibilityHandler);

  unloadHandler = () => {
    // Best-effort: delete pode não completar no unload.
    void removePresenceDoc(id);
  };
  window.addEventListener("beforeunload", unloadHandler);
}

/** Para timers locais sem apagar o doc (usado antes de logout explícito). */
export function stopPresenceSync(): void {
  clearLocalPresenceTimers();
}

/** Encerra presença: para heartbeat e remove documento. */
export async function stopPresence(re?: string): Promise<void> {
  const id = re ? presenceDocId(re) : activeRe;
  clearLocalPresenceTimers();
  activeRe = null;
  if (id) await removePresenceDoc(id);
}

export function isPresenceFresh(lastSeen: PresenceDoc["lastSeen"], nowMs = Date.now()): boolean {
  if (!lastSeen) return false;
  let ms = 0;
  if (lastSeen instanceof Timestamp) {
    ms = lastSeen.toMillis();
  } else if (lastSeen instanceof Date) {
    ms = lastSeen.getTime();
  } else if (typeof lastSeen === "object" && "seconds" in lastSeen) {
    ms = Number(lastSeen.seconds) * 1000;
  } else {
    return false;
  }
  return nowMs - ms <= ONLINE_WINDOW_MS;
}

/** Conta documentos com lastSeen recente. */
export function countOnlineFromDocs(
  docs: Array<PresenceDoc | { lastSeen?: PresenceDoc["lastSeen"] }>,
  nowMs = Date.now()
): number {
  let n = 0;
  for (const d of docs) {
    if (isPresenceFresh(d.lastSeen, nowMs)) n += 1;
  }
  return n;
}

/**
 * Assina a coleção de presença e reporta quantos estão online.
 * Retorna unsubscribe.
 */
export function subscribeOnlineCount(onCount: (count: number) => void): () => void {
  let latest: PresenceDoc[] = [];

  const emit = () => {
    onCount(countOnlineFromDocs(latest));
  };

  const unsub = onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      latest = snap.docs.map((d) => d.data() as PresenceDoc);
      emit();
    },
    (err) => {
      console.warn("Falha ao ouvir presença online:", err);
      onCount(0);
    }
  );

  // Reavalia a janela de 90s mesmo sem novos writes.
  const tick = setInterval(emit, 15_000);

  return () => {
    unsub();
    clearInterval(tick);
  };
}
