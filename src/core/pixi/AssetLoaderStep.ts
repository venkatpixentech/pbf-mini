// The numbers behind AssetLoader: which files a definition means, with `{res}` and `{n}` filled in. Plain TypeScript with no
// Pixi import, so `AssetLoader.check.ts` can run it in Node. The loading itself is in AssetLoader.ts.
import type { AssetBundleDef, AssetDef } from './viewConfig.ts';

export type AssetResolution = '@1x' | '@0.5x';

/** One file to load: a Pixi asset (`asset`), a canvas font (`font`) or a bitmap font (`bmpfont`). */
export type ConcreteAsset = { alias: string; src: string; loader: 'asset' | 'font' | 'bmpfont'; family?: string };

const withRes = (src: string, res: AssetResolution) => src.split('{res}').join(res);

/** The concrete files a definition stands for at an asset resolution. A sequence becomes one entry per sheet. */
export function expandAsset(def: AssetDef, res: AssetResolution): ConcreteAsset[] {
  const src = withRes(def.src, res);
  if (def.kind === 'sequence') {
    const count = typeof def.sheets === 'number' ? def.sheets : def.sheets[res];
    return Array.from({ length: count }, (_, i) => ({
      alias: `${def.alias}${i}`,
      src: src.split('{n}').join(String(i)),
      loader: 'asset' as const,
    }));
  }
  if (def.kind === 'font') return [{ alias: def.alias, src, loader: 'font', family: def.family }];
  if (def.kind === 'bmpfont') return [{ alias: def.alias, src, loader: 'bmpfont' }];
  return [{ alias: def.alias, src, loader: 'asset' }];
}

export const expandAssets = (defs: AssetDef[], res: AssetResolution): ConcreteAsset[] =>
  defs.flatMap((d) => expandAsset(d, res));

/** Two concrete assets of one alias name the same file and loader. */
export const sameAsset = (a: ConcreteAsset, b: ConcreteAsset) =>
  a.src === b.src && a.loader === b.loader && a.family === b.family;

/** A bundle by id, or an error that names the bundles that exist (the legacy "Invalid bundle" check). */
export function findBundle(bundles: AssetBundleDef[], id: string): AssetBundleDef {
  const found = bundles.find((b) => b.id === id);
  if (!found)
    throw new Error(
      `Unknown asset bundle "${id}"; the bundles are: ${bundles.map((b) => b.id).join(', ') || '(none)'}`,
    );
  return found;
}
