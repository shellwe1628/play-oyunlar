/**
 * The update banner on a page (launcher or game): fetches the manifest through the native
 * plugin, runs the state machine, renders it in a Shadow DOM overlay and places it with
 * placement.ts. All decisions live in the pure modules next to this one; this file wires them to
 * the DOM, sessionStorage and the plugin.
 */
import { pickLang, type Lang } from '../lang';
import { effectOf, initial, reduce, type Effect, type Event as UpdateEvent, type State } from './machine';
import { findOffer, parseManifest } from './manifest';
import { errorCode, type NativeInfo, type TestUpdateNative } from './native';
import { placeBanner, type Placement } from './placement';
import { needsCheck, parseRecord, RECORD_KEY, type SessionRecord } from './schedule';
import { describeState, type BannerView } from './texts';

const CSS = `
:host { all: initial; }
.b { box-sizing: border-box; display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 5px 6px 5px 12px;
  border-radius: 12px; background: #ffd23f; color: #1a1300; box-shadow: 0 6px 22px rgba(0,0,0,.45), 0 0 0 2px rgba(26,19,0,.25) inset;
  font: 13px/1.25 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent;
  user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.b.error { background: #ffb4a8; }
.b.wide { flex-direction: column; align-items: stretch; padding: 10px 12px; gap: 8px; }
.txt { flex: 1; min-width: 0; }
.t { font-weight: 800; font-size: 14px; }
.s { font-size: 12px; opacity: .85; margin-top: 1px; }
.b:not(.wide) .t, .b:not(.wide) .s { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acts { display: flex; gap: 6px; flex: none; }
.wide .acts { justify-content: flex-end; }
button { font: inherit; font-weight: 800; font-size: 14px; height: 38px; padding: 0 14px; border-radius: 9px; cursor: pointer;
  border: 1.5px solid rgba(26,19,0,.55); background: transparent; color: #1a1300; }
.wide button { height: 44px; }
button.p { background: #1a1300; color: #ffd23f; border-color: #1a1300; }
.bar { height: 6px; border-radius: 3px; background: rgba(26,19,0,.2); overflow: hidden; }
.bar > i { display: block; height: 100%; background: #1a1300; width: 0; transition: width .2s linear; }
`;

/** Events that must not reach the page under the banner (Sparkrise listens on window). */
const SWALLOW = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'touchstart', 'touchend', 'touchmove', 'touchcancel', 'mousedown', 'mouseup', 'click', 'contextmenu'];

function readInsets(): { top: number; bottom: number; left: number; right: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
  document.documentElement.appendChild(probe);
  const cs = getComputedStyle(probe);
  const r = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return r;
}

function readRecord(): SessionRecord | null {
  try {
    return parseRecord(sessionStorage.getItem(RECORD_KEY));
  } catch {
    return null;
  }
}

function writeRecord(rec: SessionRecord): void {
  try {
    sessionStorage.setItem(RECORD_KEY, JSON.stringify(rec));
  } catch {
    // Storage off: the check simply runs again on the next page.
  }
}

export class UpdateBanner {
  private state: State = initial;
  private readonly host = document.createElement('div');
  private readonly root: ShadowRoot;
  private readonly lang: Lang = pickLang(navigator.languages, new URLSearchParams(location.search).get('lang'));
  private info: NativeInfo | null = null;
  private record: SessionRecord | null = readRecord();
  private lastTouch = 0;
  private held = new Set<number>();
  private placement: Placement = { mode: 'wait', top: 0 };

