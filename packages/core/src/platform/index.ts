export type * from './types';
export { createLifecycle, bindVisibility, type Lifecycle } from './lifecycle';
export type { AdapterOptions } from './base';
export { createWebPlatform, type WebPlatform, type WebHistoryEntry } from './web';
export { createCrazyGamesPlatform, type CrazyGamesSdk, type CrazyGamesOptions } from './crazygames';
export { createCapacitorPlatform, capacitorBridge, type CapacitorBridge, type CapacitorOptions } from './capacitor';
export { detectPlatform, type DetectInput } from './detect';
