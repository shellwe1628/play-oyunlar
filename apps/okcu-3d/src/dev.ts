/**
 * Every URL switch of the 3D renderer, in one place (for development, the e2e and screenshot
 * tools). Web builds and the dev server read them from the page address; a store build
 * (STORE_BUILD: the App Store / Google Play bundle, see @oyun/core's store.ts) never does: each
 * switch below is then a constant (off), so the code behind it folds away and is not in the bundle.
 * A player only ever gets the device's language and the system's reduced-motion setting.
 *
 *   ?seed=N      fixed run seed            ?bow=N    old bow +0 … 25 (meta.bow, weapon level from it)
 *   ?wave=N      jump to wave N            ?chapter=N start chapter 0 … 6 (6 = endless)
 *   ?auto=1      the aim bot plays         ?off=a,b  skip modules (stage is never skipped):
 *                                                     arena, archers, arrows, fx, bowglow, ui
 *   ?speed=K     game speed multiplier     ?armor=N  health upgrade level 0 … 12 (meta.hp; shown as armour)
 *   ?calm=1      reduced motion (also on with the system's prefers-reduced-motion): softer shake and zoom
 *   ?fx=0        the menus' reduced motion too
 *   ?difficulty=classic  the 2D game's difficulty (the 3D build plays 'hard')
 *   ?weapon=ID   force a weapon (bow, crossbow, spear, boomerang, sling, firework) at its saved level
 *   ?celestial=1 force the celestial weapon look on (0: off), whatever the save says
 *   ?mode=blitz|bossrush  open a mode (sim/modes.ts) straight away, as a test run (the save is left alone);
 *                with ?mode=bossrush, ?boss=N (1 … 6) starts the rush at that boss
 *   ?angle=side|angled|low  the camera angle for this page load (without it the angle last chosen
 *                with the HUD's camera button, else side)
 *   ?lang=tr|en  the language (else the device's)
 *   ?markers=0   hide the HUD's world markers (enemy health pills, "!" telegraph, reload ring)
 *   ?safe=top,bottom  fake safe-area insets (CSS px) in a browser
 *
 * ?bow, ?armor, ?chapter, ?wave, ?weapon and ?mode make a test run, which never writes to the save.
 * (?test=1 and ?platform= are read by @oyun/core's detectPlatform, also never in a store build.)
 */
import { STORE_BUILD } from '@oyun/core/pure';

const q: URLSearchParams | null = STORE_BUILD ? null : new URLSearchParams(location.search);

/** a number switch: null when absent, `invalid` when present but not a number */
function num(key: string, invalid: number | null): number | null {
  if (!q?.has(key)) return null;
  const v = Number(q.get(key));
  return Number.isFinite(v) ? v : invalid;
}

export const DEV_SEED: number | null = STORE_BUILD ? null : num('seed', null);
export const DEV_AUTO: boolean = STORE_BUILD ? false : q?.get('auto') === '1';
export const DEV_OFF: ReadonlySet<string> = STORE_BUILD ? new Set() : new Set((q?.get('off') ?? '').split(',').filter(Boolean));
export const DEV_SPEED: number = STORE_BUILD ? 1 : (num('speed', 1) ?? 1);
export const DEV_WEAPON: string | null = STORE_BUILD ? null : (q?.get('weapon') ?? null);
export const DEV_BOW: number | null = STORE_BUILD ? null : num('bow', 0);
export const DEV_ARMOR: number | null = STORE_BUILD ? null : num('armor', 0);
export const DEV_CHAPTER: number | null = STORE_BUILD ? null : num('chapter', 0);
export const DEV_WAVE: number | null = STORE_BUILD ? null : num('wave', 1);
export const DEV_MODE: string | null = STORE_BUILD ? null : (q?.get('mode') ?? null);
export const DEV_BOSS: number | null = STORE_BUILD ? null : num('boss', 1);
export const DEV_CLASSIC: boolean = STORE_BUILD ? false : q?.get('difficulty') === 'classic';
/** true / false forces the celestial look, null follows the save */
export const DEV_CELESTIAL: boolean | null = STORE_BUILD ? null : q?.has('celestial') ? q.get('celestial') === '1' : null;
export const DEV_CALM: boolean = STORE_BUILD ? false : q?.get('calm') === '1';
export const DEV_FX_OFF: boolean = STORE_BUILD ? false : q?.get('fx') === '0';
export const DEV_ANGLE: string | null = STORE_BUILD ? null : (q?.get('angle') ?? null);
export const DEV_LANG: string | null = STORE_BUILD ? null : (q?.get('lang') ?? null);
export const DEV_MARKERS: boolean = STORE_BUILD ? true : q?.get('markers') !== '0';
export const DEV_SAFE: readonly number[] = STORE_BUILD ? [] : (q?.get('safe') ?? '').split(',').map(Number);
/** a run set up by switches: it never writes to the save, posts no score and shows no ads */
export const DEV_TEST_RUN: boolean = STORE_BUILD ? false : ['bow', 'armor', 'chapter', 'wave', 'weapon', 'mode'].some((k) => q?.has(k) === true);
