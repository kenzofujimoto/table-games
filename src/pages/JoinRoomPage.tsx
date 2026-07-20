import { ArrowRight, Globe2, KeyRound, RefreshCw, Timer, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { repository, useAppStore } from "@/app/store";
import { playerColors, type PublicRoomSummary } from "@/multiplayer/types";
import { AppShell } from "@/shared/components/AppShell";
import { Field, TextInput } from "@/shared/components/Field";

function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

export function JoinRoomPage() {
  const profile = useAppStore((state) => state.profile);
  const setProfile = useAppStore((state) => state.setProfile);
  const setRoom = useAppStore((state) => state.setRoom);
  const [search] = useSearchParams();
  const invitedCode = normalizeRoomCode(search.get("code") ?? "");
  const [code, setCode] = useState(invitedCode);
  const [error, setError] = useState<string | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const loadRooms = async () => {
      try {
        const rooms = await repository.listPublicRooms();
        if (active) setPublicRooms(rooms);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Não foi possível listar as salas públicas.");
      } finally {
        if (active) setLoadingRooms(false);
      }
    };
    void loadRooms();
    const interval = window.setInterval(() => void loadRooms(), 5_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  if (!profile) {
    const next = invitedCode ? `/entrar?code=${encodeURIComponent(invitedCode)}` : "/entrar";
    return <Navigate to={`/perfil?next=${encodeURIComponent(next)}`} replace />;
  }

  const join = async (requestedCode = code) => {
    const normalizedCode = normalizeRoomCode(requestedCode);
    setBusyCode(normalizedCode);
    setError(null);
    try {
      const existing = await repository.getRoom(normalizedCode);
      if (!existing) throw new Error("Sala não encontrada. Confira o código.");
      const alreadyJoined = existing.players.some((player) => player.profile.id === profile.id);
      const usedColors = new Set(existing.players.map((player) => player.profile.color));
      const availableColor = playerColors.find((color) => !usedColors.has(color));
      let joiningProfile = profile;
      if (!alreadyJoined && usedColors.has(profile.color)) {
        if (!availableColor) throw new Error("A sala não tem mais cores disponíveis.");
        joiningProfile = { ...profile, color: availableColor };
      }
      const room = alreadyJoined ? existing : await repository.joinRoom(normalizedCode, joiningProfile);
      setProfile(joiningProfile);
      setRoom(room);
      void navigate(`/sala/${room.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <AppShell>
      <main className="join-page">
        <header className="page-heading join-heading">
          <div className="eyebrow"><Globe2 /> ENCONTRE UMA MESA</div>
          <h1>Jogue agora com seus amigos</h1>
          <p>Entre numa sala pública aberta ou use o convite de uma sala privada.</p>
        </header>

        <section className="public-rooms-panel" aria-live="polite">
          <div className="public-rooms-title">
            <div><Globe2 /><span><h2>Salas públicas ao vivo</h2><p>Mesas abertas para entrada imediata.</p></span></div>
            <span className="live-pill"><span /> AO VIVO</span>
          </div>
          {loadingRooms ? <div className="public-rooms-empty"><RefreshCw className="is-spinning" /> Procurando salas…</div>
            : publicRooms.length === 0 ? <div className="public-rooms-empty">Nenhuma sala pública aberta agora.</div>
              : <div className="public-room-list">{publicRooms.map((room) => (
                <article className="public-room-card" key={room.code}>
                  <div><strong>{room.name}</strong><small>Código {room.code}</small></div>
                  <span><Users /> {room.playerCount}/{room.maxPlayers ?? "∞"}</span>
                  <span><Timer /> {Math.round(room.turnSeconds / 60)} min</span>
                  <button className="button button--primary" type="button" aria-label={`Entrar em ${room.name}`} disabled={busyCode !== null} onClick={() => void join(room.code)}>
                    {busyCode === room.code ? "Entrando…" : "Entrar"}<ArrowRight />
                  </button>
                </article>
              ))}</div>}
        </section>

        <section className="form-card private-room-card">
          <div className="round-icon"><KeyRound /></div>
          <div className="eyebrow">SALA PRIVADA</div>
          <h2>Entrar com convite</h2>
          <p>Salas privadas não aparecem na lista. Use os seis caracteres enviados pelo anfitrião.</p>
          <Field label="Código da sala"><TextInput className="text-input code-input" value={code} onChange={(event) => setCode(normalizeRoomCode(event.target.value))} placeholder="AUREN2" maxLength={6} autoFocus /></Field>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button button--primary button--full" type="button" onClick={() => void join()} disabled={code.length !== 6 || busyCode !== null}>{busyCode === code ? "Entrando…" : "Entrar na sala"} <ArrowRight /></button>
        </section>
      </main>
    </AppShell>
  );
}
