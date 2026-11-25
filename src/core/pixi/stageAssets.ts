import { Assets } from 'pixi.js';

import { registerAsset } from './preload';
import type { StageAsset } from './scene';

// Reference counts per alias, so a texture shared by two mounted stages survives one of them unmounting.
const refs = new Map<string, number>();

export async function loadStageAssets(assets: StageAsset[]): Promise<void> {
  for (const a of assets) {
    const n = refs.get(a.alias) ?? 0;
    refs.set(a.alias, n + 1);
    if (n === 0) registerAsset(a); // the boot preload may already have registered (and loaded) it
  }
  await Assets.load(assets.map((a) => a.alias));
}

export async function unloadStageAssets(assets: StageAsset[]): Promise<void> {
  const release: string[] = [];
  for (const a of assets) {
    const n = (refs.get(a.alias) ?? 1) - 1;
    if (n > 0) refs.set(a.alias, n);
    else {
      refs.delete(a.alias);
      release.push(a.alias);
    }
  }
  if (release.length) await Assets.unload(release);
}
