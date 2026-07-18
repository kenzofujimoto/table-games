import { Clock3, History, MapPinned, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { useAppStore } from "@/app/store";
import { AppShell } from "@/shared/components/AppShell";

export function HistoryPage() {
  const game = useAppStore((state) => state.game);
  return (
    <AppShell><main className="content-page"><header className="page-heading"><div className="eyebrow"><History size={14} /> REGISTRO</div><h1>Histórico de expedições</h1><p>Retome sua mesa ou consulte jornadas concluídas.</p></header>
      {game ? <article className="history-card"><div className="history-card__icon"><MapPinned /></div><div><span className="status-pill">EM ANDAMENTO</span><h2>Sala {game.roomCode}</h2><p><Clock3 /> Turno {game.turnNumber} · Seed {game.seed}</p></div><Link className="button button--primary" to={`/jogo/${game.id}`}>Reconectar</Link></article>
        : <div className="empty-state"><Trophy /><h2>Nenhuma jornada registrada</h2><p>Sua primeira ilha está esperando.</p><Link className="button button--primary" to="/perfil?next=/criar">Criar partida</Link></div>}
    </main></AppShell>
  );
}
