import { bindVisibility, createLifecycle, defaultDocument, type Lifecycle } from './lifecycle';
import type { Platform, PlatformName, VisibilitySource } from './types';

export interface AdapterOptions {
  /** Defaults to the global document; pass a fake in tests. */
  document?: VisibilitySource | null;
}

/** Shared plumbing: lifecycle + visibility binding. Adapters spread this and override behaviour. */
export function basePlatform(name: PlatformName, opts: AdapterOptions): {
  lifecycle: Lifecycle;
  common: Pick<Platform, 'name' | 'paused' | 'onLifecycle' | 'dispose'>;
} {
  const lifecycle = createLifecycle();
  const unbind = bindVisibility(lifecycle, opts.document === undefined ? defaultDocument() : opts.document);
  const common = {
    name,
    get paused() {
      return lifecycle.paused;
    },
    onLifecycle: lifecycle.on,
    dispose() {
      unbind();
      lifecycle.clear();
    },
  };
  return { lifecycle, common };
}
