import React, { useState, useEffect } from "react";
import { seedDatabaseIfEmpty } from "./utils/seedData";
import { Usuario } from "./types";
import { WeekInfo } from "./utils/dateUtils";
import Login from "./components/Login";
import WeekSelector from "./components/WeekSelector";
import ScheduleEditor from "./components/ScheduleEditor";
import Configuracoes from "./components/Configuracoes";

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    // Attempt local storage session recovery
    const saved = localStorage.getItem("escala_sessao_usuario");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [currentView, setCurrentView] = useState<"selector" | "editor" | "config">("selector");
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedWeek, setSelectedWeek] = useState<WeekInfo | null>(null);

  // Initialize and seed database if empty
  useEffect(() => {
    seedDatabaseIfEmpty();
  }, []);

  const handleLoginSuccess = (user: Usuario) => {
    setUsuario(user);
    localStorage.setItem("escala_sessao_usuario", JSON.stringify(user));
    setCurrentView("selector");
  };

  const handleLogout = () => {
    setUsuario(null);
    localStorage.removeItem("escala_sessao_usuario");
    setCurrentView("selector");
  };

  const handleSelectWeek = (year: number, week: WeekInfo) => {
    setSelectedYear(year);
    setSelectedWeek(week);
    setCurrentView("editor");
  };

  // Login view guard
  if (!usuario) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // View Routing Router
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
        />
      );

    case "config":
      if (usuario.perfil !== "Administrador") {
        setCurrentView("selector");
        return null;
      }
      return (
        <Configuracoes
          usuario={usuario}
          onBack={() => {
            setCurrentView("selector");
          }}
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
        />
      );
  }
}
