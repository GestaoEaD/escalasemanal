/**
 * Smoke local para aviso de pendências (RBAC, rota, dismiss).
 * Executar: npx tsx scripts/smoke-pendencias.ts
 */
import { canApproveScales } from "../src/utils/permissions";
import {
  clearPendenciasAvisoDismiss,
  dismissPendenciasAviso,
  loadPendingApprovalsForGestor,
  wasPendenciasAvisoDismissed,
} from "../src/utils/pendingApprovalsService";
import { buildAppPath, parseAppPath } from "../src/utils/appNavigation";
import type { Usuario } from "../src/types";

const store = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(k: string) {
    return store.has(k) ? store.get(k)! : null;
  },
  setItem(k: string, v: string) {
    store.set(k, String(v));
  },
  removeItem(k: string) {
    store.delete(k);
  },
  key() {
    return null;
  },
};

function check(ok: boolean, msg: string) {
  if (!ok) throw new Error(msg);
}

const op: Usuario = {
  re: "1",
  nome: "Op",
  postoGrad: "Sd",
  secao: "X",
  perfil: "Operador",
};
const adm: Usuario = {
  re: "2",
  nome: "Adm",
  postoGrad: "Cb",
  secao: "X",
  perfil: "Administrador",
};
const gest: Usuario = {
  re: "3",
  nome: "Gest",
  postoGrad: "Sgt",
  secao: "X",
  perfil: "Gestor",
};

check(!canApproveScales(op), "Operador não deve aprovar");
check(!canApproveScales(adm), "Administrador não deve aprovar");
check(!!canApproveScales(gest), "Gestor deve aprovar");

const route = parseAppPath("/aprovacoes");
check(route.view === "pendencias", "parseAppPath(/aprovacoes) → pendencias");
check(
  buildAppPath({ view: "pendencias" }) === "/aprovacoes",
  "buildAppPath(pendencias) → /aprovacoes"
);

clearPendenciasAvisoDismiss();
check(!wasPendenciasAvisoDismissed(), "sem dismiss inicial");
dismissPendenciasAviso();
check(wasPendenciasAvisoDismissed(), "dismiss na sessão");
clearPendenciasAvisoDismiss();
check(!wasPendenciasAvisoDismissed(), "clear dismiss");

const emptyOp = await loadPendingApprovalsForGestor(op);
const emptyAdm = await loadPendingApprovalsForGestor(adm);
check(emptyOp.total === 0, "Operador: total 0 sem consulta efetiva");
check(emptyAdm.total === 0, "Admin: total 0 sem consulta efetiva");

console.log("SMOKE OK: rbac + rota + dismiss + empty non-gestor");
