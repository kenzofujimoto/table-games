import {
  terrainResource,
  type Board,
  type BoardEdge,
  type BoardPort,
  type BoardTile,
  type BoardVertex,
  type Terrain,
} from "./types.js";

const CLASSIC_TERRAINS: Terrain[] = [
  ...Array<Terrain>(4).fill("forest"),
  ...Array<Terrain>(3).fill("hills"),
  ...Array<Terrain>(4).fill("pasture"),
  ...Array<Terrain>(4).fill("fields"),
  ...Array<Terrain>(3).fill("mountains"),
  "desert",
];

const CLASSIC_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORT_KINDS = ["generic", "wood", "generic", "brick", "wool", "generic", "grain", "generic", "ore"] as const;

function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function seededRandom(seed: string): () => number {
  const seedHash = xmur3(seed);
  let state = seedHash();
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(input: readonly T[], random: () => number): T[] {
  const result = [...input];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function coordinates(): Array<{ q: number; r: number }> {
  const result: Array<{ q: number; r: number }> = [];
  for (let r = -2; r <= 2; r += 1) {
    for (let q = -2; q <= 2; q += 1) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 2) {
        result.push({ q, r });
      }
    }
  }
  return result;
}

function axialAdjacent(first: Pick<BoardTile, "q" | "r">, second: Pick<BoardTile, "q" | "r">): boolean {
  const dq = first.q - second.q;
  const dr = first.r - second.r;
  const ds = -first.q - first.r - (-second.q - second.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) === 1;
}

function terrainLayout(random: () => number, coords: Array<{ q: number; r: number }>): Terrain[] {
  let candidate = shuffle(CLASSIC_TERRAINS, random);
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const clustered = candidate.some((terrain, index) => {
      if (terrain === "desert") return false;
      return coords.filter((coord, otherIndex) => otherIndex !== index && candidate[otherIndex] === terrain && axialAdjacent(coords[index]!, coord)).length > 2;
    });
    if (!clustered) return candidate;
    candidate = shuffle(CLASSIC_TERRAINS, random);
  }
  return candidate;
}

function numberLayout(
  random: () => number,
  coords: Array<{ q: number; r: number }>,
  terrains: Terrain[],
): Array<number | null> {
  const productiveIndices = terrains.flatMap((terrain, index) => terrain === "desert" ? [] : [index]);
  let candidate = shuffle(CLASSIC_NUMBERS, random);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const values = terrains.map((): number | null => null);
    productiveIndices.forEach((tileIndex, numberIndex) => {
      values[tileIndex] = candidate[numberIndex]!;
    });
    const adjacentHigh = productiveIndices.some((tileIndex) => {
      const value = values[tileIndex];
      return (value === 6 || value === 8) && productiveIndices.some((otherIndex) =>
        otherIndex !== tileIndex &&
        (values[otherIndex] === 6 || values[otherIndex] === 8) &&
        axialAdjacent(coords[tileIndex]!, coords[otherIndex]!),
      );
    });
    if (!adjacentHigh) return values;
    candidate = shuffle(CLASSIC_NUMBERS, random);
  }
  throw new Error("Unable to generate a balanced number layout");
}

function pointKey(x: number, y: number): string {
  return `${x.toFixed(4)},${y.toFixed(4)}`;
}

