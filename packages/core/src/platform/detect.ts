import { STORE_BUILD } from '../store';
import type { PlatformName } from './types';

export interface DetectInput {
  /** location.search (not passed in store builds) */
  search?: string;
  /** location.hostname (not passed in store builds) */
  hostname?: string;
  /** Build-time choice, from `import.meta.env.VITE_OYUN_PLATFORM`. */
  forced?: string | undefined;
  /** `window.Capacitor?.isNativePlatform()` */
  capacitorNative?: boolean;
}

const NAMES: readonly PlatformName[] = ['web', 'crazygames', 'capacitor'];
const isName = (v: string | null | undefined): v is PlatformName => !!v && (NAMES as readonly string[]).includes(v);

/**
 * Order: test mode → web; build-time choice; native shell; `?platform=`; CrazyGames host; web.
 * Store builds (STORE_BUILD): only the build-time choice ("capacitor" or "web"), else the native
 * shell; nothing read from the URL or the host, and no web-portal adapter.
 */
export function detectPlatform(input: DetectInput): PlatformName {
  if (STORE_BUILD) {
    if (input.forced === 'capacitor' || input.forced === 'web') return input.forced;
    return input.capacitorNative ? 'capacitor' : 'web';
  }
  const params = new URLSearchParams(input.search ?? '');
  if (params.get('test') === '1') return 'web';
  if (isName(input.forced)) return input.forced;
  if (input.capacitorNative) return 'capacitor';
  const fromQuery = params.get('platform');
  if (isName(fromQuery)) return fromQuery;
  if (/(^|\.)crazygames\./.test(input.hostname ?? '')) return 'crazygames';
  return 'web';
}

/** Where detectPlatform reads the page address from: nowhere in a store build. */
export function pageAddress(): Pick<DetectInput, 'search' | 'hostname'> {
  return STORE_BUILD ? {} : { search: location.search, hostname: location.hostname };
}
