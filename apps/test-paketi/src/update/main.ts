/**
 * Entry of oyun-test-update.js, the script tools/apk.mjs adds to every page of a TEST APK (the
 * launcher and each game's index.html). Never part of a game's own build or of a Play bundle.
 * In a browser, or without the native TestUpdate plugin, it does nothing.
 */
import { nativeUpdater } from './native';
import { UpdateBanner } from './ui';

const native = nativeUpdater();
if (native) {
  const start = (): void => void new UpdateBanner(native).start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