function buildTopology(
  seed: string,
  coords: Array<{ q: number; r: number }>,
  terrains: Terrain[],
  numbers: Array<number | null>,
): Board {
  const vertices: BoardVertex[] = [];
  const vertexByPoint = new Map<string, BoardVertex>();
  const edges: BoardEdge[] = [];
  const edgeByVertices = new Map<string, BoardEdge>();
  const tiles: BoardTile[] = coords.map((coord, tileIndex) => {
    const tileId = `t-${coord.q}-${coord.r}`;
    const centerX = Math.sqrt(3) * (coord.q + coord.r / 2);
    const centerY = 1.5 * coord.r;
    const tileVertexIds: string[] = [];

    for (let corner = 0; corner < 6; corner += 1) {
      const angle = ((60 * corner - 30) * Math.PI) / 180;
      const x = centerX + Math.cos(angle);
      const y = centerY + Math.sin(angle);
      const key = pointKey(x, y);
      let vertex = vertexByPoint.get(key);
      if (!vertex) {
        vertex = { id: `v-${vertices.length}`, tileIds: [], building: null, x, y };
        vertices.push(vertex);
        vertexByPoint.set(key, vertex);
      }
      vertex.tileIds.push(tileId);
      tileVertexIds.push(vertex.id);
    }

    for (let corner = 0; corner < 6; corner += 1) {
      const first = tileVertexIds[corner]!;
      const second = tileVertexIds[(corner + 1) % 6]!;
      const pair = [first, second].sort();
      const key = pair.join(":");
      if (!edgeByVertices.has(key)) {
        const edge: BoardEdge = {
          id: `e-${edges.length}`,
          vertexIds: [first, second],
          roadPlayerId: null,
        };
        edges.push(edge);
        edgeByVertices.set(key, edge);
      }
    }

    const terrain = terrains[tileIndex]!;
    return {
      id: tileId,
      ...coord,
      terrain,
      resource: terrainResource(terrain),
      number: numbers[tileIndex] ?? null,
      hasRobber: terrain === "desert",
      vertexIds: tileVertexIds,
    };
  });

  const coast = edges.filter((edge) => {
    const [first, second] = edge.vertexIds.map((id) => vertices.find((vertex) => vertex.id === id));
    return first !== undefined && second !== undefined && first.tileIds.length < 3 && second.tileIds.length < 3;
  });
  const orderedCoast = [...coast].sort((first, second) => {
    const midpoint = (edge: BoardEdge) => {
      const points = edge.vertexIds.map((id) => vertices.find((vertex) => vertex.id === id)!);
      return { x: (points[0]!.x! + points[1]!.x!) / 2, y: (points[0]!.y! + points[1]!.y!) / 2 };
    };
    const a = midpoint(first);
    const b = midpoint(second);
    return Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x);
  });
  const random = seededRandom(`${seed}:ports`);
  const portKinds = shuffle(PORT_KINDS, random);
  const step = orderedCoast.length / 9;
  const ports: BoardPort[] = portKinds.map((kind, index) => ({
    id: `port-${index}`,
    edgeId: orderedCoast[Math.floor(index * step)]!.id,
    kind,
    ratio: kind === "generic" ? 3 : 2,
  }));

  return { seed, tiles, vertices, edges, ports };
}

export function generateBoard(options: { seed: string; shape: "classic" }): Board {
  if (options.seed.trim().length === 0) {
    throw new Error("A board seed is required");
  }
  const coords = coordinates();
  const random = seededRandom(options.seed);
  const terrains = terrainLayout(random, coords);
  const numbers = numberLayout(random, coords, terrains);
  return buildTopology(options.seed, coords, terrains, numbers);
}

export function validateBoardBalance(board: Board): { balanced: boolean; issues: string[] } {
  const issues: string[] = [];
  if (board.tiles.length !== 19) issues.push("Classic board must contain 19 tiles");
  const resources = new Set(board.tiles.flatMap((tile) => tile.resource ?? []));
  if (resources.size !== 5) issues.push("Every resource must be present");
  if (board.tiles.filter((tile) => tile.terrain === "desert").length !== 1) issues.push("Exactly one desert is required");

  for (const tile of board.tiles.filter((candidate) => candidate.number === 6 || candidate.number === 8)) {
    if (board.tiles.some((candidate) =>
      candidate.id !== tile.id &&
      (candidate.number === 6 || candidate.number === 8) &&
      axialAdjacent(tile, candidate),
    )) {
      issues.push("Production numbers 6 and 8 cannot be adjacent");
      break;
    }
  }

  return { balanced: issues.length === 0, issues };
}
