import type { PlatformName } from './types';

export interface DetectInput {
  /** location.search */
  search: string;
  /** location.hostname */
  hostname: string;
  /** Build-time choice, from `import.meta.env.VITE_OYUN_PLATFORM`. */
  forced?: string | undefined;
  /** `window.Capacitor?.isNativePlatform()` */
  capacitorNative?: boolean;
}

const NAMES: readonly PlatformName[] = ['web', 'crazygames', 'capacitor'];
const isName = (v: string | null | undefined): v is PlatformName => !!v && (NAMES as readonly string[]).includes(v);

/** Order: test mode → web; build-time choice; native shell; `?platform=`; CrazyGames host; web. */
export function detectPlatform(input: DetectInput): PlatformName {
  const params = new URLSearchParams(input.search);
  if (params.get('test') === '1') return 'web';
  if (isName(input.forced)) return input.forced;
  if (input.capacitorNative) return 'capacitor';
  const fromQuery = params.get('platform');
  if (isName(fromQuery)) return fromQuery;
  if (/(^|\.)crazygames\./.test(input.hostname)) return 'crazygames';
  return 'web';
}
