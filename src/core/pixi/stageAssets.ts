import { Assets } from 'pixi.js';

import type { StageAsset } from './scene';

// Reference counts per alias, so a texture shared by two mounted stages survives one of them unmounting.
const refs = new Map<string, number>();
const ROOT = `${import.meta.env.BASE_URL}assets/`;

export async function loadStageAssets(assets: StageAsset[]): Promise<void> {
  for (const a of assets) {
    const n = refs.get(a.alias) ?? 0;
    refs.set(a.alias, n + 1);
    // the boot preload may already have registered the alias: registering twice makes Pixi warn and overwrite
    if (n === 0 && !Assets.resolver.hasKey(a.alias)) Assets.add({ alias: a.alias, src: ROOT + a.src });
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