  constructor(
    private readonly native: TestUpdateNative,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.host.id = 'oyun-test-update';
    this.host.style.cssText = 'position:fixed;z-index:2147483647;left:0;right:0;top:0;display:none;';
    this.root = this.host.attachShadow({ mode: 'open' });
    for (const type of SWALLOW) this.host.addEventListener(type, (e) => e.stopPropagation());
    // Touches on the page (not on the banner): used to keep out of the way of a player.
    const mine = (e: Event): boolean => e.composedPath().includes(this.host);
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (mine(e)) return;
        this.lastTouch = this.now();
        this.held.add(e.pointerId);
        this.place();
      },
      { capture: true, passive: true },
    );
    for (const type of ['pointerup', 'pointercancel'] as const) {
      window.addEventListener(
        type,
        (e) => {
          this.held.delete(e.pointerId);
          this.lastTouch = this.now();
        },
        { capture: true, passive: true },
      );
    }
    window.addEventListener('resize', () => this.place());
    setInterval(() => this.place(), 500);
    this.native.onProgress((p) => this.dispatch({ type: 'progress', ...p }));
  }

  async start(): Promise<void> {
    try {
      this.info = await this.native.info();
    } catch (e) {
      console.warn(`[test-update] plugin info failed: ${errorCode(e)}`);
      return;
    }
    document.documentElement.appendChild(this.host);
    const rec = this.record;
    if (rec?.dismissed) {
      // "Later" was tapped earlier in this app run: nothing until the next start.
      this.state = { kind: 'hidden' };
      this.host.dataset.state = 'hidden';
      return;
    }
    // A result from another page of this run (the bundle's launcher → game).
    if (rec?.offer && rec.offer.applicationId === this.info.applicationId && rec.offer.versionCode > this.info.versionCode) {
      this.dispatch({ type: 'offer', offer: rec.offer });
    }
    if (needsCheck(rec, this.now())) await this.check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && needsCheck(this.record, this.now())) void this.check();
    });
  }

  /** Ask GitHub (through the plugin). Every failure is silent for the player: no banner. */
  async check(): Promise<void> {
    if (!this.info) return;
    const rec: SessionRecord = { checkedAt: this.now(), offer: this.record?.offer ?? null, dismissed: this.record?.dismissed ?? false };
    this.record = rec;
    writeRecord(rec);
    let res: { status: number; body: string };
    try {
      res = await this.native.check();
    } catch (e) {
      console.warn(`[test-update] manifest not reachable: ${errorCode(e)}`);
      return;
    }
    if (res.status !== 200) {
      console.warn(`[test-update] manifest HTTP ${res.status}`);
      return;
    }
    const parsed = parseManifest(res.body);
    if (!parsed.ok) {
      console.warn(`[test-update] manifest rejected: ${parsed.error}`);
      return;
    }
    const offer = findOffer(parsed.manifest, this.info);
    this.record = { ...rec, offer };
    writeRecord(this.record);
    if (offer) this.dispatch({ type: 'offer', offer });
  }

  dispatch(e: UpdateEvent): void {
    const prev = this.state;
    const next = reduce(prev, e);
    if (next === prev) return;
    this.state = next;
    this.render();
    const effect = effectOf(prev, next);
    if (effect) void this.run(effect, next);
  }

  private async run(effect: Effect, s: State): Promise<void> {
    if (effect === 'dismiss') {
      this.record = { checkedAt: this.record?.checkedAt ?? this.now(), offer: this.record?.offer ?? null, dismissed: true };
      writeRecord(this.record);
      return;
    }
    if (!('offer' in s)) return;
    const { offer } = s;
    try {
      switch (effect) {
        case 'queryPermission':
          this.dispatch({ type: 'permission', granted: (await this.native.canInstall()).canInstall });
          return;
        case 'openSettings':
          this.dispatch({ type: 'settingsReturned', granted: (await this.native.openInstallSettings()).canInstall });
          return;
        case 'download':
          this.dispatch({ type: 'downloaded', ...(await this.native.download({ file: offer.file, size: offer.size, sha256: offer.sha256 })) });
          return;
        case 'install':
          this.dispatch({ type: 'installResult', result: (await this.native.install({ file: offer.file, sha256: offer.sha256 })).result });
          return;
      }
    } catch (e) {
      const code = errorCode(e);
      console.warn(`[test-update] ${effect} failed: ${code}`);
      if (effect === 'download') this.dispatch({ type: 'downloadFailed', code });
      else if (effect === 'install') this.dispatch({ type: 'installResult', result: 'failed' });
      else if (effect === 'queryPermission') this.dispatch({ type: 'permission', granted: false });
      else this.dispatch({ type: 'settingsReturned', granted: false });
    }
  }

  private render(): void {
    const view = describeState(this.state, this.lang);
    this.host.dataset.state = this.state.kind;
    if (!view) {
      this.host.style.display = 'none';
      this.root.replaceChildren();
      return;
    }
    this.root.replaceChildren(style(), this.build(view));
    this.place();
  }

  private build(view: BannerView): HTMLElement {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const wide = this.state.kind !== 'available';
    const box = el('div', `b ${view.tone}${wide ? ' wide' : ''}`);
    box.setAttribute('role', view.tone === 'error' ? 'alert' : 'status');
    box.setAttribute('aria-live', 'polite');
    const txt = el('div', 'txt');
    txt.append(el('div', 't', view.title), el('div', 's', view.body));
    box.append(txt);
    if (view.progress !== null) {
      const bar = el('div', 'bar');
      const fill = el('i', '');
      fill.style.width = `${(view.progress * 100).toFixed(1)}%`;
      bar.append(fill);
      box.append(bar);
    }
    if (view.actions.length) {
      const acts = el('div', 'acts');
      for (const a of view.actions) {
        const b = el('button', a.primary ? 'p' : '', a.label);
        b.type = 'button';
        b.dataset.event = a.event;
        b.addEventListener('click', () => this.dispatch({ type: a.event }));
        acts.append(b);
      }
      box.append(acts);
    }
    return box;
  }

  /** Position (or hold back) the banner; see placement.ts. */
  private place(): void {
    if (this.host.style.display === 'none' && !this.root.childElementCount) return;
    const insets = readInsets();
    this.host.style.left = `${insets.left + 8}px`;
    this.host.style.right = `${insets.right + 8}px`;
    this.host.style.maxWidth = '560px';
    this.host.style.marginInline = 'auto';
    // Measure invisibly, then place.
    this.host.style.visibility = 'hidden';
    this.host.style.display = 'block';
    const height = this.host.getBoundingClientRect().height;
    const canvas = document.querySelector('canvas')?.getBoundingClientRect() ?? null;
    this.placement = placeBanner({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      insets,
      canvas: canvas && canvas.height > 0 ? canvas : null,
      height,
      idleMs: this.now() - this.lastTouch,
      pointerHeld: this.held.size > 0,
      engaged: this.state.kind !== 'available',
    });
    this.host.dataset.mode = this.placement.mode;
    if (this.placement.mode === 'wait') {
      this.host.style.display = 'none';
      return;
    }
    this.host.style.top = `${this.placement.top}px`;
    this.host.style.visibility = 'visible';
  }
}

function style(): HTMLStyleElement {
  const s = document.createElement('style');
  s.textContent = CSS;
  return s;
}

