// AssetLoader: adapted from the legacy framework's corelib/models/services/AssetLoader.ts (kept in legacy/corelib).
// Kept from it: the asset kinds (images, atlases, sequences, fonts, bitmap fonts), `{res}` asset variants from DeviceProxy,
// named bundles, the "unknown bundle" error, FontFace loading for canvas fonts, and the rule that a failed load is never
// remembered as loaded. Changed, and why:
//  - Ownership: loads are ref-counted leases (AssetRegistry.ts, the lifecycle verified for Spine), so two stages share one
//    load and the last release frees it. The legacy loader loaded bundles once and kept them for good.
//  - Failure: each file gets a timeout and one retry (core/boot/loadQueue), a failure rejects the lease's `ready` instead of
//    only dispatching an event, and a failed or half-loaded asset is cleaned up on release.
//  - Gone: the hard-wired PBF asset config and bundle names, the WrapperProxy progress calls, the global event bus, sounds
//    (Phase 5), Spine (SpineAssets.ts) and gif. Progress is the lease's `ready`; background warm-up is acquiring early.
import { Assets } from 'pixi.js';

import { assetUrl } from 'core/boot/assetUrl';
import { runQueue } from 'core/boot/loadQueue';

import { type AssetBackend, type AssetLease, createAssetRegistry } from './AssetRegistry';
import { type ConcreteAsset, expandAssets, findBundle, sameAsset } from './AssetLoaderStep';
import { DeviceProxy } from './DeviceConfigProxy';
import { registerAsset } from './preload';
import { type AssetBundleDef, type AssetDef, validateAssets, validateBundles } from './viewConfig';

/** Per attempt; a slow network gets one retry before the lease fails. */
const LOAD_TIMEOUT_MS = 15_000;

const fonts = new Map<string, FontFace>();

const backend: AssetBackend<ConcreteAsset> = {
  async load(a) {
    if (a.loader === 'font') {
      await runQueue(
        [a.alias],
        async () => {
          const face = new FontFace(a.family!, `url(${assetUrl(a.src)})`);
          await face.load();
          document.fonts.add(face);
          fonts.set(a.alias, face);
        },
        { timeoutMs: LOAD_TIMEOUT_MS, retries: 1 },
      );
      return;
    }
    registerAsset({ alias: a.alias, src: a.src });
    // Pixi removes a failed load from its cache, so the retry really requests the file again.
    await runQueue([a.alias], (alias) => Assets.load(alias), { timeoutMs: LOAD_TIMEOUT_MS, retries: 1 });
  },
  async unload(a) {
    if (a.loader === 'font') {
      const face = fonts.get(a.alias);
      if (face) document.fonts.delete(face);
      fonts.delete(a.alias);
      return;
    }
    if (Assets.cache.has(a.alias)) await Assets.unload(a.alias);
  },
};

/** Every stage's plain assets share this registry, so one alias loaded by two stages is one load. */
export const assetRegistry = createAssetRegistry<ConcreteAsset>(backend, {
  keyOf: (a) => a.alias,
  same: sameAsset,
  label: 'Asset',
});

/** Takes the assets a stage or scene needs: `ready` resolves when they are all loaded, `release()` gives them back. */
export function acquireAssets(defs: AssetDef[]): AssetLease {
  return assetRegistry.acquire(expandAssets(defs, DeviceProxy.config.assetResolution));
}

class AssetLoaderClass {
  private bundles: AssetBundleDef[] = [];

  /** Declares the game's bundles (the legacy initAssets). Validated here, not at load time. */
  public initAssets(bundles: AssetBundleDef[]): void {
    validateBundles(bundles);
    this.bundles = bundles;
  }

  public hasBundle(id: string): boolean {
    return this.bundles.some((b) => b.id === id);
  }

  /** Loads one or more bundles together as a single lease (the legacy loadBundles). Throws for an unknown bundle. */
  public acquireBundles(ids: string | string[]): AssetLease {
    const list = typeof ids === 'string' ? [ids] : ids;
    const defs = list.flatMap((id) => findBundle(this.bundles, id).assets);
    validateAssets(
      defs.filter((d, i) => defs.findIndex((x) => x.alias === d.alias) === i),
      'bundles',
    );
    return acquireAssets(defs);
  }
}

export const AssetLoader = new AssetLoaderClass();
