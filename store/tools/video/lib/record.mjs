// Frame recorder: the game runs on Playwright's paused fake clock and every video frame is one
// clock step (1/30 s of game time, or 1/(30·density) s for slow-motion material), so a slow
// machine still gets every frame and two runs give the same pictures.
//
// A clip is a folder of JPEG frames plus clip.json: each frame's game time `t` (ms since the clip
// started), named marks (moments the edit can cut on) and the game's sound events (played back by
// the audio render at the matching video time).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Animation driver for DOM games: Web Animations and CSS transitions run on the compositor's real
 * clock, which the fake clock does not move. This pauses every animation and sets its time from
 * the fake clock instead (finishing it when it is over, so onfinish handlers still run).
 */
export const DOM_ANIMATION_DRIVER = `
(() => {
  const seen = new WeakMap();
  let now = 0;
  window.__vanim = (dt) => {
    now += dt;
    for (const a of document.getAnimations()) {
      let rec = seen.get(a);
      if (!rec) {
        rec = { start: now - dt, base: 0, done: false };
        seen.set(a, rec);
      }
      if (rec.done) continue;
      const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
      const end = timing ? timing.endTime : Infinity;
      const local = rec.base + (now - rec.start) * (a.playbackRate || 1);
      if (Number.isFinite(end) && local >= end) {
        rec.done = true;
        try { a.finish(); } catch { a.cancel(); }
        continue;
      }
      if (a.playState !== 'paused') a.pause();
      a.currentTime = local;
    }
  };
})();
`;

export class Recorder {
  /**
   * page: a page whose clock is installed and paused. root: folder for this game's clips.
   * step(dt) (optional): page-side hook called after every clock step; returns sound events.
   */
  constructor(page, root, { quality = 90, clip = undefined } = {}) {
    this.page = page;
    this.root = root;
    this.quality = quality;
    this.shotClip = clip;
    this.cur = null;
    this.frameMs = 1000 / 30;
  }

  /** Start a clip. density 2 records 60 frames per game second (for slow motion in the edit). */
  start(id, { density = 1 } = {}) {
    if (this.cur) throw new Error(`clip ${this.cur.id} still open`);
    const dir = join(this.root, id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    this.cur = { id, dir, t: 0, next: 0, k: 0, density, frames: [], marks: {}, events: [], capturing: true };
    return this;
  }

  density(d) {
    this.cur.density = d;
    return this;
  }

  /** Name the current clip time (ms) so the edit can cut relative to it. */
  mark(name) {
    if (this.cur) this.cur.marks[name] = this.cur.t;
  }

  get t() {
    return this.cur ? this.cur.t : 0;
  }

  async #hook(dt) {
    const ev = await this.page.evaluate((d) => {
      if (window.__vanim) window.__vanim(d);
      return window.__vstep ? window.__vstep(d) : null;
    }, dt);
    if (this.cur && this.cur.capturing && ev && ev.length) for (const e of ev) this.cur.events.push({ ...e, t: this.cur.t });
  }

  async #shoot() {
    const c = this.cur;
    const name = `${String(c.frames.length).padStart(5, '0')}.jpg`;
    await this.page.screenshot({ path: join(c.dir, name), type: 'jpeg', quality: this.quality, ...(this.shotClip ? { clip: this.shotClip } : {}) });
    c.frames.push({ f: name, t: Math.round(c.t * 10) / 10 });
  }

  /**
   * Advance `ms` of game time. Inside an open, capturing clip a frame is taken at every frame
   * boundary; the last step lands exactly on `ms` (input timing stays exact). Same signature as
   * the store's g.run(ms, frame), so the store's shot helpers can drive a recording.
   */
  async run(ms) {
    // whole milliseconds only: input timing in the games (e.g. Sparkrise edges stamped with
    // performance.now()) drifts off the planned ticks with fractional clock steps
    let left = Math.round(ms);
    while (left > 0) {
      const c = this.cur;
      if (c && c.capturing) {
        const toNext = c.next - c.t;
        if (toNext <= 1e-6) {
          await this.#shoot();
          c.k++;
          c.next = Math.round((c.k * this.frameMs) / c.density);
          continue;
        }
        const d = Math.min(left, toNext);
        await this.page.clock.fastForward(d);
        c.t += d;
        left -= d;
        await this.#hook(d);
      } else {
        const d = Math.min(left, 33);
        await this.page.clock.fastForward(d);
        left -= d; // skipped time is not clip time: the clip stays continuous
        await this.#hook(d);
      }
    }
  }

  /** Advance without taking frames (time still runs in frame-sized steps, so the game animates). */
  async skip(ms) {
    const c = this.cur;
    const was = c?.capturing;
    if (c) c.capturing = false;
    await this.run(ms);
    if (c) c.capturing = was;
  }

  /** Step frames until `test()` (async, Node side) is true. */
  async until(test, { max = 20000, what = 'condition' } = {}) {
    for (let t = 0; t <= max; t += this.frameMs) {
      if (await test()) return;
      await this.run(this.frameMs);
    }
    throw new Error(`recorder: timed out waiting for ${what}`);
  }

  /** Close the clip and write clip.json; returns its manifest. */
  end() {
    const c = this.cur;
    if (!c) throw new Error('no open clip');
    if (c.frames.length === 0 || c.next <= c.t + 1e-6) {
      /* frame at the end boundary is taken by the next run(); fine to drop */
    }
    const manifest = { id: c.id, frames: c.frames, marks: c.marks, events: c.events, duration: c.t };
    writeFileSync(join(c.dir, 'clip.json'), JSON.stringify(manifest));
    this.cur = null;
    return manifest;
  }
}

/** Exact 1/30 s steps are fractional ms; Playwright's fake clock takes fractional ms fine. */
export const FRAME_MS = 1000 / 30;
