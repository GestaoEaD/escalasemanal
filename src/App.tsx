import React, { useState, useEffect } from "react";
import { seedDatabaseIfEmpty } from "./utils/seedData";
import { Usuario } from "./types";
import { WeekInfo } from "./utils/dateUtils";
import { canAccessConfig } from "./utils/permissions";
import Login from "./components/Login";
import WeekSelector from "./components/WeekSelector";
import ScheduleEditor from "./components/ScheduleEditor";
import Configuracoes from "./components/Configuracoes";
import AprovacaoPage from "./components/AprovacaoPage";

function parseApprovalPath(pathname: string): string | null {
  const match = pathname.match(/^\/aprovacao\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

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

  const [currentView, setCurrentView] = useState<"selector" | "editor" | "config" | "aprovacao">(
    () => (parseApprovalPath(window.location.pathname) ? "aprovacao" : "selector")
  );
  const [approvalEscalaId, setApprovalEscalaId] = useState<string | null>(() =>
    parseApprovalPath(window.location.pathname)
  );
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedWeek, setSelectedWeek] = useState<WeekInfo | null>(null);

  useEffect(() => {
    seedDatabaseIfEmpty();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const id = parseApprovalPath(window.location.pathname);
      if (id) {
        setApprovalEscalaId(id);
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

  const openApproval = (escalaId: string) => {
    const path = `/aprovacao/${encodeURIComponent(escalaId)}`;
    window.history.pushState({}, "", path);
    setApprovalEscalaId(escalaId);
    setCurrentView("aprovacao");
  };

  const handleLoginSuccess = (user: Usuario) => {
    setUsuario(user);
    localStorage.setItem("escala_sessao_usuario", JSON.stringify(user));
    const pending = parseApprovalPath(window.location.pathname);
    if (pending) {
      setApprovalEscalaId(pending);
      setCurrentView("aprovacao");
    } else {
      setCurrentView("selector");
    }
  };

  const handleLogout = () => {
    setUsuario(null);
    localStorage.removeItem("escala_sessao_usuario");
    // Mantém a URL de aprovação para retornar após novo login
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
