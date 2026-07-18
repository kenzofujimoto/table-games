import { BookOpen, History, Settings } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Link } from "react-router-dom";

import { GameLogo } from "./GameLogo";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <GameLogo />
        <nav aria-label="Navegação principal">
          <Link to="/historico"><History aria-hidden="true" /> Histórico</Link>
          <Link to="/regras"><BookOpen aria-hidden="true" /> Regras</Link>
          <Link to="/configuracoes"><Settings aria-hidden="true" /> Ajustes</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
