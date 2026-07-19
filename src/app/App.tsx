import { useLayoutEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { ExperienceController } from "@/accessibility/ExperienceController";
import { CreateRoomPage } from "@/pages/CreateRoomPage";
import { GamePage } from "@/pages/GamePage";
import { HistoryPage } from "@/pages/HistoryPage";
import { JoinRoomPage } from "@/pages/JoinRoomPage";
import { LandingPage } from "@/pages/LandingPage";
import { LobbyPage } from "@/pages/LobbyPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RulesPage } from "@/pages/RulesPage";
import { SettingsPage } from "@/pages/SettingsPage";

function RouteScrollReset() {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ExperienceController />
      <RouteScrollReset />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/criar" element={<CreateRoomPage />} />
        <Route path="/entrar" element={<JoinRoomPage />} />
        <Route path="/sala/:code" element={<LobbyPage />} />
        <Route path="/jogo/:gameId" element={<GamePage />} />
        <Route path="/historico" element={<HistoryPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="/regras" element={<RulesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
