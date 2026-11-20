/**
 * The online leaderboard panel, one look for every game: a DOM overlay above the canvas (Phaser
 * or three.js alike), so all three games share it. Content follows Online.state():
 *   unavailable  explains that online ranking lives in the Google Play version
 *   ask-age      the neutral age question (birth year from a full list, nothing hints at a
 *                threshold, no "are you over 13?")
 *   blocked      online ranking is off on this device (no reason given, no way to retry)
 *   signed-out   one button: sign in with Google Play Games
 *   signed-in    the player's name and one row per board: local best, public score and rank,
 *                and a button that opens Google's own leaderboard screen
 * Closes on the close button, a tap outside the card, or Escape.
 */
import { defineStrings, type Lang } from '../i18n';
import { cssColor, DEFAULT_THEME, type Theme } from '../ui/theme';
import type { BoardEntry, Online } from './online';

export const ONLINE_STRINGS = defineStrings({
  en: {
    title: 'Online ranking',
    close: 'Close',
    unavailable: 'Online ranking is part of the Google Play version of the game.',
    ageQuestion: 'What year were you born?',
    agePick: 'Choose a year',
    ageWhy: 'We ask once, before anything goes online. Only the answer’s category is kept on this device.',
    next: 'Continue',
    blocked: 'Online ranking is not available on this device. Your progress and records keep working as before.',
    signInText: 'Sign in with Google Play Games to put your best scores on the worldwide boards.',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    signInFailed: 'Could not sign in. Check the connection and try again.',
    player: 'Playing as {name}',
    yourBest: 'Your best',
    rank: 'Rank',
    noRank: 'not ranked yet',
    open: 'Open board',
    loading: 'Loading…',
  },
  tr: {
    title: 'Online sıralama',
    close: 'Kapat',
    unavailable: 'Online sıralama oyunun Google Play sürümünde var.',
    ageQuestion: 'Hangi yıl doğdun?',
    agePick: 'Yıl seç',
    ageWhy: 'Bir şey internete gitmeden önce bir kez soruyoruz. Bu cihazda yalnızca cevabın kategorisi saklanır.',
    next: 'Devam',
    blocked: 'Online sıralama bu cihazda kullanılamıyor. İlerlemen ve rekorların eskisi gibi çalışır.',
    signInText: 'En iyi skorlarını dünya sıralamasına koymak için Google Play Games ile giriş yap.',
    signIn: 'Giriş yap',
    signingIn: 'Giriş yapılıyor…',
    signInFailed: 'Giriş yapılamadı. Bağlantını kontrol edip tekrar dene.',
    player: '{name} olarak oynuyorsun',
    yourBest: 'En iyin',
    rank: 'Sıra',
    noRank: 'henüz sırada değil',
    open: 'Tabloyu aç',
    loading: 'Yükleniyor…',
  },
});
type Key = keyof (typeof ONLINE_STRINGS)['en'];

export interface PanelOptions {
  lang: Lang;
  theme?: Theme;
  /** where the overlay goes (default document.body) */
  parent?: HTMLElement;
  onClose?: () => void;
}

export interface OnlinePanel {
  close(): void;
  readonly element: HTMLElement;
}

const STYLE_ID = 'oyun-online-style';

function css(t: Theme): string {
  const c = (n: number): string => cssColor(n);
  return `
.oyun-online{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  background:rgba(8,10,24,.72);font-family:${t.fontFamily};color:${c(t.colors.text)};
  padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;user-select:none}
.oyun-online *{box-sizing:border-box}
.oyun-online .card{width:100%;max-width:420px;max-height:100%;overflow:auto;background:${c(t.colors.surface)};
  border-radius:${Math.round(t.radius * 0.8)}px;box-shadow:0 10px 0 ${c(t.colors.shadow)};padding:22px 20px 20px}
.oyun-online .head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.oyun-online h2{margin:0;font-size:24px;font-weight:900;letter-spacing:.2px}
.oyun-online .x{width:44px;height:44px;border:0;border-radius:14px;background:${c(t.colors.secondary)};
  color:${c(t.colors.secondaryText)};font:900 22px/1 ${t.fontFamily};cursor:pointer}
.oyun-online p{margin:0 0 14px;font-size:17px;line-height:1.4;color:${c(t.colors.textDim)}}
.oyun-online p.lead{color:${c(t.colors.text)};font-size:19px;font-weight:800}
.oyun-online p.err{color:${c(t.colors.danger)};font-weight:700}
.oyun-online select{width:100%;height:52px;border-radius:14px;border:2px solid ${c(t.colors.secondary)};
  background:${c(t.colors.background)};color:${c(t.colors.text)};font:800 19px ${t.fontFamily};padding:0 14px;margin-bottom:14px}
.oyun-online .btn{display:block;width:100%;min-height:54px;border:0;border-radius:16px;cursor:pointer;
  background:${c(t.colors.primary)};color:${c(t.colors.primaryText)};font:900 19px ${t.fontFamily};
  box-shadow:0 5px 0 ${c(t.colors.shadow)};margin-top:6px}
.oyun-online .btn:disabled{opacity:.45;cursor:default}
.oyun-online .btn.alt{background:${c(t.colors.secondary)};color:${c(t.colors.secondaryText)};min-height:44px;font-size:16px;
  width:auto;padding:0 16px;margin:0;box-shadow:0 4px 0 ${c(t.colors.shadow)}}
.oyun-online .who{font-size:15px;color:${c(t.colors.accent)};font-weight:800;margin:-4px 0 12px}
.oyun-online .row{background:${c(t.colors.background)};border-radius:16px;padding:14px;margin-bottom:10px;
  display:flex;align-items:center;gap:12px}
.oyun-online .row .txt{flex:1;min-width:0}
.oyun-online .row .name{font-size:18px;font-weight:900;margin-bottom:4px}
.oyun-online .row .nums{font-size:15px;color:${c(t.colors.textDim)};line-height:1.35}
.oyun-online .row .nums b{color:${c(t.colors.text)}}
.oyun-online .row .rank{color:${c(t.colors.primary)};font-weight:900}
`;
}

