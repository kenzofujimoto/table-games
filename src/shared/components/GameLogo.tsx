import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

export function GameLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="game-logo" to="/" aria-label="Auren — início">
      <span className="game-logo__mark"><Compass aria-hidden="true" /></span>
      <span>
        <strong>AUREN</strong>
        {!compact && <small>ROTAS DO HORIZONTE</small>}
      </span>
    </Link>
  );
}
