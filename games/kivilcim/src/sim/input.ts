/**
 * Press/release edges with their event times, applied per sim tick (pure, fixed buffer).
 *
 * Each tick k covers real time (T(k-1), T(k)]. An edge at time e applies from the first tick with
 * T(k) >= e, so a press that happens late in a long frame does not act on the ticks before it.
 * At most one edge applies per tick: a press and release inside one tick still give one held
 * tick (and a release shorter than a tick one released tick); later edges move to later ticks.
 */
const CAP = 64;

export class EdgeQueue {
  private readonly times = new Float64Array(CAP);
  private readonly states = new Uint8Array(CAP);
  private head = 0;
  private count = 0;
  /** Input applied to the last tick. */
  held: boolean;
  /** State after the last queued edge (to drop repeats). */
  private last: boolean;

  constructor(held = false) {
    this.held = held;
    this.last = held;
  }

  get pending(): number {
    return this.count;
  }

  /** Queue an edge (event time in ms, any monotonic clock shared with next()). */
  push(held: boolean, time: number): void {
    if (held === this.last) return;
    this.last = held;
    if (this.count === CAP) {
      // Overflow (a stalled game): drop the oldest edge, keeping the order of the rest.
      this.held = this.states[this.head] === 1;
      this.head = (this.head + 1) % CAP;
      this.count--;
    }
    const i = (this.head + this.count) % CAP;
    this.times[i] = time;
    this.states[i] = held ? 1 : 0;
    this.count++;
  }

  /** Input for the tick ending at real time `tickTime`. */
  next(tickTime: number): boolean {
    if (this.count > 0 && this.times[this.head]! <= tickTime) {
      this.held = this.states[this.head] === 1;
      this.head = (this.head + 1) % CAP;
      this.count--;
    }
    return this.held;
  }

  /** Drop pending edges and set the state (run start, resume, autopilot). */
  reset(held: boolean): void {
    this.head = 0;
    this.count = 0;
    this.held = held;
    this.last = held;
  }
}
