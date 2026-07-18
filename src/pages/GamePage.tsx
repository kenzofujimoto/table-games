import { ArrowRightLeft, BookOpenCheck, Building2, ChevronRight, Clock3, Crown, Dices, Flag, Home, MapPin, Radio, Route, Settings, ShieldAlert, Sparkles, Trophy, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { repository, useAppStore } from "@/app/store";
import type { GameCommand, GameState } from "@/game/application/game-engine";
import { calculateScore } from "@/game/domain/scoring";
import { validRoadEdges, validSettlementVertices } from "@/game/domain/placement";
import { RESOURCE_TYPES } from "@/game/domain/types";
import { DevelopmentModal, DiscardModal, TradeModal } from "@/game/ui/GameModals";
import { HexBoard } from "@/game/ui/HexBoard";
import { ResourceToken } from "@/game/ui/ResourceToken";
import { GameLogo } from "@/shared/components/GameLogo";

type BuildMode = "road" | "settlement" | "city" | null;

const phaseLabels = {
  setupSettlement: "Posicione uma aldeia",
  setupRoad: "Conecte uma estrada",
  roll: "Lance os dados",
  discard: "Descarte recursos",
  robber: "Mova o andarilho",
  actions: "Negocie e construa",
  finished: "Expedição concluída",
};

function totalCards(state: GameState, playerId: string): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return player ? RESOURCE_TYPES.reduce((sum, resource) => sum + player.resources[resource], 0) : 0;
}

