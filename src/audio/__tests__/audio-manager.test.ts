import { describe, expect, it, vi } from "vitest";

import { GameAudioManager, MUSIC_PLAYLIST, type MusicPlayer } from "../audio-manager";

function fakePlayer() {
  const player: MusicPlayer = {
    src: "",
    volume: 1,
    currentTime: 0,
    preload: "none",
    onended: null,
    onerror: null,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
  };
  return player;
}

describe("game audio manager", () => {
  it("starts licensed music only after a user gesture and obeys volume settings", async () => {
    const player = fakePlayer();
    const manager = new GameAudioManager(() => player);

    manager.sync({ music: true, effects: true, volume: 70 });
    expect(player.play).not.toHaveBeenCalled();

    await manager.unlock();

    expect(player.src).toBe(MUSIC_PLAYLIST[0]!.src);
    expect(player.volume).toBeCloseTo(0.245);
    expect(player.play).toHaveBeenCalledOnce();

    manager.sync({ music: false, effects: true, volume: 70 });
    expect(player.pause).toHaveBeenCalledOnce();
  });

  it("advances through the playlist when a track ends", async () => {
    const player = fakePlayer();
    const manager = new GameAudioManager(() => player);
    manager.sync({ music: true, effects: true, volume: 100 });
    await manager.unlock();

    player.onended?.(new Event("ended"));

    expect(player.src).toBe(MUSIC_PLAYLIST[1]!.src);
    expect(player.load).toHaveBeenCalledOnce();
    expect(player.play).toHaveBeenCalledTimes(2);
  });
});
