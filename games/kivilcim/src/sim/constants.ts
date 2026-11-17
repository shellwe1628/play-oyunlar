/** Fixed-tick constants shared by the run sim, the solver and the scenes. Pure. */

/** Sim ticks per second. Every run advances in exactly these steps, whatever the frame rate. */
export const TICK_HZ = 120;
export const DT = 1 / TICK_HZ;

/** Logical shaft width = canvas width (portrait 720). */
export const SHAFT_W = 720;
export const START_X = SHAFT_W / 2;

/** Collision radius of the spark, normal and after a mini gate (px). */
export const SPARK_R = 13;
export const MINI_R = 7.5;

/** Scroll-speed multipliers set by gates. Lateral speed always equals scroll speed (45°). */
export const SPEED_MULT = { slow: 0.72, normal: 1, fast: 1.38 } as const;

/**
 * Beat grid in world px. Music tempo is derived from scroll speed so that one beat is always
 * BEAT_PX of climb: gates snapped to this grid land on the beat at any speed.
 */
export const BEAT_PX = 256;
export const STEP_PX = BEAT_PX / 4;

/** Clearance below which passing a hazard counts as a near miss (px), and its release hysteresis. */
export const NEAR_PX = 10;
export const NEAR_RELEASE_PX = 16;
/** Consecutive near misses within this many seconds raise the edge combo. */
export const EDGE_WINDOW_S = 2;

/** Gem pickup radius (px). */
export const GEM_R = 20;

/** Distances are only resolved up to this cap (px); farther hazards read as CLEAR_CAP. */
export const CLEAR_CAP = 220;
