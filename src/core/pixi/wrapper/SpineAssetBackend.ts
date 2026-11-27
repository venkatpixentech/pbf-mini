// The Pixi side of Spine asset ownership: loads and releases Spine data through Pixi's Assets for the registry in
// SpineAssets.ts, and the one shared registry PixiStage uses. Kept apart from SpineAssets.ts so that file stays free of
// Pixi imports (its self-check runs in Node) and so Pixi is imported statically, which keeps Pixi's own chunk layout.
import { Assets, Cache, path } from 'pixi.js';

import { registerAsset } from '../preload';
import type { SpineAssetDef } from '../viewConfig';
import { createSpineAssets, type SpineAssets, type SpineBackend } from './SpineAssets';
import { loadSpineRuntime } from './SpineRuntime';

/**
 * Loads Spine data through Pixi's Assets under the legacy aliases `<id>Data` and `<id>Atlas`. The atlas loader loads the
 * page images itself, by URL next to the atlas; those are released here too, since unloading the atlas alias alone
 * leaves the page textures behind.
 */
export function createPixiSpineBackend(ensureRuntime: () => Promise<unknown> = loadSpineRuntime): SpineBackend {
  const aliases = (d: SpineAssetDef) => [`${d.id}Data`, `${d.id}Atlas`] as const;
  // Two Spine assets (different ids, so different skeletons) may name the same atlas file. Pixi loads that file once and
  // shares it, so it is released only when no loaded asset still names it.
  const atlasHolders = new Map<string, Set<string>>();
  return {
    async ensureRuntime() {
      await ensureRuntime();
    },
    async load(d) {
      const [skeleton, atlas] = aliases(d);
      registerAsset({ alias: skeleton, src: d.skeleton });
      registerAsset({ alias: atlas, src: d.atlas });
      (atlasHolders.get(d.atlas) ?? atlasHolders.set(d.atlas, new Set()).get(d.atlas)!).add(d.id);
      await Assets.load([skeleton, atlas]);
    },
    async unload(d) {
      const [skeleton, atlas] = aliases(d);
      // page image URLs, worked out the way the runtime's atlas loader does, before the atlas is disposed
      const pages: string[] = [];
      const loaded = Assets.cache.get(atlas) as { pages?: Array<{ name: string }> } | undefined;
      const atlasSrc = Assets.resolver.resolve(atlas)?.src as string | undefined;
      if (loaded?.pages && atlasSrc) {
        let dir = path.dirname(atlasSrc);
        if (dir && dir.lastIndexOf('/') !== dir.length - 1) dir += '/';
        for (const page of loaded.pages) pages.push(path.normalize([...dir.split(path.sep), page.name].join(path.sep)));
      }
      // Spine.from keeps the parsed skeleton data in Pixi's Cache (key `<skeleton>-<atlas>-<scale>`, PixSpine uses scale 1),
      // and that data points at the atlas pages released below: drop it, or the next load would draw destroyed textures
      const parsed = `${skeleton}-${atlas}-1`;
      if (Cache.has(parsed)) Cache.remove(parsed);
      atlasHolders.get(d.atlas)?.delete(d.id);
      if (Assets.cache.has(skeleton)) await Assets.unload(skeleton);
      if (atlasHolders.get(d.atlas)?.size) {
        // another loaded asset still uses this atlas: forget only this alias, keep the atlas and its pages
        if (Assets.cache.has(atlas)) Assets.cache.remove(atlas);
        return;
      }
      // the loader unloads the file itself (Assets.unload would also warn about cache keys another alias already removed)
      if (atlasSrc) await Assets.loader.unload(atlasSrc);
      for (const page of pages) await Assets.loader.unload(page).catch(() => {});
      // Assets.unload may leave this alias in the cache when another alias once named the same file
      for (const alias of [skeleton, atlas]) if (Assets.cache.has(alias)) Assets.cache.remove(alias);
    },
  };
}

/** The one registry of the app: stages that use the same Spine asset share it. */
export const spineAssets: SpineAssets = createSpineAssets(createPixiSpineBackend());
