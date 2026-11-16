/** Persistent progress rules (pure). The shape is stored by src/save.ts. */
export interface SaveData {
  best: number;
  rounds: number;
}

export const SAVE_DEFAULTS: SaveData = { best: 0, rounds: 0 };

/** Record a finished round. Mutates data; returns the best score and whether it was beaten. */
export function applyRoundResult(data: SaveData, score: number): { best: number; newBest: boolean } {
  data.rounds += 1;
  const newBest = score > data.best;
  if (newBest) data.best = score;
  return { best: data.best, newBest };
}
