// Game-level Pixi config for Higher or Lower: what the first screen preloads and the named effects its scene can
// start. Per-view layout and timings stay in the view configs (cardReveal.config.ts); this file only gathers what
// the shared Pixi core needs from the game.
import type { PixiGameConfig } from 'core/pixi/GameConfigProxy';

import { cardRevealConfig } from './cardReveal.config.ts';
import { confettiConfig } from './confetti.config.ts';

export const higherLowerPixiConfig = {
  preload: cardRevealConfig.assets,
  effects: { win: confettiConfig },
} satisfies PixiGameConfig;
