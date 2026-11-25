// Self-check: node --experimental-strip-types --no-warnings src/games/accacrash/scenes/config.check.ts
// The crash curve config is valid and has the label elements the scene updates.
import assert from 'node:assert/strict';

import { validateCanvas, validateElements } from '../../../core/pixi/viewConfig.ts';
import { crashCurveConfig as c } from './crashCurve.config.ts';

validateCanvas(c.canvas, 'crashCurve.canvas');
validateElements(c.elements, 'crashCurve.elements');
for (const id of ['label', 'sub', 'boost'])
  assert.ok(
    c.elements.some((e) => e.id === id),
    `missing element "${id}"`,
  );
assert.ok(
  c.plot.gridLevels.every((m, i, a) => m >= 1 && (i === 0 || m > a[i - 1])),
  'grid levels rise from 1',
);
assert.ok(c.plot.minMultiplier > 1 && c.plot.minTimeMs > 0 && c.plot.headroom >= 1);
assert.ok(c.texts.crashed.includes('{multiplier}') && c.texts.boost.includes('{boost}'));

console.log('accacrash config.check: ok');
