/**
 * Online leaderboards through Google Play Games Services v2, behind a neutral age question.
 *
 * Why the age question: the games' Play audience is "all ages" (Families policy). Google does not
 * list Play Games Services as approved for child users, so a child must never be signed in or
 * have a score sent. Nothing touches Play Games until the player answers the question: before
 * that the native SDK is not even initialised (no automatic sign-in at launch). The answer is
 * stored as a category only ('adult' / 'child'), never the birth year, and cannot be changed in
 * the game (clearing the app's data asks again).
 *
 * The native side is tools/aab/PlayGamesPlugin.java (Capacitor plugin "PlayGames"), present only
 * in Play builds whose store/apps.json entry has a `playGames` block. Anywhere else (browser,
 * test APK, unconfigured app) the bridge is missing and the state is 'unavailable'.
 *
 * Pure: no DOM, no Phaser. The panel (./panel.ts) draws it.
 */
import type { Lang } from '../i18n';
import type { StorageAdapter } from '../storage';

/** The calls PlayGamesPlugin.java answers (Capacitor resolves every call with an object). */
export interface PlayGamesBridge {
  /** Play Games is wired in this build (APP_ID and the plugin present). Does not initialise. */
  available(): Promise<{ value: boolean }>;
  /** Initialise the SDK (first call only) and report the automatic sign-in result. */
  init(): Promise<SignInResult>;
  /** Interactive sign-in (the Play Games sheet). */
  signIn(): Promise<SignInResult>;
  submitScore(options: { board: string; score: number }): Promise<unknown>;
  /** Google's own leaderboard screen for one board. */
  showBoard(options: { board: string }): Promise<unknown>;
  /** The player's own all-time entry; rank is absent until the first score is in. */
  loadMine(options: { board: string }): Promise<{ score?: number; rank?: number; display?: string }>;
}

export interface SignInResult {
  signedIn: boolean;
  name?: string;
}

export interface BoardDef {
  /** logical id; the native side maps it to the Console id through string resource pgs_board_<id> */
  id: string;
  title: Readonly<Record<Lang, string>>;
  /** how a score reads in the panel (default: locale-grouped integer) */
  format?: (score: number, lang: Lang) => string;
}

export type AgeAnswer = 'adult' | 'child';
export type OnlineState = 'unavailable' | 'ask-age' | 'blocked' | 'signed-out' | 'signed-in';

export interface BoardEntry {
  board: BoardDef;
  /** the best this device has (from the game's save) */
  local: number;
  /** the player's public entry, when signed in and loaded */
  score?: number;
  rank?: number;
}

export interface Online {
  readonly boards: readonly BoardDef[];
  state(): OnlineState;
  playerName(): string | undefined;
  /** Call once at boot: initialises Play Games only for an adult answer already on file. */
  start(): Promise<void>;
  /** Store the age answer from a birth year; returns the category. Adults are initialised. */
  answerAge(birthYear: number): Promise<AgeAnswer>;
  signIn(): Promise<boolean>;
  /** Send every board whose local best is above what this device already sent. Never throws. */
  sync(): Promise<void>;
  entries(): Promise<BoardEntry[]>;
  showBoard(id: string): Promise<void>;
  /** state changes (sign-in finished, age answered) */
  onChange(listener: () => void): () => void;
}

export interface OnlineOptions {
  /** `null` = no Play Games here. Defaults to window.Capacitor.Plugins.PlayGames. */
  bridge?: PlayGamesBridge | null;
  storage: StorageAdapter;
  boards: readonly BoardDef[];
  /** the game's current bests per board id (higher is better) */
  scores: () => Readonly<Record<string, number>>;
  /** for tests */
  now?: () => Date;
}

const AGE_KEY = 'oyun.online.age';
const SENT_PREFIX = 'oyun.online.sent.';

/**
 * Youngest birth year that is certainly 13 or older today, whatever the birthday: someone born in
 * (year - 14) has turned 13 by 1 January at the latest. Born in (year - 13) may still be 12.
 */
export function adultFromBirthYear(birthYear: number, today: Date): boolean {
  return Number.isFinite(birthYear) && birthYear <= today.getFullYear() - 14;
}

