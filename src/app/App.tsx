import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

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

export function App() {
  return (
    <BrowserRouter>
      <ExperienceController />
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
