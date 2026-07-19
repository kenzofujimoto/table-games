import type { AudioCue } from "./audio-cues";

interface AudioPreferences {
  music: boolean;
  effects: boolean;
  volume: number;
}

export interface MusicPlayer {
  src: string;
  volume: number;
  currentTime: number;
  preload: string;
  onended: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  play: () => Promise<void>;
  pause: () => void;
  load: () => void;
}

export const MUSIC_PLAYLIST = [
  { title: "A Brand New Wisdom", author: "hernandack", src: "/audio/music/a-brand-new-wisdom.ogg" },
  { title: "Winter Dust", author: "hernandack", src: "/audio/music/winter-dust.ogg" },
  { title: "Swinging Sweet", author: "hernandack", src: "/audio/music/swinging-sweet.ogg" },
  { title: "Just Saying Tho", author: "hernandack", src: "/audio/music/just-saying-tho.ogg" },
] as const;

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

type MusicPlayerFactory = () => MusicPlayer;

export class GameAudioManager {
  private context: AudioContext | null = null;
  private musicPlayer: MusicPlayer | null = null;
  private musicPlaying = false;
  private unlocked = false;
  private trackIndex = 0;
  private preferences: AudioPreferences = { music: false, effects: true, volume: 70 };

  constructor(private readonly createMusicPlayer: MusicPlayerFactory = () => new Audio()) {}

  sync(preferences: AudioPreferences): void {
    this.preferences = preferences;
    this.applyMusicVolume();
    if (preferences.music) this.startMusic();
    else this.stopMusic();
  }

  async unlock(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    this.unlocked = true;
    const audioWindow = window as unknown as AudioWindow;
    const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    try {
      if (AudioContextConstructor) {
        this.context ??= new AudioContextConstructor();
        if (this.context.state === "suspended") await this.context.resume();
      }
      if (this.preferences.music) this.startMusic();
      return true;
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
    return Math.max(0, Math.min(1, this.preferences.volume / 100)) * 0.35;
  }

  private applyMusicVolume(): void {
    if (this.musicPlayer) this.musicPlayer.volume = this.musicLevel();
  }

  private ensureMusicPlayer(): MusicPlayer {
    if (this.musicPlayer) return this.musicPlayer;
    const player = this.createMusicPlayer();
    player.src = MUSIC_PLAYLIST[this.trackIndex]!.src;
    player.preload = "auto";
    player.volume = this.musicLevel();
    player.onended = () => this.advanceTrack();
    player.onerror = () => this.advanceTrack();
    this.musicPlayer = player;
    return player;
  }

  private startMusic(): void {
    if (!this.unlocked || !this.preferences.music || this.musicPlaying) return;
    const player = this.ensureMusicPlayer();
    this.musicPlaying = true;
    void player.play().catch((error: unknown) => {
      this.musicPlaying = false;
      console.warn("Background music could not be played", error);
    });
  }

  private stopMusic(): void {
    if (!this.musicPlayer || !this.musicPlaying) return;
    this.musicPlayer.pause();
    this.musicPlaying = false;
  }

  private advanceTrack(): void {
    if (!this.musicPlayer) return;
    this.trackIndex = (this.trackIndex + 1) % MUSIC_PLAYLIST.length;
    this.musicPlayer.src = MUSIC_PLAYLIST[this.trackIndex]!.src;
    this.musicPlayer.currentTime = 0;
    this.musicPlayer.load();
    this.musicPlaying = false;
    this.startMusic();
  }
}

export const audioManager = new GameAudioManager();
