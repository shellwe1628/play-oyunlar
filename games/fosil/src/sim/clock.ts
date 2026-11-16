/**
 * Away-time credit (pure). The stored last-seen time only ever moves forward, so winding the
 * device clock forward, collecting, winding it back and repeating earns nothing until real time
 * passes the stored value again.
 */
export function awayCredit(lastSeen: number, now: number): { seconds: number; lastSeen: number } {
  if (!(lastSeen > 0)) return { seconds: 0, lastSeen: Math.max(0, now) };
  return { seconds: Math.max(0, (now - lastSeen) / 1000), lastSeen: Math.max(lastSeen, now) };
}
