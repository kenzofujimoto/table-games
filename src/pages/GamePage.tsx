import { ArrowRightLeft, BookOpenCheck, Building2, ChevronRight, Clock3, Crown, Dices, Flag, Home, LogOut, MapPin, Radio, Route, Settings, ShieldAlert, Sparkles, Trophy, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { repository, useAppStore } from "@/app/store";
import { shouldConfirmGameCommand } from "@/accessibility/experience";
import type { GameCommand } from "@/game/application/game-engine";
import { calculateScore } from "@/game/domain/scoring";
import { validRoadEdges, validSettlementVertices } from "@/game/domain/placement";
import { RESOURCE_TYPES } from "@/game/domain/types";
import { DevelopmentModal, DiscardModal, TradeModal } from "@/game/ui/GameModals";
import { HexBoard } from "@/game/ui/HexBoard";
import { ResourceToken } from "@/game/ui/ResourceToken";
import { formatCountdown, remainingMilliseconds } from "@/game/ui/countdown";
import { canOpenTrade, canPlayerInteract, pendingTradeForViewer, resourceCardTotal } from "@/game/ui/player-view";
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

export function GamePage() {
  const { gameId = "" } = useParams();
  const profile = useAppStore((store) => store.profile);
  const storedRoom = useAppStore((store) => store.room);
  const storedGame = useAppStore((store) => store.game);
  const setGame = useAppStore((store) => store.setGame);
  const dispatch = useAppStore((store) => store.dispatch);
  const error = useAppStore((store) => store.error);
  const setError = useAppStore((store) => store.setError);
  const settings = useAppStore((store) => store.settings);
  const [loading, setLoading] = useState(storedGame?.id !== gameId);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [modal, setModal] = useState<"trade" | "development" | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const timerTicking = useRef(false);
  const navigate = useNavigate();
  const game = storedGame?.id === gameId ? storedGame : null;

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    const reload = async () => {
      try {
        const loaded = await repository.loadGame(gameId);
        if (active && loaded) setGame(loaded);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Não foi possível sincronizar a partida.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void reload();
    const roomCode = storedGame?.roomCode ?? storedRoom?.code;
    const unsubscribe = roomCode ? repository.subscribe(roomCode, (event) => {
      if (event.kind === "game" || event.kind === "room" || event.kind === "connection") void reload();
    }) : () => undefined;
    return () => { active = false; unsubscribe(); };
  }, [gameId, setError, setGame, storedGame?.roomCode, storedRoom?.code]);

  const interaction = useMemo(() => {
    const validVertexIds = new Set<string>();
    const validEdgeIds = new Set<string>();
    if (!game) return { validVertexIds, validEdgeIds, selectableTiles: false };
    const viewerId = profile?.id;
    if (!viewerId || !canPlayerInteract(game, viewerId)) return { validVertexIds, validEdgeIds, selectableTiles: false };
    if (game.phase === "setupSettlement") validSettlementVertices(game.board, viewerId, { setup: true }).forEach((id) => validVertexIds.add(id));
    if (game.phase === "setupRoad") validRoadEdges(game.board, viewerId, game.pendingSetupVertexId ?? undefined).forEach((id) => validEdgeIds.add(id));
    if (game.phase === "actions" && buildMode === "road") validRoadEdges(game.board, viewerId).forEach((id) => validEdgeIds.add(id));
    if (game.phase === "actions" && buildMode === "settlement") validSettlementVertices(game.board, viewerId, { setup: false }).forEach((id) => validVertexIds.add(id));
    if (game.phase === "actions" && buildMode === "city") game.board.vertices.filter((vertex) => vertex.building?.playerId === viewerId && vertex.building.kind === "settlement").forEach((vertex) => validVertexIds.add(vertex.id));
    return { validVertexIds, validEdgeIds, selectableTiles: game.phase === "robber" };
  }, [buildMode, game, profile?.id]);

  const remaining = remainingMilliseconds(game?.phaseDeadlineAt, new Date(clockNow));
  const pendingTradeId = game && profile ? pendingTradeForViewer(game, profile.id)?.id ?? null : null;

  useEffect(() => {
    if (!game || game.phase === "finished" || remaining > 0 || timerTicking.current) return;
    timerTicking.current = true;
    void repository.advanceExpiredGame(game).then((next) => {
      setGame(next);
    }).catch(async () => {
      const latest = await repository.loadGame(game.id);
      if (latest) setGame(latest);
    }).finally(() => {
      timerTicking.current = false;
    });
  }, [game, remaining, setGame]);

  if (!profile) return <Navigate to={`/perfil?next=/jogo/${gameId}`} replace />;
  if (loading) return <main className="game-loading"><div className="loading-orbit" /><p>Reconectando à expedição…</p></main>;
  if (!game) return <Navigate to="/historico" replace />;
  const actor = game.players[game.activePlayerIndex]!;
  const viewer = game.players.find((player) => player.id === profile.id);
  if (!viewer) return <Navigate to="/" replace />;
  const canAct = canPlayerInteract(game, viewer.id) && actor.id === viewer.id;
  const tradeAvailable = canOpenTrade(game, viewer.id);
  const hasOpenTrade = game.trades.some((trade) => trade.status === "open");
  const canEndTurn = game.phase === "actions" && canAct && !hasOpenTrade;

  const send = async (command: GameCommand) => {
    const confirmBuild = shouldConfirmGameCommand(command.type, settings);
    const confirmEndTurn = command.type === "endTurn" && game.config.confirmEndTurn;
    if ((confirmBuild || confirmEndTurn) && !window.confirm(
      confirmBuild ? "Confirmar esta construção e o gasto dos materiais?" : "Confirmar o fim do turno?",
    )) return;
    const next = await dispatch(command);
    if (next) setBuildMode(null);
  };
  const clickVertex = (vertexId: string) => {
    if (game.phase === "setupSettlement") void send({ id: crypto.randomUUID(), type: "placeSettlement", actorId: viewer.id, vertexId });
    else if (buildMode === "settlement") void send({ id: crypto.randomUUID(), type: "buildSettlement", actorId: viewer.id, vertexId });
    else if (buildMode === "city") void send({ id: crypto.randomUUID(), type: "upgradeCity", actorId: viewer.id, vertexId });
  };
  const clickEdge = (edgeId: string) => {
    if (game.phase === "setupRoad") void send({ id: crypto.randomUUID(), type: "placeRoad", actorId: viewer.id, edgeId });
    else if (buildMode === "road") void send({ id: crypto.randomUUID(), type: "buildRoad", actorId: viewer.id, edgeId });
  };
  const clickTile = (tileId: string) => {
    const tile = game.board.tiles.find((candidate) => candidate.id === tileId)!;
    const victimId = tile.vertexIds.flatMap((vertexId) => game.board.vertices.find((vertex) => vertex.id === vertexId)?.building?.playerId ?? []).find((playerId) => playerId !== viewer.id && resourceCardTotal(game.players.find((player) => player.id === playerId)!) > 0) ?? null;
    void send({ id: crypto.randomUUID(), type: "moveRobber", actorId: viewer.id, tileId, victimId });
  };
  const abandon = async () => {
    if (!window.confirm("Abandonar a partida e deixar seu assento no piloto automático?")) return;
    await repository.leaveRoom(game.roomCode, viewer.id);
    setGame(null);
    void navigate("/");
  };

  return (
    <main className="game-screen">
      <header className="game-topbar"><GameLogo compact /><div className="turn-banner"><span className={`avatar-token avatar-token--${actor.color}`}>{actor.name[0]}</span><div><small>TURNO {game.turnNumber}</small><strong>Vez de {actor.name}</strong></div><span className="phase-pill"><Radio /> {phaseLabels[game.phase]}</span></div><div className="game-top-actions"><span className={remaining <= 10_000 ? "is-urgent" : ""}><Clock3 /> {formatCountdown(remaining)}</span><Link to="/configuracoes" aria-label="Configurações"><Settings /></Link><button type="button" onClick={() => void abandon()} aria-label="Abandonar partida"><LogOut /></button></div></header>

      <aside className="players-rail"><div className="rail-title"><Users /> Exploradores</div>{game.players.map((player, index) => {
        const score = calculateScore(player, game.board, game.achievements);
        return <article className={`game-player-card ${index === game.activePlayerIndex ? "is-active" : ""}`} key={player.id}><span className={`avatar-token avatar-token--${player.color}`}>{player.name[0]}</span><div><strong>{player.name}</strong><small><span className={`presence ${player.connected ? "is-online" : ""}`} /> {{ online: "Online", reconnecting: "Reconectando", offline: "Offline", autopilot: "Piloto automático" }[player.connectionStatus ?? (player.connected ? "online" : "reconnecting")]}</small><span className="card-count">▰ {resourceCardTotal(player)} cartas</span></div><div className="score-gem">{score.visible}</div>{game.achievements.longestRoadPlayerId === player.id && <Route className="award-icon" />}{game.achievements.largestArmyPlayerId === player.id && <Crown className="award-icon" />}</article>;
      })}<div className="seed-card"><MapPin /><span>Seed do mapa<strong>{game.seed}</strong></span></div></aside>

      <section className="board-stage"><div className="board-instruction"><Sparkles /><span><small>ETAPA ATUAL</small><strong>{phaseLabels[game.phase]}</strong></span></div><HexBoard state={game} {...interaction} onVertex={clickVertex} onEdge={clickEdge} onTile={clickTile} /></section>

      <aside className="action-rail">
        <section className="dice-panel"><div className="dice-pair"><span>{game.dice?.first ?? "?"}</span><span>{game.dice?.second ?? "?"}</span></div><button className="button button--primary button--full" type="button" disabled={game.phase !== "roll" || !canAct} onClick={() => void send({ id: crypto.randomUUID(), type: "rollDice", actorId: viewer.id })}><Dices /> Lançar dados</button></section>
        <section className="actions-panel"><div className="rail-title">Construir</div><button className={buildMode === "road" ? "is-selected" : ""} type="button" disabled={game.phase !== "actions" || !canAct} onClick={() => setBuildMode("road")}><Route /><span><strong>Estrada</strong><small>1 madeira · 1 tijolo</small></span><ChevronRight /></button><button className={buildMode === "settlement" ? "is-selected" : ""} type="button" disabled={game.phase !== "actions" || !canAct} onClick={() => setBuildMode("settlement")}><Home /><span><strong>Aldeia</strong><small>Madeira · tijolo · lã · trigo</small></span><ChevronRight /></button><button className={buildMode === "city" ? "is-selected" : ""} type="button" disabled={game.phase !== "actions" || !canAct} onClick={() => setBuildMode("city")}><Building2 /><span><strong>Cidade</strong><small>2 trigo · 3 minério</small></span><ChevronRight /></button></section>
        <section className="quick-actions"><button type="button" disabled={!tradeAvailable} onClick={() => setModal("trade")}><ArrowRightLeft /> Comércio</button><button type="button" disabled={game.phase !== "actions" || !canAct} onClick={() => setModal("development")}><BookOpenCheck /> Cartas</button></section>
        <section className="event-log"><div className="rail-title"><Flag /> Histórico</div><div>{[...game.events.slice(-7)].reverse().map((item) => <p key={item.id}><span />{item.message}</p>)}</div></section>
      </aside>

      <footer className="resource-dock"><div className="resource-owner"><span className={`avatar-token avatar-token--${viewer.color}`}>{viewer.name[0]}</span><div><small>SEUS RECURSOS</small><strong>{viewer.name}</strong></div></div><div className="resource-list">{RESOURCE_TYPES.map((resource) => <ResourceToken resource={resource} amount={viewer.resources[resource]} key={resource} />)}</div><button className="button button--danger desktop-end-turn" type="button" disabled={!canEndTurn} title={hasOpenTrade ? "Cancele ou aguarde a resolução da troca aberta" : undefined} onClick={() => void send({ id: crypto.randomUUID(), type: "endTurn", actorId: viewer.id })}>Encerrar turno <ChevronRight /></button><nav className="mobile-action-bar"><button type="button" disabled={game.phase !== "roll" || !canAct} onClick={() => void send({ id: crypto.randomUUID(), type: "rollDice", actorId: viewer.id })}><Dices /> Dados</button><button type="button" disabled={game.phase !== "actions" || !canAct} onClick={() => setBuildMode("road")}><Route /> Estrada</button><button type="button" disabled={!tradeAvailable} onClick={() => setModal("trade")}><ArrowRightLeft /> Trocar</button><button type="button" disabled={!canEndTurn} onClick={() => void send({ id: crypto.randomUUID(), type: "endTurn", actorId: viewer.id })}><Flag /> Encerrar</button></nav></footer>

      {game.phase === "discard" && <DiscardModal state={game} viewerId={viewer.id} dispatch={dispatch} />}
      {(modal === "trade" || pendingTradeId) && <TradeModal state={game} viewerId={viewer.id} dispatch={dispatch} onClose={() => setModal(null)} />}
      {modal === "development" && <DevelopmentModal state={game} viewerId={viewer.id} dispatch={dispatch} onClose={() => setModal(null)} />}
      {error && <button className="floating-error" type="button" onClick={() => setError(null)}><ShieldAlert /> {error}<X /></button>}
      {game.winnerId && <div className="victory-overlay"><div className="victory-rays" /><section><Trophy /><div className="eyebrow">EXPEDIÇÃO CONCLUÍDA</div><h1>{game.players.find((player) => player.id === game.winnerId)?.name} venceu!</h1><p>Uma rota digna de entrar para os mapas de Auren.</p><div className="victory-score">{game.players.map((player) => <div key={player.id}><span className={`avatar-token avatar-token--${player.color}`}>{player.name[0]}</span><strong>{player.name}</strong><b>{calculateScore(player, game.board, game.achievements).total} pts</b></div>)}</div><div className="hero__actions"><Link className="button button--primary" to="/perfil?next=/criar">Nova partida</Link><Link className="button button--ghost" to="/">Voltar ao menu</Link></div></section></div>}
    </main>
  );
}
