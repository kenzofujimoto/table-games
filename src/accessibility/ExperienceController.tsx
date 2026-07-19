import { useEffect } from "react";

import { useAppStore } from "@/app/store";
import { audioManager } from "@/audio/audio-manager";

import { applyAccessibilitySettings } from "./experience";

export function ExperienceController() {
  const settings = useAppStore((state) => state.settings);

  useEffect(() => {
    applyAccessibilitySettings(settings);
    audioManager.sync(settings);
  }, [settings]);

  useEffect(() => {
    const unlock = () => { void audioManager.unlock(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
