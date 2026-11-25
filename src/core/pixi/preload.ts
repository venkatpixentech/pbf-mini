// Boot-time loading of a Pixi game's critical assets. Imported dynamically by GameBoot, and only when the
// game declares preload assets, so a game without Pixi never downloads Pixi.
import { Assets } from 'pixi.js';

import { assetUrl } from 'core/boot/assetUrl';
import { type QueueOptions, runQueue } from 'core/boot/loadQueue';

import type { StageAsset } from './scene';

/** Registers an alias once (a second Assets.add for the same alias makes Pixi warn and overwrite). */
export function registerAsset(a: StageAsset) {
  if (!Assets.resolver.hasKey(a.alias)) Assets.add({ alias: a.alias, src: assetUrl(a.src) });
}

/** Loads every asset with bounded concurrency, a timeout and one retry; rejects with LoadError on failure. */
export async function preloadStageAssets(assets: StageAsset[], options: QueueOptions = {}): Promise<void> {
  assets.forEach(registerAsset);
  // Pixi removes a failed load from its cache, so a retry really requests the file again.
  await runQueue(
    assets.map((a) => a.alias),
    (alias) => Assets.load(alias),
    options,
  );
}
