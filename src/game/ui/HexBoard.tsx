import { LocateFixed, Minus, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { GameState } from "@/game/application/game-engine";
import type { BoardPort } from "@/game/domain/types";

import { clampCamera, clientDeltaToViewBox } from "./board-camera";

interface HexBoardProps {
  state: GameState;
  validVertexIds: Set<string>;
  validEdgeIds: Set<string>;
  selectableTiles: boolean;
  onVertex: (vertexId: string) => void;
  onEdge: (edgeId: string) => void;
  onTile: (tileId: string) => void;
}

const SCALE = 70;
const HEX_SIZE = 66;

function center(q: number, r: number) {
  return { x: Math.sqrt(3) * (q + r / 2) * SCALE, y: 1.5 * r * SCALE };
}

function hexPoints(x: number, y: number, size = HEX_SIZE): string {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = ((60 * corner - 30) * Math.PI) / 180;
    return `${x + Math.cos(angle) * size},${y + Math.sin(angle) * size}`;
  }).join(" ");
}

const terrainLabel = {
  forest: "Floresta",
  hills: "Colinas",
  pasture: "Pasto",
  fields: "Campos",
  mountains: "Montanhas",
  desert: "Deserto",
};

const portLabel = {
  generic: "geral",
  wood: "madeira",
  brick: "tijolo",
  wool: "lã",
  grain: "trigo",
  ore: "minério",
};

function portAriaLabel(port: BoardPort): string {
  return `Porto ${port.kind === "generic" ? "geral" : `de ${portLabel[port.kind]}`} ${port.ratio} por 1`;
}

