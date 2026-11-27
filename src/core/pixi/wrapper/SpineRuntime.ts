// The only file that loads the Spine runtime, and only through import(), so the runtime (and spine-core) is a lazy
// chunk that no game downloads unless it uses Spine. `npm run check:games` (rule 11) enforces that nothing else
// imports it. Importing the package also registers its asset loaders (.atlas, .skel, skeleton .json) with Pixi,
// so SpineAssets awaits this before it loads any Spine asset.
import type * as SpineModule from '@pixi/spine-pixi';

export type SpineRuntime = typeof SpineModule;

let pending: Promise<SpineRuntime> | null = null;

/** Loads the runtime once. A failed load is forgotten, so the next call tries again. */
export function loadSpineRuntime(): Promise<SpineRuntime> {
  pending ??= import('@pixi/spine-pixi').catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}
