/** Scene keys. One place so scenes never typo each other's names. */
export const SCENES = {
  menu: 'menu',
  nights: 'nights',
  game: 'game',
  result: 'result',
  logbook: 'logbook',
} as const;

/** What GameScene is asked to play. */
export interface ShiftData {
  mode: 'campaign' | 'daily';
  /** Campaign night 1..7 (daily uses its own difficulty). */
  night: number;
  /** Daily: calendar day YYYY-MM-DD. */
  day?: string;
}

/** Today's calendar day in the player's local time zone. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
