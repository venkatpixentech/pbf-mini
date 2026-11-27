// Game-level Pixi config for Acca Crash: what the first screen preloads and the named effects its scene can start.
// The curve is drawn from code, so there are no textures to preload, and there are no effects yet. Per-view layout
// stays in crashCurve.config.ts.
import type { PixiGameConfig } from 'core/pixi/GameConfigProxy';

export const accaCrashPixiConfig = {
  preload: [],
} satisfies PixiGameConfig;
