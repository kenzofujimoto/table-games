import { describe, expect, it } from "vitest";

import { clampCamera, clientDeltaToViewBox } from "../board-camera";

describe("board camera", () => {
  it("keeps a fitted board centered and clamps the supported zoom range", () => {
    expect(clampCamera({ x: 400, y: -300, zoom: 0.2 })).toEqual({ x: 0, y: 0, zoom: 0.65 });
    expect(clampCamera({ x: 400, y: -300, zoom: 3 })).toEqual({ x: 222.5, y: -197.5, zoom: 1.75 });
  });

  it("converts pointer pixels into stable SVG view-box units", () => {
    expect(clientDeltaToViewBox(
      { x: 100, y: 50 },
      { width: 390, height: 310 },
    )).toEqual({ x: 200, y: 100 });
  });
});
