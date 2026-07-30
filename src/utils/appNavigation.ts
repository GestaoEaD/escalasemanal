/**
 * Navegação global via URL (history API) — fonte de verdade das telas.
 * Mantém compatibilidade com /aprovacao/{token} e rotas legadas.
 */
import { TipoEscalaDocumento } from "../types";
import { getWeeksForYear, WeekInfo } from "./dateUtils";
import { parseApprovalPath } from "./approvalService";
import { buildTokenApprovalPath } from "./solicitacaoAprovacaoService";

export type AppView =
  | "divisoes"
  | "selector"
  | "secao"
  | "editor"
  | "config"
  | "aprovacao"
  | "frequencia"
  | "pendencias";

export type AppRoute =
  | { view: "divisoes" }
  | { view: "selector" }
  | { view: "secao"; secaoId: string }
  | { view: "editor"; year: number; weekId: string; secaoId?: string }
  | { view: "config" }
  | { view: "pendencias" }
  | {
      view: "frequencia";
      year: number;
      month?: number;
      secaoId?: string;
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
    case "divisoes":
      return "/divisoes";
    case "selector":
      return "/";
    case "secao":
      return `/secao/${encodeURIComponent(route.secaoId)}`;
    case "editor":
      if (route.secaoId) {
        return `/secao/${encodeURIComponent(route.secaoId)}/semana/${route.year}/${encodeURIComponent(
          route.weekId
        )}`;
      }
      return `/semana/${route.year}/${encodeURIComponent(route.weekId)}`;
    case "config":
      return "/config";
    case "pendencias":
      return "/aprovacoes";
    case "frequencia": {
      // Canônico: /frequencia/{ano} → /frequencia/{ano}/secao/{secaoId} → /frequencia/{ano}/secao/{secaoId}/{mês}
      let path = `/frequencia/${route.year}`;
      if (route.secaoId) {
        path += `/secao/${encodeURIComponent(route.secaoId)}`;
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

  if (/^\/divisoes\/?$/i.test(path)) {
    return { view: "divisoes" };
  }

  if (path === "/" || path === "") {
    return { view: "selector" };
  }

  const secaoSemana = path.match(
    /^\/secao\/([^/]+)\/semana\/(\d{4})\/([^/]+)\/?$/i
  );
  if (secaoSemana) {
    return {
      view: "editor",
      secaoId: decodeURIComponent(secaoSemana[1]),
      year: Number(secaoSemana[2]),
      weekId: decodeURIComponent(secaoSemana[3]),
    };
  }

  const secao = path.match(/^\/secao\/([^/]+)\/?$/i);
  if (secao) {
    return {
      view: "secao",
      secaoId: decodeURIComponent(secao[1]),
    };
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

  // Canônico: /frequencia/{ano}/secao/{secaoId}/{mês}
  const freqSecaoMonth = path.match(
    /^\/frequencia\/(\d{4})\/secao\/([^/]+)\/(\d{1,2})\/?$/i
  );
  if (freqSecaoMonth) {
    return {
      view: "frequencia",
      year: Number(freqSecaoMonth[1]),
      secaoId: decodeURIComponent(freqSecaoMonth[2]),
      month: Number(freqSecaoMonth[3]),
    };
  }

  // Canônico: /frequencia/{ano}/secao/{secaoId}
  const freqSecaoOnly = path.match(/^\/frequencia\/(\d{4})\/secao\/([^/]+)\/?$/i);
  if (freqSecaoOnly) {
    return {
      view: "frequencia",
      year: Number(freqSecaoOnly[1]),
      secaoId: decodeURIComponent(freqSecaoOnly[2]),
    };
  }

  // Legado: /frequencia/{ano}/{mês}/secao/{secaoId}
  const freqLegacyMonthSecao = path.match(
    /^\/frequencia\/(\d{4})\/(\d{1,2})\/secao\/([^/]+)\/?$/i
  );
  if (freqLegacyMonthSecao) {
    return {
      view: "frequencia",
      year: Number(freqLegacyMonthSecao[1]),
      month: Number(freqLegacyMonthSecao[2]),
      secaoId: decodeURIComponent(freqLegacyMonthSecao[3]),
    };
  }

  // Legado: /frequencia/{ano}/{mês} — sem seção; o app redireciona para a lista de seções
  const freqMonthOnly = path.match(/^\/frequencia\/(\d{4})\/(\d{1,2})\/?$/i);
  if (freqMonthOnly) {
    return {
      view: "frequencia",
      year: Number(freqMonthOnly[1]),
    };
  }

  // Legado: /frequencia/{ano}/{mês}/{secao}
  const freqLegacyMonthFirst = path.match(
    /^\/frequencia\/(\d{4})\/(\d{1,2})\/([^/]+)\/?$/i
  );
  if (freqLegacyMonthFirst) {
    return {
      view: "frequencia",
      year: Number(freqLegacyMonthFirst[1]),
      month: Number(freqLegacyMonthFirst[2]),
      secaoId: decodeURIComponent(freqLegacyMonthFirst[3]),
    };
  }

  // Legado: /frequencia/{ano}/{secao}/{mês} — se o 2º segmento não for mês puro
  const freqLegacyMonthLast = path.match(
    /^\/frequencia\/(\d{4})\/([^/]+)\/(\d{1,2})\/?$/i
  );
  if (freqLegacyMonthLast && !/^\d{1,2}$/.test(freqLegacyMonthLast[2])) {
    return {
      view: "frequencia",
      year: Number(freqLegacyMonthLast[1]),
      secaoId: decodeURIComponent(freqLegacyMonthLast[2]),
      month: Number(freqLegacyMonthLast[3]),
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
