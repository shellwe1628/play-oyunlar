/**
 * The whole screen is the button. Raw DOM pointer events on the window (so the letterbox counts
 * too), handled the moment they arrive — no Phaser input queue, no tween, no scene change in the
 * way. "Held" = at least one finger (or the mouse, or Space / Up) is down.
 *
 * Robustness: every pointer is tracked by id; pointerup, pointercancel and lostpointercapture
 * release it; a touchend/touchcancel with no touches left clears every touch pointer (a finger
 * sliding off the edge can lose its pointerup); blur and tab-hide clear everything. A second
 * finger never sticks the spark: holding is the union of fingers, and losing one id cannot leave
 * a phantom press once the browser reports no touches.
 */

export interface HoldTarget {
  /** A new press started (first finger down). x, y are logical canvas coordinates. */
  onPress(x: number, y: number): void;
  /** The last finger lifted. */
  onRelease(): void;
  /** Should this press be left to the UI (a button under it)? */
  isUi(x: number, y: number): boolean;
}

export class HoldInput {
  private readonly down = new Map<number | string, boolean>();
  private readonly offs: (() => void)[] = [];
  private keyDown = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly logical: { width: number; height: number },
    private readonly target: HoldTarget,
  ) {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
      window.addEventListener(type, fn, opts);
      this.offs.push(() => window.removeEventListener(type, fn, opts));
    };
    on('pointerdown', (e) => this.pointerDown(e), { passive: true });
    on('pointerup', (e) => this.release(e.pointerId), { passive: true });
    on('pointercancel', (e) => this.release(e.pointerId), { passive: true });
    on('lostpointercapture', (e) => this.release(e.pointerId), { passive: true });
    on('touchend', (e) => this.touchesLeft(e), { passive: true });
    on('touchcancel', (e) => this.touchesLeft(e), { passive: true });
    on('blur', () => this.clear());
    on('keydown', (e) => this.key(e, true));
    on('keyup', (e) => this.key(e, false));
    const vis = (): void => {
      if (document.hidden) this.clear();
    };
    document.addEventListener('visibilitychange', vis);
    this.offs.push(() => document.removeEventListener('visibilitychange', vis));
  }

  get held(): boolean {
    return this.down.size > 0;
  }

  /** Client → logical canvas coordinates. */
  toLogical(cx: number, cy: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * this.logical.width, y: ((cy - r.top) / r.height) * this.logical.height };
  }

  private pointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = this.toLogical(e.clientX, e.clientY);
    if (this.down.size === 0 && this.target.isUi(p.x, p.y)) return;
    this.press(e.pointerId, p.x, p.y);
  }

  /** Same path as a finger: used by the test hook ('test' id) and the keyboard. */
  press(id: number | string, x = this.logical.width / 2, y = this.logical.height / 2): void {
    const was = this.down.size > 0;
    this.down.set(id, true);
    if (!was) this.target.onPress(x, y);
  }

  release(id: number | string): void {
    if (!this.down.delete(id)) return;
    if (this.down.size === 0) this.target.onRelease();
  }

  private touchesLeft(e: TouchEvent): void {
    if (e.touches.length > 0) return;
    let any = false;
    for (const id of [...this.down.keys()]) {
      if (typeof id === 'number') {
        this.down.delete(id);
        any = true;
      }
    }
    if (any && this.down.size === 0) this.target.onRelease();
  }

  private key(e: KeyboardEvent, isDown: boolean): void {
    if (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'KeyW') return;
    if (isDown === this.keyDown) return;
    this.keyDown = isDown;
    if (isDown) this.press('key');
    else this.release('key');
  }

  clear(): void {
    const was = this.down.size > 0;
    this.down.clear();
    this.keyDown = false;
    if (was) this.target.onRelease();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.down.clear();
  }
}
