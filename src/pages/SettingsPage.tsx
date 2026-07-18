import { Accessibility, Gauge, Music, Settings2, Volume2 } from "lucide-react";

import { useAppStore } from "@/app/store";
import { AppShell } from "@/shared/components/AppShell";

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const rows = [
    ["music", Music, "Música", "Trilha ambiente durante a partida"],
    ["effects", Volume2, "Efeitos", "Dados, construções e recursos"],
    ["colorBlind", Accessibility, "Modo daltônico", "Padrões e símbolos adicionais"],
    ["highContrast", Gauge, "Alto contraste", "Bordas e textos mais definidos"],
    ["lowPerformance", Settings2, "Baixo desempenho", "Reduz animações e partículas"],
    ["confirmBuilds", Settings2, "Confirmar construções", "Evita gastos acidentais"],
  ] as const;
  return (
    <AppShell><main className="content-page content-page--narrow"><header className="page-heading"><div className="eyebrow">PREFERÊNCIAS</div><h1>Ajustes da jornada</h1><p>Personalize som, contraste e ritmo visual.</p></header><section className="setup-card">
      <div className="toggle-list">{rows.map(([key, Icon, title, description]) => <button className="toggle-row" type="button" onClick={() => setSettings({ [key]: !settings[key] })} key={key}><Icon /><span><strong>{title}</strong><small>{description}</small></span><span className={`switch ${settings[key] ? "is-on" : ""}`} /></button>)}</div>
      <label className="volume-control"><span><Volume2 /> Volume <strong>{settings.volume}%</strong></span><input type="range" min={0} max={100} value={settings.volume} onChange={(event) => setSettings({ volume: Number(event.target.value) })} /></label>
    </section></main></AppShell>
  );
}
