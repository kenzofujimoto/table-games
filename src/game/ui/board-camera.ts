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
export const BOARD_CONTENT_BOUNDS: ViewportSize = { width: 700, height: 580 };
export const MIN_BOARD_ZOOM = 0.65;
export const MAX_BOARD_ZOOM = 1.75;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clampCamera(camera: BoardCamera): BoardCamera {
  const zoom = clamp(camera.zoom, MIN_BOARD_ZOOM, MAX_BOARD_ZOOM);
  const maximumX = Math.max(0, (BOARD_CONTENT_BOUNDS.width * zoom - BOARD_VIEWBOX.width) / 2);
  const maximumY = Math.max(0, (BOARD_CONTENT_BOUNDS.height * zoom - BOARD_VIEWBOX.height) / 2);
  return {
    x: maximumX === 0 ? 0 : clamp(camera.x, -maximumX, maximumX),
    y: maximumY === 0 ? 0 : clamp(camera.y, -maximumY, maximumY),
    zoom,
  };
}

export function clientDeltaToViewBox(
  delta: { x: number; y: number },
  viewport: ViewportSize,
): { x: number; y: number } {
  const scale = Math.min(viewport.width / BOARD_VIEWBOX.width, viewport.height / BOARD_VIEWBOX.height);
  if (!Number.isFinite(scale) || scale <= 0) return { x: 0, y: 0 };
  return { x: delta.x / scale, y: delta.y / scale };
}
