// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/wrapper/PixSpine.check.ts
// The numbers behind PixSpine: fit-to-box placement, animation start times, error texts.
import assert from 'node:assert/strict';

import {
  fitPlacement,
  missingAnimationMessage,
  missingSkinMessage,
  resolveStartTime,
  spineAliases,
} from './PixSpineStep.ts';

// a tall skeleton (2000 x 4000, off-centre) into a 300 x 300 box
const bounds = { x: -500, y: -4000, width: 2000, height: 4000 };
{
  const contain = fitPlacement(bounds, { width: 300, height: 300, mode: 'contain' });
  assert.equal(contain.scale, 300 / 4000); // the height limits it
  assert.deepEqual(contain.pivot, { x: 500, y: -2000 }); // centre of the bounds
  const cover = fitPlacement(bounds, { width: 300, height: 300, mode: 'cover' });
  assert.equal(cover.scale, 300 / 2000); // the width limits it, the height overflows
  const none = fitPlacement(bounds, { width: 300, height: 300, mode: 'none' });
  assert.equal(none.scale, 1);
  assert.deepEqual(none.pivot, contain.pivot);
}
// the fitted skeleton fits the box (contain) or covers it (cover)
{
  const f = { width: 540, height: 300 };
  const c = fitPlacement(bounds, { ...f, mode: 'contain' });
  assert.ok(bounds.width * c.scale <= f.width + 1e-9 && bounds.height * c.scale <= f.height + 1e-9);
  const v = fitPlacement(bounds, { ...f, mode: 'cover' });
  assert.ok(bounds.width * v.scale >= f.width - 1e-9 && bounds.height * v.scale >= f.height - 1e-9);
}
// empty bounds (nothing drawn yet) never produce NaN or Infinity
for (const empty of [
  { x: 0, y: 0, width: 0, height: 0 },
  { x: 0, y: 0, width: 10, height: 0 },
  { x: 0, y: 0, width: NaN, height: 5 },
]) {
  assert.deepEqual(fitPlacement(empty, { width: 100, height: 100, mode: 'contain' }), {
    scale: 1,
    pivot: { x: 0, y: 0 },
  });
}

// start times: first, last, a clamped number, and "no override"
assert.equal(resolveStartTime(undefined, 0, 2), undefined);
assert.equal(resolveStartTime('first', 0.5, 2), 0.5);
assert.equal(resolveStartTime('last', 0, 2), 2);
assert.equal(resolveStartTime(1.25, 0, 2), 1.25);
assert.equal(resolveStartTime(-3, 0, 2), 0);
assert.equal(resolveStartTime(9, 0, 2), 2);
assert.equal(resolveStartTime(NaN, 0, 2), undefined);

assert.match(missingAnimationMessage('walk', ['idle', 'run']), /"walk".*idle, run/);
assert.match(missingAnimationMessage('walk', []), /\(none\)/);
assert.match(missingSkinMessage('Gold', ['default']), /"Gold".*default/);

// legacy alias names: asset `effects` is read from effectsData and effectsAtlas
assert.deepEqual(spineAliases('effects'), { skeleton: 'effectsData', atlas: 'effectsAtlas' });

console.log('PixSpine.check: ok');