export function HexBoard({ state, validVertexIds, validEdgeIds, selectableTiles, onVertex, onEdge, onTile }: HexBoardProps) {
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const playerColors = useMemo(() => Object.fromEntries(state.players.map((player) => [player.id, player.color])), [state.players]);

  const zoom = (delta: number) => setCamera((current) => clampCamera({ ...current, zoom: current.zoom + delta }));
  const reset = () => setCamera({ x: 0, y: 0, zoom: 1 });

  return (
    <div className="board-viewport">
      <div className="board-tools">
        <button type="button" onClick={() => zoom(0.15)} aria-label="Aproximar"><Plus /></button>
        <button type="button" onClick={() => zoom(-0.15)} aria-label="Afastar"><Minus /></button>
        <button type="button" onClick={reset} aria-label="Recentrar"><LocateFixed /></button>
      </div>
      <svg
        className="hex-board"
        viewBox="-390 -310 780 620"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Tabuleiro hexagonal interativo"
        onWheel={(event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 0.08 : -0.08); }}
        onPointerDown={(event) => {
          if ((event.target as Element).closest("[data-interactive]")) return;
          drag.current = { x: event.clientX, y: event.clientY, originX: camera.x, originY: camera.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const delta = clientDeltaToViewBox(
            { x: event.clientX - drag.current.x, y: event.clientY - drag.current.y },
            event.currentTarget.getBoundingClientRect(),
          );
          setCamera((current) => clampCamera({
            ...current,
            x: drag.current!.originX + delta.x,
            y: drag.current!.originY + delta.y,
          }));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <defs>
          <filter id="tile-shadow"><feDropShadow dx="0" dy="5" stdDeviation="5" floodOpacity=".38" /></filter>
          <linearGradient id="ocean" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#173c43" /><stop offset="1" stopColor="#0a262d" /></linearGradient>
          {Object.keys(terrainLabel).map((terrain) => <pattern key={terrain} id={`terrain-${terrain}`} patternUnits="userSpaceOnUse" width="132" height="132">
            <image href={`/textures/${terrain}.webp`} x="0" y="0" width="132" height="132" preserveAspectRatio="xMidYMid slice" />
          </pattern>)}
        </defs>
        <rect className="board-ocean-backdrop" x="-2048" y="-2048" width="4096" height="4096" fill="url(#ocean)" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {state.board.ports.map((port) => {
            const edge = state.board.edges.find((candidate) => candidate.id === port.edgeId);
            const first = state.board.vertices.find((vertex) => vertex.id === edge?.vertexIds[0]);
            const second = state.board.vertices.find((vertex) => vertex.id === edge?.vertexIds[1]);
            if (first?.x === undefined || first.y === undefined || second?.x === undefined || second.y === undefined) return null;
            const x1 = first.x * SCALE; const y1 = first.y * SCALE;
            const x2 = second.x * SCALE; const y2 = second.y * SCALE;
            const midpointX = (x1 + x2) / 2; const midpointY = (y1 + y2) / 2;
            const distance = Math.hypot(midpointX, midpointY) || 1;
            const x = midpointX + (midpointX / distance) * 22;
            const y = midpointY + (midpointY / distance) * 22;
            return <g key={port.id} className={`board-port board-port--${port.kind}`} aria-label={portAriaLabel(port)}>
              <line className="port-pier" x1={x1} y1={y1} x2={x} y2={y} />
              <line className="port-pier" x1={x2} y1={y2} x2={x} y2={y} />
              <circle className="port-badge" cx={x} cy={y} r="19" />
              <text className="port-ratio" x={x} y={y + 4}>{port.ratio}:1</text>
            </g>;
          })}

          {state.board.tiles.map((tile) => {
            const point = center(tile.q, tile.r);
            const probability = tile.number === null ? 0 : 6 - Math.abs(7 - tile.number);
            return (
              <g key={tile.id} className={`board-tile board-tile--${tile.terrain} ${selectableTiles && !tile.hasRobber ? "is-selectable" : ""}`} data-interactive={selectableTiles ? "true" : undefined} onClick={() => selectableTiles && !tile.hasRobber && onTile(tile.id)} aria-label={`${terrainLabel[tile.terrain]} ${tile.number ?? ""}`}>
                <polygon points={hexPoints(point.x, point.y)} className="tile-base" filter="url(#tile-shadow)" />
                <polygon points={`${point.x - 46},${point.y - 27} ${point.x},${point.y - 59} ${point.x + 5},${point.y - 5} ${point.x - 36},${point.y + 23}`} className="tile-facet tile-facet--light" />
                <polygon points={`${point.x + 5},${point.y - 5} ${point.x + 54},${point.y - 30} ${point.x + 48},${point.y + 27} ${point.x + 2},${point.y + 57}`} className="tile-facet tile-facet--dark" />
                {tile.number && <g className={`number-token ${tile.number === 6 || tile.number === 8 ? "is-hot" : ""}`}><circle cx={point.x} cy={point.y} r="21" /><text x={point.x} y={point.y + 7}>{tile.number}</text><g className="probability-dots">{Array.from({ length: probability }, (_, index) => <circle key={index} cx={point.x - ((probability - 1) * 2.5) + index * 5} cy={point.y + 13} r="1.2" />)}</g></g>}
                {tile.hasRobber && <g className="robber-piece"><path d={`M ${point.x - 12} ${point.y + 24} Q ${point.x - 18} ${point.y - 8} ${point.x} ${point.y - 29} Q ${point.x + 18} ${point.y - 8} ${point.x + 12} ${point.y + 24} Z`} /><circle cx={point.x} cy={point.y - 31} r="10" /></g>}
              </g>
            );
          })}

          {state.board.edges.map((edge) => {
            const first = state.board.vertices.find((vertex) => vertex.id === edge.vertexIds[0]);
            const second = state.board.vertices.find((vertex) => vertex.id === edge.vertexIds[1]);
            if (first?.x === undefined || first.y === undefined || second?.x === undefined || second.y === undefined) return null;
            const x1 = first.x * SCALE; const y1 = first.y * SCALE; const x2 = second.x * SCALE; const y2 = second.y * SCALE;
            return <g key={edge.id} className={`board-edge ${validEdgeIds.has(edge.id) ? "is-valid" : ""}`} data-interactive={validEdgeIds.has(edge.id) ? "true" : undefined} onClick={() => validEdgeIds.has(edge.id) && onEdge(edge.id)}>
              <line className="edge-hit" x1={x1} y1={y1} x2={x2} y2={y2} />
              {(edge.roadPlayerId || validEdgeIds.has(edge.id)) && <line className={`road road--${edge.roadPlayerId ? playerColors[edge.roadPlayerId] : "preview"}`} x1={x1} y1={y1} x2={x2} y2={y2} />}
            </g>;
          })}

          {state.board.vertices.map((vertex) => {
            if (vertex.x === undefined || vertex.y === undefined) return null;
            const x = vertex.x * SCALE; const y = vertex.y * SCALE;
            return <g key={vertex.id} className={`board-vertex ${validVertexIds.has(vertex.id) ? "is-valid" : ""}`} data-interactive={validVertexIds.has(vertex.id) ? "true" : undefined} onClick={() => validVertexIds.has(vertex.id) && onVertex(vertex.id)}>
              {validVertexIds.has(vertex.id) && <circle className="valid-position" cx={x} cy={y} r="11" />}
              {vertex.building?.kind === "settlement" && <path className={`building building--${playerColors[vertex.building.playerId]}`} d={`M ${x - 10} ${y + 9} L ${x - 10} ${y - 2} L ${x} ${y - 12} L ${x + 10} ${y - 2} L ${x + 10} ${y + 9} Z`} />}
              {vertex.building?.kind === "city" && <path className={`building building--${playerColors[vertex.building.playerId]}`} d={`M ${x - 13} ${y + 10} L ${x - 13} ${y - 6} L ${x - 4} ${y - 6} L ${x - 4} ${y - 15} L ${x + 5} ${y - 15} L ${x + 5} ${y - 5} L ${x + 14} ${y - 5} L ${x + 14} ${y + 10} Z`} />}
            </g>;
          })}
        </g>
      </svg>
    </div>
  );
}
