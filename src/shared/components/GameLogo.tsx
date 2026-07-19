import { Link } from "react-router-dom";

export function GameLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="game-logo" to="/" aria-label="Table Games — início">
      <img className="game-logo__mark" src="/brand/table-games-mark.svg" alt="Símbolo Table Games" />
      <span>
        <strong>TABLE GAMES</strong>
        {!compact && <small>JOGUE JUNTO</small>}
      </span>
    </Link>
  );
}