export function playGamesBridge(): PlayGamesBridge | null {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { PlayGames?: PlayGamesBridge } } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.PlayGames ?? null;
}

export function createOnline(opts: OnlineOptions): Online {
  const bridge = opts.bridge === undefined ? playGamesBridge() : opts.bridge;
  const now = opts.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  let wired: boolean | null = bridge ? null : false;
  let initialised = false;
  let signedIn = false;
  let name: string | undefined;

  const emit = (): void => {
    for (const l of listeners) {
      try {
        l();
      } catch {
        /* a listener never breaks the game */
      }
    }
  };
  const age = (): AgeAnswer | null => {
    const v = opts.storage.getItem(AGE_KEY);
    return v === 'adult' || v === 'child' ? v : null;
  };
  const apply = (r: SignInResult | undefined): void => {
    signedIn = Boolean(r?.signedIn);
    name = signedIn ? r?.name : undefined;
  };
  const isWired = async (): Promise<boolean> => {
    if (wired !== null) return wired;
    try {
      wired = Boolean((await bridge!.available()).value);
    } catch {
      wired = false;
    }
    return wired;
  };
  const init = async (): Promise<void> => {
    if (initialised || !(await isWired()) || age() !== 'adult') return;
    initialised = true;
    try {
      apply(await bridge!.init());
    } catch {
      apply(undefined);
    }
    emit();
    if (signedIn) await online.sync();
  };

  const online: Online = {
    boards: opts.boards,
    state() {
      if (!bridge || wired === false) return 'unavailable';
      const a = age();
      if (a === null) return 'ask-age';
      if (a === 'child') return 'blocked';
      return signedIn ? 'signed-in' : 'signed-out';
    },
    playerName: () => name,
    async start() {
      if (!(await isWired())) {
        emit();
        return;
      }
      await init();
    },
    async answerAge(birthYear) {
      const answer: AgeAnswer = adultFromBirthYear(birthYear, now()) ? 'adult' : 'child';
      // first answer wins: the question is not asked again on this install
      if (age() === null) opts.storage.setItem(AGE_KEY, answer);
      const stored = age() ?? answer;
      emit();
      if (stored === 'adult') await init();
      return stored;
    },
    async signIn() {
      if (age() !== 'adult' || !(await isWired())) return false;
      if (!initialised) await init();
      if (signedIn) return true;
      try {
        apply(await bridge!.signIn());
      } catch {
        apply(undefined);
      }
      emit();
      if (signedIn) await online.sync();
      return signedIn;
    },
    async sync() {
      if (!signedIn || age() !== 'adult') return;
      let scores: Readonly<Record<string, number>>;
      try {
        scores = opts.scores();
      } catch {
        return;
      }
      for (const b of opts.boards) {
        const value = Math.floor(scores[b.id] ?? 0);
        const sent = Number(opts.storage.getItem(SENT_PREFIX + b.id) ?? '0') || 0;
        if (!(value > 0 && value > sent)) continue;
        try {
          await bridge!.submitScore({ board: b.id, score: value });
          opts.storage.setItem(SENT_PREFIX + b.id, String(value));
        } catch {
          /* offline or not configured: try again next sync */
        }
      }
    },
    async entries() {
      let scores: Readonly<Record<string, number>> = {};
      try {
        scores = opts.scores();
      } catch {
        /* keep zeros */
      }
      const out: BoardEntry[] = [];
      for (const b of opts.boards) {
        const e: BoardEntry = { board: b, local: Math.floor(scores[b.id] ?? 0) };
        if (signedIn) {
          try {
            const m = await bridge!.loadMine({ board: b.id });
            if (typeof m.score === 'number') e.score = m.score;
            if (typeof m.rank === 'number' && m.rank > 0) e.rank = m.rank;
          } catch {
            /* offline: local only */
          }
        }
        out.push(e);
      }
      return out;
    },
    async showBoard(id) {
      if (!signedIn) return;
      try {
        await bridge!.showBoard({ board: id });
      } catch {
        /* nothing to show */
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return online;
}
