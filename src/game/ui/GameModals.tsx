import { ArrowRightLeft, BookOpenCheck, Check, Dices, X } from "lucide-react";
import { useState } from "react";

import type { GameCommand, GameState } from "@/game/application/game-engine";
import { validRoadEdges } from "@/game/domain/placement";
import { RESOURCE_TYPES, emptyResources, type Resource, type ResourceCounts } from "@/game/domain/types";

import { RESOURCE_META } from "./resource-meta";

interface ModalProps {
  state: GameState;
  viewerId: string;
  dispatch: (command: GameCommand) => Promise<GameState | null>;
  onClose: () => void;
}

function ModalFrame({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="game-modal" role="dialog" aria-modal="true" aria-label={title}><header><span>{icon}</span><div><small>AÇÃO DA PARTIDA</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X /></button></header>{children}</section></div>;
}

export function TradeModal({ state, viewerId, dispatch, onClose }: ModalProps) {
  const active = state.players[state.activePlayerIndex]!;
  const viewer = state.players.find((player) => player.id === viewerId)!;
  const [tab, setTab] = useState<"players" | "bank">("players");
  const [give, setGive] = useState<Resource>("wood");
  const [receive, setReceive] = useState<Resource>("ore");
  const [targetId, setTargetId] = useState(state.players.find((player) => player.id !== viewer.id)?.id ?? "");
  const openTrade = state.trades.find((trade) => trade.status === "open");

  const submit = async () => {
    if (tab === "bank") {
      await dispatch({ id: crypto.randomUUID(), type: "bankTrade", actorId: viewer.id, give, receive, ratio: 4 });
      onClose();
      return;
    }
    const offer = { ...emptyResources(), [give]: 1 };
    const request = { ...emptyResources(), [receive]: 1 };
    await dispatch({ id: crypto.randomUUID(), type: "proposeTrade", actorId: viewer.id, offer, request, targetPlayerIds: [targetId] });
  };

  return <ModalFrame title="Mesa de comércio" icon={<ArrowRightLeft />} onClose={onClose}>
    <div className="modal-tabs"><button className={tab === "players" ? "is-active" : ""} type="button" onClick={() => setTab("players")}>Com jogadores</button><button className={tab === "bank" ? "is-active" : ""} type="button" onClick={() => setTab("bank")}>Com o banco</button></div>
    {openTrade ? <div className="open-trade"><span className="status-pill">PROPOSTA ABERTA</span><p><strong>{state.players.find((player) => player.id === openTrade.proposerId)?.name}</strong> oferece {Object.entries(openTrade.offer).filter(([, amount]) => amount > 0).map(([resource, amount]) => `${amount} ${RESOURCE_META[resource as Resource].label}`).join(", ")} por {Object.entries(openTrade.request).filter(([, amount]) => amount > 0).map(([resource, amount]) => `${amount} ${RESOURCE_META[resource as Resource].label}`).join(", ")}.</p>
      {openTrade.targetPlayerIds.includes(viewer.id) ? <div className="trade-responses"><div><span>Responder como {viewer.name}</span><button className="button button--secondary" type="button" onClick={() => void dispatch({ id: crypto.randomUUID(), type: "respondTrade", actorId: viewer.id, tradeId: openTrade.id, response: "accept" })}><Check /> Aceitar</button><button className="button button--ghost" type="button" onClick={() => void dispatch({ id: crypto.randomUUID(), type: "respondTrade", actorId: viewer.id, tradeId: openTrade.id, response: "reject" })}>Recusar</button></div></div> : <p className="modal-note">Aguardando a resposta dos exploradores convidados.</p>}
    </div> : <>
      <div className="trade-builder"><label><span>Você oferece</span><select className="text-input" value={give} onChange={(event) => setGive(event.target.value as Resource)}>{RESOURCE_TYPES.map((resource) => <option value={resource} key={resource}>{RESOURCE_META[resource].label} ({viewer.resources[resource]})</option>)}</select></label><ArrowRightLeft /><label><span>Você recebe</span><select className="text-input" value={receive} onChange={(event) => setReceive(event.target.value as Resource)}>{RESOURCE_TYPES.map((resource) => <option value={resource} key={resource}>{RESOURCE_META[resource].label}</option>)}</select></label></div>
      {tab === "players" && <label className="field"><span>Destinatário</span><select className="text-input" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{state.players.filter((player) => player.id !== viewer.id).map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>}
      {tab === "bank" && <p className="modal-note">Taxa atual: 4 recursos por 1. Portos válidos habilitam 3:1 ou 2:1 automaticamente no motor.</p>}
      <button className="button button--primary button--full" type="button" disabled={active.id !== viewer.id || give === receive || viewer.resources[give] < (tab === "bank" ? 4 : 1)} onClick={() => void submit()}>{tab === "bank" ? "Negociar com o banco" : "Enviar proposta"}</button>
    </>}
  </ModalFrame>;
}

export function DevelopmentModal({ state, viewerId, dispatch, onClose }: ModalProps) {
  const active = state.players.find((player) => player.id === viewerId)!;
  const play = async (cardId: string, kind: string) => {
    let command: GameCommand;
    if (kind === "monopoly") command = { id: crypto.randomUUID(), type: "playDevelopmentCard", actorId: active.id, cardId, resource: "ore" };
    else if (kind === "yearOfPlenty") command = { id: crypto.randomUUID(), type: "playDevelopmentCard", actorId: active.id, cardId, resources: ["grain", "ore"] };
    else if (kind === "roadBuilding") {
      const edgeId = validRoadEdges(state.board, active.id)[0];
      if (!edgeId) return;
      command = { id: crypto.randomUUID(), type: "playDevelopmentCard", actorId: active.id, cardId, edgeIds: [edgeId] };
    } else command = { id: crypto.randomUUID(), type: "playDevelopmentCard", actorId: active.id, cardId };
    await dispatch(command);
    onClose();
  };
  const names = { knight: "Cavaleiro", roadBuilding: "Construção de estradas", yearOfPlenty: "Ano de abundância", monopoly: "Monopólio", victoryPoint: "Ponto de vitória" };
  return <ModalFrame title="Cartas de horizonte" icon={<BookOpenCheck />} onClose={onClose}>
    <div className="development-list">{active.developmentCards.length === 0 ? <div className="empty-modal"><BookOpenCheck /><p>Você ainda não possui cartas.</p></div> : active.developmentCards.map((card) => {
      const playable = card.kind !== "victoryPoint" && card.purchasedTurn < state.turnNumber && !state.usedDevelopmentCardThisTurn;
      return <article key={card.id}><div className={`dev-card-symbol dev-card-symbol--${card.kind}`}><BookOpenCheck /></div><div><strong>{names[card.kind]}</strong><small>{card.kind === "victoryPoint" ? "Permanece oculto até a vitória" : card.purchasedTurn === state.turnNumber ? "Disponível no próximo turno" : "Pronta para usar"}</small></div><button className="button button--secondary" type="button" disabled={!playable} onClick={() => void play(card.id, card.kind)}>Usar</button></article>;
    })}</div>
  </ModalFrame>;
}

export function DiscardModal({ state, viewerId, dispatch }: Omit<ModalProps, "onClose">) {
  const pending = Object.entries(state.pendingDiscards).filter(([playerId]) => playerId === viewerId);
  const discardAutomatically = async (playerId: string, required: number) => {
    const player = state.players.find((candidate) => candidate.id === playerId)!;
    let remaining = required;
    const resources = RESOURCE_TYPES.reduce<ResourceCounts>((selection, resource) => {
      const amount = Math.min(remaining, player.resources[resource]);
      selection[resource] = amount;
      remaining -= amount;
      return selection;
    }, emptyResources());
    await dispatch({ id: crypto.randomUUID(), type: "discardResources", actorId: playerId, resources });
  };
  return <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-label="Descartar recursos"><header><span><Dices /></span><div><small>RESULTADO 7</small><h2>O andarilho chegou</h2></div></header><p className="modal-note">Jogadores com mais de sete cartas descartam metade, arredondando para baixo.</p><div className="discard-list">{pending.length === 0 ? <div className="empty-modal"><p>Aguardando os outros exploradores descartarem.</p></div> : pending.map(([playerId, amount]) => <article key={playerId}><span className={`avatar-token avatar-token--${state.players.find((player) => player.id === playerId)?.color}`}>{state.players.find((player) => player.id === playerId)?.name[0]}</span><div><strong>{state.players.find((player) => player.id === playerId)?.name}</strong><small>Deve descartar {amount} cartas</small></div><button className="button button--secondary" type="button" onClick={() => void discardAutomatically(playerId, amount)}>Escolher automaticamente</button></article>)}</div></section></div>;
}
