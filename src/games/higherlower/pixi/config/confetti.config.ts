// Config for the win confetti burst: how many pieces, their size and colours, how they fly and fade.
// It is drawn inside the card stage by the shared startBurst (core/pixi/wrapper/PixParticleComp.ts).
import type { BurstConfig } from 'core/pixi/wrapper/PixParticleStep';

export const confettiConfig: BurstConfig = {
  count: 60,
  colors: ['green', 'red', 'gold', 'white'],
  /** Each piece is a rectangle, centred on its position. */
  piece: { width: 6, height: 10 },
  /** Where the burst starts, as a fraction of the canvas. */
  origin: { x: 0.5, y: 0.35 },
  /** Launch speed ranges (px per frame at 60 fps): x is +/- spreadX / 2, y is upward from minUp. */
  speed: { spreadX: 9, maxUp: 9, minUp: 2 },
  gravity: 0.25,
  spin: 0.4,
  /** A canvas resize within this many ms of launch moves the burst with the new origin. */
  reanchorMs: 250,
  /** Alpha lost per frame, so pieces fade out. */
  fade: 0.008,
};
