import React, { useCallback, useEffect, useState } from "react";
import { seedDatabaseIfEmpty } from "./utils/seedData";
import { Divisao, TipoEscalaDocumento, Usuario } from "./types";
import { WeekInfo } from "./utils/dateUtils";
import { canAccessConfig, canApproveScales } from "./utils/permissions";
import { auditAuth } from "./utils/auditService";
import { upsertAuthIndex } from "./utils/authIndex";
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
  restoreSession,
  setActiveDivisaoInSession,
  setActiveSecaoInSession,
  toSessionUser,
  writeSession,
} from "./utils/sessionService";
import { signOutGoogle } from "./utils/googleAuthService";
import { markUsuarioGoogleLogin } from "./utils/usuarioHelpers";
import { resolveActiveDivisaoId } from "./utils/divisaoContext";
import {
  canAccessSecao,
  canAccessSecaoFrequenciaCtx,
  resolveActiveSecaoId,
} from "./utils/secaoContext";
import { loadSecaoById } from "./utils/secaoCodigo";
import Login from "./components/Login";
import DivisaoSelector from "./components/DivisaoSelector";
import WeekSelector from "./components/WeekSelector";
import ScheduleEditor from "./components/ScheduleEditor";
import Configuracoes from "./components/Configuracoes";
import AprovacaoPage from "./components/AprovacaoPage";
import FrequenciaApp from "./components/frequencia/FrequenciaApp";
import PendenciasAprovacaoPage from "./components/PendenciasAprovacaoPage";
import AppShell from "./components/AppShell";

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

function needsDivisaoSelection(usuario: Usuario, route: AppRoute): boolean {
  if (route.view === "aprovacao") return false;
  // Gerente (e Admin) precisa abrir Configurações sem Divisão ativa —
  // é o único jeito de cadastrar a primeira Divisão.
  if (route.view === "config" || route.view === "pendencias") return false;
  if (route.view === "divisoes") return true;
  const active = String(usuario.activeDivisaoId || "").trim();
  return !active;
}

