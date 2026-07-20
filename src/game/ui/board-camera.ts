export interface BoardCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export const BOARD_VIEWBOX: ViewportSize = { width: 780, height: 620 };
export const MIN_BOARD_ZOOM = 0.65;
export const MAX_BOARD_ZOOM = 1.75;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clampCamera(camera: BoardCamera): BoardCamera {
  const zoom = clamp(Number.isFinite(camera.zoom) ? camera.zoom : 1, MIN_BOARD_ZOOM, MAX_BOARD_ZOOM);
  return { x: 0, y: 0, zoom };
}

export function clientDeltaToViewBox(
  delta: { x: number; y: number },
  viewport: ViewportSize,
): { x: number; y: number } {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return { x: 0, y: 0 };
  const scale = Math.min(viewport.width / BOARD_VIEWBOX.width, viewport.height / BOARD_VIEWBOX.height);
  if (!Number.isFinite(scale) || scale <= 0) return { x: 0, y: 0 };
  return { x: delta.x / scale, y: delta.y / scale };
}
