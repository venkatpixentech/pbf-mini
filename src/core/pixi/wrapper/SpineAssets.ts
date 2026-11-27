// Who owns Spine data, how it is shared and when it is released: the shared asset registry (core/pixi/AssetRegistry.ts)
// applied to Spine assets, keyed by asset id. The rules (ref counts, release while loading, retry after a failed load,
// reload after the last release) are those verified in Phase 2 and are checked in Node by SpineAssets.check.ts.
import { type AssetBackend, type AssetLease, type AssetRegistry, createAssetRegistry } from '../AssetRegistry.ts';
import type { SpineAssetDef } from '../viewConfig.ts';

export type SpineBackend = AssetBackend<SpineAssetDef> & {
  /** Loads the lazy Spine runtime (and registers its asset loaders). Called before any asset load. May be called often. */
  ensureRuntime(): Promise<void>;
};

export type SpineLease = Omit<AssetLease, 'keys'> & { ids: string[] };

export type SpineAssets = {
  acquire(defs: SpineAssetDef[]): SpineLease;
  /** Reference counts and load state per id, for tests and the harness. */
  stats: AssetRegistry<SpineAssetDef>['stats'];
};

const sameFiles = (a: SpineAssetDef, b: SpineAssetDef) => a.skeleton === b.skeleton && a.atlas === b.atlas;

export function createSpineAssets(
  backend: SpineBackend,
  onUnloadError: (id: string, error: unknown) => void = (id, error) =>
    console.warn(`[spine] unload ${id} failed`, error),
): SpineAssets {
  const registry = createAssetRegistry<SpineAssetDef>(backend, {
    keyOf: (d) => d.id,
    same: sameFiles,
    label: 'Spine asset',
    onUnloadError,
  });
  return {
    acquire(defs) {
      const { keys, ...lease } = registry.acquire(defs);
      return { ...lease, ids: keys };
    },
    stats: registry.stats,
  };
}