function ensureStyle(t: Theme): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css(t);
  document.head.appendChild(s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function defaultFormat(n: number, lang: Lang): string {
  return Math.floor(n).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');
}

/** Opens the panel. Returns a handle; the panel also closes itself. */
export function openOnlinePanel(online: Online, opts: PanelOptions): OnlinePanel {
  const theme = opts.theme ?? DEFAULT_THEME;
  const lang = opts.lang;
  const s = (k: Key, p?: Record<string, string>): string =>
    (ONLINE_STRINGS[lang][k] ?? ONLINE_STRINGS.en[k]).replace(/\{(\w+)\}/g, (_, n: string) => p?.[n] ?? '');
  ensureStyle(theme);

  const root = el('div', 'oyun-online');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.dataset.testid = 'online-panel';
  const card = el('div', 'card');
  const head = el('div', 'head');
  const h = el('h2', undefined, s('title'));
  const x = el('button', 'x', '✕');
  x.setAttribute('aria-label', s('close'));
  x.dataset.testid = 'online-close';
  head.append(h, x);
  const body = el('div');
  card.append(head, body);
  root.append(card);

  let closed = false;
  let error = false;
  let busy = false;
  let renderId = 0;
  const unsubscribe = online.onChange(() => void render());
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  function close(): void {
    if (closed) return;
    closed = true;
    unsubscribe();
    document.removeEventListener('keydown', onKey);
    root.remove();
    opts.onClose?.();
  }
  x.addEventListener('click', close);
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) close();
  });
  // keep game input underneath from seeing the panel's touches
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'wheel']) {
    card.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }
  document.addEventListener('keydown', onKey);

  function askAge(): void {
    body.replaceChildren();
    const q = el('p', 'lead', s('ageQuestion'));
    const sel = el('select');
    sel.dataset.testid = 'online-year';
    sel.setAttribute('aria-label', s('ageQuestion'));
    const ph = el('option', undefined, s('agePick'));
    ph.value = '';
    sel.append(ph);
    const year = new Date().getFullYear();
    for (let y = year; y >= year - 100; y--) {
      const o = el('option', undefined, String(y));
      o.value = String(y);
      sel.append(o);
    }
    const why = el('p', undefined, s('ageWhy'));
    const go = el('button', 'btn', s('next'));
    go.dataset.testid = 'online-age-next';
    go.disabled = true;
    sel.addEventListener('change', () => (go.disabled = sel.value === ''));
    go.addEventListener('click', () => {
      if (!sel.value || busy) return;
      busy = true;
      go.disabled = true;
      void online.answerAge(Number(sel.value)).finally(() => {
        busy = false;
        void render();
      });
    });
    body.append(q, sel, why, go);
  }

  function signedOut(): void {
    body.replaceChildren();
    const p = el('p', 'lead', s('signInText'));
    const b = el('button', 'btn', busy ? s('signingIn') : s('signIn'));
    b.dataset.testid = 'online-signin';
    b.disabled = busy;
    b.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      error = false;
      void render();
      void online.signIn().then((ok) => {
        busy = false;
        error = !ok;
        void render();
      });
    });
    body.append(p, b);
    if (error) body.append(el('p', 'err', s('signInFailed')));
  }

  function rows(list: BoardEntry[]): void {
    body.replaceChildren();
    const name = online.playerName();
    if (name) body.append(el('div', 'who', s('player', { name })));
    for (const e of list) {
      const fmt = e.board.format ?? defaultFormat;
      const row = el('div', 'row');
      const txt = el('div', 'txt');
      txt.append(el('div', 'name', e.board.title[lang]));
      const nums = el('div', 'nums');
      const best = Math.max(e.local, e.score ?? 0);
      nums.append(document.createTextNode(`${s('yourBest')}: `), el('b', undefined, fmt(best, lang)));
      nums.append(el('br'));
      nums.append(document.createTextNode(`${s('rank')}: `));
      nums.append(e.rank ? el('span', 'rank', `#${defaultFormat(e.rank, lang)}`) : document.createTextNode(s('noRank')));
      txt.append(nums);
      const open = el('button', 'btn alt', s('open'));
      open.dataset.testid = `online-open-${e.board.id}`;
      open.addEventListener('click', () => void online.showBoard(e.board.id));
      row.append(txt, open);
      body.append(row);
    }
  }

  async function render(): Promise<void> {
    if (closed) return;
    const id = ++renderId;
    const state = online.state();
    root.dataset.state = state;
    if (state === 'unavailable') body.replaceChildren(el('p', 'lead', s('unavailable')));
    else if (state === 'ask-age') {
      if (!busy) askAge();
    } else if (state === 'blocked') body.replaceChildren(el('p', 'lead', s('blocked')));
    else if (state === 'signed-out') signedOut();
    else {
      body.replaceChildren(el('p', undefined, s('loading')));
      await online.sync();
      const list = await online.entries();
      if (id === renderId && !closed) rows(list);
    }
  }

  (opts.parent ?? document.body).append(root);
  void render();
  return { close, element: root };
}
