// Config of the Spine harness: two Spine assets of the first PBF game (exported by Spine 4.2.38) and the views the
// scene builds from them. Same layout as a game: assets and views are declared here, the scene only drives PixSpine.
import type { SpineAssetDef, SpineViewConfig } from 'core/pixi/viewConfig';

/** Each stage is 320 x 320, so a view is centred on 160, 160. */
export const STAGE_SIZE = 320;

export const spineAssets = [
  // binary skeleton: a pack effect with three animations and two animation events
  { id: 'packFx', skeleton: 'spineprobe/spines/fx/Pack Fx.skel', atlas: 'spineprobe/spines/fx/Pack Fx.atlas' },
  // JSON skeleton: a pack with three skins and two animation events
  {
    id: 'goldPack',
    skeleton: 'spineprobe/spines/gold/Pack Open.json',
    atlas: 'spineprobe/spines/gold/Pack Open.atlas',
  },
  // the same atlas as goldPack with a different skeleton file (the binary export): two assets, one atlas
  {
    id: 'goldPackBin',
    skeleton: 'spineprobe/spines/gold/Pack Open.skel',
    atlas: 'spineprobe/spines/gold/Pack Open.atlas',
  },
] satisfies SpineAssetDef[];

export const spineViews = {
  gold: {
    asset: 'goldPack',
    defaultState: 'packAnimation',
    loop: true,
    skin: 'Gold Pack',
    place: { x: STAGE_SIZE / 2, y: STAGE_SIZE / 2, fit: { width: 280, height: 280, mode: 'contain' } },
  },
  goldBin: {
    asset: 'goldPackBin',
    // this binary export names its animation differently from the JSON one
    defaultState: 'goldpackAnimation',
    loop: true,
    skin: 'Gold Pack',
    place: { x: STAGE_SIZE / 2, y: STAGE_SIZE / 2, fit: { width: 280, height: 280, mode: 'contain' } },
  },
  fx: {
    asset: 'packFx',
    defaultState: 'loopAnimation',
    loop: true,
    mixes: [{ from: 'backfxAnimation', to: 'frontfxAnimation', duration: 0.5 }],
    place: { x: STAGE_SIZE / 2, y: STAGE_SIZE / 2, scale: 0.05 },
  },
} satisfies Record<string, SpineViewConfig>;

export type ViewName = keyof typeof spineViews;

/** The assets a stage of each kind holds (PixiStage `spine`). */
export const assetsOf = (view: ViewName): SpineAssetDef[] => spineAssets.filter((a) => a.id === spineViews[view].asset);
