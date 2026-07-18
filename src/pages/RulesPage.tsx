import { BookOpen, Building2, Dices, Route, ScrollText, Shield, Swords } from "lucide-react";

import { AppShell } from "@/shared/components/AppShell";

const costs = [
  ["Estrada", "1 madeira · 1 tijolo"],
  ["Aldeia", "1 madeira · 1 tijolo · 1 lã · 1 trigo"],
  ["Cidade", "2 trigo · 3 minério"],
  ["Carta", "1 lã · 1 trigo · 1 minério"],
];

export function RulesPage() {
  return (
    <AppShell>
      <main className="content-page">
        <header className="page-heading"><div className="eyebrow"><BookOpen size={14} /> GUIA RÁPIDO</div><h1>Regras de bordo</h1><p>O essencial para iniciar sua primeira expedição.</p></header>
        <div className="rules-grid">
          <section className="rule-card"><Dices /><h2>Seu turno</h2><ol><li>Lance os dois dados.</li><li>Resolva produção ou o andarilho.</li><li>Negocie, construa e use uma carta.</li><li>Encerre o turno.</li></ol></section>
          <section className="rule-card"><Building2 /><h2>Construções</h2>{costs.map(([name, cost]) => <div className="cost-row" key={name}><strong>{name}</strong><span>{cost}</span></div>)}</section>
          <section className="rule-card"><Route /><h2>Maior rota</h2><p>Uma sequência contínua de pelo menos cinco estradas vale 2 pontos. Construções adversárias interrompem o caminho.</p></section>
          <section className="rule-card"><Swords /><h2>Maior exército</h2><p>Use ao menos três cavaleiros e tenha mais que todos os rivais para receber 2 pontos.</p></section>
          <section className="rule-card"><Shield /><h2>O andarilho</h2><p>Ao tirar 7, quem tiver mais de sete recursos descarta metade. Mova o andarilho e roube uma carta elegível.</p></section>
          <section className="rule-card"><ScrollText /><h2>Vitória</h2><p>Aldeias valem 1 ponto, cidades valem 2. Alcance a meta durante seu próprio turno para vencer imediatamente.</p></section>
        </div>
      </main>
    </AppShell>
  );
}
