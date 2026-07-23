import React, { useCallback, useEffect, useState } from "react";
import { seedDatabaseIfEmpty } from "./utils/seedData";
import { TipoEscalaDocumento, Usuario } from "./types";
import { WeekInfo } from "./utils/dateUtils";
import { canAccessConfig, canApproveScales } from "./utils/permissions";
import { auditAuth } from "./utils/auditService";
import { resolveActiveApprovalToken } from "./utils/approvalService";
import {
  AppRoute,
  commitAppPath,
  parseAppPath,
  resolveWeekFromRoute,
} from "./utils/appNavigation";
import {
  AuthPhase,
  clearSession,
  readSession,
  restoreSession,
  toSessionUser,
  writeSession,
} from "./utils/sessionService";
import Login from "./components/Login";
import WeekSelector from "./components/WeekSelector";
import ScheduleEditor from "./components/ScheduleEditor";
import Configuracoes from "./components/Configuracoes";
import AprovacaoPage from "./components/AprovacaoPage";
import FrequenciaApp from "./components/frequencia/FrequenciaApp";
import PendenciasAprovacaoPage from "./components/PendenciasAprovacaoPage";

const APPROVAL_RETURN_KEY = "aprovacao_return_view";

function routeFromLocation(): AppRoute {
  return parseAppPath(window.location.pathname);
}

function SessionLoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-sm font-semibold text-gray-600">
        Restaurando sessão…
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Aguarde enquanto validamos seu acesso.
      </p>
    </div>
  );
}

