// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/viewConfig.check.ts
// The config validators accept a good config and reject each kind of broken one.
import assert from 'node:assert/strict';

import { type ElementConfig, ViewConfigError, validateCanvas, validateElements } from './viewConfig.ts';

const good = { heightPct: 30, minHeight: 200, maxHeight: 280 };
validateCanvas(good);
for (const bad of [
  { ...good, heightPct: 0 },
  { ...good, heightPct: 120 },
  { ...good, minHeight: 300 },
  { ...good, maxHeight: NaN },
  { ...good, minHeight: 0 },
]) {
  assert.throws(() => validateCanvas(bad), ViewConfigError);
}

const text: ElementConfig = {
  type: 'text',
  id: 'a',
  text: 'x',
  x: 0,
  y: 0,
  style: { font: 'body', size: 12, color: 'ink' },
};
const sprite: ElementConfig = { type: 'sprite', id: 'b', alias: 'x', x: 0, y: 0 };
validateElements([text, sprite, { type: 'group', id: 'g', x: 0, y: 0, children: [{ ...text, id: 'a' }] }]);

assert.throws(() => validateElements([text, { ...sprite, id: 'a' }]), /duplicate id/);
assert.throws(() => validateElements([{ ...text, id: '' }]), /id is required/);
assert.throws(() => validateElements([{ ...(text as object), text: undefined } as ElementConfig]), /text/);
assert.throws(() => validateElements([{ ...sprite, alias: '' }]), /alias/);
assert.throws(() => validateElements([{ ...text, x: NaN }]), /finite/);
assert.throws(() => validateElements([{ type: 'shape', id: 's', shape: 'circle', x: 0, y: 0, fill: 'ink' }]), /size/);
assert.throws(
  () => validateElements([{ type: 'shape', id: 's', shape: 'rect', x: 0, y: 0, width: 4, height: 4 }]),
  /fill or a stroke/,
);
assert.throws(
  () => validateElements([{ type: 'group', id: 'g', x: 0, y: 0, children: [text, { ...sprite, id: 'a' }] }]),
  /g\.a: duplicate id/,
);

console.log('viewConfig.check: ok');
