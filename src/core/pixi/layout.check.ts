// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/layout.check.ts
// Fit scales, letterboxing and anchors, including the sizes a stage really has (tiny frames, zero before the first resize).
import assert from 'node:assert/strict';

import { applyPlacement, fitScale, placeInBox, stageFit } from './layout.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

// fit modes on a wide box and a tall content
const content = { width: 100, height: 400 };
const box = { width: 300, height: 200 };
near(fitScale(content, box, 'contain'), 0.5); // height limits
near(fitScale(content, box, 'cover'), 3); // width fills, height overflows
near(fitScale(content, box, 'width'), 3);
near(fitScale(content, box, 'height'), 0.5);
near(fitScale(content, box, 'none'), 1);

// invalid or empty sizes never produce NaN or Infinity
for (const [c, b] of [
  [{ width: 0, height: 10 }, box],
  [content, { width: 0, height: 0 }],
  [content, { width: NaN, height: 5 }],
  [{ width: -3, height: 4 }, box],
] as const)
  assert.equal(fitScale(c, b, 'contain'), 1);

// stageFit letterboxes a design size and centres it
{
  const p = stageFit({ width: 720, height: 960 }, { width: 360, height: 640 });
  near(p.scale, 360 / 720); // width limits: 0.5
  near(p.x, 0);
  near(p.y, (640 - 960 * 0.5) / 2); // 80: bars above and below
  const wide = stageFit({ width: 720, height: 960 }, { width: 1280, height: 720 });
  near(wide.scale, 720 / 960);
  near(wide.x, (1280 - 720 * wide.scale) / 2);
  near(wide.y, 0);
  const cover = stageFit({ width: 720, height: 960 }, { width: 1280, height: 720 }, 'cover');
  near(cover.scale, 1280 / 720);
  assert.ok(cover.y < 0, 'cover overflows the short side, centred');
}

// the supported viewports: the scaled design never leaves the stage (contain) and is centred
for (const [w, h] of [
  [202, 356],
  [202, 275],
  [224, 237],
  [360, 640],
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1920, 1080],
] as const) {
  const design = { width: 720, height: 960 };
  const p = stageFit(design, { width: w, height: h });
  assert.ok(design.width * p.scale <= w + 1e-9 && design.height * p.scale <= h + 1e-9, `${w}x${h} fits`);
  assert.ok(p.x >= -1e-9 && p.y >= -1e-9, `${w}x${h} has no negative offset`);
  near(p.x, w - (p.x + design.width * p.scale)); // equal bars on both sides
  near(p.y, h - (p.y + design.height * p.scale));
}

// before the first resize the stage is 0 x 0: a safe placement, no NaN
{
  const p = stageFit({ width: 720, height: 960 }, { width: 0, height: 0 });
  assert.ok([p.scale, p.x, p.y].every(Number.isFinite));
}

// anchors inside a box
{
  const c = { width: 40, height: 20 };
  const b = { x: 10, y: 100, width: 200, height: 100 };
  assert.deepEqual(placeInBox(c, b), { scale: 1, x: 10 + 80, y: 100 + 40 }); // centred by default
  assert.deepEqual(placeInBox(c, b, { x: 'left', y: 'top' }), { scale: 1, x: 10, y: 100 });
  assert.deepEqual(placeInBox(c, b, { x: 'right', y: 'bottom' }), { scale: 1, x: 10 + 160, y: 100 + 80 });
  const fitted = placeInBox(c, b, { x: 'center', y: 'middle' }, 'contain'); // 5x: 200 x 100, fills the box
  near(fitted.scale, 5);
  near(fitted.x, 10);
  near(fitted.y, 100);
}

// applyPlacement writes scale and position
{
  const seen: number[] = [];
  const target = {
    scale: { set: (x: number) => seen.push(x) },
    position: { set: (x: number, y?: number) => seen.push(x, y ?? NaN) },
  };
  applyPlacement(target, { scale: 2, x: 3, y: 4 });
  assert.deepEqual(seen, [2, 3, 4]);
}

console.log('layout.check: ok');