export function GamePage() {
  const { gameId = "" } = useParams();
  const storedGame = useAppStore((store) => store.game);
  const setGame = useAppStore((store) => store.setGame);
  const dispatch = useAppStore((store) => store.dispatch);
  const error = useAppStore((store) => store.error);
  const setError = useAppStore((store) => store.setError);
  const [loading, setLoading] = useState(storedGame?.id !== gameId);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [modal, setModal] = useState<"trade" | "development" | null>(null);
  const game = storedGame?.id === gameId ? storedGame : null;

  useEffect(() => {
    if (game) return;
    let active = true;
    void repository.loadGame(gameId).then((loaded) => { if (active) { setGame(loaded); setLoading(false); } });
    return () => { active = false; };
  }, [game, gameId, setGame]);

  const interaction = useMemo(() => {
    const validVertexIds = new Set<string>();
    const validEdgeIds = new Set<string>();
    if (!game) return { validVertexIds, validEdgeIds, selectableTiles: false };
    const actor = game.players[game.activePlayerIndex]!;
    if (game.phase === "setupSettlement") validSettlementVertices(game.board, actor.id, { setup: true }).forEach((id) => validVertexIds.add(id));
    if (game.phase === "setupRoad") validRoadEdges(game.board, actor.id, game.pendingSetupVertexId ?? undefined).forEach((id) => validEdgeIds.add(id));
    if (game.phase === "actions" && buildMode === "road") validRoadEdges(game.board, actor.id).forEach((id) => validEdgeIds.add(id));
    if (game.phase === "actions" && buildMode === "settlement") validSettlementVertices(game.board, actor.id, { setup: false }).forEach((id) => validVertexIds.add(id));
    if (game.phase === "actions" && buildMode === "city") game.board.vertices.filter((vertex) => vertex.building?.playerId === actor.id && vertex.building.kind === "settlement").forEach((vertex) => validVertexIds.add(vertex.id));
    return { validVertexIds, validEdgeIds, selectableTiles: game.phase === "robber" };
  }, [buildMode, game]);

  if (loading) return <main className="game-loading"><div className="loading-orbit" /><p>Reconectando à expedição…</p></main>;
  if (!game) return <Navigate to="/historico" replace />;
  const actor = game.players[game.activePlayerIndex]!;

  const send = async (command: GameCommand) => {
    const next = await dispatch(command);
    if (next) setBuildMode(null);
  };
  const clickVertex = (vertexId: string) => {
    if (game.phase === "setupSettlement") void send({ id: crypto.randomUUID(), type: "placeSettlement", actorId: actor.id, vertexId });
    else if (buildMode === "settlement") void send({ id: crypto.randomUUID(), type: "buildSettlement", actorId: actor.id, vertexId });
    else if (buildMode === "city") void send({ id: crypto.randomUUID(), type: "upgradeCity", actorId: actor.id, vertexId });
  };
  const clickEdge = (edgeId: string) => {
    if (game.phase === "setupRoad") void send({ id: crypto.randomUUID(), type: "placeRoad", actorId: actor.id, edgeId });
    else if (buildMode === "road") void send({ id: crypto.randomUUID(), type: "buildRoad", actorId: actor.id, edgeId });
  };
  const clickTile = (tileId: string) => {
    const tile = game.board.tiles.find((candidate) => candidate.id === tileId)!;
    const victimId = tile.vertexIds.flatMap((vertexId) => game.board.vertices.find((vertex) => vertex.id === vertexId)?.building?.playerId ?? []).find((playerId) => playerId !== actor.id && totalCards(game, playerId) > 0) ?? null;
    void send({ id: crypto.randomUUID(), type: "moveRobber", actorId: actor.id, tileId, victimId });
  };

  return (
    <main className="game-screen">
      <header className="game-topbar"><GameLogo compact /><div className="turn-banner"><span className={`avatar-token avatar-token--${actor.color}`}>{actor.name[0]}</span><div><small>TURNO {game.turnNumber}</small><strong>Vez de {actor.name}</strong></div><span className="phase-pill"><Radio /> {phaseLabels[game.phase]}</span></div><div className="game-top-actions"><span><Clock3 /> {Math.floor(game.config.turnSeconds / 60).toString().padStart(2, "0")}:00</span><Link to="/configuracoes" aria-label="Configurações"><Settings /></Link></div></header>

      <aside className="players-rail"><div className="rail-title"><Users /> Exploradores</div>{game.players.map((player, index) => {
        const score = calculateScore(player, game.board, game.achievements);
        return <article className={`game-player-card ${index === game.activePlayerIndex ? "is-active" : ""}`} key={player.id}><span className={`avatar-token avatar-token--${player.color}`}>{player.name[0]}</span><div><strong>{player.name}</strong><small><span className={`presence ${player.connected ? "is-online" : ""}`} /> {player.connected ? "Online" : "Reconectando"}</small><span className="card-count">▰ {index === game.activePlayerIndex ? totalCards(game, player.id) : totalCards(game, player.id)} cartas</span></div><div className="score-gem">{score.visible}</div>{game.achievements.longestRoadPlayerId === player.id && <Route className="award-icon" />}{game.achievements.largestArmyPlayerId === player.id && <Crown className="award-icon" />}</article>;
      })}<div className="seed-card"><MapPin /><span>Seed do mapa<strong>{game.seed}</strong></span></div></aside>

      <section className="board-stage"><div className="board-instruction"><Sparkles /><span><small>ETAPA ATUAL</small><strong>{phaseLabels[game.phase]}</strong></span></div><HexBoard state={game} {...interaction} onVertex={clickVertex} onEdge={clickEdge} onTile={clickTile} /></section>

      <aside className="action-rail">
        <section className="dice-panel"><div className="dice-pair"><span>{game.dice?.first ?? "?"}</span><span>{game.dice?.second ?? "?"}</span></div><button className="button button--primary button--full" type="button" disabled={game.phase !== "roll"} onClick={() => void send({ id: crypto.randomUUID(), type: "rollDice", actorId: actor.id })}><Dices /> Lançar dados</button></section>
        <section className="actions-panel"><div className="rail-title">Construir</div><button className={buildMode === "road" ? "is-selected" : ""} type="button" disabled={game.phase !== "actions"} onClick={() => setBuildMode("road")}><Route /><span><strong>Estrada</strong><small>1 madeira · 1 tijolo</small></span><ChevronRight /></button><button className={buildMode === "settlement" ? "is-selected" : ""} type="button" disabled={game.phase !== "actions"} onClick={() => setBuildMode("settlement")}><Home /><span><strong>Aldeia</strong><small>Madeira · tijolo · lã · trigo</small></span><ChevronRight /></button><button className={buildMode === "city" ? "is-selected" : ""} type="button" disabled={game.phase !== "actions"} onClick={() => setBuildMode("city")}><Building2 /><span><strong>Cidade</strong><small>2 trigo · 3 minério</small></span><ChevronRight /></button></section>
        <section className="quick-actions"><button type="button" disabled={game.phase !== "actions"} onClick={() => setModal("trade")}><ArrowRightLeft /> Comércio</button><button type="button" disabled={game.phase !== "actions"} onClick={() => setModal("development")}><BookOpenCheck /> Cartas</button></section>
        <section className="event-log"><div className="rail-title"><Flag /> Histórico</div><div>{[...game.events.slice(-7)].reverse().map((item) => <p key={item.id}><span />{item.message}</p>)}</div></section>
      </aside>

      <footer className="resource-dock"><div className="resource-owner"><span className={`avatar-token avatar-token--${actor.color}`}>{actor.name[0]}</span><div><small>SEUS RECURSOS</small><strong>{actor.name}</strong></div></div><div className="resource-list">{RESOURCE_TYPES.map((resource) => <ResourceToken resource={resource} amount={actor.resources[resource]} key={resource} />)}</div><button className="button button--danger" type="button" disabled={game.phase !== "actions"} onClick={() => void send({ id: crypto.randomUUID(), type: "endTurn", actorId: actor.id })}>Encerrar turno <ChevronRight /></button></footer>

      {game.phase === "discard" && <DiscardModal state={game} dispatch={dispatch} />}
      {modal === "trade" && <TradeModal state={game} dispatch={dispatch} onClose={() => setModal(null)} />}
      {modal === "development" && <DevelopmentModal state={game} dispatch={dispatch} onClose={() => setModal(null)} />}
      {error && <button className="floating-error" type="button" onClick={() => setError(null)}><ShieldAlert /> {error}<X /></button>}
      {game.winnerId && <div className="victory-overlay"><div className="victory-rays" /><section><Trophy /><div className="eyebrow">EXPEDIÇÃO CONCLUÍDA</div><h1>{game.players.find((player) => player.id === game.winnerId)?.name} venceu!</h1><p>Uma rota digna de entrar para os mapas de Auren.</p><div className="victory-score">{game.players.map((player) => <div key={player.id}><span className={`avatar-token avatar-token--${player.color}`}>{player.name[0]}</span><strong>{player.name}</strong><b>{calculateScore(player, game.board, game.achievements).total} pts</b></div>)}</div><div className="hero__actions"><Link className="button button--primary" to="/perfil?next=/criar">Nova partida</Link><Link className="button button--ghost" to="/">Voltar ao menu</Link></div></section></div>}
    </main>
  );
}
