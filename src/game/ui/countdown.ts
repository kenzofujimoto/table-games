export function remainingMilliseconds(deadline: string | null | undefined, now = new Date()): number {
  if (!deadline) return 0;
  const value = Date.parse(deadline) - now.getTime();
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
