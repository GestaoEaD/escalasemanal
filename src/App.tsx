import React, { useState, useEffect } from "react";
import { seedDatabaseIfEmpty } from "./utils/seedData";
import { TipoEscalaDocumento, Usuario } from "./types";
import { WeekInfo } from "./utils/dateUtils";
import { canAccessConfig } from "./utils/permissions";
import { auditAuth } from "./utils/auditService";
import { parseApprovalPath } from "./utils/approvalService";
import Login from "./components/Login";
import WeekSelector from "./components/WeekSelector";
import ScheduleEditor from "./components/ScheduleEditor";
import Configuracoes from "./components/Configuracoes";
import AprovacaoPage from "./components/AprovacaoPage";

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const saved = localStorage.getItem("escala_sessao_usuario");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const initialApproval = parseApprovalPath(window.location.pathname);

  const [currentView, setCurrentView] = useState<"selector" | "editor" | "config" | "aprovacao">(
    () => (initialApproval ? "aprovacao" : "selector")
  );
  const [approvalEscalaId, setApprovalEscalaId] = useState<string | null>(
    () => initialApproval?.escalaId ?? null
  );
  const [approvalTipo, setApprovalTipo] = useState<TipoEscalaDocumento>(
    () => initialApproval?.tipo ?? "semanal"
  );
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedWeek, setSelectedWeek] = useState<WeekInfo | null>(null);

  useEffect(() => {
    seedDatabaseIfEmpty();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseApprovalPath(window.location.pathname);
      if (parsed) {
        setApprovalEscalaId(parsed.escalaId);
        setApprovalTipo(parsed.tipo);
        setCurrentView("aprovacao");
      } else if (currentView === "aprovacao") {
        setApprovalEscalaId(null);
        setCurrentView("selector");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [currentView]);

  const navigateHome = () => {
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
    setApprovalEscalaId(null);
    setCurrentView("selector");
  };

  const openApproval = (escalaId: string, tipo: TipoEscalaDocumento = "semanal") => {
    const path = `/aprovacao/${tipo}/${encodeURIComponent(escalaId)}`;
    window.history.pushState({}, "", path);
    setApprovalEscalaId(escalaId);
    setApprovalTipo(tipo);
    setCurrentView("aprovacao");
  };

  const handleLoginSuccess = (user: Usuario) => {
    const sessionUser: Usuario = {
      uid: user.uid || user.re,
      re: user.re,
      nome: user.nome,
      nomeCompleto: user.nomeCompleto,
      postoGrad: user.postoGrad,
      secao: user.secao,
      perfil: user.perfil,
      ativo: user.ativo,
    };
    setUsuario(sessionUser);
    localStorage.setItem("escala_sessao_usuario", JSON.stringify(sessionUser));
    void auditAuth("LOGIN", sessionUser).catch((err) =>
      console.warn("Falha ao registrar login na auditoria:", err)
    );
    const pending = parseApprovalPath(window.location.pathname);
    if (pending) {
      setApprovalEscalaId(pending.escalaId);
      setApprovalTipo(pending.tipo);
      setCurrentView("aprovacao");
    } else {
      setCurrentView("selector");
    }
  };

  const handleLogout = () => {
    if (usuario) {
      void auditAuth("LOGOUT", usuario).catch((err) =>
        console.warn("Falha ao registrar logout na auditoria:", err)
      );
    }
    setUsuario(null);
    localStorage.removeItem("escala_sessao_usuario");
    if (!parseApprovalPath(window.location.pathname)) {
      setCurrentView("selector");
    }
  };

  const handleSelectWeek = (year: number, week: WeekInfo) => {
    setSelectedYear(year);
    setSelectedWeek(week);
    setCurrentView("editor");
  };

  if (!usuario) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentView === "aprovacao" && approvalEscalaId) {
    return (
      <AprovacaoPage
        escalaId={approvalEscalaId}
        tipo={approvalTipo}
        usuario={usuario}
        onBack={navigateHome}
        onLogout={handleLogout}
      />
    );
  }

  switch (currentView) {
    case "editor":
      if (!selectedWeek) {
        setCurrentView("selector");
        return null;
      }
      return (
        <ScheduleEditor
          usuario={usuario}
          year={selectedYear}
          week={selectedWeek}
          onBack={() => setCurrentView("selector")}
          onLogout={handleLogout}
          onOpenConfig={() => setCurrentView("config")}
          onOpenApproval={openApproval}
        />
      );

    case "config":
      if (!canAccessConfig(usuario)) {
        setCurrentView("selector");
        return null;
      }
      return (
        <Configuracoes
          usuario={usuario}
          onBack={() => setCurrentView("selector")}
        />
      );

    case "selector":
    default:
      return (
        <WeekSelector
          usuario={usuario}
          onSelectWeek={handleSelectWeek}
          onLogout={handleLogout}
          onOpenConfig={() => setCurrentView("config")}
          onOpenApproval={openApproval}
        />
      );
  }
}
