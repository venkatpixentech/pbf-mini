// The game-level Pixi configuration (the equivalent of the old framework's GameConfig, AssetConfig and
// SoundLoadConfig, gathered into one typed object per game): the game's scenes and index.ts read it, so a new
// game declares what it needs here and the shared core does the rest. Later phases add sections to this type
// (design size, spine, sounds, host); a game that does not use one leaves it out.
// A game writes its object as `{ ... } satisfies PixiGameConfig` in pixi/config/game.config.ts.
// Plain TypeScript with no Pixi import, so it can be checked in Node.
import { type BurstConfig, validateBurst } from './wrapper/PixParticleStep.ts';
import { type SoundGameConfig, validateSoundConfig } from '../audio/SoundConfig.ts';
import type { StageAsset } from './scene.ts';
import type { Fit } from './layout.ts';
import {
  type AssetBundleDef,
  type AssetDef,
  type SpineAssetDef,
  type SpineViewConfig,
  validateAssets,
  validateBundles,
  validateSpineAssets,
  validateSpineViews,
} from './viewConfig.ts';

export type PixiGameConfig = {
  /** Assets the first screen needs; the game's index.ts passes this to defineGame as `preload`. */
  preload: StageAsset[];
  /** Named particle effects a scene may start with startBurst. */
  effects?: Record<string, BurstConfig>;
  /** Assets a stage loads on mount (PixiStage `assets`): images, atlases, sequences, fonts and bitmap fonts. */
  assets?: AssetDef[];
  /** Named groups a scene loads and releases together (AssetLoader.initAssets, then acquireBundles). */
  bundles?: AssetBundleDef[];
  /** Spine assets (PixiStage `spine`) and the views a scene builds from them with PixSpine.create. */
  spine?: { assets: SpineAssetDef[]; views: Record<string, SpineViewConfig> };
  /** Sounds the screen plays (core/audio, loaded lazily by `useSound`). Not Pixi-specific: a DOM game declares the same object. */
  sounds?: SoundGameConfig;
  /** The size scenes lay out in; a scene applies layout.stageFit(design, size, fit) on every resize. */
  design?: { width: number; height: number; fit?: Fit };
};

/** Throws for a config that can never work (called by each game's config.check.ts). */
export function validatePixiConfig(c: PixiGameConfig, where = 'pixiConfig'): void {
  const seen = new Set<string>();
  for (const a of c.preload) {
    if (!a.alias || !a.src) throw new Error(`${where}.preload: every asset needs an alias and a src`);
    if (seen.has(a.alias)) throw new Error(`${where}.preload: duplicate alias "${a.alias}"`);
    seen.add(a.alias);
  }
  for (const [name, effect] of Object.entries(c.effects ?? {})) validateBurst(effect, `${where}.effects.${name}`);
  if (c.assets) validateAssets(c.assets, `${where}.assets`);
  if (c.bundles) validateBundles(c.bundles, `${where}.bundles`);
  if (c.spine) {
    validateSpineAssets(c.spine.assets, `${where}.spine.assets`);
    validateSpineViews(c.spine.views, c.spine.assets, `${where}.spine.views`);
  }
  if (c.sounds) validateSoundConfig(c.sounds, `${where}.sounds`);
  if (c.design && !(c.design.width > 0 && c.design.height > 0))
    throw new Error(`${where}.design: width and height must be above 0`);
}
