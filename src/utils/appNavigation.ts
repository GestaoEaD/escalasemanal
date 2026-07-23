/**
 * Navegação global via URL (history API) — fonte de verdade das telas.
 * Mantém compatibilidade com /aprovacao/{token} e rotas legadas.
 */
import { TipoEscalaDocumento } from "../types";
import { getWeeksForYear, WeekInfo } from "./dateUtils";
import { parseApprovalPath } from "./approvalService";
import { buildTokenApprovalPath } from "./solicitacaoAprovacaoService";

export type AppView =
  | "selector"
  | "editor"
  | "config"
  | "aprovacao"
  | "frequencia"
  | "pendencias";

export type AppRoute =
  | { view: "selector" }
  | { view: "editor"; year: number; weekId: string }
  | { view: "config" }
  | { view: "pendencias" }
  | {
      view: "frequencia";
      year: number;
      month?: number;
      secao?: string;
    }
  | {
      view: "aprovacao";
      mode: "token";
      token: string;
    }
  | {
      view: "aprovacao";
      mode: "legacy";
      escalaId: string;
      tipo: TipoEscalaDocumento;
    };

export function buildAppPath(route: AppRoute): string {
  switch (route.view) {
    case "selector":
      return "/";
    case "editor":
      return `/semana/${route.year}/${encodeURIComponent(route.weekId)}`;
    case "config":
      return "/config";
    case "pendencias":
      return "/aprovacoes";
    case "frequencia": {
      let path = `/frequencia/${route.year}`;
      if (route.secao) {
        path += `/${encodeURIComponent(route.secao)}`;
        if (route.month != null) {
          path += `/${String(route.month).padStart(2, "0")}`;
        }
      }
      return path;
    }
    case "aprovacao":
      if (route.mode === "token") {
        return buildTokenApprovalPath(route.token);
      }
      return `/aprovacao/${route.tipo}/${encodeURIComponent(route.escalaId)}`;
    default:
      return "/";
  }
}

export function parseAppPath(pathname: string): AppRoute {
  const approval = parseApprovalPath(pathname);
  if (approval?.mode === "token") {
    return { view: "aprovacao", mode: "token", token: approval.token };
  }
  if (approval?.mode === "legacy") {
    return {
      view: "aprovacao",
      mode: "legacy",
      escalaId: approval.escalaId,
      tipo: approval.tipo,
    };
  }

  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/" || path === "") {
    return { view: "selector" };
  }

  const semana = path.match(/^\/semana\/(\d{4})\/([^/]+)\/?$/i);
  if (semana) {
    return {
      view: "editor",
      year: Number(semana[1]),
      weekId: decodeURIComponent(semana[2]),
    };
  }

  if (/^\/config\/?$/i.test(path)) {
    return { view: "config" };
  }

  if (/^\/aprovacoes\/?$/i.test(path)) {
    return { view: "pendencias" };
  }

  // Novo fluxo: /frequencia/{ano}/{secao}/{mês}
  const freqFull = path.match(
    /^\/frequencia\/(\d{4})\/([^/]+)\/(\d{1,2})\/?$/i
  );
  if (freqFull) {
    return {
      view: "frequencia",
      year: Number(freqFull[1]),
      secao: decodeURIComponent(freqFull[2]),
      month: Number(freqFull[3]),
    };
  }

  // Legado: /frequencia/{ano}/{mês}/{secao}
  const freqLegacy = path.match(
    /^\/frequencia\/(\d{4})\/(\d{1,2})\/([^/]+)\/?$/i
  );
  if (freqLegacy) {
    return {
      view: "frequencia",
      year: Number(freqLegacy[1]),
      month: Number(freqLegacy[2]),
      secao: decodeURIComponent(freqLegacy[3]),
    };
  }

  // /frequencia/{ano}/{secao} — seletor de meses
  const freqSecao = path.match(/^\/frequencia\/(\d{4})\/([^/]+)\/?$/i);
  if (freqSecao) {
    return {
      view: "frequencia",
      year: Number(freqSecao[1]),
      secao: decodeURIComponent(freqSecao[2]),
    };
  }

  const freqYear = path.match(/^\/frequencia\/(\d{4})\/?$/i);
  if (freqYear) {
    return { view: "frequencia", year: Number(freqYear[1]) };
  }

  // Fallback seguro
  return { view: "selector" };
}

export function resolveWeekFromRoute(
  year: number,
  weekId: string
): WeekInfo | null {
  const weeks = getWeeksForYear(year);
  return weeks.find((w) => w.id === weekId) || null;
}

/** Aplica rota no history sem perder entradas (push) ou substituindo (replace). */
export function commitAppPath(
  route: AppRoute,
  mode: "push" | "replace" = "push"
): void {
  const next = buildAppPath(route);
  const current = window.location.pathname + window.location.search;
  if (current === next || current === next + "/") {
    if (mode === "replace") {
      window.history.replaceState({ appRoute: true }, "", next);
    }
    return;
  }
  if (mode === "replace") {
    window.history.replaceState({ appRoute: true }, "", next);
  } else {
    window.history.pushState({ appRoute: true }, "", next);
  }
}