export default function App() {
  const [authPhase, setAuthPhase] = useState<AuthPhase>("loading");
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [divisaoLabel, setDivisaoLabel] = useState<string>("");
  const [secaoLabel, setSecaoLabel] = useState<string>("");

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
    if (import.meta.env.DEV) {
      seedDatabaseIfEmpty();
    }
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

  // Após auth: se não há Divisão ativa, força /divisoes (exceto aprovação/config)
  useEffect(() => {
    if (authPhase !== "authenticated" || !usuario) return;
    if (route.view === "aprovacao" || route.view === "config" || route.view === "pendencias") {
      return;
    }
    if (needsDivisaoSelection(usuario, route) && route.view !== "divisoes") {
      navigate({ view: "divisoes" }, "replace");
    }
  }, [authPhase, usuario, route, navigate]);

  useEffect(() => {
    if (authPhase !== "authenticated" || !usuario) return;
    if (route.view === "aprovacao" || route.view === "divisoes") return;
    if (route.view === "config" && !canAccessConfig(usuario)) {
      navigate({ view: "selector" }, "replace");
      return;
    }
    if (route.view === "pendencias" && !canApproveScales(usuario)) {
      navigate({ view: "selector" }, "replace");
      return;
    }
    if (route.view === "editor") {
      // Escala por Divisão — secaoId na rota é opcional/legado.
      if (!selectedWeek) {
        navigate({ view: "selector" }, "replace");
      }
      return;
    } else if (route.view === "secao") {
      if (!canAccessSecao(usuario, route.secaoId, resolveActiveDivisaoId(usuario))) {
        navigate({ view: "selector" }, "replace");
        return;
      }
      if (String(usuario.activeSecaoId || "").trim() !== route.secaoId) {
        setUsuario(setActiveSecaoInSession(usuario, route.secaoId));
      }
    } else if (route.view === "frequencia") {
      const secaoId = String(route.secaoId || "").trim();
      if (
        secaoId &&
        !canAccessSecaoFrequenciaCtx(
          usuario,
          secaoId,
          resolveActiveDivisaoId(usuario)
        )
      ) {
        navigate({ view: "selector" }, "replace");
        return;
      }
    } else if (route.view === "aprovacao") {
      const hasTarget =
        (route.mode === "token" && Boolean(route.token)) ||
        (route.mode === "legacy" && Boolean(route.escalaId));
      if (!hasTarget) {
        navigate({ view: "selector" }, "replace");
      }
    }
  }, [authPhase, navigate, route, selectedWeek, usuario]);

  // Carrega rótulo da Divisão ativa
  useEffect(() => {
    if (!usuario?.activeDivisaoId) {
      setDivisaoLabel("");
      return;
    }
    const id = resolveActiveDivisaoId(usuario);
    let cancelled = false;
    (async () => {
      try {
        const { db, doc, getDoc } = await import("./firebase");
        const snap = await getDoc(doc(db, "divisoes", id));
        if (cancelled) return;
        if (snap.exists()) {
          const d = snap.data() as Divisao;
          setDivisaoLabel(`${d.nome || id} · ${d.codigo || id}`);
        } else {
          setDivisaoLabel(id);
        }
      } catch {
        if (!cancelled) setDivisaoLabel(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usuario?.activeDivisaoId, usuario?.divisaoId]);

  // Carrega rótulo da Seção ativa / selecionada.
  useEffect(() => {
    const secaoId =
      route.view === "secao" || route.view === "editor" || route.view === "frequencia"
        ? String(route.secaoId || "").trim()
        : String(usuario?.activeSecaoId || "").trim();

    if (!secaoId || !usuario?.activeDivisaoId) {
      setSecaoLabel("");
      return;
    }

    let cancelled = false;
    (async () => {
      const secao = await loadSecaoById(secaoId, resolveActiveDivisaoId(usuario));
      if (!cancelled) {
        setSecaoLabel(secao?.nome || secaoId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route.view, route.secaoId, usuario?.activeDivisaoId, usuario?.activeSecaoId, usuario]);

  const goHome = useCallback(() => {
    if (usuario && !usuario.activeDivisaoId) {
      navigate({ view: "divisoes" });
      return;
    }
    navigate({ view: "selector" });
  }, [navigate, usuario]);

  const goDivisoes = useCallback(() => {
    navigate({ view: "divisoes" });
  }, [navigate]);

  const handleSelectDivisao = useCallback(
    (divisao: Divisao) => {
      if (!usuario) return;
      const nextDiv = setActiveDivisaoInSession(usuario, divisao.codigo);
      const next = setActiveSecaoInSession(nextDiv, "");
      setUsuario(next);
      setSelectedWeek(null);
      setDivisaoLabel(`${divisao.nome} · ${divisao.codigo}`);
      setSecaoLabel("");
      navigate({ view: "selector" });
    },
    [usuario, navigate]
  );

  const openApproval = async (
    escalaIdOrToken: string,
    tipo: TipoEscalaDocumento = "semanal",
    returnTo: "home" | "pendencias" = "home"
  ) => {
    let token = escalaIdOrToken.trim();
    // Aceita IDs legados YYYY_WW e tenant PREFIX_YYYY_WW / CF
    if (
      /^\d{4}_\d{1,2}$/.test(token) ||
      /^\d{4}_\d{1,2}_.+/.test(token) ||
      /^.+_\d{4}_\d{1,2}$/.test(token) ||
      /^.+_\d{4}_\d{1,2}_.+/.test(token)
    ) {
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
    const sessionUser = toSessionUser({
      ...user,
      authProvider: "google",
      emailVerificado: true,
      // Força escolha de Divisão após login
      activeDivisaoId: "",
      activeSecaoId: "",
    });
    writeSession(sessionUser);
    setUsuario(sessionUser);
    setAuthPhase("authenticated");
    void upsertAuthIndex(sessionUser).catch((err) =>
      console.warn("Falha ao gravar auth_index:", err)
    );
    void markUsuarioGoogleLogin(sessionUser).catch((err) =>
      console.warn("Falha ao atualizar metadados de login Google:", err)
    );
    void auditAuth("LOGIN", sessionUser).catch((err) =>
      console.warn("Falha ao registrar login na auditoria:", err)
    );
    setSecaoLabel("");
    navigate({ view: "divisoes" }, "replace");
  };

  const handleLogout = () => {
    const leaving = usuario;
    if (leaving) {
      void auditAuth("LOGOUT", leaving).catch((err) =>
        console.warn("Falha ao registrar logout na auditoria:", err)
      );
    }
    clearSession();
    setUsuario(null);
    setAuthPhase("unauthenticated");
    void signOutGoogle();
    const pending = routeFromLocation();
    if (pending.view !== "aprovacao") {
      commitAppPath({ view: "divisoes" }, "replace");
      setRoute({ view: "divisoes" });
    }
  };

  const handleSelectWeek = (year: number, week: WeekInfo) => {
    setSelectedYear(year);
    setSelectedWeek(week);
    navigate({
      view: "editor",
      year,
      weekId: week.id,
    });
  };

  if (authPhase === "loading") {
    return <SessionLoadingScreen />;
  }

  if (authPhase === "unauthenticated" || !usuario) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  let page: React.ReactNode = null;
  const hideShellChrome = route.view === "divisoes";

  if (route.view === "aprovacao") {
    const token = route.mode === "token" ? route.token : null;
    const escalaId = route.mode === "legacy" ? route.escalaId : null;
    const tipo = route.mode === "legacy" ? route.tipo : "semanal";
    if (!token && !escalaId) {
      page = <SessionLoadingScreen />;
    } else {
      page = (
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
  } else if (route.view === "config") {
    if (!canAccessConfig(usuario)) {
      page = <SessionLoadingScreen />;
    } else {
      page = (
        <Configuracoes
          usuario={usuario}
          onBack={goHome}
          onUsuarioUpdate={setUsuario}
        />
      );
    }
  } else if (route.view === "divisoes" || needsDivisaoSelection(usuario, route)) {
    page = (
      <DivisaoSelector
        usuario={usuario}
        onSelectDivisao={handleSelectDivisao}
      />
    );
  } else if (route.view === "secao") {
    page = (
      <WeekSelector
        usuario={usuario}
        secaoId={route.secaoId}
        secaoLabel={secaoLabel}
        initialYear={selectedYear}
        onSelectWeek={handleSelectWeek}
        onLogout={handleLogout}
        onOpenConfig={() => navigate({ view: "config" })}
        onOpenApproval={openApproval}
        onOpenPendencias={() => navigate({ view: "pendencias" })}
        onOpenFrequencia={(year) => {
          setSelectedYear(year);
          navigate({
            view: "frequencia",
            year,
          });
        }}
      />
    );
  } else if (route.view === "pendencias") {
    if (!canApproveScales(usuario)) {
      page = <SessionLoadingScreen />;
    } else {
      page = (
        <PendenciasAprovacaoPage
          usuario={usuario}
          onBack={goHome}
          onOpenApproval={(tok, tipo) => {
            void openApproval(tok, tipo || "semanal", "pendencias");
          }}
        />
      );
    }
  } else if (route.view === "editor") {
    if (!selectedWeek) {
      page = <SessionLoadingScreen />;
    } else {
      page = (
        <ScheduleEditor
          usuario={usuario}
          year={selectedYear}
          week={selectedWeek}
          secaoId={String(route.secaoId || usuario.activeSecaoId || "").trim()}
          onBack={goHome}
          onLogout={handleLogout}
          onOpenConfig={() => navigate({ view: "config" })}
          onOpenApproval={openApproval}
        />
      );
    }
  } else if (route.view === "frequencia") {
    page = (
      <FrequenciaApp
        usuario={usuario}
        year={route.year}
        month={route.month ?? null}
        secaoId={route.secaoId || null}
        secao={route.secao || null}
        onBack={goHome}
        onOpenApproval={openApproval}
        onNavigateFrequencia={(next) => {
          navigate({
            view: "frequencia",
            year: next.year,
            month: next.month,
            secaoId: next.secaoId,
            secao: next.secao,
          });
        }}
      />
    );
  } else {
    page = (
      <WeekSelector
        usuario={usuario}
        secaoId={String(usuario.activeSecaoId || "").trim() || undefined}
        secaoLabel={secaoLabel || divisaoLabel}
        initialYear={selectedYear}
        onSelectWeek={handleSelectWeek}
        onLogout={handleLogout}
        onOpenConfig={() => navigate({ view: "config" })}
        onOpenApproval={openApproval}
        onOpenPendencias={() => navigate({ view: "pendencias" })}
        onOpenFrequencia={(year) => {
          setSelectedYear(year);
          navigate({
            view: "frequencia",
            year,
          });
        }}
      />
    );
  }

  return (
    <AppShell
      usuario={usuario}
      divisaoLabel={hideShellChrome ? undefined : divisaoLabel}
      onHome={hideShellChrome ? goDivisoes : goHome}
      onTrocarDivisao={hideShellChrome ? undefined : goDivisoes}
      onLogout={handleLogout}
      onOpenConfig={() => navigate({ view: "config" })}
      onOpenPendencias={
        hideShellChrome || !canApproveScales(usuario)
          ? undefined
          : () => navigate({ view: "pendencias" })
      }
      hidePendenciasBtn={route.view === "pendencias" || hideShellChrome}
      hideConfigBtn={route.view === "config"}
    >
      {page}
    </AppShell>
  );
}
