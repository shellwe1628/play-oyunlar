// AdMob settings shared by tools/aab.mjs (Google Play) and tools/ipa.mjs (App Store).
//
// An app shows rewarded ads only when its source is a template game (oyun.config.json, so it
// uses the @oyun/core platform adapter) AND store/apps.json says `"platform": "capacitor"`.
// Then the build: passes the platform's rewarded ad unit id to the web bundle
// (VITE_OYUN_ADMOB_REWARDED), adds @capacitor-community/admob to the generated Capacitor project,
// and writes the AdMob app id into the native project (AndroidManifest / Info.plist).
// Every other app (okcu ships apps/okcu-3d, which has no rewarded buttons) has no ad SDK at all.
//
// Child-directed by design (Google Play Families, audience "all ages"): the adapter tags every
// request TFCD + TFUA, max rating G, non-personalised; no ATT prompt, no IDFA, the Android AD_ID
// permission is removed. See packages/core/src/platform/capacitor.ts.
//
// OYUN_ADMOB_TEST=1 builds ask for Google's test creatives (for testers' devices; never click
// real ads on your own apps).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './template.mjs';

export const ADMOB_PLUGIN = '@capacitor-community/admob';

/** The plugin version pinned in the root package.json (it is installed there; the generated project resolves it upwards). */
export function admobPluginVersion() {
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const want = root.devDependencies?.[ADMOB_PLUGIN];
  if (!want) throw new Error(`${ADMOB_PLUGIN} is not in the root package.json devDependencies`);
  let installed;
  try {
    installed = JSON.parse(readFileSync(join(ROOT, 'node_modules', ...ADMOB_PLUGIN.split('/'), 'package.json'), 'utf8')).version;
  } catch {
    throw new Error(`${ADMOB_PLUGIN} is not installed (npm ci at the repo root)`);
  }
  if (installed !== want) throw new Error(`${ADMOB_PLUGIN} ${installed} installed, package.json pins ${want} (npm ci)`);
  return want;
}

/**
 * store/apps.json `admob.<android|ios>` = { appId: "ca-app-pub-<16 digits>~<10 digits>",
 * rewarded: "ca-app-pub-<16 digits>/<10 digits>" }. Throws a readable message when malformed.
 */
export function admobIds(app, os) {
  const ids = app.admob?.[os];
  if (!ids) throw new Error(`${app.slug}: store/apps.json has no admob.${os} block (platform "capacitor" shows ads)`);
  if (!/^ca-app-pub-\d{16}~\d{10}$/.test(ids.appId ?? '')) throw new Error(`${app.slug}: admob.${os}.appId "${ids.appId}" is not an AdMob app id (ca-app-pub-…~…)`);
  if (!/^ca-app-pub-\d{16}\/\d{10}$/.test(ids.rewarded ?? '')) throw new Error(`${app.slug}: admob.${os}.rewarded "${ids.rewarded}" is not an ad unit id (ca-app-pub-…/…)`);
  if (ids.appId.split('~')[0] !== ids.rewarded.split('/')[0]) throw new Error(`${app.slug}: admob.${os} app id and ad unit are from different AdMob accounts`);
  return { appId: ids.appId, rewarded: ids.rewarded };
}

/** Environment for `vite build`: the unit id reaches JS only through these (nothing hard-coded in game code). */
export function admobViteEnv(ids) {
  return {
    VITE_OYUN_ADMOB_REWARDED: ids?.rewarded ?? '',
    VITE_OYUN_ADMOB_TEST: ids && process.env.OYUN_ADMOB_TEST === '1' ? '1' : '',
  };
}

/** Problems with the AdMob ids found in a built web bundle (its JS files' text). */
export function checkBundleAdIds(jsTexts, ids) {
  const found = new Set(jsTexts.flatMap((t) => [...t.matchAll(/ca-app-pub-\d{16}[~/]\d{10}/g)].map((m) => m[0])));
  const problems = [];
  if (ids && !found.has(ids.rewarded)) problems.push(`rewarded ad unit ${ids.rewarded} not found in the bundle (VITE_OYUN_ADMOB_REWARDED)`);
  for (const id of found) if (id !== ids?.rewarded) problems.push(`unexpected AdMob id in the bundle: ${id}`);
  return problems;
}

/**
 * SKAdNetwork identifiers from Google's iOS quick-start (developers.google.com/admob/ios/quick-start,
 * "Update your Info.plist", 50 entries, copied 2026-11). Google's own first. Re-check that page
 * when updating the Google Mobile Ads SDK.
 */
export const SKADNETWORK_IDS = [
  'cstr6suwn9', '4fzdc2evr5', '2fnua5tdw4', 'ydx93a7ass', 'p78axxw29g', 'v72qych5uu', 'ludvb6z3bs', 'cp8zw746q7', '3sh42y64q3', 'c6k4g5qg8m',
  's39g8k73mm', 'wg4vff78zm', '3qy4746246', 'f38h382jlk', 'hs6bdukanm', 'mlmmfzh3r3', 'v4nxqhlyqp', 'wzmmz9fp6w', 'su67r6k2v3', 'yclnxrl5pm',
  't38b2kh725', '7ug5zh24hu', 'gta9lk7p23', 'vutu7akeur', 'y5ghdn5j9k', 'v9wttpbfk9', 'n38lu8286q', '47vhws6wlr', 'kbd757ywx3', '9t245vhmpl',
  'a2p9lx4jpn', '22mmun2rn5', '44jx6755aq', 'k674qkevps', '4468km3ulz', '2u9pt9hc89', '8s468mfl3y', 'klf5c3l5u5', 'ppxm28t8ap', 'kbmxgpxpgc',
  'uw77j35x4d', '578prtvx9j', '4dzt52r2t5', 'tl55sbb4fm', 'c3frkrj4fj', 'e5fvkxwrpn', '8c4e2ghe7u', '3rd42ekr43', '97r2b46745', '3qcr597p9d',
].map((id) => `${id}.skadnetwork`);
