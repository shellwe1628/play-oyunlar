// Store build guard, shared by tools/ipa.mjs (App Store) and tools/aab.mjs (Google Play).
//
// Both build the web bundle with VITE_OYUN_STORE=1 (STORE_BUILD in packages/core/src/store.ts):
// the test hook, every URL switch and the web-portal adapters are then removed at build time, so
// a store build has no code path a reviewer could take for a hidden feature (App Store Review
// 5.6, "features ... intentionally hidden during the review process"). This check fails the build
// when any of them comes back in the bundle's JS.

/** Build-time env for `vite build` of a store bundle. */
export const STORE_VITE_ENV = { VITE_OYUN_STORE: '1' };

/** [what it is, pattern] — none of these may be in a store bundle's JS. */
const MARKERS = [
  ['the test hook (window.__OYUN__)', /__OYUN__/],
  ['the 3D renderer dev hook (window.__okcu3d)', /__okcu3d/],
  ['the Sparkrise test handle (window.__kivilcimGame)', /__kivilcimGame/],
  ['the CrazyGames adapter', /crazygames/i],
  ['a test action (autopilot)', /autopilot/i],
  ['a test action (fxPreview)', /fxPreview/],
  ['a test action (waitWeak / tapWeak)', /waitWeak|tapWeak/],
  ['URL query parsing (URLSearchParams)', /URLSearchParams/],
  ['the page address (location.search)', /location\.search/],
  ['the page host (location.hostname)', /location\.hostname/],
  ['automation detection (navigator.webdriver)', /webdriver/],
  ['test mode (?test=1)', /test=1/],
];

/** Problems in a store bundle: `files` = [{ name, text }] of its JS files. */
export function checkStoreMarkers(files) {
  const problems = [];
  for (const { name, text } of files) {
    for (const [what, re] of MARKERS) {
      const m = re.exec(text);
      if (m) problems.push(`${name}: ${what} is in the store bundle ("${text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ')}"); gate it with STORE_BUILD (packages/core/src/store.ts)`);
    }
  }
  return problems;
}
