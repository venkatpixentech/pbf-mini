// The numbers behind a particle burst (confetti and similar): its config, its validation and one physics step.
// Plain TypeScript with no Pixi import, so `PixParticleComp.check.ts` can run it in Node. The drawing is in PixParticleComp.ts.
import type { ColorRef } from '../viewConfig';

export type BurstConfig = {
  count: number;
  colors: ColorRef[];
  /** Each piece is a rectangle, centred on its position. */
  piece: { width: number; height: number };
  /** Where the burst starts, as a fraction of the canvas. */
  origin: { x: number; y: number };
  /** Launch speed ranges (px per frame at 60 fps): x is +/- spreadX / 2, y is upward from minUp. */
  speed: { spreadX: number; maxUp: number; minUp: number };
  gravity: number;
  spin: number;
  /** A canvas resize within this many ms of launch moves the burst with the new origin. */
  reanchorMs: number;
  /** Alpha lost per frame, so pieces fade out and the burst ends. */
  fade: number;
};

/** The parts of a display object a piece moves; a Pixi Graphics fits. */
export type PieceView = { x: number; y: number; rotation: number; alpha: number };
export type Piece = { g: PieceView; vx: number; vy: number; spin: number };

/** A piece's launch velocity and spin from one random source (injectable so a check can be exact). */
export function launchVelocity(cfg: BurstConfig, random: () => number) {
  return {
    vx: (random() - 0.5) * cfg.speed.spreadX,
    vy: -random() * cfg.speed.maxUp - cfg.speed.minUp,
    spin: (random() - 0.5) * cfg.spin,
  };
}

/** One frame of physics for every piece. Returns true while at least one piece is still visible. */
export function stepBurst(pieces: Piece[], deltaMs: number, cfg: BurstConfig): boolean {
  const k = deltaMs / 16.7; // the config speeds are per frame at 60 fps
  let alive = false;
  for (const b of pieces) {
    b.vy += cfg.gravity * k;
    b.g.x += b.vx * k;
    b.g.y += b.vy * k;
    b.g.rotation += b.spin * k;
    b.g.alpha = Math.max(0, b.g.alpha - cfg.fade * k);
    if (b.g.alpha > 0) alive = true;
  }
  return alive;
}

/** Throws for a config that can never work (caught by npm run check, not at the player). */
export function validateBurst(c: BurstConfig, where = 'burst'): void {
  const bad = (m: string) => {
    throw new Error(`${where}: ${m}`);
  };
  if (!(c.count > 0)) bad('count must be above 0');
  if (!c.colors.length) bad('colors must not be empty');
  if (!(c.piece.width > 0 && c.piece.height > 0)) bad('piece needs a size');
  if (!(c.fade > 0)) bad('fade must be above 0, or the burst never ends');
  if (!(c.origin.x >= 0 && c.origin.x <= 1 && c.origin.y >= 0 && c.origin.y <= 1))
    bad('origin is a fraction of the canvas, 0..1');
}
