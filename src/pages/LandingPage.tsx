import { ArrowRight, Dices, Link2, Map, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "@/shared/components/AppShell";

const features = [
  { icon: Map, title: "Mundos únicos", text: "Mapas equilibrados e reproduzíveis por seed." },
  { icon: Users, title: "3–4 exploradores", text: "Salas privadas, presença e retorno à partida." },
  { icon: Dices, title: "Estratégia clássica", text: "Produção, comércio, rotas e cartas de horizonte." },
];

export function LandingPage() {
  return (
    <AppShell>
      <main className="landing">
        <div className="aurora aurora--one" />
        <div className="aurora aurora--two" />
        <section className="hero">
          <div className="hero__copy">
            <div className="eyebrow"><Sparkles size={14} /> JOGO DE ESTRATÉGIA ONLINE</div>
            <h1>Rotas do{" "}<br /><em>Horizonte</em></h1>
            <p>Explore, negocie e construa seu legado em ilhas que nunca se repetem. Reúna seus amigos e trace a rota mais memorável.</p>
            <div className="hero__actions">
              <Link className="button button--primary" to="/perfil?next=/criar">Criar partida <ArrowRight /></Link>
              <Link className="button button--ghost" to="/perfil?next=/entrar"><Link2 /> Entrar em partida</Link>
            </div>
            <div className="trust-line"><ShieldCheck /> Modo local disponível · Supabase pronto para conectar</div>
          </div>
          <div className="hero-board" aria-label="Prévia artística de uma ilha hexagonal">
            <div className="hero-board__glow" />
            {[
              ["forest", 0, 1], ["mountain", 1, 0], ["field", 2, 1], ["pasture", 0, 3],
              ["desert", 1, 2], ["hills", 2, 3], ["field", 1, 4],
            ].map(([terrain], index) => (
              <div
                className={`mini-hex mini-hex--${terrain}`}
                key={index}
              ><span>{index === 4 ? "7" : [8, 5, 10, 4, 7, 6, 9][index]}</span></div>
            ))}
          </div>
        </section>

        <section className="feature-strip" aria-label="Destaques">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title}><Icon /><div><strong>{title}</strong><p>{text}</p></div></article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
