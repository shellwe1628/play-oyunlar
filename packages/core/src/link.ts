/**
 * Outside pages (the games' privacy policies), opened the same way everywhere: the online panel's
 * link and the main menus' "Privacy" buttons. In the native apps it is a plain top-level
 * navigation, which Capacitor does not load in the game's WebView but hands to the system browser
 * (Android: the bridge's URL override; iOS: its navigation policy), so the game keeps its state.
 * In a browser tab it opens a new tab, so the game keeps running.
 */

/** True inside the Capacitor app (Android or iOS). */
export function isNativeApp(): boolean {
  return Boolean((globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
}

/** Points `a` at an outside page: href, plus a new tab outside the native apps. */
export function externalLink(a: HTMLAnchorElement, url: string): HTMLAnchorElement {
  a.href = url;
  if (!isNativeApp()) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

/** Opens an outside page from a tap handler (canvas buttons, which have no <a> of their own). */
export function openExternal(url: string): void {
  if (typeof document === 'undefined') return;
  const a = externalLink(document.createElement('a'), url);
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
}
