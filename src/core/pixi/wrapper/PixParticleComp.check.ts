// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/wrapper/PixParticleComp.check.ts
// The burst numbers: launch velocity, one physics step, how a burst ends, and config validation.
import assert from 'node:assert/strict';

import { type BurstConfig, launchVelocity, type Piece, stepBurst, validateBurst } from './PixParticleStep.ts';

const cfg: BurstConfig = {
  count: 10,
  colors: ['green', 'red'],
  piece: { width: 6, height: 10 },
  origin: { x: 0.5, y: 0.35 },
  speed: { spreadX: 8, maxUp: 10, minUp: 2 },
  gravity: 0.25,
  spin: 0.4,
  reanchorMs: 250,
  fade: 0.1,
};

// launch velocity comes from one random source
assert.deepEqual(
  launchVelocity(cfg, () => 0.5),
  { vx: 0, vy: -7, spin: 0 },
);
const low = launchVelocity(cfg, () => 0);
assert.equal(low.vx, -4);
assert.equal(low.vy, -2);

// one frame at 60 fps (16.7 ms) applies gravity, moves, spins and fades each piece exactly once
const piece = (): Piece => ({ g: { x: 0, y: 0, rotation: 0, alpha: 1 }, vx: 2, vy: -4, spin: 0.1 });
{
  const p = piece();
  assert.equal(stepBurst([p], 16.7, cfg), true);
  assert.equal(p.vy, -4 + 0.25);
  assert.equal(p.g.x, 2);
  assert.equal(p.g.y, -4 + 0.25);
  assert.ok(Math.abs(p.g.rotation - 0.1) < 1e-12);
  assert.ok(Math.abs(p.g.alpha - 0.9) < 1e-12);
}

// a frame twice as long moves twice as far (speeds are per 60 fps frame)
{
  const p = piece();
  stepBurst([p], 33.4, cfg);
  assert.equal(p.g.x, 4);
}

// the burst ends: with fade 0.1 every piece is gone within 10 frames, and the step then reports false
{
  const pieces = [piece(), piece(), piece()];
  let frames = 0;
  while (stepBurst(pieces, 16.7, cfg)) {
    frames++;
    assert.ok(frames <= 11, 'a burst with fade > 0 always ends');
  }
  assert.ok(frames >= 9);
  assert.ok(pieces.every((p) => p.g.alpha === 0));
}

// validation
validateBurst(cfg);
const bad = (change: Partial<BurstConfig>, text: RegExp) =>
  assert.throws(() => validateBurst({ ...cfg, ...change }), text);
bad({ count: 0 }, /count/);
bad({ colors: [] }, /colors/);
bad({ fade: 0 }, /never ends/);
bad({ piece: { width: 0, height: 4 } }, /piece/);
bad({ origin: { x: 1.5, y: 0.5 } }, /origin/);

console.log('PixParticleComp.check: ok');
