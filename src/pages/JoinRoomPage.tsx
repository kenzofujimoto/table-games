import { ArrowRight, KeyRound } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { repository, useAppStore } from "@/app/store";
import { playerColors } from "@/multiplayer/types";
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
  const navigate = useNavigate();
  if (!profile) {
    const next = invitedCode ? `/entrar?code=${encodeURIComponent(invitedCode)}` : "/entrar";
    return <Navigate to={`/perfil?next=${encodeURIComponent(next)}`} replace />;
  }

  const join = async () => {
    try {
      const existing = await repository.getRoom(code);
      if (!existing) throw new Error("Sala não encontrada. Confira o código.");
      const alreadyJoined = existing.players.some((player) => player.profile.id === profile.id);
      const usedColors = new Set(existing.players.map((player) => player.profile.color));
      const availableColor = playerColors.find((color) => !usedColors.has(color));
      let joiningProfile = profile;
      if (!alreadyJoined && usedColors.has(profile.color)) {
        if (!availableColor) throw new Error("A sala não tem mais cores disponíveis.");
        joiningProfile = { ...profile, color: availableColor };
      }
      const room = alreadyJoined ? existing : await repository.joinRoom(code, joiningProfile);
      setProfile(joiningProfile);
      setRoom(room);
      void navigate(`/sala/${room.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
    }
  };

  return (
    <AppShell>
      <main className="page-center">
        <section className="form-card">
          <div className="round-icon"><KeyRound /></div>
          <div className="eyebrow">CÓDIGO DE CONVITE</div>
          <h1>Encontre sua expedição</h1>
          <p>Use os seis caracteres enviados pelo anfitrião.</p>
          <Field label="Código da sala"><TextInput className="text-input code-input" value={code} onChange={(event) => setCode(normalizeRoomCode(event.target.value))} placeholder="AUREN2" maxLength={6} autoFocus /></Field>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button button--primary button--full" type="button" onClick={() => void join()} disabled={code.length !== 6}>Entrar na sala <ArrowRight /></button>
        </section>
      </main>
    </AppShell>
  );
}