export default function App() {
  const [authPhase, setAuthPhase] = useState<AuthPhase>(() =>
    readSession() ? "loading" : "unauthenticated"
  );
  const [usuario, setUsuario] = useState<Usuario | null>(() => readSession());

  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation());
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const r = routeFromLocation();
    if (r.view === "editor" || r.view === "frequencia") return r.year;
    return 2026;
  });
  const [selectedWeek, setSelectedWeek] = useState<WeekInfo | null>(() => {
    const r = routeFromLocation();
    if (r.view === "editor") {
      return resolveWeekFromRoute(r.year, r.weekId);
    }
    return null;
  });

  useEffect(() => {
    seedDatabaseIfEmpty();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await restoreSession();
      if (cancelled) return;
      setUsuario(result.usuario);
      setAuthPhase(result.phase);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyRoute = useCallback((next: AppRoute) => {
    setRoute(next);
    if (next.view === "editor") {
      setSelectedYear(next.year);
      setSelectedWeek(resolveWeekFromRoute(next.year, next.weekId));
    } else if (next.view === "frequencia") {
      setSelectedYear(next.year);
    }
  }, []);

  const navigate = useCallback(
    (next: AppRoute, mode: "push" | "replace" = "push") => {
      commitAppPath(next, mode);
      applyRoute(next);
    },
    [applyRoute]
  );

  useEffect(() => {
    const onPopState = () => {
      applyRoute(routeFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyRoute]);

  useEffect(() => {
    if (authPhase !== "authenticated") return;
    if (route.view === "editor" && !selectedWeek) {
      navigate({ view: "selector" }, "replace");
      return;
    }
    if (route.view === "config" && usuario && !canAccessConfig(usuario)) {
      navigate({ view: "selector" }, "replace");
      return;
    }
    if (route.view === "pendencias" && usuario && !canApproveScales(usuario)) {
      navigate({ view: "selector" }, "replace");
      return;
    }
    if (route.view === "aprovacao") {
      const hasTarget =
        (route.mode === "token" && Boolean(route.token)) ||
        (route.mode === "legacy" && Boolean(route.escalaId));
      if (!hasTarget) {
        navigate({ view: "selector" }, "replace");
      }
    }
  }, [authPhase, route, selectedWeek, usuario, navigate]);

  const goHome = useCallback(() => {
    navigate({ view: "selector" });
  }, [navigate]);

  const openApproval = async (
    escalaIdOrToken: string,
    tipo: TipoEscalaDocumento = "semanal",
    returnTo: "home" | "pendencias" = "home"
  ) => {
    let token = escalaIdOrToken.trim();
    if (/^\d{4}_\d{1,2}$/.test(token) || /^\d{4}_\d{1,2}_.+/.test(token)) {
      const resolved = await resolveActiveApprovalToken(token, tipo);
      if (!resolved) {
        alert("Não há solicitação ativa com link para este documento.");
        return;
      }
      token = resolved;
    }
    try {
      sessionStorage.setItem(APPROVAL_RETURN_KEY, returnTo);
    } catch {
      /* ignore */
    }
    navigate({ view: "aprovacao", mode: "token", token });
  };

  const handleApprovalBack = () => {
    let ret: string | null = null;
    try {
      ret = sessionStorage.getItem(APPROVAL_RETURN_KEY);
      sessionStorage.removeItem(APPROVAL_RETURN_KEY);
    } catch {
      /* ignore */
    }
    if (ret === "pendencias" && canApproveScales(usuario)) {
      navigate({ view: "pendencias" });
    } else {
      goHome();
    }
  };

  const handleLoginSuccess = (user: Usuario) => {
    const sessionUser = toSessionUser(user);
    writeSession(sessionUser);
    setUsuario(sessionUser);
    setAuthPhase("authenticated");
    void auditAuth("LOGIN", sessionUser).catch((err) =>
      console.warn("Falha ao registrar login na auditoria:", err)
    );
    navigate(routeFromLocation(), "replace");
  };

  const handleLogout = () => {
    if (usuario) {
      void auditAuth("LOGOUT", usuario).catch((err) =>
        console.warn("Falha ao registrar logout na auditoria:", err)
      );
    }
    clearSession();
    setUsuario(null);
    setAuthPhase("unauthenticated");
    const pending = routeFromLocation();
    if (pending.view !== "aprovacao") {
      commitAppPath({ view: "selector" }, "replace");
      setRoute({ view: "selector" });
    }
  };

  const handleSelectWeek = (year: number, week: WeekInfo) => {
    setSelectedYear(year);
    setSelectedWeek(week);
    navigate({ view: "editor", year, weekId: week.id });
  };

  if (authPhase === "loading") {
    return <SessionLoadingScreen />;
  }

  if (authPhase === "unauthenticated" || !usuario) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (route.view === "aprovacao") {
    const token = route.mode === "token" ? route.token : null;
    const escalaId = route.mode === "legacy" ? route.escalaId : null;
    const tipo = route.mode === "legacy" ? route.tipo : "semanal";
    if (!token && !escalaId) {
      return <SessionLoadingScreen />;
    }
    return (
      <AprovacaoPage
        token={token}
        escalaId={escalaId}
        tipo={tipo}
        usuario={usuario}
        onBack={handleApprovalBack}
        onLogout={handleLogout}
      />
    );
  }

  if (route.view === "pendencias") {
    if (!canApproveScales(usuario)) {
      return <SessionLoadingScreen />;
    }
    return (
      <PendenciasAprovacaoPage
        usuario={usuario}
        onBack={goHome}
        onOpenApproval={(tok, tipo) => {
          void openApproval(tok, tipo || "semanal", "pendencias");
        }}
      />
    );
  }

  if (route.view === "editor") {
    if (!selectedWeek) {
      return <SessionLoadingScreen />;
    }
    return (
      <ScheduleEditor
        usuario={usuario}
        year={selectedYear}
        week={selectedWeek}
        onBack={goHome}
        onLogout={handleLogout}
        onOpenConfig={() => navigate({ view: "config" })}
        onOpenApproval={openApproval}
      />
    );
  }

  if (route.view === "config") {
    if (!canAccessConfig(usuario)) {
      return <SessionLoadingScreen />;
    }
    return <Configuracoes usuario={usuario} onBack={goHome} />;
  }

  if (route.view === "frequencia") {
    return (
      <FrequenciaApp
        usuario={usuario}
        year={route.year}
        month={route.month ?? null}
        secao={route.secao ?? null}
        onBack={goHome}
        onOpenApproval={openApproval}
        onNavigateFrequencia={(next) => {
          navigate({
            view: "frequencia",
            year: next.year,
            month: next.month,
            secao: next.secao,
          });
        }}
      />
    );
  }

  return (
    <WeekSelector
      usuario={usuario}
      initialYear={selectedYear}
      onSelectWeek={handleSelectWeek}
      onLogout={handleLogout}
      onOpenConfig={() => navigate({ view: "config" })}
      onOpenApproval={openApproval}
      onOpenPendencias={() => navigate({ view: "pendencias" })}
      onOpenFrequencia={(year) => {
        setSelectedYear(year);
        navigate({ view: "frequencia", year });
      }}
    />
  );
}
