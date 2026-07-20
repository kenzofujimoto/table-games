import { BookOpenCheck, Building2, Check, ChevronRight, Flag, Home, LogOut, Route, Settings, Users, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { GameState } from "@/game/application/game-engine";
import { calculateScore } from "@/game/domain/scoring";

import { resourceCardTotal } from "./player-view";

type BuildChoice = "road" | "settlement" | "city";

interface ConfirmationDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  dangerous?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function GameConfirmationDialog({
  title,
  description,
  confirmLabel,
  dangerous = false,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  return <div className="modal-backdrop" role="presentation">
    <section className="game-modal confirmation-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header><span><Check /></span><div><small>CONFIRMAÇÃO</small><h2>{title}</h2></div><button type="button" onClick={onCancel} aria-label="Cancelar e fechar"><X /></button></header>
      <p>{description}</p>
      <div className="confirmation-actions">
        <button className="button button--ghost" type="button" onClick={onCancel}>Cancelar</button>
        <button className={`button ${dangerous ? "button--danger" : "button--primary"}`} type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}

interface BuildSheetProps {
  selected: BuildChoice | null;
  onSelect: (choice: BuildChoice) => void;
  onClose: () => void;
}

const buildChoices = [
  { choice: "road" as const, Icon: Route, label: "Construir estrada", cost: "1 madeira · 1 tijolo" },
  { choice: "settlement" as const, Icon: Home, label: "Construir aldeia", cost: "1 madeira · 1 tijolo · 1 lã · 1 trigo" },
  { choice: "city" as const, Icon: Building2, label: "Construir cidade", cost: "2 trigos · 3 minérios" },
];

export function MobileBuildSheet({ selected, onSelect, onClose }: BuildSheetProps) {
  return <div className="modal-backdrop mobile-sheet-backdrop" role="presentation">
    <section className="game-modal mobile-action-sheet" role="dialog" aria-modal="true" aria-label="Opções de construção">
      <header><span><Building2 /></span><div><small>AÇÕES</small><h2>Construir</h2></div><button type="button" onClick={onClose} aria-label="Fechar opções de construção"><X /></button></header>
      <div className="mobile-sheet-actions">{buildChoices.map(({ choice, Icon, label, cost }) => (
        <button className={selected === choice ? "is-selected" : ""} type="button" aria-label={label} onClick={() => onSelect(choice)} key={choice}>
          <Icon /><span><strong>{label.replace("Construir ", "")}</strong><small>{cost}</small></span><ChevronRight />
        </button>
      ))}</div>
    </section>
  </div>;
}

interface MoreSheetProps {
  state: GameState;
  canUseCards: boolean;
  canEndTurn: boolean;
  hasOpenTrade: boolean;
  onDevelopment: () => void;
  onEndTurn: () => void;
  onAbandon: () => void;
  onClose: () => void;
}

export function MobileMoreSheet({
  state,
  canUseCards,
  canEndTurn,
  hasOpenTrade,
  onDevelopment,
  onEndTurn,
  onAbandon,
  onClose,
}: MoreSheetProps) {
  const [showOverview, setShowOverview] = useState(false);
  return <div className="modal-backdrop mobile-sheet-backdrop" role="presentation">
    <section className="game-modal mobile-action-sheet mobile-more-sheet" role="dialog" aria-modal="true" aria-label="Mais ações">
      <header><span><Flag /></span><div><small>PARTIDA</small><h2>Mais ações</h2></div><button type="button" onClick={onClose} aria-label="Fechar mais ações"><X /></button></header>
      <div className="mobile-sheet-actions">
        <button type="button" disabled={!canUseCards} onClick={onDevelopment}><BookOpenCheck /><span><strong>Cartas de desenvolvimento</strong><small>Comprar e jogar cartas</small></span><ChevronRight /></button>
        <button type="button" aria-expanded={showOverview} onClick={() => setShowOverview((current) => !current)}><Users /><span><strong>Exploradores e histórico</strong><small>Pontuação, conexão e últimos eventos</small></span><ChevronRight /></button>
        {showOverview && <div className="mobile-overview__content">
            {state.players.map((player) => <article key={player.id}><span className={`avatar-token avatar-token--${player.color}`}>{player.name[0]}</span><div><strong>{player.name}</strong><small>{resourceCardTotal(player)} cartas · {calculateScore(player, state.board, state.achievements).visible} pontos</small></div></article>)}
            <div className="mobile-event-list">{[...state.events.slice(-6)].reverse().map((event) => <p key={event.id}>{event.message}</p>)}</div>
          </div>}
        <button type="button" disabled={!canEndTurn} title={hasOpenTrade ? "Resolva a troca aberta antes de encerrar" : undefined} onClick={onEndTurn}><Flag /><span><strong>Encerrar turno</strong><small>{hasOpenTrade ? "Há uma troca aguardando resposta" : "Passar a vez ao próximo jogador"}</small></span><ChevronRight /></button>
        <Link to="/configuracoes"><Settings /><span><strong>Configurações</strong><small>Som, contraste e acessibilidade</small></span><ChevronRight /></Link>
        <button className="is-danger" type="button" onClick={onAbandon}><LogOut /><span><strong>Abandonar partida</strong><small>Seu assento ficará no piloto automático</small></span><ChevronRight /></button>
      </div>
    </section>
  </div>;
}
