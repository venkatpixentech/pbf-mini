// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/Interaction.check.ts
// Tap versus drag, presses by pointer id, and hit area growth and its limits.
import assert from 'node:assert/strict';

import {
  limitExpansion,
  MIN_TARGET_CSS,
  PressTracker,
  pointerKind,
  TAP_MOVE_CSS,
  wantedExpansion,
} from './InteractionStep.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

// pointer names
assert.equal(pointerKind('touch'), 'touch');
assert.equal(pointerKind('pen'), 'pen');
assert.equal(pointerKind('mouse'), 'mouse');
assert.equal(pointerKind(undefined), 'mouse');
assert.equal(pointerKind('something'), 'mouse');
assert.equal(TAP_MOVE_CSS, 10);
assert.equal(MIN_TARGET_CSS, 44);

// a press and release on the target is a tap; moving past the threshold (even if the pointer comes back) is not
{
  const t = new PressTracker();
  assert.equal(t.down(1, 'a', 100, 100), true);
  assert.deepEqual(t.up(1, 103, 104, true), { target: 'a', tap: true, outside: false });
  assert.equal(t.size, 0);
  t.down(1, 'a', 100, 100);
  t.move(1, 100, 111); // 11 css px away
  assert.deepEqual(t.up(1, 100, 100, true), { target: 'a', tap: false, outside: false }, 'came back, still a drag');
  t.down(1, 'a', 0, 0);
  t.move(1, 6, 8); // exactly 10: not past the threshold
  assert.equal(t.up(1, 6, 8, true)!.tap, true);
}

// released outside the target: no tap, and the caller can tell
{
  const t = new PressTracker();
  t.down(7, 'a', 0, 0);
  assert.deepEqual(t.up(7, 50, 50, false), { target: 'a', tap: false, outside: true });
  assert.equal(t.up(7, 0, 0, true), null, 'a second release of the same pointer is ignored');
}

// one press per target, independent presses on different targets (multi-touch), a pointer presses one thing
{
  const t = new PressTracker();
  assert.equal(t.down(1, 'a', 0, 0), true);
  assert.equal(t.down(2, 'a', 0, 0), false, 'a second pointer on a pressed target is ignored');
  assert.equal(t.down(2, 'b', 0, 0), true, 'another target, another pointer');
  assert.equal(t.down(1, 'c', 0, 0), false, 'pointer 1 is already pressing a');
  assert.equal(t.size, 2);
  assert.equal(t.up(2, 0, 0, true)!.target, 'b');
  assert.equal(t.isPressed('a'), true);
  assert.equal(t.isPressed('b'), false);
}

// cancel by pointer, by target, and all (blocked)
{
  const t = new PressTracker();
  t.down(1, 'a', 0, 0);
  t.down(2, 'b', 0, 0);
  assert.equal(t.cancelPointer(1), 'a');
  assert.equal(t.cancelPointer(1), null, 'cancelled once');
  assert.equal(t.cancelTarget('b'), true);
  assert.equal(t.cancelTarget('b'), false);
  t.down(3, 'c', 0, 0);
  t.down(4, 'd', 0, 0);
  assert.deepEqual(t.cancelAll().sort(), ['c', 'd']);
  assert.equal(t.size, 0);
  assert.equal(t.down(3, 'c', 0, 0), true, 'free again after a cancel');
}

// hit area: padding on every side, then grown to the minimum on-screen size
{
  const e = wantedExpansion({ width: 100, height: 100 }, 1, 0, 44);
  assert.deepEqual(e, { left: 0, top: 0, right: 0, bottom: 0 }, 'already large enough');
  const small = wantedExpansion({ width: 20, height: 30 }, 1, 0, 44);
  near(small.left, 12); // (44 - 20) / 2
  near(small.top, 7); // (44 - 30) / 2
  const padded = wantedExpansion({ width: 20, height: 30 }, 1, 8, 44);
  near(padded.left, 12); // 8 padding + (44 - 36) / 2
  near(padded.top, 8); // 8 + (44 - 46 < 0 -> 0)
  // scaled down to half: a 40-unit object is 20 css px, so it needs 12 css px = 24 root units per axis
  const scaled = wantedExpansion({ width: 40, height: 40 }, 0.5, 0, 44);
  near(scaled.left, (44 / 0.5 - 40) / 2);
  // an invalid scale never gives NaN
  assert.ok(Object.values(wantedExpansion({ width: 10, height: 10 }, 0, 0, 44)).every(Number.isFinite));
}

// two close objects split the gap between them; a far one is not limited; overlapping own rects do not limit each other
{
  const want = { left: 30, top: 30, right: 30, bottom: 30 };
  const items = [
    { id: 'a', rect: { x: 0, y: 0, width: 20, height: 20 }, want },
    { id: 'b', rect: { x: 30, y: 0, width: 20, height: 20 }, want }, // gap of 10 to the right of a
    { id: 'far', rect: { x: 400, y: 400, width: 20, height: 20 }, want },
  ];
  const out = limitExpansion(items);
  near(out.get('a')!.right, 5);
  near(out.get('b')!.left, 5);
  near(out.get('a')!.left, 30);
  near(out.get('far')!.left, 30);
  assert.ok(out.get('a')!.right + out.get('b')!.left <= 10 + 1e-9, 'the two areas never cross');
  // vertical neighbours
  const v = limitExpansion([
    { id: 'top', rect: { x: 0, y: 0, width: 20, height: 20 }, want },
    { id: 'low', rect: { x: 0, y: 26, width: 20, height: 20 }, want },
  ]);
  near(v.get('top')!.bottom, 3);
  near(v.get('low')!.top, 3);
  // own rectangles that overlap: no limit from each other
  const o = limitExpansion([
    { id: 'x', rect: { x: 0, y: 0, width: 20, height: 20 }, want },
    { id: 'y', rect: { x: 10, y: 0, width: 20, height: 20 }, want },
  ]);
  near(o.get('x')!.right, 30);
  near(o.get('y')!.left, 30);
}

console.log('Interaction.check: ok');
