/** Every tuning number in one place (also listed in GAME.md "Built"). */
export const TUNING = {
  /** fixed sim tick */
  dt: 1 / 120,
  /** arrow gravity, px/s² */
  gravity: 1500,
  /** player arrow speed at power 0 and 1, px/s */
  speedMin: 620,
  speedMax: 1750,
  /** seconds between player shots before cards */
  reload: 0.5,
  /** enemy arrow speeds */
  enemySpeed: 1050,
  bombSpeed: 780,
  bossSpeed: 1180,
  bombRadius: 85,
  bombDamage: 26,
  /** a player arrow passing this close to a bomb in flight pops it */
  bombHitRadius: 30,
  /** velocity transferred to the body (fraction of arrow velocity) */
  impulse: 0.42,
  /** extra velocity (fraction of the arrow's) given to the whole body on a knockout, plus a hop */
  koKick: 0.22,
  koHop: 260,
  /** muscle multiplier right after a hit (lower = floppier whip) */
  hitMuscle: 0.06,
  /** muscle regained per second */
  muscleRecover: 1.6,
  playerMaxHp: 100,
  waveClearHeal: 12,
  /** apples */
  appleEvery: [9, 14] as const,
  appleHeal: 25,
  appleRadius: 26,
  appleSpeed: 75,
  /** KO'd archers poof into feathers after this long (seconds) */
  poofAfter: 2.4,
  dangleTime: [1.4, 2.4] as const,
  /** cap on arrows stuck in one body (oldest fades first) */
  stuckPerBody: 10,
  stuckLedgeLife: 7,
  /** how far a leg hit shoves the stance, px (× impulse scale) */
  legShove: 20,
  /** pause between the last KO and the card pick */
  clearDelay: 2.1,
  /** player death animation before the result screen */
  dyingTime: 1.7,
} as const;

/** Player world placement (logical px, portrait 720×1280). */
export const PLAYER_LEDGE = { x: 18, y: 1030, w: 250, h: 96 } as const;
export const PLAYER_X = 132;

/** Every archer is drawn and simulated at this size (the boss is bigger still). */
export const ARCHER_SCALE = 1.25;
export const PLAYER_SCALE = ARCHER_SCALE;
