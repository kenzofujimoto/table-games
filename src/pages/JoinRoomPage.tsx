import { ArrowRight, KeyRound } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { repository, useAppStore } from "@/app/store";
import { AppShell } from "@/shared/components/AppShell";
import { Field, TextInput } from "@/shared/components/Field";

export function JoinRoomPage() {
  const profile = useAppStore((state) => state.profile);
  const setRoom = useAppStore((state) => state.setRoom);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  if (!profile) return <Navigate to="/perfil?next=/entrar" replace />;

  const join = async () => {
    try {
      const existing = await repository.getRoom(code);
      if (!existing) throw new Error("Sala não encontrada. Confira o código.");
      const alreadyJoined = existing.players.some((player) => player.profile.id === profile.id);
      const room = alreadyJoined ? existing : await repository.joinRoom(code, profile);
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
          <Field label="Código da sala"><TextInput className="text-input code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} placeholder="AUREN2" maxLength={6} autoFocus /></Field>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button button--primary button--full" type="button" onClick={() => void join()} disabled={code.length !== 6}>Entrar na sala <ArrowRight /></button>
        </section>
      </main>
    </AppShell>
  );
}
