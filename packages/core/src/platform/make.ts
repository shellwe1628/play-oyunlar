import { STORE_BUILD } from '../store';
import { createCapacitorPlatform } from './capacitor';
import { createCrazyGamesPlatform } from './crazygames';
import type { Platform, PlatformName } from './types';
import { createWebPlatform } from './web';

/**
 * The adapter for a platform name. Store builds (STORE_BUILD) know only the native adapter and
 * plain web, so the web-portal adapter (CrazyGames) is not in the App Store / Google Play bundle.
 */
export function createPlatform(name: PlatformName): Platform {
  if (STORE_BUILD) return name === 'capacitor' ? createCapacitorPlatform() : createWebPlatform();
  switch (name) {
    case 'crazygames':
      return createCrazyGamesPlatform();
    case 'capacitor':
      return createCapacitorPlatform();
    default:
      return createWebPlatform();
  }
}
