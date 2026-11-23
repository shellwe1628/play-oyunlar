/**
 * Store build switch. Pure, no Phaser.
 *
 * True only in the web bundle of an App Store / Google Play build: tools/ipa.mjs and
 * tools/aab.mjs run `vite build` with VITE_OYUN_STORE=1. Vite replaces the env lookup with a
 * string literal, so this is a compile-time constant: everything behind `if (!STORE_BUILD)` (the
 * test hook, URL switches, the web-portal adapters) is dropped from those bundles by dead-code
 * elimination, not merely skipped at run time. Web builds, dev servers, unit and e2e tests leave
 * VITE_OYUN_STORE unset and keep every switch. The native tools scan the bundle for leftovers.
 *
 * Use it as a plain `if (!STORE_BUILD)` / `STORE_BUILD ? a : b` so the minifier can fold it.
 * Outside Vite (node scripts) import.meta.env does not exist, hence the optional chain.
 */
export const STORE_BUILD: boolean = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_OYUN_STORE === '1';
