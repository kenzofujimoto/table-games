import type { AudioCue } from "./audio-cues";

interface AudioPreferences {
  music: boolean;
  effects: boolean;
  volume: number;
}

const CUE_NOTES: Record<AudioCue, { frequency: number; duration: number; wave: OscillatorType }> = {
  dice: { frequency: 145, duration: 0.16, wave: "square" },
  build: { frequency: 330, duration: 0.22, wave: "triangle" },
  trade: { frequency: 520, duration: 0.18, wave: "sine" },
  card: { frequency: 660, duration: 0.28, wave: "sine" },
  turn: { frequency: 240, duration: 0.2, wave: "triangle" },
};

interface AudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

class GameAudioManager {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private preferences: AudioPreferences = { music: false, effects: true, volume: 70 };

  sync(preferences: AudioPreferences): void {
    this.preferences = preferences;
    if (!this.context) return;
    if (preferences.music) this.startMusic();
    else this.stopMusic();
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(this.musicLevel(), this.context.currentTime, 0.08);
  }

  async unlock(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const audioWindow = window as unknown as AudioWindow;
    const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return false;
    try {
      this.context ??= new AudioContextConstructor();
      if (this.context.state === "suspended") await this.context.resume();
      if (this.preferences.music) this.startMusic();
      return this.context.state === "running";
    } catch (error) {
      console.warn("Audio could not be started", error);
      return false;
    }
  }

  play(cue: AudioCue): void {
    if (!this.preferences.effects || this.preferences.volume === 0) return;
    void this.unlock().then((unlocked) => {
      if (!unlocked || !this.context) return;
      const note = CUE_NOTES[cue];
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = note.wave;
      oscillator.frequency.setValueAtTime(note.frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(note.frequency * 1.45, now + note.duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.preferences.volume / 1_800), now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + note.duration + 0.02);
    });
  }

  private musicLevel(): number {
    return Math.max(0.0001, this.preferences.volume / 6_000);
  }

  private startMusic(): void {
    if (!this.context || this.musicOscillators.length > 0) return;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(this.musicLevel(), this.context.currentTime);
    gain.connect(this.context.destination);
    this.musicGain = gain;
    this.musicOscillators = [110, 164.81, 220].map((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, this.context!.currentTime);
      oscillator.detune.setValueAtTime(index * 3 - 3, this.context!.currentTime);
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
  }

  private stopMusic(): void {
    for (const oscillator of this.musicOscillators) oscillator.stop();
    this.musicOscillators = [];
    this.musicGain?.disconnect();
    this.musicGain = null;
  }
}

export const audioManager = new GameAudioManager();
