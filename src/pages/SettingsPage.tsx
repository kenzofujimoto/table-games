import { Accessibility, Gauge, Music, RotateCcw, Settings2, Volume2 } from "lucide-react";

import { useAppStore } from "@/app/store";
import { AppShell } from "@/shared/components/AppShell";
import { Field, SelectInput } from "@/shared/components/Field";

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const restoreVisualDefaults = () => setSettings({
    interfaceScale: "comfortable",
    colorBlind: false,
    highContrast: false,
    lowPerformance: false,
  });
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
      <div className="toggle-list">{rows.map(([key, Icon, title, description]) => <button className="toggle-row" type="button" aria-pressed={settings[key]} onClick={() => setSettings({ [key]: !settings[key] })} key={key}><Icon /><span><strong>{title}</strong><small>{description}</small></span><span className={`switch ${settings[key] ? "is-on" : ""}`} /></button>)}</div>
      <Field label="Tamanho da interface"><SelectInput value={settings.interfaceScale} onChange={(event) => setSettings({ interfaceScale: event.target.value as typeof settings.interfaceScale })}><option value="compact">Compacta</option><option value="comfortable">Confortável</option><option value="large">Grande</option></SelectInput></Field>
      <label className="volume-control"><span><Volume2 /> Volume <strong>{settings.volume}%</strong></span><input type="range" min={0} max={100} value={settings.volume} onChange={(event) => setSettings({ volume: Number(event.target.value) })} /></label>
      <div className="device-settings-note"><p>Estas preferências ficam somente neste dispositivo para que cada jogador use a acessibilidade de que precisa. As cores de identidade dos exploradores continuam iguais para todos.</p><button className="button button--ghost" type="button" onClick={restoreVisualDefaults}><RotateCcw /> Restaurar visual padrão</button></div>
    </section></main></AppShell>
  );
}
