/**
 * Away-time credit (pure). The stored last-seen time only ever moves forward, so winding the
 * device clock forward, collecting, winding it back and repeating earns nothing until real time
 * passes the stored value again.
 */
export function awayCredit(lastSeen: number, now: number): { seconds: number; lastSeen: number } {
  if (!(lastSeen > 0)) return { seconds: 0, lastSeen: Math.max(0, now) };
  return { seconds: Math.max(0, (now - lastSeen) / 1000), lastSeen: Math.max(lastSeen, now) };
}

/**
 * A wall-clock cooldown on the same rule. `seen` is the latest time this save has ever observed
 * and only moves forward, and the wait is counted from it: a clock wound back does not shorten
 * the wait, and winding it back and forth over the same hours earns nothing; only time beyond
 * the latest ever seen counts. `readyAt` 0 (or less) means no cooldown is running.
 */
export function cooldown(readyAt: number, seen: number, now: number): { seconds: number; seen: number } {
  const t = Math.max(seen > 0 ? seen : 0, now > 0 && Number.isFinite(now) ? now : 0);
  return { seconds: readyAt > t ? (readyAt - t) / 1000 : 0, seen: t };
}
