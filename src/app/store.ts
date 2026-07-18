import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { GameCommand, GameState } from "@/game/application/game-engine";
import { createBrowserGameRepository } from "@/multiplayer/repository-factory";
import type { GameRoom, PlayerProfile } from "@/multiplayer/types";

export interface AccessibilitySettings {
  music: boolean;
  effects: boolean;
  volume: number;
  interfaceScale: "compact" | "comfortable" | "large";
  colorBlind: boolean;
  highContrast: boolean;
  lowPerformance: boolean;
  confirmBuilds: boolean;
}

interface AppStore {
  profile: PlayerProfile | null;
  room: GameRoom | null;
  game: GameState | null;
  settings: AccessibilitySettings;
  error: string | null;
  setProfile: (profile: PlayerProfile) => void;
  setRoom: (room: GameRoom | null) => void;
  setGame: (game: GameState | null) => void;
  setSettings: (settings: Partial<AccessibilitySettings>) => void;
  setError: (error: string | null) => void;
  dispatch: (command: GameCommand) => Promise<GameState | null>;
}

export const repository = createBrowserGameRepository();

const defaultSettings: AccessibilitySettings = {
  music: false,
  effects: true,
  volume: 70,
  interfaceScale: "comfortable",
  colorBlind: false,
  highContrast: false,
  lowPerformance: false,
  confirmBuilds: true,
};

export const useAppStore = create<AppStore>()(persist(
  (set, get) => ({
    profile: null,
    room: null,
    game: null,
    settings: defaultSettings,
    error: null,
    setProfile: (profile) => set({ profile }),
    setRoom: (room) => set({ room }),
    setGame: (game) => set({ game }),
    setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
    setError: (error) => set({ error }),
    dispatch: async (command) => {
      const current = get().game;
      if (!current) {
        set({ error: "Nenhuma partida ativa." });
        return null;
      }
      try {
        const next = await repository.executeCommand(current, command);
        set({ game: next, error: null });
        return next;
      } catch (error) {
        const message = error instanceof Error ? error.message : "A ação não pôde ser concluída.";
        set({ error: message });
        return null;
      }
    },
  }),
  {
    name: "auren:app:v1",
    storage: createJSONStorage(() => window.localStorage),
    partialize: (state) => ({
      profile: state.profile,
      room: state.room,
      game: state.game,
      settings: state.settings,
    }),
  },
));
