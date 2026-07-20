import { ChevronRight, Eye, LockKeyhole, MapPinned, Timer, Users } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { repository, useAppStore } from "@/app/store";
import { AUREN_GAME_ID } from "@/games/game-registry";
import type { RoomSettings } from "@/multiplayer/types";
import { AppShell } from "@/shared/components/AppShell";
import { Field, SelectInput, TextInput } from "@/shared/components/Field";

const initialSettings: RoomSettings = {
  visibility: "private",
  maxPlayers: 3,
  targetScore: 10,
  turnSeconds: 120,
  mapShape: "classic",
  terrainDistribution: "random",
  numberDistribution: "random",
  ports: "random",
  previewMap: true,
  allowSpectators: true,
  chatEnabled: true,
  confirmEndTurn: true,
};

const toggleOptions = [
  { key: "previewMap" as const, Icon: Eye, title: "Mostrar prévia do mapa", description: "Todos veem a ilha antes do posicionamento." },
  { key: "allowSpectators" as const, Icon: Users, title: "Permitir espectadores", description: "Amigos podem acompanhar sem interferir." },
  { key: "chatEnabled" as const, Icon: LockKeyhole, title: "Ativar chat", description: "Mensagens públicas durante a partida." },
  { key: "confirmEndTurn" as const, Icon: Timer, title: "Confirmar fim do turno", description: "Evita encerramentos acidentais." },
];

export function CreateRoomPage() {
  const profile = useAppStore((state) => state.profile);
  const setRoom = useAppStore((state) => state.setRoom);
  const [name, setName] = useState("Expedição do horizonte");
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (!profile) return <Navigate to="/perfil?next=/criar" replace />;

  const createRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await repository.createRoom({ name, host: profile, settings, gameKey: AUREN_GAME_ID });
      setRoom(room);
      void navigate(`/sala/${room.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar a sala.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: (typeof toggleOptions)[number]["key"]) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <AppShell>
      <main className="content-page content-page--narrow">
        <header className="page-heading"><div className="eyebrow">NOVA SALA</div><h1>Criar nova expedição</h1><p>Defina o ritmo e a geografia da próxima jornada.</p></header>
        <section className="setup-card">
          <div className="form-grid">
            <Field label="Nome da sala"><TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={48} /></Field>
            <Field label="Acesso"><SelectInput value={settings.visibility} onChange={(event) => setSettings({ ...settings, visibility: event.target.value as RoomSettings["visibility"] })}><option value="private">Privada · somente link ou código</option><option value="public">Pública · aparece na lista ao vivo</option></SelectInput></Field>
            <Field label="Exploradores"><SelectInput value={settings.maxPlayers ?? 2} onChange={(event) => setSettings({ ...settings, maxPlayers: Number(event.target.value) })}><option value={2}>2 jogadores</option><option value={3}>3 jogadores</option><option value={4}>4 jogadores</option></SelectInput></Field>
            <Field label="Pontos para vencer"><TextInput type="number" min={5} max={20} value={settings.targetScore} onChange={(event) => setSettings({ ...settings, targetScore: Number(event.target.value) })} /></Field>
            <Field label="Tempo por turno"><SelectInput value={settings.turnSeconds} onChange={(event) => setSettings({ ...settings, turnSeconds: Number(event.target.value) })}><option value={60}>1 minuto</option><option value={120}>2 minutos</option><option value={180}>3 minutos</option><option value={300}>5 minutos</option></SelectInput></Field>
            <Field label="Formato do mapa"><SelectInput value={settings.mapShape} onChange={(event) => setSettings({ ...settings, mapShape: event.target.value as RoomSettings["mapShape"] })}><option value="classic">Ilha clássica</option><option value="archipelago">Arquipélago</option><option value="wide">Horizonte amplo</option></SelectInput></Field>
          </div>

          <div className="setting-section"><h2><MapPinned /> Geração do mapa</h2><div className="form-grid">
            <Field label="Terrenos"><SelectInput value={settings.terrainDistribution} onChange={(event) => setSettings({ ...settings, terrainDistribution: event.target.value as "classic" | "random" })}><option value="random">Aleatórios equilibrados</option><option value="classic">Distribuição clássica</option></SelectInput></Field>
            <Field label="Números"><SelectInput value={settings.numberDistribution} onChange={(event) => setSettings({ ...settings, numberDistribution: event.target.value as "classic" | "random" })}><option value="random">Aleatórios equilibrados</option><option value="classic">Distribuição clássica</option></SelectInput></Field>
            <Field label="Portos"><SelectInput value={settings.ports} onChange={(event) => setSettings({ ...settings, ports: event.target.value as "fixed" | "random" })}><option value="random">Aleatórios</option><option value="fixed">Fixos</option></SelectInput></Field>
          </div></div>

          <div className="toggle-list">
            {toggleOptions.map(({ key, Icon, title, description }) => (
              <button className="toggle-row" type="button" onClick={() => toggle(key)} key={key}>
                <Icon /><span><strong>{title}</strong><small>{description}</small></span><span className={`switch ${settings[key] ? "is-on" : ""}`} />
              </button>
            ))}
          </div>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button button--primary button--full" type="button" onClick={() => void createRoom()} disabled={busy}>{busy ? "Criando…" : "Criar sala"}<ChevronRight /></button>
        </section>
      </main>
    </AppShell>
  );
}
