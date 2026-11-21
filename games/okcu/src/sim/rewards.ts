/**
 * The 3D build's run rewards (pure): what a run end, a first boss knockout and the daily goal put
 * into `save.arsenal`. The app only calls these (apps/okcu-3d/src/ui/progress.ts); the economy
 * simulation (sim/economy.ts) follows the same rules. Chests are queued, never opened here.
 *
 * - run end: `runChest(reached)`, once per run; a revived run that dies further on upgrades the
 *   chest it already queued instead of adding a second (`RunBank.chest`);
 * - the first knockout of chapter c's boss: a boss chest and the weapon with `unlockBoss === c`
 *   (level 1, if not owned yet); the sky boss (chapter index 5) brings the celestial look;
 * - the daily goal: a gold chest in place of the 2D game's coins (the streak counts as before).
 */
import type { ChestKind } from './arsenal';
import { CHAPTERS } from './chapters';
import { runChest } from './chests';
import type { RunBank, SaveData } from './meta';
import { meetDailyGoal } from './progress';
import { WEAPON_IDS, WEAPONS } from './weapons';

/** chapter index of the sky (chapter 6) boss, whose first knockout grants the celestial look */
export const SKY_CHAPTER = CHAPTERS - 1;

const RUN_CHEST_ORDER: readonly ChestKind[] = ['wood', 'silver', 'gold'];

/** The reward for the first knockout of chapter `chapter`'s boss (call once per chapter). */
export function grantBossReward(save: SaveData, chapter: number): void {
  const a = save.arsenal;
  a.chests.push('boss');
  for (const id of WEAPON_IDS) if (WEAPONS[id].unlockBoss === chapter) a.weapons[id].owned = true;
  if (chapter === SKY_CHAPTER) a.celestial = true;
}

/**
 * Boss rewards for every chapter whose knockout count went from 0 (in `before`, the counts as they
 * were before this bank) to more. Returns the chapters rewarded.
 */
export function grantFirstBossRewards(save: SaveData, before: readonly number[]): number[] {
  const out: number[] = [];
  for (let c = 0; c < CHAPTERS; c++) {
    if ((before[c] ?? 0) > 0 || (save.bosses[c] ?? 0) <= 0) continue;
    grantBossReward(save, c);
    out.push(c);
  }
  return out;
}

/**
 * The run-end chest: queues `runChest(reached)` the first time this run ends. A revived run ends
 * again: a better chest then replaces the one it queued (if still unopened); otherwise nothing.
 * Returns the kind queued or upgraded to, null when nothing changed.
 */
export function grantRunChest(save: SaveData, bank: RunBank, reached: number): ChestKind | null {
  const kind = runChest(reached);
  const q = save.arsenal.chests;
  if (bank.chest === null) {
    q.push(kind);
    bank.chest = kind;
    return kind;
  }
  if (RUN_CHEST_ORDER.indexOf(kind) <= RUN_CHEST_ORDER.indexOf(bank.chest)) return null;
  const at = q.lastIndexOf(bank.chest);
  if (at < 0) return null;
  q[at] = kind;
  bank.chest = kind;
  return kind;
}

/** The daily challenge, 3D rules: the first time today's goal is met, a gold chest. True if granted. */
export function bankDailyChest(save: SaveData, key: string, reached: number): boolean {
  if (!meetDailyGoal(save, key, reached)) return false;
  save.arsenal.chests.push('gold');
  return true;
}
