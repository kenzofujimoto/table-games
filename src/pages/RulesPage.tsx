import {
  Anchor,
  BookOpen,
  Building2,
  Clock3,
  Dices,
  Handshake,
  Leaf,
  Route,
  ScrollText,
  Shield,
  Swords,
  WifiOff,
} from "lucide-react";

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
      <main className="content-page rules-manual">
        <header className="page-heading">
          <div className="eyebrow"><BookOpen size={14} /> MANUAL COMPLETO</div>
          <h1>Regras de bordo</h1>
          <p>Da primeira aldeia aos portos, cartas e reconexões: tudo para conduzir uma partida de Auren.</p>
        </header>
        <nav className="manual-index" aria-label="Índice do manual">
          <a href="#inicio">Preparação</a><a href="#materiais">Materiais</a><a href="#trocas">Trocas</a><a href="#cartas">Cartas</a><a href="#conexao">Conexão</a>
        </nav>
        <div className="rules-grid">
          <section className="rule-card" id="inicio"><Dices /><h2>Preparação e turno</h2><p>Cada pessoa coloca uma aldeia e uma estrada em ordem de ida e volta. No turno normal, lance os dados, resolva a produção ou o 7, negocie, construa e encerre.</p><p>O lançamento tem 5 segundos; as demais fases usam o tempo escolhido na sala. Ao expirar, o servidor executa uma jogada segura.</p></section>
          <section className="rule-card" id="materiais"><Leaf /><h2>Materiais e produção</h2><p>Madeira vem das florestas, tijolo das colinas, lã dos pastos, trigo dos campos e minério das montanhas.</p><p>Quando os dados somam o número de um terreno, cada aldeia adjacente recebe 1 material e cada cidade recebe 2. O deserto não produz; o andarilho bloqueia o terreno ocupado.</p></section>
          <section className="rule-card"><Building2 /><h2>Construções e custos</h2>{costs.map(([name, cost]) => <div className="cost-row" key={name}><strong>{name}</strong><span>{cost}</span></div>)}<p>Aldeias exigem uma estrada sua e distância mínima de dois cruzamentos. Cidades substituem uma aldeia própria.</p></section>
          <section className="rule-card" id="trocas"><Anchor /><h2>Trocas e portos</h2><p>Com o banco, qualquer pessoa pode entregar 4 cartas iguais por 1 material à escolha. Quatro portos gerais permitem 3:1.</p><p>Existe um porto 2:1 para cada material: madeira, tijolo, lã, trigo e minério. Construa uma aldeia ou cidade em uma das duas pontas do porto para usar sua taxa.</p></section>
          <section className="rule-card"><Handshake /><h2>Negociação entre pessoas</h2><p>No seu turno, informe as quantidades exatas que oferece e deseja. A solicitação é enviada a todos os outros exploradores; o primeiro aceite conclui a troca, desde que ambas as pessoas ainda possuam todas as cartas anunciadas.</p><p>Cada pessoa pode recusar separadamente. Se todas recusarem ou o tempo terminar, a solicitação expira. O proponente pode cancelar a qualquer momento, e o turno só pode terminar depois que a proposta for aceita, recusada por todos, cancelada ou expirada.</p><p>Promessas futuras e doações fora da proposta não fazem parte das regras.</p></section>
          <section className="rule-card"><Shield /><h2>O 7 e o andarilho</h2><p>Ao sair 7, quem possui mais de sete recursos descarta metade, arredondando para baixo. Depois, o jogador ativo move o andarilho para outro terreno e pode roubar uma carta aleatória de um rival adjacente elegível.</p></section>
          <section className="rule-card" id="cartas"><ScrollText /><h2>Cartas de desenvolvimento</h2><p><strong>Cavaleiro:</strong> move o andarilho. <strong>Construção de estradas:</strong> coloca até duas estradas. <strong>Monopólio:</strong> toma um tipo de material dos rivais. <strong>Ano de abundância:</strong> recebe dois materiais. <strong>Ponto de vitória:</strong> soma um ponto oculto.</p><p>Uma carta comprada não pode ser usada no mesmo turno, e só uma carta de ação pode ser jogada por turno.</p></section>
          <section className="rule-card"><Route /><h2>Maior rota</h2><p>Uma sequência contínua de pelo menos cinco estradas vale 2 pontos. Ramificações contam pelo caminho contínuo mais longo; aldeias e cidades adversárias interrompem a ligação.</p></section>
          <section className="rule-card"><Swords /><h2>Maior exército</h2><p>Depois de usar ao menos três cavaleiros, quem tiver estritamente mais cavaleiros jogados recebe 2 pontos. O título muda de dono quando alguém supera a marca atual.</p></section>
          <section className="rule-card"><ScrollText /><h2>Pontuação e vitória</h2><p>Aldeia vale 1 ponto; cidade, 2; Maior Rota, 2; Maior Exército, 2; cartas de ponto, 1 cada. Alcance a meta configurada para vencer. Pontos ocultos só são revelados no resultado.</p></section>
          <section className="rule-card" id="conexao"><WifiOff /><h2>Quedas e reconexão</h2><p>Uma queda curta mostra “Reconectando” e pode conceder até 60 segundos extras, limitados a 3 minutos por pessoa na partida. Se todos ficarem offline, o relógio congela.</p><p>Ao abandonar de propósito, o piloto automático preserva o assento e conclui jogadas seguras. Voltar pelo mesmo navegador recupera o controle. No lobby, uma saída remove a pessoa e transfere o anfitrião quando necessário.</p></section>
          <section className="rule-card"><Clock3 /><h2>Banco, tempo e ações automáticas</h2><p>O banco tem quantidade limitada de cada recurso; se não puder pagar toda a produção de um material, ninguém recebe aquele material nessa rolagem. No fim do prazo, posicionamentos, descartes, dados e encerramento são resolvidos pelo servidor.</p></section>
        </div>
      </main>
    </AppShell>
  );
}
