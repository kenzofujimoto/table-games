import { ArrowRightLeft, BookOpenCheck, Check, Dices, X } from "lucide-react";
import { useState } from "react";

import type { GameCommand, GameState } from "@/game/application/game-engine";
import { bankTradeRatio, BUILD_COSTS, canAfford } from "@/game/domain/economy";
import { validRoadEdges } from "@/game/domain/placement";
import { RESOURCE_TYPES, emptyResources, type Resource, type ResourceCounts } from "@/game/domain/types";

import { canAcceptTrade, pendingTradeForViewer } from "./player-view";
import { RESOURCE_META } from "./resource-meta";

interface ModalProps {
  state: GameState;
  viewerId: string;
  dispatch: (command: GameCommand) => Promise<GameState | null>;
  onClose: () => void;
}

function ModalFrame({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose?: (() => void) | undefined }) {
  return <div className="modal-backdrop" role="presentation"><section className="game-modal" role="dialog" aria-modal="true" aria-label={title}><header><span>{icon}</span><div><small>AÇÃO DA PARTIDA</small><h2>{title}</h2></div>{onClose && <button type="button" onClick={onClose} aria-label="Fechar"><X /></button>}</header>{children}</section></div>;
}

export function TradeModal({ state, viewerId, dispatch, onClose }: ModalProps) {
  const active = state.players[state.activePlayerIndex]!;
  const viewer = state.players.find((player) => player.id === viewerId)!;
  const [tab, setTab] = useState<"players" | "bank">("players");
  const [give, setGive] = useState<Resource>("wood");
  const [receive, setReceive] = useState<Resource>("ore");
  const [giveAmount, setGiveAmount] = useState(1);
  const [receiveAmount, setReceiveAmount] = useState(1);
  const openTrade = state.trades.find((trade) => trade.status === "open");
  const pendingTrade = pendingTradeForViewer(state, viewer.id);
  const ratio = bankTradeRatio(state.board, viewer.id, give);

  const submit = async () => {
    if (tab === "bank") {
      await dispatch({ id: crypto.randomUUID(), type: "bankTrade", actorId: viewer.id, give, receive, ratio });
      onClose();
      return;
    }
    const offer = { ...emptyResources(), [give]: giveAmount };
    const request = { ...emptyResources(), [receive]: receiveAmount };
    const targetPlayerIds = state.players.filter((player) => player.id !== viewer.id).map((player) => player.id);
    await dispatch({ id: crypto.randomUUID(), type: "proposeTrade", actorId: viewer.id, offer, request, targetPlayerIds });
  };

  const respond = async (response: "accept" | "reject") => {
    if (!openTrade) return;
    const next = await dispatch({
      id: crypto.randomUUID(),
      type: "respondTrade",
      actorId: viewer.id,
      tradeId: openTrade.id,
      response,
    });
    if (next) onClose();
  };

  const cancel = async () => {
    if (!openTrade) return;
    const next = await dispatch({
      id: crypto.randomUUID(),
      type: "cancelTrade",
      actorId: viewer.id,
      tradeId: openTrade.id,
    });
    if (next) onClose();
  };

  const acceptance = openTrade ? canAcceptTrade(state, openTrade, viewer.id) : null;
  const missingDescription = acceptance
    ? RESOURCE_TYPES.filter((resource) => (acceptance.missing[resource] ?? 0) > 0)
      .map((resource) => `${acceptance.missing[resource]} ${RESOURCE_META[resource].label}`)
      .join(", ")
    : "";
  const isValidPlayerBundle = Number.isInteger(giveAmount)
    && giveAmount > 0
    && Number.isInteger(receiveAmount)
    && receiveAmount > 0;
  const title = pendingTrade ? "Solicitação de troca" : "Mesa de comércio";

  return <ModalFrame title={title} icon={<ArrowRightLeft />} onClose={pendingTrade ? undefined : onClose}>
    {!openTrade && <div className="modal-tabs"><button className={tab === "players" ? "is-active" : ""} type="button" onClick={() => setTab("players")}>Com jogadores</button><button className={tab === "bank" ? "is-active" : ""} type="button" onClick={() => setTab("bank")}>Com o banco</button></div>}
    {openTrade ? <div className="open-trade"><span className="status-pill">PROPOSTA ABERTA</span><p>{state.players.find((player) => player.id === openTrade.proposerId)?.name} oferece <strong>{Object.entries(openTrade.offer).filter(([, amount]) => amount > 0).map(([resource, amount]) => `${amount} ${RESOURCE_META[resource as Resource].label}`).join(", ")}</strong> por <strong>{Object.entries(openTrade.request).filter(([, amount]) => amount > 0).map(([resource, amount]) => `${amount} ${RESOURCE_META[resource as Resource].label}`).join(", ")}</strong>.</p>
      {pendingTrade ? <div className="trade-responses"><div><span>Responder como {viewer.name}</span>{!acceptance?.canAccept && <p className="modal-note">Você precisa de {missingDescription} para aceitar.</p>}<button className="button button--secondary" type="button" disabled={!acceptance?.canAccept} onClick={() => void respond("accept")}><Check /> Aceitar</button><button className="button button--ghost" type="button" onClick={() => void respond("reject")}>Recusar</button></div></div> : openTrade.proposerId === viewer.id ? <div className="trade-responses"><p className="modal-note">Aguardando os outros exploradores. O turno só pode terminar após esta proposta ser resolvida.</p><button className="button button--ghost button--full" type="button" onClick={() => void cancel()}>Cancelar proposta</button></div> : <p className="modal-note">Você já recusou esta proposta. Aguardando os outros exploradores.</p>}
    </div> : <>
      <div className="trade-builder"><label><span>Você oferece</span><select className="text-input" value={give} onChange={(event) => setGive(event.target.value as Resource)}>{RESOURCE_TYPES.map((resource) => <option value={resource} key={resource}>{RESOURCE_META[resource].label} ({viewer.resources[resource]})</option>)}</select>{tab === "players" && <input className="text-input" type="number" min="1" max="19" aria-label="Quantidade oferecida" value={giveAmount} onChange={(event) => setGiveAmount(Number(event.target.value))} />}</label><ArrowRightLeft /><label><span>Você recebe</span><select className="text-input" value={receive} onChange={(event) => setReceive(event.target.value as Resource)}>{RESOURCE_TYPES.map((resource) => <option value={resource} key={resource}>{RESOURCE_META[resource].label}</option>)}</select>{tab === "players" && <input className="text-input" type="number" min="1" max="19" aria-label="Quantidade solicitada" value={receiveAmount} onChange={(event) => setReceiveAmount(Number(event.target.value))} />}</label></div>
      {tab === "players" && <p className="modal-note">A solicitação será enviada a todos os outros exploradores. O primeiro aceite conclui a troca.</p>}
      {tab === "bank" && <p className="modal-note">Taxa atual para {RESOURCE_META[give].label.toLowerCase()}: {ratio}:1.</p>}
      <button className="button button--primary button--full" type="button" disabled={active.id !== viewer.id || give === receive || !isValidPlayerBundle || viewer.resources[give] < (tab === "bank" ? ratio : giveAmount)} onClick={() => void submit()}>{tab === "bank" ? "Negociar com o banco" : "Enviar proposta"}</button>
    </>}
  </ModalFrame>;
}

