import { Bot, Check, Clipboard, Crown, Link2, LogOut, MessageCircle, Play, Radio, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { repository, useAppStore } from "@/app/store";
import { createGame } from "@/game/application/game-engine";
import { emptyResources, type Player } from "@/game/domain/types";
import type { ChatMessage } from "@/multiplayer/protocol";
import type { GameRoom, PlayerProfile } from "@/multiplayer/types";
import { AppShell } from "@/shared/components/AppShell";

const localExplorers: PlayerProfile[] = [
  { id: "local-noah", name: "Noah", color: "tide", avatar: "fox", crest: "wave" },
  { id: "local-maya", name: "Maya", color: "moss", avatar: "owl", crest: "leaf" },
  { id: "local-iris", name: "Íris", color: "amethyst", avatar: "feather", crest: "moon" },
];

function roomPlayerToGamePlayer(roomPlayer: GameRoom["players"][number]): Player {
  return {
    id: roomPlayer.profile.id,
    name: roomPlayer.profile.name,
    color: roomPlayer.profile.color,
    avatar: roomPlayer.profile.avatar,
    connected: roomPlayer.connected,
    ready: roomPlayer.ready,
    resources: emptyResources(),
    remainingPieces: { roads: 15, settlements: 5, cities: 4 },
    developmentCards: [],
    playedKnights: 0,
    revealedVictoryPoints: 0,
  };
}

export function LobbyPage() {
  const { code = "" } = useParams();
  const profile = useAppStore((state) => state.profile);
  const storedRoom = useAppStore((state) => state.room);
  const setRoom = useAppStore((state) => state.setRoom);
  const setGame = useAppStore((state) => state.setGame);
  const [room, updateRoom] = useState<GameRoom | null>(storedRoom?.code === code ? storedRoom : null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const syncRoom = async () => {
      const nextRoom = await repository.getRoom(code);
      if (active && nextRoom) {
        updateRoom(nextRoom);
        setRoom(nextRoom);
        if (nextRoom.status === "playing" && nextRoom.gameId) {
          const game = await repository.loadGame(nextRoom.gameId);
          if (game) {
            setGame(game);
            void navigate(`/jogo/${game.id}`);
          }
        }
      }
    };
    void syncRoom().catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "Não foi possível sincronizar a sala.");
    });
    const unsubscribe = repository.subscribe(code, (event) => {
      if (event.kind === "chat") {
        setMessages((current) => current.some((message) => message.id === event.message.id)
          ? current
          : [...current.slice(-49), event.message]);
      } else {
        void syncRoom();
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [code, navigate, setGame, setRoom]);

  if (!profile) return <Navigate to={`/perfil?next=/sala/${code}`} replace />;
  if (!room) return <AppShell><main className="page-center"><div className="loading-orbit" /><p>Buscando sala…</p></main></AppShell>;

  const me = room.players.find((player) => player.profile.id === profile.id);
  const isHost = room.hostId === profile.id;
  const missingPlayers = room.settings.maxPlayers - room.players.length;
  const allReady = room.players.length === room.settings.maxPlayers && room.players.every((player) => player.ready);

  const refresh = (next: GameRoom) => { updateRoom(next); setRoom(next); };
  const toggleReady = async () => {
    if (!me) return;
    try { refresh(await repository.setReady(room.code, profile.id, !me.ready)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao atualizar prontidão."); }
  };
  const fillLocalSeats = async () => {
    if (repository.kind !== "local") return;
    try {
      let next = room;
      for (const explorer of localExplorers) {
        if (next.players.length >= next.settings.maxPlayers) break;
        if (!next.players.some((player) => player.profile.id === explorer.id)) {
          next = await repository.joinRoom(next.code, explorer);
          next = await repository.setReady(next.code, explorer.id, true);
        }
      }
      refresh(next);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível preencher os assentos."); }
  };
  const start = async () => {
    try {
      const startedRoom = await repository.startGame(room.code, profile.id);
      const game = repository.kind === "local"
        ? createGame({
          id: startedRoom.gameId!,
          roomCode: room.code,
          seed: `${room.code}-${Date.now().toString(36)}`,
          players: startedRoom.players.map(roomPlayerToGamePlayer),
          targetScore: room.settings.targetScore,
          turnSeconds: room.settings.turnSeconds,
        })
        : await repository.loadGame(startedRoom.gameId!);
      if (!game) throw new Error("A partida foi criada, mas o estado inicial não pôde ser carregado.");
      if (repository.kind === "local") await repository.saveGame(game);
      refresh(startedRoom);
      setGame(game);
      void navigate(`/jogo/${game.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível iniciar."); }
  };
  const sendChat = async () => {
    if (!chatInput.trim()) return;
    try {
      await repository.sendChat(room.code, profile, chatInput);
      setChatInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar a mensagem.");
    }
  };
  const copyInvite = async () => {
    const invite = `${window.location.origin}/entrar?code=${encodeURIComponent(room.code)}`;
    try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Não foi possível copiar automaticamente."); }
  };

  return (
    <AppShell>
      <main className="lobby-page">
        <header className="lobby-heading"><div><div className="eyebrow"><Radio size={14} /> SALA PRIVADA · {repository.kind === "online" ? "ONLINE" : "MODO LOCAL"}</div><h1>{room.name}</h1><p>Todos devem estar prontos antes da partida começar.</p></div><button className="button button--ghost" type="button" onClick={() => void navigate("/")}><LogOut /> Sair</button></header>
        <div className="lobby-layout">
          <section className="lobby-panel">
            <div className="panel-title"><span><Users /> Exploradores</span><small>{room.players.length}/{room.settings.maxPlayers}</small></div>
            <div className="player-list">
              {room.players.map((player) => (
                <article className="lobby-player" key={player.profile.id}>
                  <span className={`avatar-token avatar-token--${player.profile.color}`}>{player.profile.name.slice(0, 1).toUpperCase()}</span>
                  <div><strong>{player.profile.name} {player.profile.id.startsWith("local-") && <Bot size={14} />}</strong><small><span className={`presence ${player.connected ? "is-online" : ""}`} />{player.connected ? "Conectado" : "Reconectando"}</small></div>
                  {player.profile.id === room.hostId && <span className="host-badge"><Crown /> Anfitrião</span>}
                  <span className={`ready-badge ${player.ready ? "is-ready" : ""}`}>{player.ready ? <><Check /> Pronto</> : "Aguardando"}</span>
                </article>
              ))}
              {Array.from({ length: room.settings.maxPlayers - room.players.length }, (_, index) => <div className="empty-seat" key={index}><UserPlus /><span>Assento disponível</span></div>)}
            </div>
            <div className="lobby-actions">
              {me && <button className={`button ${me.ready ? "button--ghost" : "button--secondary"}`} type="button" onClick={() => void toggleReady()}>{me.ready ? "Não estou pronto" : "Estou pronto"}</button>}
              {repository.kind === "local" && isHost && room.players.length < room.settings.maxPlayers && <button className="button button--ghost" type="button" onClick={() => void fillLocalSeats()}><Bot /> Preencher para demonstração</button>}
            </div>
          </section>

          <aside className="lobby-sidebar">
            <section className="lobby-panel invite-panel"><span className="panel-kicker">CÓDIGO DA SALA</span><button className="room-code" type="button" onClick={() => void copyInvite()}>{room.code}<Clipboard /></button><button className="copy-link" type="button" onClick={() => void copyInvite()}>{copied ? <><Check /> Link copiado</> : <><Link2 /> Copiar link do convite</>}</button></section>
            <section className="lobby-panel settings-summary"><div className="panel-title"><span>Configuração</span></div><dl><div><dt>Mapa</dt><dd>Ilha clássica</dd></div><div><dt>Vitória</dt><dd>{room.settings.targetScore} pontos</dd></div><div><dt>Turno</dt><dd>{room.settings.turnSeconds / 60} min</dd></div><div><dt>Terrenos</dt><dd>Equilibrados</dd></div><div><dt>Espectadores</dt><dd>{room.settings.allowSpectators ? "Permitidos" : "Bloqueados"}</dd></div></dl></section>
            <section className="lobby-panel lobby-chat"><div className="panel-title"><span><MessageCircle /> Chat do lobby</span></div><div className="chat-messages">{messages.length === 0 ? <div className="chat-placeholder"><p>As mensagens da expedição aparecerão aqui.</p></div> : messages.map((message) => <p key={message.id}><strong>{message.playerName}</strong><span>{message.message}</span></p>)}</div><form onSubmit={(event) => { event.preventDefault(); void sendChat(); }}><input className="text-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} maxLength={280} placeholder="Enviar mensagem…" disabled={!room.settings.chatEnabled} /><button type="submit" disabled={!chatInput.trim()}>Enviar</button></form></section>
          </aside>
        </div>
        {error && <div className="floating-error" role="alert">{error}</div>}
        {isHost && <div className="start-dock"><div><strong>{allReady ? "A tripulação está pronta" : missingPlayers === 1 ? "Falta 1 jogador" : missingPlayers > 1 ? `Faltam ${missingPlayers} jogadores` : "Aguardando a prontidão"}</strong><small>{allReady ? "A ilha foi gerada e aguarda sua ordem." : missingPlayers > 0 ? `Esta sala começa com ${room.settings.maxPlayers} jogadores.` : "Todos precisam marcar que estão prontos."}</small></div><button className="button button--primary" type="button" disabled={!allReady} onClick={() => void start()}><Play /> Iniciar partida</button></div>}
      </main>
    </AppShell>
  );
}
