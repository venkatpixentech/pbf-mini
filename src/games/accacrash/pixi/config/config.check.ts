// Self-check: node --experimental-strip-types --no-warnings src/games/accacrash/pixi/config/config.check.ts
// The crash curve config is valid and has the label elements the scene updates.
import assert from 'node:assert/strict';

import { validatePixiConfig } from '../../../../core/pixi/GameConfigProxy.ts';
import { validateCanvas, validateElements } from '../../../../core/pixi/viewConfig.ts';
import { accaCrashPixiConfig } from './game.config.ts';
import { crashCurveConfig as c } from './crashCurve.config.ts';
import en from '../../i18n/en.ts';

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
assert.ok(en[c.texts.crashed].includes('{multiplier}') && en[c.texts.boost].includes('{boost}'));
for (const key of Object.values(c.texts)) assert.ok(key in en, `text key ${key} is in the dictionary`);

validatePixiConfig(accaCrashPixiConfig, 'accaCrashPixiConfig');

console.log('accacrash config.check: ok');