export function DevelopmentModal({ state, viewerId, dispatch, onClose }: ModalProps) {
  const viewer = state.players.find((player) => player.id === viewerId)!;
  const isActive = state.players[state.activePlayerIndex]?.id === viewer.id;
  const canBuy = state.phase === "actions"
    && isActive
    && state.developmentDeck.length > 0
    && canAfford(viewer.resources, BUILD_COSTS.developmentCard);
  const buy = async () => {
    const next = await dispatch({ id: crypto.randomUUID(), type: "buyDevelopmentCard", actorId: viewer.id });
    if (next) onClose();
  };
  const play = async (cardId: string, kind: string) => {
    let command: GameCommand;
    if (kind === "monopoly") command = { id: crypto.randomUUID(), type: "playDevelopmentCard", actorId: viewer.id, cardId, resource: "ore" };
    else if (kind === "yearOfPlenty") command = { id: crypto.randomUUID(), type: "playDevelopmentCard", actorId: viewer.id, cardId, resources: ["grain", "ore"] };
    else if (kind === "roadBuilding") {
      const edgeId = validRoadEdges(state.board, viewer.id)[0];
      if (!edgeId) return;
      command = { id: crypto.randomUUID(), type: "playDevelopmentCard", actorId: viewer.id, cardId, edgeIds: [edgeId] };
    } else command = { id: crypto.randomUUID(), type: "playDevelopmentCard", actorId: viewer.id, cardId };
    await dispatch(command);
    onClose();
  };
  const names = { knight: "Cavaleiro", roadBuilding: "Construção de estradas", yearOfPlenty: "Ano de abundância", monopoly: "Monopólio", victoryPoint: "Ponto de vitória" };
  return <ModalFrame title="Cartas de horizonte" icon={<BookOpenCheck />} onClose={onClose}>
    <p className="modal-note">O baralho possui {state.developmentDeck.length} cartas. A compra custa 1 lã, 1 trigo e 1 minério.</p>
    <button className="button button--primary button--full" type="button" disabled={!canBuy} onClick={() => void buy()}>Comprar carta</button>
    <div className="development-list">{viewer.developmentCards.length === 0 ? <div className="empty-modal"><BookOpenCheck /><p>Você ainda não possui cartas.</p></div> : viewer.developmentCards.map((card) => {
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
